# Findings Register

32 findings. Every finding that claims an exploitable bug was verified with Trail of Bits
`fp-check` ([fp-check-verification.md](fp-check-verification.md)): 8 TRUE POSITIVES,
8 FALSE POSITIVES (kept as hardening, severity Informational). Status vocabulary: **Confirmed** (reproduced or directly evidenced),
**Confirmed (advisory)** (vulnerable version present and reachable code path exists; the
exploit itself was not reproduced), **Potential**, **Hardening (fp-check: false positive)** (not exploitable; fix kept), **Requires environment access**.
"Conditional" severity applies only under a stated configuration.

CVSS v4.0 vectors are given where the information supports them; numeric scores were
not computed (no calculator was run) and are deliberately omitted rather than guessed.

Pre-fix line numbers refer to commit `d877c06` (audit start); post-fix to the current
branch head. Commits: `763c1c6` dependencies, `5e9dc7c` CI, `2377040` app hardening,
`97d4db0` session-bound MFA, OTP log redaction, timeouts, identifier allowlist and
checkout credentials, `72e224e` this report.

| ID | Title | Severity | Status | Patch |
|---|---|---|---|---|
| SEC-001 | Reflected XSS in TanStack Start server-function responses | Critical | Confirmed (advisory) | Applied |
| SEC-002 | seroval deserialization invokes attacker-chosen callables / DoS | High | Confirmed (advisory) | Applied |
| SEC-004 | MFA verification shared by every session of an account | High (conditional) | Confirmed | Applied |
| SEC-005 | Verified MFA phone replaceable without passing MFA | High (conditional) | Confirmed | Applied |
| SEC-003 | Per-IP rate limits keyed on attacker-controlled X-Forwarded-For | Medium | Confirmed | Applied |
| SEC-006 | zod memory exhaustion in server-function input validation | Medium | Confirmed (advisory) | Applied |
| SEC-007 | Password change without current password; sessions not revoked | Medium | Confirmed | Applied |
| SEC-009 | CI/CD: broad token, mutable action tags, unpinned deploy CLI, persisted credentials | Medium | Confirmed | Applied |
| SEC-010 | Stale `package-lock.json` pins 37 known-vulnerable packages | Medium | Confirmed | Not started |
| SEC-026 | MFA disabled by default; admin accounts are password-only | Medium | Confirmed | Proposed (config + code) |
| SEC-011 | Container runs as root | Low | Confirmed | Proposed |
| SEC-012 | Internal review fields in public company detail and export | Low | Confirmed | Applied |
| SEC-016 | Missing nosniff, Referrer-Policy and HSTS headers | Low | Confirmed | Applied |
| SEC-017 | Settings encryption key falls back to DATABASE_URL | Low | Confirmed | Proposed (config) |
| SEC-022 | `.env` with public-by-design keys in git history | Low | Confirmed | Proposed |
| SEC-023 | Brute-forceable initial-password hashes committed to the repo | Low | Confirmed | Proposed |
| SEC-024 | No security audit trail for auth events and privileged actions | Low | Confirmed | Proposed |
| SEC-025 | Known vulnerabilities in desktop and build toolchain dependencies | Low | Confirmed | Partially applied |
| SEC-008 | Script-capable URL schemes stored in owner-editable URL fields | Informational | Hardening (fp-check: false positive) | Applied |
| SEC-013 | Username enumeration through login response time | Informational | Hardening (fp-check: false positive) | Applied |
| SEC-014 | Debug endpoint enabled whenever NODE_ENV is unset | Informational | Hardening (fp-check: false positive) | Applied |
| SEC-015 | AES-GCM authentication tag length not pinned | Informational | Hardening (fp-check: false positive) | Applied |
| SEC-018 | OTP code and full phone number written to logs | Informational | Hardening (fp-check: false positive) | Applied |
| SEC-019 | No timeouts on outbound HTTP calls | Informational | Hardening (fp-check: false positive) | Applied |
| SEC-020 | Export snapshot keys spliced into SQL as identifiers | Informational | Hardening (fp-check: false positive) | Applied |
| SEC-021 | Indirect prompt injection via company content in assistant prompt | Informational | Hardening (fp-check: false positive) | Proposed |
| SEC-027 | Session tokens stored unhashed | Informational | Confirmed | Proposed |
| SEC-028 | CSP allows inline scripts | Informational | Confirmed | Not started |
| SEC-029 | First-user-becomes-admin trigger remains active | Informational | Confirmed | Proposed |
| SEC-030 | Database TLS without certificate verification | Informational | Requires environment access | Not started |
| SEC-031 | Developer test pages routable in production | Informational | Confirmed | Proposed |
| SEC-032 | Open self-registration plus SMS sending (abuse/cost surface) | Informational | Confirmed | Accepted with controls |

