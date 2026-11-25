# Security Audit

**Date:** 2026-11-24 · **Standards:** OWASP ASVS 5.0, OWASP Web Security
Testing Guide (WSTG), OWASP API Security Top 10 (2023) · **Target:** this
repository (web application, admin and company-owner portals, assistant,
offline desktop build, Docker image, CI/CD), tested on isolated local
instances only: the dev server and the production build, against a
disposable PostgreSQL 16 database. The production deployment was not
touched.

| Document | Contents |
|---|---|
| SECURITY_AUDIT.md (this file) | Scope, discovery, architecture, threat model, review by category, ASVS mapping, final recommendation |
| [VULNERABILITY_REPORT.md](VULNERABILITY_REPORT.md) | Every finding: confirmed, potential, false positives, untested areas, with evidence |
| [SECURITY_FIXES.md](SECURITY_FIXES.md) | Root cause, change and regression test for each fix |
| [PENETRATION_TEST_RESULTS.md](PENETRATION_TEST_RESULTS.md) | Commands, targets and results of every scanner and dynamic test |
| [SECURITY_TEST_COVERAGE.md](SECURITY_TEST_COVERAGE.md) | What each test suite covers, how to run it, what is not covered |
| [PRODUCTION_SECURITY_CHECKLIST.md](PRODUCTION_SECURITY_CHECKLIST.md) | What must be true before and after going live |

The short summary of all findings is [`docs/Security Report.md`](../Security%20Report.md).

## Final recommendation: CONDITIONAL PASS

No open Critical or High finding. Every confirmed vulnerability in the code
is fixed and covered by tests that failed before the fix and pass after it,
except SEC-055 (Low), a review-workflow design weakness that needs a product
decision.
The application may go live once the conditions below are met; until then
the deployed site does not have these fixes.

| # | Condition | Why |
|---|---|---|
| 1 | Back up the database, then deploy this code; the container applies migrations 0022–0024 itself at start-up | None of the fixes protects the live site until it runs this code |
| 2 | Turn on MFA for admins: configure the SMS provider, check one real code and one failed send, set `MFA_ENFORCED=true` (SEC-026, Medium, open) | Today an admin account is protected by its password alone; no SMS account existed to test with |
| 3 | Set `SETTINGS_ENCRYPTION_KEY` and re-enter the assistant key once (SEC-017) | Otherwise the key is derived from `DATABASE_URL`, and the restore drill showed it is lost after a restore to a new database address or a database password change |
| 4 | Run `scripts/backup-restore-drill.sh` on the real backups | The drill was tested on a copy of the test database |
| 4a | Edge protection and sizing: CDN or edge rate limiting, CPU sized for peak traffic (SEC-059, SEC-060) | A distributed sign-in flood slows sign-in; past about 350 requests per second per CPU some requests wait 10–30 s |
| 5 | Decide the review-workflow rule (SEC-055, Low, open) | An owner can still change a company while it waits for review |
| 6 | Rotate the keys found in old git history if any of them was ever private (SEC-022) | They remain in the history |

