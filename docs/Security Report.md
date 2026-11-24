# Security Report

**Date:** 2026-11 · **Scope:** this repository (web app, admin and owner
portals, assistant, offline desktop build, Docker image, CI/CD configuration),
tested against an isolated local instance — both the dev server and the
production build. Production was not tested.

## Summary

| | |
|---|---|
| Findings | 57 (SEC-001 … SEC-057) |
| Critical / High | 1 / 3 — all fixed |
| Medium | 8 — 7 fixed, 1 open (MFA off by default, SEC-026) |
| Low | 13 — 12 fixed, 1 open (review workflow, SEC-055) |
| Informational / hardening | 32 — 22 fixed or partly fixed, 9 open or accepted (configuration or product decisions), 1 concerning old git history only |

The full audit (scope, threat model, every finding with its evidence, the
fixes, penetration-test commands and results, test coverage and the
production checklist) is in [`docs/security/`](security/SECURITY_AUDIT.md).

Every fix listed below is covered by an automated test or a scanner re-run.
None of them protects a deployment until this code is deployed there. A clean
result means these tests found nothing; it does not prove the absence of
vulnerabilities.

## Method

- Manual review of authentication, sessions, authorization, server functions,
  file upload and serving, SQL, cryptography, the Docker image, CI/CD and the
  deployment setup.
- Static analysis and dependency scanning: CodeQL, Semgrep, Gitleaks, Trivy,
  OSV-Scanner, `bun audit`, `npm audit`, Checkov, Hadolint, zizmor, Bandit.
- Dynamic scanners against the production build: sqlmap (level 3, boolean,
  error, union, stacked and time-based techniques on every public text input
  of the server functions, and on a company owner's company and product
  saves with a signed-in session), Wapiti (XSS, stored XSS, SQL and blind SQL
  injection, command execution, path traversal, CRLF, open redirect, SSRF,
  XXE, CSRF, backup files, upload, Log4Shell/Spring4Shell/Shellshock) and
  Nikto (6,544 checks).
- Exploit reproduction against the pre-fix code, then the same tests against
  the fixed code.
- Concurrency testing: parallel bursts against every throttle and every
  check-then-write step (rate limits, OTP sends, change-request approval,
  admin role changes), with a stand-in SMS panel so OTP sends can be counted.