---

### SEC-001 — Reflected XSS in TanStack Start server-function responses

- **fp-check verdict:** TRUE POSITIVE — reflected XSS reachable through unauthenticated GET server functions.

- **Status:** Confirmed (advisory) · **Severity:** Critical (advisory rating)
- **CVSS v4.0:** not computed; advisory GHSA-qx66-fv34-fjm8 rates it Critical.
- **CWE:** CWE-79 · **OWASP:** A03:2021 Injection
- **Affected asset:** All server functions · **Location:** `package.json` / `bun.lock` — `@tanstack/start-server-core@1.169.15`, `@tanstack/react-start@1.168.26`
- **Evidence:** `bun audit` (pre-upgrade) flagged `>=1.143.12 <1.169.39`; the app uses 67 server functions, so the vulnerable response path is reachable.
- **Root cause:** framework defect.
- **Attack prerequisites:** victim follows a crafted link; no authentication.
- **Impact:** script execution in the site origin (session riding, defacement).
- **Safe reproduction:** not attempted (no public PoC reviewed); version-based.
- **Remediation:** upgrade to `@tanstack/start-server-core >= 1.169.39`.
- **Patch status:** Applied (`763c1c6`, now 1.169.45). Server functions renamed `.inputValidator()` → `.validator()` as required by the new version.
- **Verification:** `bun audit` and OSV-Scanner on `bun.lock` no longer list it; authz suite 51/51, contracts 13/13, e2e 8/8 after upgrade.
- **Residual risk:** none known for this advisory; `package-lock.json` still pins the old version (SEC-010).

### SEC-002 — seroval deserialization invokes attacker-chosen callables / DoS

- **fp-check verdict:** TRUE POSITIVE for unauthenticated DoS; the advisory's critical callable-invocation impact was not demonstrated (no gadget found), so severity is **High**, not Critical.

- **Status:** Confirmed (advisory) · **Severity:** High (advisory: Critical; see fp-check verdict)
- **CWE:** CWE-502, CWE-400 · **OWASP:** A08:2021
- **Location:** transitive `seroval@1.5.4` (via `@tanstack/router-core`)
- **Evidence:** GHSA-p6vx-979v-rg4c (Critical), GHSA-7rv5-mrxv-xcr9, GHSA-97r2-qh9m-474h, GHSA-wp97-x4hv-qvhp, GHSA-jp82-f5mq-hwhp; seroval is the serializer for server-function payloads.
- **Prerequisites:** unauthenticated request to any server function.
- **Impact:** code-path manipulation during deserialization; event-loop/memory exhaustion.
- **Remediation / patch:** upgraded transitively to `seroval@1.8.1` (`763c1c6`).
- **Verification:** `bun audit` clean for seroval. **Residual:** none known.

### SEC-003 — Per-IP rate limits keyed on attacker-controlled X-Forwarded-For

- **fp-check verdict:** TRUE POSITIVE — reproduced against the pre-fix code.