Remaining accepted or open risks, each explained in
[VULNERABILITY_REPORT.md](VULNERABILITY_REPORT.md#open-and-accepted-risks):
inline scripts allowed by the CSP (SEC-028), no audit trail (SEC-024),
first-account-becomes-admin on an empty database (SEC-029), database TLS
without certificate verification (SEC-030), assistant prompt content
(SEC-021), open self-registration (SEC-032, SEC-046), session cookie without
the `__Host-` prefix (SEC-057), one Moderate advisory in dev tooling only
(SEC-025), sign-in under a distributed flood (SEC-059), no load shedding
past capacity (SEC-060), unfixed CVEs in the Debian base image (SEC-061).

Not tested, and therefore not covered by this recommendation: a real SMS
provider (no account exists, and the providers' documentation was not
reachable from the test network), the assistant against a live model,
restoring the real production backups, and the live site (the read-only
checks need a network approval that was not available at the time;
they are listed in the production checklist). The Docker image, load and
denial-of-service behaviour, and backup and restore were tested locally. A
clean test result means these tests found nothing; it does not prove the
absence of vulnerabilities.

## Phase 1: discovery

### Components

| Component | Implementation |
|---|---|
| Frontend | React 19, TanStack Router, server-side rendered by TanStack Start 1.169; Vite 8 build |
| Backend | TanStack Start server functions (RPC over `/_serverFn/<id>`, seroval-encoded), Nitro node server; entry `src/server.ts` (method guard, body limits, security headers), `src/start.ts` (CSRF, request id, database-error guard) |
| Database | PostgreSQL through postgres.js tagged templates (parameterised); 24 migrations in `db/migrations`, applied by the server at start-up under a database lock (or `bun run db:migrate`) |
| File storage | Local disk under `UPLOAD_DIR`, served by `src/routes/assets.$.ts` |
| Authentication | Own implementation: e-mail or company national ID plus password (scrypt), opaque session token in an `httpOnly` cookie, SHA-256 of the token in `sessions`; optional SMS one-time code (`MFA_ENFORCED`) |
| Authorization | Roles in `user_roles` (`admin`, `company_owner`); middleware `requireAuth` / `requireMfaVerified`; per-function admin checks; ownership from `exhibition_companies.owner_user_id` read from the database, never from the request |
| Rate limiting | PostgreSQL table `rate_limit_hits`, per account and per client address (trusted proxy hop) |
| Outbound services | SMS panels (Kavenegar, Melipayamak, Ghasedak), an AI chat provider for the assistant, both with timeouts; Google Maps and OpenStreetMap tiles in the browser |
| Desktop build | Electron app with an embedded PostgreSQL on 127.0.0.1, seeded from the public export |
| Deployment | Docker image (runs as uid 1000) on Liara; GitHub Actions deploy workflow with pinned actions and a read-only token |
| WebSockets | None (no WebSocket, socket.io or EventSource in the code) |
| Payments | None (no payment provider, checkout, wallet or invoice code) |
| JWT | None (sessions are opaque database tokens) |
| CORS | None configured (no `Access-Control-*` headers are sent; cross-origin reads are refused by the browser) |

### Entry points

- 67 server functions in 11 modules (20 GET, 47 POST). Twelve can be called
  without a session: `signIn`, `signUp`, `signOutFn`, `askAssistant`,
  `getExhibitionCompanies`, `getExhibitionCompanyDetail`,
  `getPublicExhibitionProducts`, `getAttachments`, `getParkContent`,
  `getActiveParks`, `getInactiveParkIds`, `getAboutSections`. All others
  require a session, and every admin function checks the admin role on the
  server.
- HTTP routes: 25 page routes, `/assets/*` (stored files), and
  `/api/public/export`, `/api/public/health`, `/api/public/csp-report`,
  `/api/public/asset-audit`, `/api/public/debug-echo` (off unless enabled).
- Configuration (environment): `DATABASE_URL`, `UPLOAD_DIR`,
  `MFA_ENFORCED`, `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_LINE`,
  `SETTINGS_ENCRYPTION_KEY`, `TRUSTED_PROXY_HOPS`, `CSP_ENFORCE`, assistant
  provider keys and models, `OFFLINE_SYNC_SOURCE`, `WEB_CONCURRENCY`,
  `LOG_SINK`, `SEED_ASSET_DIR`, `NODE_ENV`.

### Trust boundaries

```
 Browser (anonymous, self-registered user, company owner, admin)
   │  HTTPS (Liara router, one trusted proxy hop)
   ▼
 Node server ── method guard ── body limit ── CSRF check ── zod validation ── role / ownership checks
   │                │                                   │
   │ postgres.js    │ local disk (UPLOAD_DIR)            │ HTTPS with timeouts
   ▼                ▼                                   ▼
 PostgreSQL      uploads served by /assets          SMS panel, AI provider

 Desktop app (Electron) ── HTTPS ── /api/public/export (public data only)
 GitHub Actions ── Liara deploy token (repository secret)
```

Everything that arrives from the browser is untrusted, including the
server-function id, the serialized payload, cookies, `Host`,
`X-Forwarded-*` and `Sec-Fetch-*` headers. Company owners are trusted with
their own company only; the content they submit is untrusted for every
other viewer. Values from the SMS panel and the AI provider are untrusted.

## Threat model

| Asset | Threat (STRIDE) | Attacker | Controls in place | Residual risk |
|---|---|---|---|---|
| Admin privileges | Elevation: self-registered account becomes admin | Anonymous | Roles only in `user_roles`; admin checks on the server; since migration 0024 only the first account ever created is promoted (SEC-053) | Empty database at install time (SEC-029) |
| Admin accounts | Spoofing: password guessing, credential stuffing | Anonymous | Per-account and per-address limits that hold under parallel requests (SEC-050); scrypt; password policy | No MFA until enabled (SEC-026) |
| Sessions | Spoofing: theft, fixation, replay after logout | Network, XSS, DB reader | `httpOnly`, `Secure`, `SameSite=Lax`; new token at sign-in; row deleted at logout; token hashed in the DB; CSP | Cookie name without `__Host-` (SEC-057) |
| Company data | Tampering: owner edits another company or bypasses review | Company owner | Ownership from the DB row; admin-only fields stripped; edits to a published company become change requests | Edits during review (SEC-055) |
| Unpublished content | Information disclosure | Anonymous | Visibility rules in every public read and the export (SEC-042, SEC-054) | Files stay reachable by URL; names now have 96 random bits (SEC-052) |
| Personal data | Information disclosure | Anonymous, DB reader | Public responses walked field by field by tests; hashes and tokens never returned | Old git history (SEC-022) |
| Password hashes | Offline cracking after a leak | DB reader | scrypt at the OWASP-equivalent cost (SEC-056) | Initial passwords of company accounts are mobile numbers until first login |
| SMS and AI budget | Denial of wallet | Self-registered user | Rate limits; OTP cooldown and daily cap enforced atomically (SEC-051) | No CAPTCHA (SEC-032) |
| Availability | Denial of service | Anonymous | Body limits, header timeout, method guard, input length limits, no ReDoS in tested inputs; tested with floods, slowloris and load on the real image | Sign-in under a distributed flood (SEC-059); no load shedding past capacity (SEC-060) |
| Server functions | Cross-site request forgery | Other website | CSRF middleware (`Sec-Fetch-Site`, then `Origin`/`Referer`); `SameSite=Lax` | none known |
| Uploads | Malicious file, path traversal | Owner, admin | Extension and file-signature checks; safe path segments; `nosniff`; served as stored type | none known |
| Desktop app | Navigation to hostile sites, device access | Hostile content | Navigation and new windows restricted; permissions refused | none known |
| Container | Exploiting the runtime image | Attacker with code execution | App runs as uid 1000 with no capabilities and no-new-privileges (the entrypoint starts as root only to re-own the uploads disk, without following links); read-only application files; no package managers (SEC-058) | Unfixed Debian CVEs (SEC-061) |
| Backups | Disclosure or unusable restore | Anyone with backup access; disaster | Drill script with checksums, owner-only files | Backups hold hashes and the encrypted key; key lost on restore without `SETTINGS_ENCRYPTION_KEY` (SEC-017) |
| CI/CD | Supply chain, token theft | Third party | Pinned actions, read-only token, pinned CLI | `npm install -g` of a pinned CLI (zizmor Low) |

## Phase 2: review by category

Each category was checked in the code, not assumed; "Test" names the suite
that exercises it (see [SECURITY_TEST_COVERAGE.md](SECURITY_TEST_COVERAGE.md)).

| Category | Result | Evidence |
|---|---|---|
| SQL injection | No issue. All queries are postgres.js tagged templates; dynamic identifiers only from allowlists (SEC-020, SEC-041) | sqlmap on 8 inputs; strict-suite fuzzing; CodeQL |
| Cross-site scripting | No issue. React escaping; URL fields refuse script schemes (SEC-008); CSP; framework XSS advisory fixed (SEC-001) | Browser suite (stored XSS in every field), Wapiti |
| CSRF | Fixed earlier (SEC-033) | Browser suite, probes |
| SSRF | Not applicable: no request goes to a URL taken from user input; outbound hosts are fixed or set by environment | Code search of every `fetch(`, CodeQL |
| Broken authentication | Fixed this round: rate-limit race (SEC-050), weak hash cost (SEC-056); earlier: SEC-004, 005, 007, 013, 034, 043 | Concurrency, deep, strict, MFA suites |
| Broken access control | Fixed this round: admin role race and promotion rule (SEC-053) | Authz suite (51), strict suite, concurrency suite |
| IDOR | No issue. Product, image and change-request ids are checked against the owning company read from the database | Authz suite, deep suite |
| Privilege escalation | SEC-053 fixed; mass assignment of status, ownership, review fields and listing order refused (SEC-047) | Deep suite |
| Sensitive data exposure | Fixed this round: hidden parks and unpublished companies' files (SEC-054); earlier SEC-012, SEC-042 | Deep suite (field-by-field walk of every public read) |
| Hardcoded secrets | None in the working tree; one old `.env` in history (SEC-022) | Gitleaks (tree and full history), Trivy, Checkov |
| Insecure file upload | Fixed earlier (SEC-038, SEC-039, SEC-048); file names hardened this round (SEC-052) | Probes, request-hardening suite, unit tests |
| Path traversal | No issue. Storage paths resolved inside `UPLOAD_DIR` | Probes, Wapiti |
| Insecure deserialization | seroval advisory fixed (SEC-002); malformed payloads refused | Strict-suite fuzzing |
| Race conditions | Fixed this round: SEC-050, SEC-051, SEC-053; change-request approval and owner saves verified safe | Concurrency suite |
| Business logic | Review workflow checked; one design weakness open (SEC-055) | Deep suite, manual review |
| JWT / session management | No JWT. Sessions: expiry, revocation, logout, fixation, tampering all refused | Concurrency suite, probes |
| Rate limiting | SEC-050 fixed; per-address keys from the trusted proxy hop (SEC-003) | Concurrency suite, strict suite |
| CORS | No CORS headers; cross-origin reads refused by the browser | Probes |
| WebSockets | Not applicable (none in the code) | Code search |
| Dependency vulnerabilities | One Moderate advisory in dev tooling only (SEC-025) | `bun audit`, `npm audit`, OSV-Scanner, Trivy |

## OWASP ASVS 5.0 mapping

| ASVS chapter | Status | Notes |
|---|---|---|
| V1 Encoding and Sanitization | Verified | Parameterised SQL, React output encoding, URL scheme checks |
| V2 Validation and Business Logic | Verified, one open item | zod on every server function with length limits; business flows tested under concurrency; SEC-055 open |
| V3 Web Frontend Security | Partly | Security headers, `X-Frame-Options`, CSP with `unsafe-inline` (SEC-028); cookie prefix missing (SEC-057) |
| V4 API and Web Service | Verified | Method guard, body limits, `no-store` on server functions, CSRF on state changes |
| V5 File Handling | Verified | Type and signature checks, size limits, safe paths, `nosniff`, unpredictable names |
| V6 Authentication | Partly | Password policy, throttling, hashing verified; MFA off by default (SEC-026) |
| V7 Session Management | Verified | Opaque tokens, hashed at rest, expiry, logout, revocation, password-change sign-out |
| V8 Authorization | Verified | Server-side checks on every function; ownership from the database |
| V9 Self-contained Tokens | Not applicable | No JWT |
| V10 OAuth and OIDC | Not applicable | Not used |
| V11 Cryptography | Verified, one condition | scrypt at OWASP cost; AES-GCM with pinned tag length; CSPRNG for tokens and file names; `SETTINGS_ENCRYPTION_KEY` must be set |
| V12 Secure Communication | Partly | HSTS in production; TLS terminated by the host; database TLS without certificate verification (SEC-030) |
| V13 Configuration | Verified, conditions | Non-root container, debug endpoints off in production, secrets from environment |
| V14 Data Protection | Verified | Internal fields stripped from public responses and the export |
| V15 Secure Coding and Architecture | Verified | Dependency scanning, pinned CI actions |
| V16 Security Logging and Error Handling | Partly | Database errors hidden from clients and logged with a request id; no audit trail (SEC-024) |
| V17 WebRTC | Not applicable | Not used |

## How this audit was run

1. Discovery and assessment plan before any change (this document).
2. Manual review of every category above against the code.
3. Static analysis: CodeQL, Semgrep (five rule sets), Gitleaks, Trivy,
   OSV-Scanner, `bun audit`, `npm audit`, Checkov, Hadolint, zizmor, Bandit.
4. Authentication and authorization tests, including negative cases, and
   concurrency tests.
5. Business-logic tests of the company review workflow (there are no
   payments).
6. Dynamic testing of the local production build: passive checks first
   (headers, Nikto), then sqlmap and Wapiti, only against local instances.
   The Docker image built from the Dockerfile, run as in production, scanned
   and tested with every suite, then load and denial-of-service tests
   against it; a backup and restore drill.
7. Each confirmed issue: reproduced on the unfixed code, fixed, regression
   test added, all suites re-run.
8. Final re-run of every scanner and suite on the final code, for both the
   repository and the client export.

<!-- repo-only -->
Raw outputs of this round are in `security-audit/evidence/r7/`; earlier
rounds are in `security-audit/evidence/`.
<!-- /repo-only -->
