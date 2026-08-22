import { getAssistantRuntimeConfig } from "./app-settings.server";

// Server-only. Calls OpenRouter's chat-completions API to power the smart
// assistant, configured via env vars:
//   OPENROUTER_API_KEY=<openrouter.ai api key>
//   OPENROUTER_MODEL=<model slug, defaults to openai/gpt-4o-mini>
//
// Until OPENROUTER_API_KEY is set, this throws instead of pretending to
// answer — mirrors the same "fail loud, no silent fallback" convention as
// src/lib/sms/send-sms.server.ts.
type ChatTurn = { role: "user" | "assistant"; content: string };

export async function askOpenRouter(
  systemPrompt: string,
  history: ChatTurn[],
  question: string,
): Promise<string> {
  const { apiKey, model } = await getAssistantRuntimeConfig();
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");

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
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: question },
      ],
      temperature: 0.4,
      max_tokens: 600,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter request failed: ${res.status}`);

  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") throw new Error("OpenRouter returned no content");
  return text;
}