- **Status:** Confirmed · **Severity:** Medium
- **CVSS v4.0:** `AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:L/SC:L/SI:N/SA:N` — assumes the per-account login limit still holds and the assistant's global cap bounds cost.
- **CWE:** CWE-348 (Use of Less Trusted Source), CWE-307 · **OWASP:** API4:2023 Unrestricted Resource Consumption
- **Location (pre-fix):** `src/lib/rate-limit.server.ts:27` — `getRequestIP({ xForwardedFor: true })` returns the leftmost (client-supplied) entry.
- **Evidence:** Playwright PoC sent `X-Forwarded-For: 203.0.113.N, 198.51.100.7` (attacker value first, proxy-appended address last) on three logins. Pre-fix code: buckets `signin-ip:203.0.113.2/.4/.6` (`evidence/xff-poc-baseline.txt`). Fixed code: one bucket `signin-ip:198.51.100.7` × 3 (`evidence/prod-build-checks.txt`).
- **Root cause:** trusting the first hop of a header the client controls.
- **Prerequisites:** none.
- **Impact:** per-IP limits on `signIn` (password spraying across accounts), `signUp`, and `askAssistant` ineffective.
- **Remediation:** key on the entry appended by the trusted proxy (`TRUSTED_PROXY_HOPS`, default 1).
- **Patch status:** Applied (`2377040`; refactored in `97d4db0` to `src/lib/client-ip.ts:10`, called at `src/lib/rate-limit.server.ts:46`).
- **Verification:** PoC before/after; 5 unit tests in `tests/unit/security-regressions.test.ts`.
- **Variants:** all callers of `clientKey()` (sign-in, sign-up, assistant) share the helper — fixed together. No other code reads `X-Forwarded-For`.
- **Residual:** if a CDN is added in front of Liara, `TRUSTED_PROXY_HOPS` must be raised.

### SEC-004 — MFA verification shared by every session of an account

- **fp-check verdict:** TRUE POSITIVE when `MFA_ENFORCED=true` — reproduced.

- **Status:** Confirmed · **Severity:** High (conditional on `MFA_ENFORCED=true`; today MFA is off, see SEC-026)
- **CVSS v4.0 (when MFA enforced):** `AV:N/AC:L/AT:P/PR:L/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N` — PR:L = attacker holds the password; AT:P = the real user verified within the last 24h.
- **CWE:** CWE-287, CWE-613 · **OWASP:** A07:2021
- **Location (pre-fix):** `src/lib/auth/session.server.ts:92` derived `mfaVerified` from `users.mfa_token_expires_at`, written by `verifyOtp` (`src/lib/mfa.functions.ts:145`).
- **Evidence:** `evidence/auth-hardening-baseline-mfa.txt` — a second, password-only session reported `satisfied=true` and called `getMyRoles` (MFA-gated) successfully.
- **Root cause:** step-up state stored on the account instead of the session.
- **Impact:** MFA provides no protection against a stolen password whenever the owner has verified in the past 24h.
- **Remediation:** store verification per session.
- **Patch status:** Applied (`97d4db0`) — `db/migrations/0022_sessions_mfa_verified.sql` (additive column), `markSessionMfaVerified()` (`src/lib/auth/session.server.ts:67`), `mfaVerified` from `sessions.mfa_verified_until` (`:108`), `getMfaStatus` uses the session (`src/lib/mfa.functions.ts:33`).
- **Verification:** `evidence/auth-hardening-patched.txt` — second session not verified and refused with `MFA_REQUIRED`.
- **Residual:** existing verifications reset once (users re-verify); only relevant while MFA is enabled.

### SEC-005 — Verified MFA phone replaceable without passing MFA

- **fp-check verdict:** TRUE POSITIVE when `MFA_ENFORCED=true` — reproduced.

- **Status:** Confirmed · **Severity:** High (conditional on `MFA_ENFORCED=true`)
- **CVSS v4.0 (when MFA enforced):** `AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N` — PR:L = password known.
- **CWE:** CWE-620 (Unverified Password Change, analogous for the second factor), CWE-308
- **Location (pre-fix):** `src/lib/mfa.functions.ts:55` — `setPhone` overwrote `phone` for any signed-in session.
- **Evidence:** baseline run — password-only session replaced `09120000001` with `09129999999`; OTPs would then go to the attacker.
- **Impact:** complete MFA bypass with only the password.
- **Patch status:** Applied (`97d4db0`) — `setPhone` refuses with `PHONE_CHANGE_REQUIRES_MFA` when the stored phone is verified and the session is not (`src/lib/mfa.functions.ts:63`); message localised.
- **Verification:** patched run — replacement refused, stored phone unchanged, MFA-verified session can still change it.
- **Residual:** a user who loses their phone needs an admin to reset it (no self-service recovery exists).

### SEC-006 — zod memory exhaustion in server-function input validation