- Own test suites, run against the dev server and the production build:
  - `scripts/test-security-probes.py`: path traversal, exposed files and
    source maps, reflected XSS, open redirects, SQL injection inputs,
    malicious and disguised uploads, session fixation, logout, brute force,
    user enumeration, HTTP methods, CORS, Host header, security headers,
    cookie flags, error leakage.
  - `scripts/test-security-strict.py`: every server function inventoried and
    checked for authorization (anonymous and non-admin callers); fuzzing of
    every server function with hostile payloads (wrong types, huge values,
    NUL bytes, prototype-pollution keys, deep nesting, malformed
    serialization); visibility of unpublished data; weak passwords;
    concurrent sign-up race; rate-limit bypass through identifier variants;
    revocation of admin rights on live sessions; cookie scope; CRLF
    injection; same-site requests; secrets or server-only code in the client
    bundle.
  - `scripts/test-security-deep.py`: every public read walked field by field
    for internal or personal data; mass assignment by a company owner
    (status, ownership, review fields, listing order, another company's id),
    directly and through change requests; the review workflow (no live
    change and no self-approval before an admin approves); large bodies from
    a self-registered user; worst-case input processing cost (ReDoS);
    nothing of a deactivated park or an unpublished company in public reads
    or the export.
  - `scripts/test-security-concurrency.py`: rate limits, OTP sends,
    change-request approval and admin revocation under parallel requests;
    session expiry and revocation; tampered session cookies.
  - `scripts/test-security-browser.cjs` (real Chromium): stored XSS in every
    text field of a company, its products and attachments, on every page that
    shows them; cross-site and same-site request forgery from another origin.
  - The production build was also run as an unprivileged user (uid 1000), as
    the Docker image does.

## Findings

### Fixed

| ID | Severity | Finding | Fix |
|---|---|---|---|
| SEC-001 | Critical | Reflected XSS in framework server-function responses (TanStack Start advisory) | Framework upgrade |
| SEC-002 | High | seroval deserialization DoS (advisory) | Upgrade to seroval 1.8.1 |
| SEC-004 | High (when MFA is on) | One OTP verified every session of the account | MFA state stored per session (migration 0022) |
| SEC-005 | High (when MFA is on) | Verified MFA phone replaceable from a session that had not passed MFA | `setPhone` requires an MFA-verified session |
| SEC-003 | Medium | Per-IP rate limits keyed on a spoofable `X-Forwarded-For` | Client address taken from the trusted proxy hop (`TRUSTED_PROXY_HOPS`) |
| SEC-006 | Medium | zod memory exhaustion in input validation (advisory) | zod 4 and `.max()` on every array validator |
| SEC-007 | Medium | Password change without the current password; other sessions kept | Current password required (except the forced first-login change); other sessions signed out |
| SEC-009 | Medium | CI/CD: broad token, mutable action tags, unpinned deploy CLI, persisted credentials | Read-only token, SHA-pinned actions, pinned CLI, no persisted credentials |
| SEC-035 | Medium | No request body size limit (unauthenticated memory exhaustion) | 2 MB limit for RPC bodies; multipart up to 110 MB only with a live session |
| SEC-012 | Low | Internal review fields in the public company page and export | Fields stripped on public paths |
| SEC-023 | Low | Initial-password hashes (`scripts/company-national-id-logins.json`) committed with the source | File removed and git-ignored; generated locally from the park's spreadsheet when provisioning |
| SEC-034 | Low | Unthrottled current-password guessing through `changeMyPassword` | 5 attempts per 15 minutes per account |
| SEC-040 | Low | Dev server listened on every network interface, exposing project files to the local network | Listens on localhost only; `--host` to opt in |
| SEC-042 | Low | Attachments of an unpublished (draft, pending, rejected or inactive) company were readable by anyone who knew its id | Same visibility rule as the company itself: public only when published; owner and admins otherwise |
| SEC-043 | Low | Trivial passwords (`12345678`, `password`, `11111111`, …) accepted at sign-up and password change | Blocklist of common passwords, repeated and sequential patterns, and passwords containing the username (NIST SP 800-63B); applies to the first-login change too |
| SEC-044 | Low | Two simultaneous sign-ups with one email returned the raw database error (table and constraint names) | Duplicate e-mail reported as `EMAIL_ALREADY_REGISTERED`; a global middleware turns any database error into `INTERNAL_ERROR` and logs the details |
| SEC-047 | Low | A company owner could set the company's `sort_order` and move it to the top of the public listing, directly or through a change request | Listing order is admin-only: stripped from owner saves and filtered again when a change request is approved, together with status, ownership and review fields |
| SEC-048 | Low | Any signed-in account, including a self-registered one that owns nothing, could send upload-sized bodies (up to 110 MB) that the server buffers | Large multipart bodies only from an admin or a company owner (the only users with an upload function) |
| SEC-008 | Info | `javascript:`/`data:` URLs accepted in owner-editable URL fields | `src/lib/safe-url.ts` on every URL field |
| SEC-010 | Info | Stale `package-lock.json` with known-vulnerable versions | Regenerated |
| SEC-011 | Info | Container ran as root | Runs as `node` (uid 1000); uploads directory owned by that user |
| SEC-013 | Info | Username enumeration through login response time | Same scrypt cost for unknown accounts |
| SEC-014 | Info | Debug endpoint on whenever `NODE_ENV` is unset | Opt-in only |
| SEC-015 | Info | AES-GCM tag length not pinned | `authTagLength: 16` |
| SEC-016 | Info | Missing nosniff, Referrer-Policy, HSTS | Added to every response |
| SEC-018 | Info | OTP code and full phone number in logs | Masked phone, no code |
| SEC-019 | Info | No timeouts on outbound HTTP calls | Timeouts on all provider calls |
| SEC-020 | Info | Export snapshot keys spliced into SQL as identifiers | Identifier allowlist |
| SEC-027 | Info | Session tokens stored as-is in the database | Only the SHA-256 of the token is stored (migration 0023 converts existing sessions without signing anyone out) |
| SEC-031 | Info | Developer test pages (`/perf`, `/dev/logo`) served in production | 404 in production builds |
| SEC-033 | Info | Server functions accepted cross-site requests | CSRF middleware: Sec-Fetch-Site (same-origin only), then Origin/Referer against the host |
| SEC-036 | Info | No Permissions-Policy; server-function responses cacheable | Permissions-Policy on every response; `no-store` on `/_serverFn/` |
| SEC-038 | Info | Uploads checked by extension only; an HTML page renamed to `.png` was stored (it was still served as an image, never as HTML) | File signature must match the extension (`assertUploadContent`) |
| SEC-037 | Info | Pages rendered for any HTTP method (`PUT /`, `DELETE /`, …) | 405 unless the path uses that method |
| SEC-039 | Info | Admin upload ids used unchecked as folder names | Path segments validated (`assertSafePathSegment`) |
| SEC-041 | Info | Desktop build's offline import spliced seed-file keys into SQL as identifiers | Same identifier allowlist as SEC-020 |
| SEC-049 | Info | Desktop build: links to other sites opened inside the app window and device permissions were not restricted | Only the local app opens in the window; other web, mail and phone links go to the system browser, anything else is blocked; permissions refused except clipboard writing |
| SEC-045 | Info | No `X-Frame-Options` header (framing was already blocked by CSP `frame-ancestors`) | `X-Frame-Options: DENY` on every response |
| SEC-025 | Info | Known vulnerabilities in desktop/build tooling | Upgraded; one Moderate `minimatch` advisory remains in dev tooling only (eslint, electron-builder), not in the running app |
| SEC-050 | Medium | Rate limits counted and recorded in two separate steps, so parallel requests all passed: 20 simultaneous current-password guesses against a limit of 5 were all checked, 30 simultaneous sign-ins against a limit of 8 got 10–11 through | Count and record under a per-bucket transaction lock (`pg_advisory_xact_lock`) |
| SEC-053 | Medium | Any new account became admin whenever no admin role existed, and two admins revoking each other at the same moment removed every admin role; the next self-registered account then became admin | Migration 0024: only the very first account ever created becomes admin; `revokeAdmin` locks the admin rows and requires the caller to still be one |
| SEC-051 | Low (Medium once SMS is live) | OTP send cooldown and daily cap read before the send and recorded after it: 10 parallel requests sent 10 texts to the account's number | Send slot claimed in one conditional `UPDATE` before the SMS call; handed back if the send fails |
| SEC-056 | Low | Password hashes used Node's default scrypt cost (N=2^14, r=8, p=1), a fifth of the OWASP Password Storage Cheat Sheet minimum; matters if the hashes ever leak | N=2^14, r=8, p=5 (an OWASP-equivalent setting at the same 16 MiB); older hashes still verify, cost the same time to check, and are replaced at the next sign-in |
| SEC-054 | Low | The public export (`/api/public/export`), `getParkContent` and park attachments returned a park an admin had deactivated (with its content, images and news) and the attachments of unpublished companies | Same visibility rules as the public site: nothing of a deactivated park, a company's files only while it is published; admins still see everything |
| SEC-052 | Info | Uploaded files are served to anyone with the path, and the only unpredictable part of the name came from `Math.random` (about 31 bits) | 96 bits from the CSPRNG (`newUploadName()`) in every upload function |

### Open or accepted

| ID | Severity | Finding | Recommended action |
|---|---|---|---|
| SEC-026 | Medium | MFA is off by default; admins sign in with a password only | Configure the SMS provider, then set `MFA_ENFORCED=true` (at least for admins) |
| SEC-055 | Low | An owner can still edit a company while it waits for review, so the content an admin approves can differ from what they looked at; an owner save already under way can also land just after approval | Product decision: freeze edits while pending, or have approval carry the version the admin reviewed and refuse if it changed |
| SEC-017 | Info | Settings encryption key falls back to `DATABASE_URL` | Set `SETTINGS_ENCRYPTION_KEY` |
| SEC-024 | Info | No audit trail for sign-ins and privileged actions | Add an audit table for auth events and admin actions |
| SEC-028 | Info | CSP allows inline scripts | Move to a nonce-based CSP |
| SEC-029 | Info | On a fresh, empty database the first account to sign up becomes admin | Create the admin account before the site is reachable (since migration 0024 nothing else is ever promoted automatically) |
| SEC-030 | Info | Database TLS without certificate verification | Acceptable on the provider's private network; verify the certificate if the DB is reached over the internet |
| SEC-021 | Info | Company content is passed into the assistant prompt | Keep the assistant read-only; treat model output as untrusted |
| SEC-032 | Info | Open self-registration plus SMS sending | Accepted with rate limits; add CAPTCHA if SMS goes live |
| SEC-046 | Info | Sign-up says when an email is already registered | Accepted: needed for the sign-up form, limited to 5 sign-ups per hour per client |
| SEC-057 | Info | The session cookie is named `session`, without the `__Host-` prefix ASVS 5.0 (3.3.1) asks for; the prefix stops sibling sites under a shared parent domain from planting the cookie | `liara.run` is on the Public Suffix List, so browsers already refuse such cookies there; rename the cookie to `__Host-session` in production (reading the old name during a transition) before moving to a custom domain shared with other sites |

SEC-022 (an `.env` with public-by-design keys in old git history) concerns the
history only; rotate those keys if any of them was ever private.

## Verification

Run against a disposable database; never point these at production.

| Test | Result |
|---|---|
| `scripts/test-security-deep.py` (dev / production build) | 34/34, 34/34 passed |
| `scripts/test-security-concurrency.py` (dev / production build) | 20/20, 20/20 passed; 25/25 with a stand-in SMS panel |
| `scripts/test-security-strict.py` (dev / production build) | 203/203, 204/204 passed (2,800+ hostile requests, no crash, no stack trace, no database error) |
| `scripts/test-security-browser.cjs` (dev / production build) | 14/14 passed |
| `scripts/test-security-probes.py` (dev / production build) | 98/98, 126/126 passed (an earlier version also run as uid 1000) |
| `scripts/test-authz-coverage.py` | 51/51 passed |
| `scripts/test-api-contracts.py` | 13/13 passed |
| `scripts/test-auth-hardening.py` (`MFA_ENFORCED=true`) | all passed |
| `scripts/test-request-hardening.py` | all passed |
| `tests/unit/security-regressions.test.ts` | passed (111 unit tests in total, 2 of them against the test database) |
| Browser flows (first login, forced password change, URL validation, admin pages, public page; production build) | 8/8 passed |
| Migration 0023 | a session created before it still signs in after it |
| Migration 0024 | on an empty database exactly one of two simultaneous first sign-ups becomes admin; later accounts never do |

### Scanner results (final code)

| Tool | Result |
|---|---|
| sqlmap | no injectable parameter (sign-in, company detail, attachments, park content, assistant; signed-in owner's company and product saves; admin role revocation) |
| Wapiti | 0 vulnerabilities; informational anomalies only (allowed HTTP methods, robots.txt); its SSRF and Log4Shell modules need an outside callback host that the test network does not reach |
| Nikto | no findings; one false positive ("ETag inode leak" applies to Apache, the ETag here is a content hash) |
| Trivy (dependencies, Dockerfile, secrets) | no findings |
| Checkov (Dockerfile, GitHub Actions, secrets) | 0 failed checks |
| Gitleaks | no findings |
| Hadolint | no findings |
| Semgrep | no confirmed issues; remaining results are style rules, escaped map-popup HTML, the constant `X-Frame-Options: DENY` (the rule looks for user input in that header), test-only scripts, and base images pinned by tag rather than digest |
| zizmor | 1 Low: the deploy job installs a pinned CLI version with `npm install -g` |
| `bun audit` / `npm audit` / OSV-Scanner (offline database downloaded the same day) | 1 Moderate advisory (`minimatch`), dev tooling only |
| Bandit | test scripts only (localhost requests, fixed SQL for the test database) |
| CodeQL 2.27.4 (JavaScript/TypeScript security-and-quality and security-experimental suites; GitHub Actions queries) | no confirmed issues; 41 security results, all in one-off dev scripts, the desktop app's own data folder, or inventory queries that list calls receiving outside data (for example passwords passed to scrypt); Actions: 0 |

Not covered: load/DoS testing, the assistant against a live model, a real
SMS provider (a stand-in answered instead), a Docker build (no container
runtime available; the image's runtime user was reproduced by running the
build as uid 1000), restore of production backups, and the production
deployment itself. Not run: OWASP ZAP (its scan add-ons could not be
obtained in the test environment); sqlmap, Wapiti, Nikto and the own suites
cover the same ground for this application.

## Before going live

1. Apply migrations 0022, 0023 and 0024 and deploy this code back to back: run
   `DATABASE_URL=<production> bun run db:migrate` from a checkout (the
   container does not run migrations; the code needs 0022's column, and 0023
   changes how sessions are looked up).
2. Make the uploads volume writable by uid 1000 (the container no longer runs as root).
3. Set `SETTINGS_ENCRYPTION_KEY`.
4. Configure SMS and enable MFA for admins.
5. Protect the default branch (reviews required, no force pushes).
6. Confirm database and uploads-disk backups with a test restore.
