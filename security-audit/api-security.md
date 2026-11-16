# API Security (OWASP API Security Top 10, 2023)

The API is 67 TanStack Start server functions plus 5 `/api/public/*` routes and
`/assets/*`. Inventory: [attack-surface.md](attack-surface.md).

| OWASP API risk | Assessment | Evidence | Findings |
|---|---|---|---|
| API1 Broken Object Level Authorization | **Pass.** Ownership derived from the stored row (`resolveEditMode`), not from client input; owner-A→B tests rejected | `scripts/test-authz-coverage.py` 51/51 | — |
| API2 Broken Authentication | Weaknesses fixed: MFA per-session and phone protection, password change, rate-limit key, timing | auth-hardening 11/11; PoC before/after | SEC-003/004/005/007/013 |
| API3 Broken Object Property Level Authorization | Owner writes strip privileged fields (no mass assignment); public detail/export leaked review fields → fixed | code review; anonymous response check | SEC-012 |
| API4 Unrestricted Resource Consumption | Per-IP limits were bypassable → fixed; zod/seroval DoS → upgraded; outbound timeouts added; upload size limits enforced before buffering; assistant global cap | bun audit, PoC | SEC-002/003/006/019 |
| API5 Broken Function Level Authorization | **Pass.** Every admin-only function rejects a signed-in non-admin; anonymous rejected everywhere | authz suite | — |
| API6 Unrestricted Access to Sensitive Business Flows | Self-registration + SMS OTP and AI assistant are abuse-prone; limits present | code review | SEC-032 |
| API7 SSRF | **Pass.** No user-controlled outbound URLs; offline sync URL comes from server env; SMS/LLM endpoints fixed | code review | — |
| API8 Security Misconfiguration | Debug endpoint fail-open, missing headers → fixed; CSP `unsafe-inline` remains | production build headers | SEC-014/016/028 |
| API9 Improper Inventory Management | Server functions have no versioning (single deployed client/server pair); `/api/public/asset-audit` is admin-only despite its path; dev pages routable | code review | SEC-031 |
| API10 Unsafe Consumption of APIs | LLM output rendered as text only; export snapshot keys were used as SQL identifiers → fixed | code review | SEC-020/021 |

## Request validation

Every server function validates input with zod (`.validator()`); unknown keys are
stripped. Upload functions validate extension and size before reading the body.
String length caps exist on all text fields (≤ 4,000) and URLs (≤ 1,000, scheme-checked).

## Response exposure

Public list endpoints select explicit columns. `getExhibitionCompanyDetail` and
`/api/public/export` use `SELECT *` but now null `owner_user_id`, `reviewed_by` and
`rejection_note` for public callers. `/api/public/export` returns every approved
company's contact data by design (it feeds the desktop app).

## Replay, webhooks, request signing

Not applicable: no webhooks, payments or signed requests exist.