- **fp-check verdict:** TRUE POSITIVE — reachable by any signed-in user (open sign-up) through the `reorder*` POST validators, which run before the admin/ownership check; the unauthenticated GET path is limited by URL size. Variant fix: all six array validators now have `.max()` caps.

- **Status:** Confirmed (advisory) · **Severity:** Medium (advisory rates it High) · **CWE:** CWE-400
- **Severity rationale:** availability-only impact (memory exhaustion of one worker; the cluster restarts it), no confidentiality or integrity effect, and per-IP rate limits apply to the expensive public functions. Rated one level below the advisory for this deployment.
- **Location:** `zod@3.25.76` (direct dependency) — GHSA-mrhx-c7xc-m3w5 (fixed only in 4.6.6).
- **Patch:** Applied (`763c1c6`, zod 4.6.7) plus `.max()` caps on all six array validators (review follow-up commit). **Verification:** `bun audit` clean; all suites pass; one pre-existing type bug surfaced and fixed (`founded_at` arrives as `Date`).

### SEC-007 — Password change without current password; sessions not revoked

- **fp-check verdict:** TRUE POSITIVE — stolen session → permanent account takeover (baseline not executed; pseudocode + post-fix test).

- **Status:** Confirmed · **Severity:** Medium
- **CVSS v4.0:** `AV:N/AC:L/AT:P/PR:L/UI:N/VC:L/VI:H/VA:N/SC:N/SI:N/SA:N` — AT:P = attacker already holds a session (stolen cookie).
- **CWE:** CWE-620, CWE-613
- **Location (pre-fix):** `changeMyPassword` in `src/lib/auth.functions.ts` accepted `{ newPassword }` only and left other sessions alive.
- **Patch:** Applied (`2377040`) — current password required unless on the provisioned bootstrap password (`changeMyPassword`, `src/lib/auth.functions.ts:218`); other sessions revoked by `destroyOtherSessions()` at `:247`.
- **Verification:** `evidence/auth-hardening-patched.txt` SEC-007 block (5 checks). Not run against the pre-fix baseline (check added after the fix).

### SEC-008 — Script-capable URL schemes stored in owner-editable URL fields

- **fp-check verdict:** FALSE POSITIVE — React 19 neutralises `javascript:` URLs in every sink found (gates 3, 4, 6 fail). Fix kept as hardening.

- **Status:** Hardening (fp-check: false positive) · **Severity:** Informational — React 19 blocks `javascript:` URLs in JSX `href`/`src`, so no executable sink was found.
- **CWE:** CWE-79 (stored, mitigated), CWE-20
- **Location (pre-fix):** `src/lib/exhibition-api.functions.ts:9` (`nullableUrlText` length-only) and park content URL fields.
- **Patch:** Applied — `src/lib/safe-url.ts:17` rejects `javascript:`, `vbscript:`, `data:`, `file:` after removing whitespace/control characters; used for company, product, image and park URL fields.
- **Verification:** 14 unit tests; browser test — `javascript:alert(document.cookie)` refused, `https://…` saved.
- **Variants searched:** `window.open`, `location.*`, `<iframe>`, `dangerouslySetInnerHTML`, `innerHTML` — only static/escaped uses.

### SEC-009 — CI/CD: broad token, mutable action tags, unpinned deploy CLI, persisted credentials

- **Status:** Confirmed · **Severity:** Medium · **CWE:** CWE-829, CWE-250
- **Location:** `.github/workflows/{ci,deploy,playwright}.yml`
- **Evidence:** no `permissions:` key (default token scope); `uses: …@v4` tags (Semgrep 7 hits); `npm install -g @liara/cli` (latest, in the job holding `LIARA_API_TOKEN`); zizmor `artipacked` ×8.
- **Patch:** Applied — `permissions: contents: read`; actions pinned to commit SHAs; `@liara/cli@9.6.7`; `persist-credentials: false` on every checkout.
- **Verification:** zizmor post-fix: 1 Low (`adhoc-packages`), 0 Medium/High; Checkov Actions 296/296 pass; Semgrep pin rule 7 → 0; YAML validated.
- **Residual:** branch protection on `main` not observable from here (requires environment access).

### SEC-010 — Stale `package-lock.json` pins 37 known-vulnerable packages

