# AI Assistant

The floating `دستیار هوشمند` panel. Was keyword substring matching until
2026-08-09; now a real model call, grounded in live exhibition data.

## Shape

`askAssistant` (`src/lib/assistant.functions.ts`), public and rate-limited:

1. Throttle first — before any DB or model work ([[Security And Auth]]).
2. Shortlist ≤20 candidate companies **in Postgres** via the trigram indexes
   ([[Performance And Scale]]).
3. Fetch products for those candidates only.
4. Rank in Node with the original scoring (`src/lib/assistant/match.ts`), now
   over ~20 rows instead of the whole table.
5. Build a Persian system prompt with those rows as ground truth.
6. `askOpenRouter(...)` → `{ answer, companyIds }`; the client turns the ids
   into clickable chips.

## Grounding policy

Decided with the product owner: **ground on real data, fall back to general
knowledge.** Concretely, the prompt says — use only the live rows for any
specific claim about a company or park in this exhibition and invent nothing
about them; but if nothing matches, or the question is broader than the
exhibition, answer from general knowledge rather than refusing.

The model receives essentially everything stored for a matched company:
intro, founders, founded year, headcount, export potential, contact details,
park name, and per-product descriptions and links. Anything collected via the
company intake spreadsheet therefore improves answers directly — that is the
point of collecting it.

## Configuration

- `OPENROUTER_API_KEY` — **required**; unset ⇒ throws `AI_NOT_CONFIGURED` and
  the UI shows a friendly message rather than breaking.
- `OPENROUTER_MODEL` — defaults to `openai/gpt-4o-mini`.

Requires migration `0004`; without `search_text` every question errors.

## Cost and abuse

This is the only endpoint in the app that costs money per request, and it is
reachable by anyone. Treat the rate limiter as part of the feature, not an
optimisation. If the limits are ever raised, raise the global ceiling
consciously — it is the thing standing between a scripted flood and the bill.

## Related

- [[Security And Auth]]
- [[Performance And Scale]]
- [[Operations]]
- [[Decision Log]]
