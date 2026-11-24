# Security Test Coverage

**Date:** 2026-11-24 · Part of the [security audit](SECURITY_AUDIT.md).

## Running the tests

All suites need a **disposable** PostgreSQL database with the migrations
applied (`DATABASE_URL=… bun run db:migrate`, then `bun run seed`) and a
running server. They create and delete their own test accounts and restore
any rows they change. Never point them at production.

```bash
bun run dev                                   # dev server on :8080
DATABASE_URL=postgres://…/test python3 scripts/test-security-probes.py
```

```bash
bun run build && NODE_ENV=production PORT=3000 node .output/server/index.mjs
DATABASE_URL=postgres://…/test BASE_URL=http://localhost:3000 \
  python3 scripts/test-security-strict.py --prod --build .output
```

Unit tests: `bunx vitest run tests/unit`. With
`TEST_DATABASE_URL=postgres://…/test` two database tests also run (they
change nothing: one uses its own bucket names, the other rolls back).

The MFA suite needs the dev server started with `MFA_ENFORCED=true`. The OTP
concurrency checks need a server whose SMS calls go to a stand-in panel that
appends one line per text to the file named by `SMS_STUB_LOG`; without it
they are skipped and a failed-send check runs instead.

## Suites

| Suite | Checks (dev / prod) | Covers | WSTG |
|---|---|---|---|
| `scripts/test-security-probes.py` | 98 / 126 | Security headers, CSP, HSTS, X-Frame-Options; exposed files, source maps, debug pages; path traversal on `/assets`; reflected XSS; open redirects; SQL injection inputs; upload of scripts, disguised files and oversized files; session fixation, cookie flags, hashed tokens, logout; brute-force throttling; user enumeration; HTTP methods, CORS, Host header; error leakage | CONF, ATHN, SESS, INPV, ERRH |
| `scripts/test-security-strict.py` | 203 / 204 | Inventory of all 67 server functions: each non-public one refuses anonymous and non-admin callers; fuzzing every function (wrong types, huge values, NUL bytes, prototype-pollution keys, deep nesting, malformed serialization); unpublished companies; weak passwords; concurrent sign-ups; identifier variants in the throttle; live revocation of admin rights; cookie scope; CRLF; `Sec-Fetch-Site`; secrets or server-only code in the client bundle | ATHZ, INPV, BUSL, SESS |
| `scripts/test-security-deep.py` | 34 / 34 | Every public read walked field by field for internal or personal data; hidden parks and unpublished companies in public reads and the export; password storage (cost, upgrade, equal response times); mass assignment by an owner; review workflow; large bodies from a user who owns nothing; worst-case input cost (ReDoS) | ATHZ, BUSL, CRYP, INPV |
| `scripts/test-security-concurrency.py` | 20 (25 with SMS stand-in) | Rate limits under parallel requests; change-request approval and owner saves under concurrency; admin revocation race and the no-admin sign-up; OTP sends under concurrency, daily cap, cooldown, failed sends; session expiry, revocation, lifetime; tampered cookies | BUSL, ATHN, SESS |
| `scripts/test-security-browser.cjs` (Chromium) | 14 / 14 | Stored XSS in every text field of a company, its products and attachments, on every page that shows them; cross-site and same-site request forgery | CLNT, SESS |
| `scripts/test-authz-coverage.py` | 51 | Admin functions refuse anonymous and non-admin callers; admin cannot revoke themselves; owner A cannot touch owner B's company, products, images or uploads | ATHZ |
| `scripts/test-api-contracts.py` | 13 | Anonymous reads expose only approved and active rows; unauthenticated writes are refused and change nothing; malformed arguments are rejected by validation | APIT |
| `scripts/test-request-hardening.py` | all | Body limits, large multipart only for uploaders, CSRF headers, Permissions-Policy, `no-store`, password-change throttle | CONF, APIT |
| `scripts/test-auth-hardening.py` | all | MFA state per session; verified phone protected; password change needs the current password and signs other sessions out | ATHN |
| `tests/unit/security-regressions.test.ts` | 111 tests in `tests/unit` | Client-address parsing, URL schemes, body limits, methods, upload signatures, path segments, password policy, rate limiter under concurrency (database), no automatic admin (database), upload names, password hashing | — |

