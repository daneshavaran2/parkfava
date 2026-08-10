# Testing

| Suite | Proves | Needs |
| ----- | ------ | ----- |
| `test:unit` | i18n guards, URL/coordinate helpers | nothing |
| `test:api` | Visibility, auth, and validation contracts | server + seed |
| `test:request-id` | Request id reaches handlers and log envelopes, across `await` | server + `LOG_SINK=memory` |
| `test:product-routing` | Product URLs navigate, render, survive reload | server + seed |
| `test:directions` | Directions links carry the right coordinates | server + seed |
| `test:company-smoke` | Company profile renders in fa/en with adequate contrast | server + seed |
| `test:visual` | Pixel diffs, three viewports | server + seed |

"server" = dev server on `:8080`. "seed" = `bun run seed` applied.

## Two lessons this suite taught the hard way

**A test that cannot fail is worse than no test.** Three separate examples in
this repo:

- `test:api` targeted PostgREST with a Supabase key and *skipped itself* when
  those env vars were absent — so after the migration it passed as a silent
  no-op indefinitely.
- `test:product-routing` demanded a products panel on every company, which the
  app only renders when a company has products. One product-less company
  failed the whole run; the assertion was simply wrong.
- `test:request-id` was the only one genuinely failing, and it was right — it
  had found a real bug nobody had acted on.

When changing a suite, **verify it still fails against a deliberate
regression** before trusting it. Both rewrites were checked that way:
publishing a seeded draft company trips three contract assertions, and
removing the auth middleware from `saveAdminCompany` trips the write-rejection
assertion.

**An absence assertion must first prove the call succeeded.** `id not in
response` also passes when the response is an *error* — which is exactly how
three checks in the rewritten contract test passed for entirely the wrong
reason during development. `test-api-contracts.py` now routes those through a
helper that rejects an errored body first, and pairs each "hidden" assertion
with its mirror on a public row.

## Known dead code

- `scripts/seed-attachments.ts` — still imports `@supabase/supabase-js`, which
  is not a dependency. Cannot run. Not wired to any `package.json` script.
  Either delete it or port it onto `db/connection.ts` as `seed-dev-data.ts`
  and `reset-dev-data.ts` already were.

## CI

`.github/workflows/ci.yml` runs unit, typecheck, and the browser e2e jobs.
`test:api` and `test:product-routing` are **not** wired in — they need a
seeded database the workflow does not provision. Run them locally.

CI itself is currently blocked; see [[Operations]].

## Related

- [[Security And Auth]]
- [[Data Model]]
- [[Operations]]
- [[Decision Log]]