- **Status:** Confirmed · **Severity:** Medium (not used by Docker or CI, which use `bun.lock`; exposure is anyone running `npm install`/`npm ci`)
- **CWE:** CWE-1104, CWE-1395
- **Evidence:** `evidence/npm-audit-package-lock.log` (8 Critical, 13 High, 15 Moderate, 1 Low), `evidence/trivy-fs.json`, `evidence/osv-scanner.json` (29 packages) — includes the SEC-001/002 versions.
- **Remediation:** delete `package-lock.json` (the project builds with Bun), or regenerate it. Regeneration was attempted with npm 10.9.9 (`--package-lock-only --ignore-scripts --before=…`) and crashed in npm's resolver (`Cannot read properties of null (reading 'edgesOut')`); not forced with `--legacy-peer-deps` because that changes resolution semantics.
- **Patch status:** Not started — decision needed (does Lovable or any team member use npm?).

### SEC-011 — Container runs as root

- **Status:** Confirmed · **Severity:** Low · **CWE:** CWE-250
- **Location:** `Dockerfile:13-32` (no `USER`); Hadolint clean, Checkov CKV_DOCKER_3, Trivy DS-0002.
- **Remediation (proposed):** `USER node` in the runtime stage after confirming the Liara disk at `/app/data/uploads` is writable by UID 1000 (e.g. `chown` in an entrypoint, or Liara disk permissions). Not applied: an unwritable uploads disk would break uploads in production.

### SEC-012 — Internal review fields in public company detail and export

- **fp-check verdict:** TRUE POSITIVE — real but low-value information disclosure.

- **Status:** Confirmed · **Severity:** Low · **CWE:** CWE-213 · **OWASP:** API3:2023
- **Location:** `getExhibitionCompanyDetail` returned `SELECT *` incl. `owner_user_id`, `reviewed_by`, `rejection_note`; `/api/public/export` included `rejection_note`.
- **Patch:** Applied (`2377040`) — nulled on the public path (`src/lib/exhibition-api.functions.ts:706`, `src/routes/api/public/export.ts:65`).
- **Verification:** `evidence/prod-build-checks.txt` — anonymous detail response contains no UUID although the company has an owner; export: 54 companies, 0 non-null `rejection_note`/`owner_user_id`/`reviewed_by`.

### SEC-013 — Username enumeration through login response time

- **fp-check verdict:** FALSE POSITIVE — not measured; negligible value since sign-up discloses emails and national IDs are public (gates 3, 4 fail). Fix kept.

- **Status:** Hardening (fp-check: false positive) · **Severity:** Informational · **CWE:** CWE-208
- **Location:** `signIn` skipped scrypt for unknown usernames.
- **Patch:** Applied — dummy scrypt verification (`src/lib/auth.functions.ts:171`, helper `dummyHash()` at `:138`). **Verification:** code review only.

### SEC-014 — Debug endpoint enabled whenever NODE_ENV is unset

- **fp-check verdict:** FALSE POSITIVE — deployed builds always run with `NODE_ENV=production` (the build inlines it; gate 6 fails). Fix kept.

- **Status:** Hardening (fp-check: false positive) · **Severity:** Informational · **CWE:** CWE-489
- **Location (pre-fix):** `src/routes/api/public/debug-echo.ts` — enabled if `NODE_ENV !== "production"`; drains the in-memory log buffer.
- **Patch:** Applied — opt-in for `development`/`test` only (`:12`). **Verification:** `evidence/prod-build-checks.txt` — 404 with `NODE_ENV=production` and with it unset; CI job sets `NODE_ENV=development`.

### SEC-015 — AES-GCM authentication tag length not pinned

- **fp-check verdict:** FALSE POSITIVE — supplying a truncated tag needs database write access (gate 2 fails). Fix kept.

- **Status:** Hardening (fp-check: false positive) · **Severity:** Informational · **CWE:** CWE-325
- **Location:** `src/lib/app-settings.server.ts:24` pre-fix (decipher now at `:26`). **Patch:** Applied — `authTagLength: 16`. **Verification:** Semgrep `gcm-no-tag-length` 1 → 0.

### SEC-016 — Missing nosniff, Referrer-Policy and HSTS headers