## Findings and the tests that guard them

| Finding | Guarded by |
|---|---|
| SEC-001 reflected XSS (framework) | probes "Reflected XSS"; dependency audit |
| SEC-002 seroval DoS, SEC-006 zod memory | strict "Fuzzing every server function"; dependency audit |
| SEC-003 spoofable client address | unit "SEC-003"; strict throttle checks |
| SEC-004, SEC-005, SEC-007 MFA and password change | `test-auth-hardening.py` |
| SEC-008 script URLs | unit "SEC-008"; browser flows step 3 |
| SEC-009 CI/CD | zizmor, Checkov |
| SEC-010, SEC-025 dependencies | `bun audit`, `npm audit`, OSV-Scanner, Trivy |
| SEC-011 root container | Hadolint, Checkov (`USER`) |
| SEC-012 internal fields | deep "Data exposure in public responses" |
| SEC-013 enumeration by timing | deep "Password storage" (equal response times); unit "SEC-056" timing parity |
| SEC-014, SEC-031 debug endpoint and test pages | probes "Exposed files and source code" |
| SEC-016, SEC-036, SEC-045 headers | probes "Security headers"; request-hardening |
| SEC-023 committed hashes, SEC-022 history | Gitleaks, Checkov secrets |
| SEC-027 hashed session tokens | probes "the database stores only a hash of the session token" |
| SEC-033 CSRF | browser "Cross-site request forgery"; strict `Sec-Fetch-Site`; request-hardening |
| SEC-034 password-change throttle | request-hardening; concurrency "current-password guesses" |
| SEC-035, SEC-048 body limits | unit "SEC-035"; request-hardening; deep "Low-privilege abuse" |
| SEC-037 methods | unit "SEC-037"; probes "HTTP methods" |
| SEC-038, SEC-039 uploads | unit "SEC-038", "SEC-039"; probes "File upload" |
| SEC-042, SEC-054 hidden content | deep "Hidden content"; strict "Visibility of unpublished companies" |
| SEC-043 weak passwords | unit "SEC-043"; strict "Account security" |
| SEC-044 database errors | strict "concurrent sign-ups never expose a database error"; fuzzing |
| SEC-047 mass assignment | deep "Mass assignment by a company owner" |
| SEC-050 rate-limit race | unit "SEC-050"; concurrency "Rate limits under parallel requests" |
| SEC-051 OTP race | concurrency "OTP sends" (needs the SMS stand-in) |
| SEC-052 upload names | unit "SEC-052" |
| SEC-053 admin promotion | unit "SEC-053"; concurrency "Admin role under concurrency" |
| SEC-056 password hashing | unit "SEC-056"; deep "Password storage" |
| SEC-015 AES-GCM tag, SEC-018 log masking, SEC-019 timeouts, SEC-020/041 identifier allowlists, SEC-040 dev server interface, SEC-049 desktop navigation | Code review only (no automated test); listed in [VULNERABILITY_REPORT.md](VULNERABILITY_REPORT.md) |

## Not covered

- Load, stress and denial-of-service testing.
- A real SMS provider; the assistant against a live model.
- The Docker image build (no container runtime in the test environment).
- The production deployment: its TLS, router and environment.
- Backup and restore.
- OWASP ZAP; Wapiti's out-of-band SSRF and Log4Shell modules.
- The desktop app's window and navigation rules (reviewed in code, not
  driven by a test).

## Adding a test for a new finding

1. Reproduce the issue with a check in the closest suite, and see it fail.
2. Fix it; see the check pass on the dev server and the production build.
3. Add the finding to `docs/Security Report.md` and to the table above.
