# Security Report

**Date:** 2026-11 · **Scope:** this repository (web app, admin and owner
portals, assistant, offline desktop build, Docker image, CI/CD configuration),
tested against an isolated local instance — both the dev server and the
production build. Production was not tested.

## Summary

| | |
|---|---|
| Findings | 41 (SEC-001 … SEC-041) |
| Critical / High | 1 / 3 — all fixed |
| Medium | 6 — 5 fixed, 1 open (MFA off by default, SEC-026) |
| Low | 5 — all fixed |
| Informational / hardening | 26 — 18 fixed or partly fixed, 7 open (configuration or product decisions), 1 not applicable to this package |

Every fix listed below is covered by an automated test or a scanner re-run.
None of them protects a deployment until this code is deployed there. A clean
result means these tests found nothing; it does not prove the absence of
vulnerabilities.

## Method

- Manual review of authentication, sessions, authorization, server functions,
  file upload and serving, SQL, cryptography, the Docker image, CI/CD and the
  deployment setup.
- Static analysis and dependency scanning: Semgrep, Gitleaks, Trivy,
  OSV-Scanner, `bun audit`, `npm audit`, Checkov, Hadolint, zizmor, Bandit.
- Exploit reproduction against the pre-fix code, then the same tests against
  the fixed code.
- Penetration-style probes (`scripts/test-security-probes.py`) against the dev
  server and the production build: path traversal, exposed files and source
  maps, reflected XSS, open redirects, SQL injection inputs, malicious and
  disguised uploads, session fixation, logout, brute force, user enumeration,
  HTTP methods, CORS, Host header, security headers, cookie flags and error
  leakage. The production build was also run as an unprivileged user (uid
  1000), as the Docker image does.

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
| SEC-038 | Low | Uploads checked by extension only; an HTML page renamed to `.png` was stored | File signature must match the extension (`assertUploadContent`) |
| SEC-040 | Low | Dev server listened on every network interface, exposing project files to the local network | Listens on localhost only; `--host` to opt in |
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
| SEC-033 | Info | Server functions accepted cross-site requests | CSRF middleware: Sec-Fetch-Site, then Origin/Referer against the host |
| SEC-036 | Info | No Permissions-Policy; server-function responses cacheable | Permissions-Policy on every response; `no-store` on `/_serverFn/` |
| SEC-037 | Info | Pages rendered for any HTTP method (`PUT /`, `DELETE /`, …) | 405 unless the path uses that method (`src/lib/method-guard.ts`) |
| SEC-039 | Info | Admin upload ids used unchecked as folder names (could place a file in another folder inside the uploads directory) | Path segments validated (`assertSafePathSegment`) |
| SEC-041 | Info | Desktop build's offline import spliced seed-file keys into SQL as identifiers | Same identifier allowlist as SEC-020 |
| SEC-025 | Info | Known vulnerabilities in desktop/build tooling | Upgraded; one Moderate `minimatch` advisory remains in dev tooling only (eslint, electron-builder), not in the running app |

### Open — action needed

| ID | Severity | Finding | Recommended action |
|---|---|---|---|
| SEC-026 | Medium | MFA is off by default; admins sign in with a password only | Configure the SMS provider, then set `MFA_ENFORCED=true` (at least for admins) |
| SEC-017 | Info | Settings encryption key falls back to `DATABASE_URL` | Set `SETTINGS_ENCRYPTION_KEY` |
| SEC-024 | Info | No audit trail for sign-ins and privileged actions | Add an audit table for auth events and admin actions |
| SEC-028 | Info | CSP allows inline scripts | Move to a nonce-based CSP |
| SEC-029 | Info | First-user-becomes-admin trigger still active | Keep for a fresh install; drop it once the first admin exists |
| SEC-030 | Info | Database TLS without certificate verification | Acceptable on the provider's private network; verify the certificate if the DB is reached over the internet |
| SEC-021 | Info | Company content is passed into the assistant prompt | Keep the assistant read-only; treat model output as untrusted |
| SEC-032 | Info | Open self-registration plus SMS sending | Accepted with rate limits; add CAPTCHA if SMS goes live |

SEC-022 (an `.env` with public-by-design keys in old git history) only matters
if that history is shared; the source package handed over ships without it.

## Verification

Run against a disposable database; never point these at production.

| Test | What it covers | Result |
|---|---|---|
| `scripts/test-security-probes.py` (dev server) | Probes listed under *Method* | 97/97 passed |
| `scripts/test-security-probes.py --prod` | Same, plus source files, source maps, debug endpoint, developer pages, HSTS, Secure cookie, error leakage | 125/125 passed (also as uid 1000) |
| `scripts/test-authz-coverage.py` | Every admin and owner mutation against anonymous, non-admin and cross-owner callers | 51/51 passed |
| `scripts/test-api-contracts.py` | Visibility and input validation of the public API | 13/13 passed |
| `scripts/test-auth-hardening.py` | SEC-004, 005, 007 (run with `MFA_ENFORCED=true`) | all passed |
| `scripts/test-request-hardening.py` | SEC-033 … 036 | all passed |
| `tests/unit/security-regressions.test.ts` | SEC-003, 008, 035, 037, 038, 039 | passed (85 unit tests in total) |
| Browser flows (dev and production build) | First login with national ID, forced password change, unsafe URL rejected, owner save, logo upload, admin pages, public page | passed |
| Migration 0023 | A session created before the migration still signs in after it | passed |

### Scanner results (final code)

| Tool | Result |
|---|---|
| Trivy (dependencies, Dockerfile, secrets) | no findings |
| Checkov (Dockerfile, GitHub Actions, secrets) | 0 failed checks |
| Gitleaks | no findings |
| Hadolint | no findings |
| Semgrep | no confirmed issues; remaining results are style rules, escaped map-popup HTML, test-only scripts, and base images pinned by tag rather than digest |
| zizmor | 1 Low: the deploy job installs a pinned CLI version with `npm install -g` |
| `bun audit` / `npm audit` / OSV-Scanner | 1 Moderate advisory (`minimatch`), dev tooling only |
| Bandit | test scripts only (localhost requests, fixed SQL for the test database) |

Not covered: load/DoS testing, the assistant against a live model, a Docker
build (no container runtime available; the image's runtime user was
reproduced by running the build as uid 1000), and restore of production
backups.

## Before going live

1. Deploy this code; migrations 0022 and 0023 apply automatically at startup.
2. Make the uploads volume writable by uid 1000 (the container no longer runs as root).
3. Set `SETTINGS_ENCRYPTION_KEY`.
4. Configure SMS and enable MFA for admins.
5. Protect the default branch (reviews required, no force pushes).
6. Confirm database and uploads-disk backups with a test restore.