- **Status:** Confirmed · **Severity:** Low · **CWE:** CWE-693
- **Patch:** Applied — `src/server.ts:69`. **Verification:** `evidence/prod-build-checks.txt`, production build: `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `strict-transport-security: max-age=31536000` on HTML and `/assets/*` responses.

### SEC-017 — Settings encryption key falls back to DATABASE_URL

- **Status:** Confirmed · **Severity:** Low · **CWE:** CWE-321
- **Location:** `src/lib/app-settings.server.ts:8`.
- **Impact:** anyone holding database credentials can also decrypt the stored OpenRouter key.
- **Remediation:** set a separate `SETTINGS_ENCRYPTION_KEY` in Liara, then re-save the key in the admin panel (old ciphertext was made with the fallback key).

### SEC-018 — OTP code and full phone number written to logs

- **fp-check verdict:** FALSE POSITIVE — the logged code is never stored, so it is never valid (gate 4 fails). Fix kept as hygiene.

- **Status:** Hardening (fp-check: false positive) · **Severity:** Informational · **CWE:** CWE-532
- **Location (pre-fix):** `src/lib/sms/send-sms.server.ts:19`.
- **Evidence:** dev log contained `OTP for 0912… (code: NNNNNN)`. The logged code was not usable in reproduction (send failure aborts before the hash is stored).
- **Patch:** Applied (`97d4db0`) — no code, last 4 digits only (`:29`).

### SEC-019 — No timeouts on outbound HTTP calls

- **fp-check verdict:** FALSE POSITIVE — not attacker-triggerable; operational robustness (gates 2, 3 fail). Fix kept for resilience.

- **Status:** Hardening (fp-check: false positive) · **Severity:** Informational · **CWE:** CWE-400
- **Location:** `src/lib/assistant-ai.server.ts` (3 calls), `src/lib/sms/send-sms.server.ts` (3), `src/lib/offline-sync.functions.ts` (1).
- **Patch:** Applied (`97d4db0`) — `AbortSignal.timeout` 45s / 15s / 120s. **Verification:** code review + build; not fault-injected.

### SEC-020 — Export snapshot keys spliced into SQL as identifiers

- **fp-check verdict:** FALSE POSITIVE — the snapshot is the project's own export over HTTPS (trusted input; gate 2 fails). Fix kept.

- **Status:** Hardening (fp-check: false positive) · **Severity:** Informational (needs a compromised live site or a hostile `OFFLINE_SYNC_SOURCE`) · **CWE:** CWE-89
- **Location:** `src/lib/offline-import.server.ts` — `sql.unsafe` with `"${c}"` from `Object.keys(row)`.
- **Patch:** Applied (`97d4db0`) — `SAFE_IDENTIFIER` allowlist (`:63`). The other `unsafe()` use (`src/lib/db/auto-migrate.server.ts:52`) runs the repository's own migration files (not attacker-controlled).

### SEC-021 — Indirect prompt injection via company content in assistant prompt

- **fp-check verdict:** FALSE POSITIVE — no tools, public data only, plain-text output: no security impact (gate 3 fails). Kept as a quality recommendation.

- **Status:** Hardening (fp-check: false positive) · **Severity:** Informational · **CWE:** CWE-1427 · **OWASP LLM:** LLM01
- **Location:** `src/lib/assistant.functions.ts:176` — owner-authored descriptions, products and links are placed in the system prompt.
- **Mitigations present:** only approved content (admin review); no tools or function calling; replies rendered as plain text with bold/italic only (`src/components/fava/primitives.tsx:95`), so no clickable links or HTML; rate limits.
- **Impact:** misleading or promotional answers, phishing URLs shown as text.
- **Remediation (proposed):** move company data out of the system prompt into a delimited data block labelled untrusted; instruct the model to ignore instructions inside it; optionally strip URLs not on the company's own domain.
- **Verification:** not tested against a live model (no API key in this environment).

### SEC-022 — `.env` with public-by-design keys in git history

- **Status:** Confirmed · **Severity:** Low · **CWE:** CWE-540
- **Evidence:** Gitleaks over full history (168 commits scanned; 217 in `git rev-list --all` including merges), re-run after the final commits: commit `13cd74d` (2026-07-28) `.env` — two Supabase JWTs with claim `role: anon` and a Google Maps browser key; removed from tracking in `385b0ff`. Values not reproduced here.
- **Impact:** anon keys are publishable; risk depends on the legacy Supabase project's RLS and the Maps key's referrer restrictions.
- **Remediation:** confirm the Maps key is HTTP-referrer restricted; delete or lock down the legacy Supabase project. History rewriting is not recommended (Lovable sync).

### SEC-023 — Brute-forceable initial-password hashes committed to the repo

- **Status:** Confirmed · **Severity:** Low · **CWE:** CWE-916, CWE-359
- **Location:** `scripts/company-national-id-logins.json` (67 scrypt hashes of CEO mobile numbers), added in `d877c06` by this engagement's national-ID work. Checkov CKV_SECRET_6 ×67.
- **Impact:** a person with repository access can recover a CEO's mobile number (search space ≈10⁹, scrypt N=2¹⁴) and, until first login, that company's initial password.
- **Remediation:** delete the file after `provision-national-id-logins.ts --apply` has run in production.

### SEC-024 — No security audit trail for auth events and privileged actions

- **Status:** Confirmed (absence) · **Severity:** Low · **CWE:** CWE-778 · **OWASP:** A09:2021
- **Evidence:** no audit table; failed logins only increment `rate_limit_hits` (pruned); `grantAdmin`/`revokeAdmin`/`assignCompanyOwner` record nothing.
- **Remediation:** append-only `security_events` table (login success/failure, role grant/revoke, owner assignment, approvals, password/phone changes) + structured log line per event.

### SEC-025 — Known vulnerabilities in desktop and build toolchain dependencies

- **Status:** Confirmed · **Severity:** Low (build/desktop only)
- **Evidence:** `evidence/bun-audit-baseline-d877c06.json` — Electron 44.0.0 (8 advisories) among 88; 59 build-tool advisories (undici, shell-quote, fast-uri, js-yaml, vite, vitest, …) cleared by `bun audit fix`.
- **Patch:** Partially applied — Electron 44.11.3, `bun audit fix` within ranges. Remaining: `minimatch` (Moderate, GHSA-g3hv-75wg-m249) under electron-builder, fix requires a major version the parent does not accept.

### SEC-026 — MFA disabled by default; admin accounts are password-only

- **Status:** Confirmed (configuration) · **Severity:** Medium · **CWE:** CWE-308 · **OWASP:** A07:2021
- **Location:** `src/lib/auth/middleware.ts:30` — `requireMfaVerified` is a no-op unless `MFA_ENFORCED=true`; no SMS provider is configured.
- **Impact:** a phished or reused admin password gives full control of public content and roles (risk-register R-02).
- **Remediation:** SEC-004/005 are fixed, so MFA can now be enabled safely: configure an SMS provider and set `MFA_ENFORCED=true`, or enforce MFA for the `admin` role only (small code change, remediation step 8).

### SEC-027 — Session tokens stored unhashed

- **Severity:** Informational · `src/lib/auth/session.server.ts:35` — store `sha256(token)` and look up by hash (logs everyone out once).

### SEC-028 — CSP allows inline scripts

- **Severity:** Informational · `src/lib/csp.ts:6` — `'unsafe-inline'` in `script-src`; nonce-based CSP requires framework/Lovable support.

### SEC-029 — First-user-becomes-admin trigger remains active

- **Severity:** Informational · `db/migrations/0001_init.sql:247` (trigger; function at `:237`) — grants admin to the next inserted user whenever no admin exists. Production always has an admin and self-revocation is blocked; drop the trigger once bootstrapped.

### SEC-030 — Database TLS without certificate verification

- **Status:** Requires environment access · **Severity:** Informational · `db/connection.ts:24` — `ssl: "require"` encrypts without verifying the server certificate; acceptable on Liara's private network, not over the internet.

### SEC-031 — Developer test pages routable in production

- **Severity:** Informational · `/perf` (`src/routes/perf.tsx:5`), `/dev/logo` — client-side visual tests, no data access.

### SEC-032 — Open self-registration plus SMS sending (abuse/cost surface)

- **Severity:** Informational · Self-registered users can set a phone and request OTP SMS. Controls: sign-up 5/hour per IP (effective after SEC-003), 60s resend cooldown, 5 SMS/day per user. Consider CAPTCHA or disabling self-registration if not needed (companies are provisioned by admins).
