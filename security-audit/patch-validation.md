# Patch Validation

Environment for all runs: Linux container, Node 22.23.4, Bun 1.4.4, PostgreSQL 16
(disposable, seeded with `bun run seed` + the 2026-08 directory migration), Chromium
via Playwright. Dates are UTC, 2026-11-16.

## Per-finding validation

| Finding | Patch | Test | Baseline result | Patched result | Evidence |
|---|---|---|---|---|---|
| SEC-001, SEC-002 | `763c1c6` dependency upgrades | `bun audit`, OSV-Scanner offline | Reported (Critical) | Not reported | `evidence/bun-audit.log`, `evidence/osv-scanner.json` |
| SEC-003 | `2377040` + `src/lib/client-ip.ts` | Playwright login ×3 with spoofed `X-Forwarded-For`, then `SELECT bucket FROM rate_limit_hits` | 3 distinct buckets (`203.0.113.2/4/6`) | 1 bucket `198.51.100.7` ×3 | this file; unit tests |
| SEC-003 | — | `tests/unit/security-regressions.test.ts` (5 cases) | n/a (helper did not exist) | pass | `evidence/unit-tests.txt` |
| SEC-004 | migration `0022`, session-bound MFA | `scripts/test-auth-hardening.py` (MFA_ENFORCED=true) | 2 FAIL — second session verified, MFA-gated call allowed | pass | `evidence/auth-hardening-baseline-mfa.txt`, `evidence/auth-hardening-patched.txt` |
| SEC-005 | `setPhone` guard | same script | 2 FAIL — phone replaced (`09129999999`) | pass — `PHONE_CHANGE_REQUIRES_MFA`, phone unchanged; verified session can still change it | same |
| SEC-007 | `2377040` | same script, SEC-007 block (5 checks) | not run (check written after the fix) | pass — refused without/with wrong current password; other session signed out | `evidence/auth-hardening-patched.txt` |
| SEC-006 | zod 4.6.7 | `bun audit`; full regression | Reported (High) | Not reported; all suites pass | — |
| SEC-008 | `src/lib/safe-url.ts` | 14 unit cases; Playwright: save `javascript:alert(document.cookie)` then `https://…` | stored (pre-fix code accepted any string) | rejected / saved | `evidence/e2e-login-flows.txt` |
| SEC-009 | workflows | zizmor, Checkov, Semgrep, YAML parse | zizmor 8 Medium + 1 Low; Semgrep pin rule 7 | zizmor 1 Low; Checkov 296/296; Semgrep 0 | `evidence/zizmor.log`, `evidence/semgrep-before-after.txt` |
| SEC-012 | public-path field stripping | Anonymous company page response; export | `owner_user_id` UUID present | no UUID; 0 non-null `rejection_note` in export | — |
| SEC-013 | dummy scrypt | code review | — | — | not measured |
| SEC-014 | opt-in debug endpoint | `curl /api/public/debug-echo` on production build | enabled when `NODE_ENV` unset (by code) | 404 with `production` and unset | — |
| SEC-015 | `authTagLength: 16` | Semgrep `gcm-no-tag-length` | 1 | 0 | `evidence/semgrep-before-after.txt` |
| SEC-016 | headers | `curl -D -` on production build (HTML and `/assets/x.png`) | absent | `nosniff`, `strict-origin-when-cross-origin`, `max-age=31536000` present | — |
| SEC-018 | log message | dev log after `requestOtp` without provider | `OTP for 0912… (code: NNNNNN)` | masked phone, no code (by code review; requestOtp path unchanged) | — |
| SEC-019, SEC-020 | timeouts, identifier allowlist | code review + build | — | — | not fault-injected |

## Regression of legitimate behaviour (post-patch)

| Suite | Result |
|---|---|
| `scripts/test-authz-coverage.py` (anonymous, non-admin, owner-A→B against every mutation) | 51 passed, 0 failed |
| `scripts/test-api-contracts.py` (visibility, input validation) | 13 passed, 0 failed |
| Browser flows: first login with national ID + CEO mobile (Persian digits), forced password set, unsafe URL rejected, owner save → pending review, old password rejected, new password works, admin login + users list, public company page | 8/8 OK, no page errors |
| Unit tests (vitest) | 45 passed (26 existing + 19 new) |
| Type check | 7 errors, identical to the pre-audit baseline (missing `recharts`/`embla-carousel-react` type packages) |
| Production build (`bun run build`) | success |
| i18n lint | no new violations |

## Scanner deltas (before → after)

| Tool | Before | After |
|---|---|---|
| bun audit (`bun.lock`) | 88 (4 C, 41 H) | 1 Moderate |
| Semgrep security-relevant rules (table in `evidence/semgrep-before-after.txt`) | 35 hits | 28 hits (−1 GCM, −7 action pinning, +1 false positive inside the evidence folder; the rest are false positives or open hardening items, see false-positives.md) |
| zizmor | 8 Medium, 1 Low | 1 Low |
| Gitleaks working tree | 0 | 0 |

## Not validated

- SEC-013 timing equalisation was not measured statistically.
- SEC-019 timeouts were not exercised with a stalled upstream.
- SEC-021 was not tested against a live model.
- No test ran against production; deployment state is unverified.
