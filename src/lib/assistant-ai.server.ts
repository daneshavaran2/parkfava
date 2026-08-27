import { getAssistantRuntimeConfig } from "./app-settings.server";

// Server-only. Powers the smart assistant.
//
// Two providers, in order:
//   1. Lovable AI Gateway (LOVABLE_API_KEY) — works out of the box, no setup.
//   2. OpenRouter (admin panel key, or OPENROUTER_API_KEY/OPENROUTER_MODEL) —
//      used when the operator has configured their own key.
//
// If neither is available we throw AI_NOT_CONFIGURED instead of pretending to
// answer — same "fail loud, no silent fallback" convention as
// src/lib/sms/send-sms.server.ts.
type ChatTurn = { role: "user" | "assistant"; content: string };

const LOVABLE_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_DEFAULT_MODEL = "google/gemini-2.5-flash";

function buildMessages(systemPrompt: string, history: ChatTurn[], question: string) {
  return [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: question },
  ];
}

function pickContent(json: any): string {
  const text = json?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") throw new Error("AI provider returned no content");
  return text;
}

async function askLovableAi(
  apiKey: string,
  systemPrompt: string,
  history: ChatTurn[],
  question: string,
  maxTokens: number,
): Promise<string> {
  const res = await fetch(LOVABLE_GATEWAY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: process.env.LOVABLE_AI_MODEL || LOVABLE_DEFAULT_MODEL,
      messages: buildMessages(systemPrompt, history, question),
      temperature: 0.4,
      // Matches the OpenRouter path's cap (below) — whichever provider ends
      // up handling a given request, answer length behaves the same way.
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 402 (out of credits) / 403 (blocked) / 429 (rate limited) are all
    // terminal for this request — surface them, never retry in place.
    console.error(`[assistant] Lovable AI Gateway ${res.status}: ${body.slice(0, 500)}`);
    if (res.status === 429) throw new Error("RATE_LIMITED");
    throw new Error(`AI request failed: ${res.status}`);
  }
  return pickContent(await res.json());
}

async function askOpenRouterWith(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatTurn[],
  question: string,
  maxTokens: number,
): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://parkfava.ir",
      "X-Title": "ICT PARK Assistant",
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(systemPrompt, history, question),
      temperature: 0.4,
      // Was 600 — too tight for a structured, multi-company answer (a
      // separate paragraph per match plus products/founders/contact easily
      // exceeds that before the model finishes, cutting answers off mid-list).
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter request failed: ${res.status}`);
  return pickContent(await res.json());
}

/**
 * Kept as the single entry point used by src/lib/assistant.functions.ts.
 * `maxTokens` defaults to the assistant's own cap (1200, tuned for a chat
 * answer) — pass a higher value for callers generating longer structured
 * output, e.g. the translation-backfill script batching a whole company's
 * fields into one response.
 */
export async function askOpenRouter(
  systemPrompt: string,
  history: ChatTurn[],
  question: string,
  maxTokens = 1200,
): Promise<string> {
  // Operator-configured OpenRouter key wins when present; otherwise the
  // built-in Lovable AI Gateway answers, so the assistant works with no setup.
  const openRouter = await getAssistantRuntimeConfig().catch(() => ({
    apiKey: null as string | null,
    model: "openai/gpt-4o-mini",
  }));
  if (openRouter.apiKey) {
    try {
      return await askOpenRouterWith(
        openRouter.apiKey,
        openRouter.model,
        systemPrompt,
        history,
        question,
        maxTokens,
      );
    } catch (error) {
      console.error("[assistant] OpenRouter failed, falling back to Lovable AI", error);
    }
  }

  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("AI_NOT_CONFIGURED");
  return await askLovableAi(lovableKey, systemPrompt, history, question, maxTokens);
}
