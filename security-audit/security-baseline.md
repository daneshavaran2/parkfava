# Security Baseline

State of existing controls **before** this audit's patches (commit `d877c06`), and after.

| Control area | Before | After this audit |
|---|---|---|
| Password storage | scrypt (N=16384, r=8, p=1), random salt, timing-safe compare | Unchanged; Persian digits folded consistently |
| Login throttling | Per-account + per-IP buckets in Postgres | Per-IP bucket was spoofable (SEC-003) → fixed |
| Account enumeration | Same error for unknown user / wrong password | Response time also equalised (SEC-013) |
| Sessions | 32-byte random token, `httpOnly`, `SameSite=Lax`, `Secure` in production, 30-day / 1-day expiry, server-side revocation | Other sessions revoked on password change (SEC-007); tokens still stored unhashed |
| MFA | Optional SMS OTP, off by default; CSPRNG codes, TTL, atomic attempt limit, send caps | Bound to the session; verified phone protected (SEC-004/005) |
| Authorization | Per-handler admin/ownership checks; regression suite `test-authz-coverage.py` | Unchanged; suite passes 51/51 |
| Input validation | zod on every server function | zod 4; URL fields reject script schemes (SEC-008) |
| SQL | postgres.js parameterized templates; two `unsafe()` sites | Identifier allowlist on the offline import site (SEC-020) |
| File uploads | Extension allowlist (no SVG/HTML), per-type size cap checked before buffering, path confinement | Plus `nosniff` on all responses |
| Output encoding | React escaping; map popups use `escapeHtml`; assistant replies rendered as text | Unchanged |
| CSP | Enforced in production; `'unsafe-inline'` scripts allowed; `frame-ancestors 'none'` | Unchanged (SEC-028) |
| Other headers | None besides CSP | `X-Content-Type-Options`, `Referrer-Policy`, HSTS (production) |
| Secrets management | Env vars; OpenRouter key AES-GCM encrypted at rest | Tag length pinned (SEC-015); key fallback to `DATABASE_URL` remains (SEC-017) |
| Supply chain | `bunfig.toml` 24h minimum release age; frozen lockfile in Docker | 88 → 1 known advisories in `bun.lock`; stale `package-lock.json` remains (SEC-010) |
| CI/CD | Workflows with default token permissions, tag-pinned actions, unpinned Liara CLI | Read-only token, SHA-pinned actions, pinned CLI, no persisted credentials (SEC-009) |
| Container | `node:22-slim`, multi-stage, healthcheck, runs as root | Unchanged (SEC-011) |
| Logging | JSON envelopes with request ids; CSP reports | OTP/phone removed from logs; no security audit trail (SEC-024) |
| Tests | Unit (vitest), Playwright e2e, Python authz/contract suites | + 19 unit regressions, + `scripts/test-auth-hardening.py` (11 checks) |
