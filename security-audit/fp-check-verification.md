# fp-check Verification

Method: Trail of Bits `fp-check` 1.0.5 (`skills/fp-check/SKILL.md` and its references:
deep-verification phases 1–5, the 13 devil's-advocate questions, the six gates in
`gate-reviews.md`, class rules in `bug-class-verification.md`). Every bug is routed to
**deep** verification (most cross auth/session/framework components). Evidence files
are in [`evidence/`](evidence/).

## Scope (batch triage, Step 0 for all 32 findings)

All 32 register findings are verified. **Part A** covers the 16 that were raised as
exploitable bugs. **Part B** covers the 16 first recorded as configuration,
supply-chain or missing-control observations, with each one's threat model stated.

Gate 3 interpretation used throughout: fp-check counts RCE, privilege escalation and
information disclosure as real impact and rejects "operational robustness" issues. An
**attacker-triggered, unauthenticated or low-privilege loss of availability with
meaningful amplification** (the `bug-class-verification.md` DoS class) is treated as
real impact; failures the attacker cannot trigger (slow upstreams, crash recovery) are
treated as robustness.

## Verdict summary — Part A

| Bug | Class | Verdict | Effect on the register |
|---|---|---|---|
| SEC-001 | Injection (reflected XSS, framework) | **TRUE POSITIVE** | Unchanged (Critical) |
| SEC-002 | Deserialization / DoS (framework) | **TRUE POSITIVE** (DoS only; critical impact unproven) | Critical → **High** |
| SEC-003 | Logic (anti-automation bypass) | **TRUE POSITIVE** | Unchanged |
| SEC-004 | Logic (auth state scope) | **TRUE POSITIVE** (when MFA enforced) | Unchanged |
| SEC-005 | Logic (second-factor replacement) | **TRUE POSITIVE** (when MFA enforced) | Unchanged |
| SEC-006 | DoS (validation memory) | **TRUE POSITIVE** (low-privilege POST path) | Unchanged |
| SEC-007 | Logic (credential change) | **TRUE POSITIVE** | Unchanged |
| SEC-012 | Information disclosure | **TRUE POSITIVE** (low value) | Unchanged |
| SEC-008 | Injection (stored URL) | **FALSE POSITIVE** — React 19 blocks the sink | → Informational hardening |
| SEC-013 | Timing side channel | **FALSE POSITIVE** — not demonstrated, impractical remotely | → Informational hardening |
| SEC-014 | Debug exposure | **FALSE POSITIVE** — production build always has `NODE_ENV=production` | → Informational hardening |
| SEC-015 | Crypto parameter | **FALSE POSITIVE** — attacker needs DB write | → Informational hardening |
| SEC-018 | Sensitive data in logs | **FALSE POSITIVE** — logged code is never valid | → Informational hardening |
| SEC-019 | Availability (timeouts) | **FALSE POSITIVE** — not attacker-triggerable | → Informational hardening |
| SEC-020 | Injection (SQL identifiers) | **FALSE POSITIVE** — input is trusted | → Informational hardening |
| SEC-021 | Prompt injection | **FALSE POSITIVE** — no security impact path | → Informational hardening |

Part B verdicts:

| Bug | Verdict | Effect on the register |
|---|---|---|
| SEC-009 | **TRUE POSITIVE** — CI fetched mutable code while holding the deploy token | Unchanged (Medium) |
| SEC-023 | **TRUE POSITIVE** — brute-forceable initial passwords in the repo (insider) | Unchanged (Low) |
| SEC-026 | **TRUE POSITIVE** — single-factor admin accounts | Unchanged (Medium) |
| SEC-010, 011, 016, 017, 022, 024, 025, 027, 028, 029, 030, 031, 032 | **FALSE POSITIVE** as vulnerabilities (no standalone attack path, public-by-design data, or defence-in-depth only) | → Informational hardening / risk-register items |

**Counts (all 32): 11 TRUE POSITIVES, 21 FALSE POSITIVES.** False positives keep their
applied fixes and recommendations; they are re-labelled as hardening, not reverted.
Operational risks such as the missing audit trail stay in the risk register.

**Exploit chains checked after all verdicts:** SEC-003 (spraying) + SEC-013 (timing
enumeration) — SEC-013 adds nothing because sign-in errors are identical and the
per-account limit (8 per 5 min) caps measurements. SEC-001 (XSS) + SEC-012 (owner IDs)
— XSS already runs with the victim's authority; IDs add nothing. SEC-005 + SEC-003 —
spraying yields the password needed for the phone swap; both are fixed. No chain
promotes a false positive.

---

## SEC-001 — Reflected XSS in TanStack Start server-function responses

**Step 0.** Claim: a crafted URL to `/_serverFn/*` makes the app return
attacker-controlled HTML from its own origin (GHSA-qx66-fv34-fjm8, from the OSV
offline DB). Root cause: transport copies payload fields into internal middleware state;
a response-shaped object in the error path is treated as an HTTP response. Trigger:
victim opens the link. Threat model: unauthenticated attacker, victim any visitor
(including an admin). Class: injection (XSS). Route: deep (framework + app).

**Phase 1.** 1.1 Boundary: internet → `/_serverFn/<id>?payload=…` GET → framework
handler (`@tanstack/start-server-core@1.169.15`, in range `>=1.143.12 <1.169.39`).
App has 13 unauthenticated server functions, several GET (`getCurrentUser`,
`getExhibitionCompanies`, …); `scripts/test-authz-coverage.py` calls them exactly this
way. 1.2 API contract: the vulnerable code is the framework's own response handling;
app validators run after deserialization and cannot intervene. 1.3 Environment: CSP is
enforced in production but allows `'unsafe-inline'` scripts (`src/lib/csp.ts:6`), so it
does not reliably block injected script. 1.4 Cross-reference: fixed upstream by
restricting input to public fields.

**Phase 2.** 2.1 Attacker fully controls the `payload` query parameter. 2.2 Bounds: N/A
(not a bounds bug). 2.3 Race: N/A (single request). 2.4 Adversarial: link in email or
chat to an admin → script runs with the admin's session cookie (`httpOnly`, but
same-origin requests carry it).

**Phase 3.** 3.1 Real impact vs operational robustness: Real security impact — script runs with the victim's authority (admin = role grants, content changes) and reads same-origin data; not a robustness issue. 3.2 Primary control vs defence-in-depth: Primary control — the framework's server-function output handling; CSP is defence-in-depth and weakened by `unsafe-inline`.

**Phase 4.**
- 4.1 Pseudocode PoC: `GET /_serverFn/<GET fn id>?payload=<seroval JSON with an extra internal field holding a response-shaped object with a text/html body>` → handler copies the field into middleware state → error path returns it as a `Response` → the browser renders attacker HTML at the site origin.
- 4.2 Executable PoC: **skipped** — the advisory does not publish the exact payload; building one is weaponisation beyond what the verdict needs. The vulnerable version (`bun.lock` at `d877c06`) and the reachable transport (used by `scripts/test-authz-coverage.py`) are both established.
- 4.3 Unit-test PoC: **skipped** for the same reason (framework internals).
- 4.4 Negative PoC: on `@tanstack/start-server-core@1.169.45` client input is limited to public fields, so no internal field can be injected; without a victim opening the link nothing happens.
- 4.5 PoC verification: the pseudocode matches the advisory's stated cause and fix (OSV offline DB entry GHSA-qx66-fv34-fjm8); the post-upgrade audit no longer reports it (`evidence/bun-audit.log`).

**Phase 5.**
- Q1 Non-vuln explanation: none — vendor-confirmed defect.
- Q2 Developer justification: N/A (framework).
- Q3 Missing context: a WAF could block it — none is configured.
- Q4 Pattern bias: no, claim is from the vendor advisory, not a code pattern.
- Q5 Validation prevents it? App validators run too late.
- Q6 Trusted data assumed attacker data? No — query string is attacker-controlled.
- Q7 Math: N/A.
- Q8 Practical: yes, one link.
- Q9 DiD confusion: no, output handling is primary.
- Q10 Runtime protections: CSP with `unsafe-inline` does not eliminate it.
- Q11 Hallucination: version range checked in `bun.lock` at `d877c06`.
- Q12 Dismissing due to complexity: no.
- Q13 Invented mitigations: re-read `csp.ts` — `unsafe-inline` present.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass (unauthenticated GET server functions) | Pass (script with victim authority) | Pass (pseudocode, advisory-derived; executable skipped with reason) | N/A → Pass | Pass (CSP allows inline script) |

`BUG SEC-001 TRUE POSITIVE — reflected XSS in TanStack Start server-function responses (fixed by upgrade).`

## SEC-002 — seroval deserialization (callable invocation; DoS)

**Step 0.** Claims: (a) GHSA-p6vx-979v-rg4c — a Promise node in `fromJSON()` input
can make the deserializer invoke a plugin-produced callable (Critical); (b)
GHSA-wp97/97r2/jp82 — attacker-supplied array lengths / TypedArray sizes cause
event-loop or memory exhaustion. Class: deserialization + DoS. Route: deep.

**Phase 1.** 1.1 `node_modules/@tanstack/start-server-core/dist/esm/server-functions-handler.js:145`
runs `fromJSON(json, { plugins: getRequestSerovalPlugins() })` on the request body or
`payload` query parameter before any app code. 1.2 API contract: seroval 1.5.4 trusted
node-supplied lengths (advisory). 1.3 Environment: Node cluster restarts a crashed
worker; no request body size limit found in the app. 1.4 Upgraded to 1.8.1.

**Phase 2.** 2.1 Attacker controls the serialized payload (unauthenticated). 2.2
Bounds: claimed `length` field is not checked against actual data; a node with
`length = 2^30` makes the deserializer loop/allocate proportionally while the request
stays a few hundred bytes → amplification ≫ 1000×. 2.3 Race: N/A. 2.4 For (a) a usable
"gadget" requires a plugin-produced callable with dangerous behaviour in TanStack's
request plugin set; **none was identified** in this review.

**Phase 3.** 3.1 Real impact vs operational robustness: Real availability impact — unauthenticated, repeatable worker exhaustion with large amplification; the critical callable-invocation impact is not established (no gadget found). Not mere robustness: the attacker triggers it at will. 3.2 Primary control vs defence-in-depth: Primary control — input deserialization; worker auto-restart is a recovery mechanism, not a protection.

**Phase 4.**
- 4.1 Pseudocode PoC: `POST /_serverFn/<any id>` with a seroval node whose claimed length is 2^30 → `fromJSON` (`server-functions-handler.js:145`) iterates/allocates to the claimed length → CPU/memory exhaustion → worker restarts; repeat.
- 4.2 Executable PoC: **not run** — the engagement rules prohibit denial-of-service testing.
- 4.3 Unit-test PoC: **not run** for the same reason.
- 4.4 Negative PoC: seroval ≥ 1.6.8 checks lengths against the data present; normal payloads carry consistent lengths and are unaffected.
- 4.5 PoC verification: the call site and the attacker-controlled input were confirmed in the installed framework code; the pseudocode follows the advisories' stated cause; the upgraded seroval (1.8.1) is no longer flagged (`evidence/bun-audit.log`).

**Phase 5.**
- Q1 Non-vuln explanation for (a): callable invocation needs a gadget — accepted, (a) not proven.
- Q2 Dev justification: N/A.
- Q3 Missing context: body size limits at Liara's proxy may cap payloads but (b) needs only a small body.
- Q4 Pattern bias: no, vendor advisories.
- Q5 Validation: app validators run after deserialization.
- Q6 Trusted data? No, request body.
- Q7 Math: length/amplification argued in 2.2.
- Q8 Practical: (b) yes, single requests.
- Q9 DiD: no.
- Q10 Runtime: worker auto-restart reduces but does not prevent outage.
- Q11 Hallucination: version `1.5.4` confirmed in `bun.lock` at `d877c06`.
- Q12 Dismissing (a) because complex? Possibly — recorded as unproven, not disproven.
- Q13 Invented mitigations: handler line re-read.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass (unauthenticated body/query) | Pass for DoS; not established for callable invocation | Pass (pseudocode; execution prohibited) | Pass (claimed length unchecked) | Pass (auto-restart does not prevent outage) |

`BUG SEC-002 TRUE POSITIVE — unauthenticated DoS through seroval deserialization; the advisory's critical callable-invocation impact was not demonstrated, so severity is lowered from Critical to High.`

## SEC-003 — Per-IP rate limits keyed on attacker-controlled X-Forwarded-For

**Step 0.** Claim: `clientKey()` used `getRequestIP({ xForwardedFor: true })`, i.e. the
leftmost XFF entry, which the client chooses; each request can get a fresh per-IP
bucket. Class: logic (anti-automation bypass). Route: deep (proxy + app + DB).

**Phase 1.** 1.1 Internet → Liara router (appends the real address) → `clientKey()`
(pre-fix `src/lib/rate-limit.server.ts:27`) → `enforceRateLimit()` bucket key in
`rate_limit_hits`. Callers: `signIn` (`signin-ip:`), `signUp`, `askAssistant`. 1.2 h3
`getRequestIP({xForwardedFor:true})` documented to return the first entry. 1.3 No
proxy-side rate limiting is configured in the repo. 1.4 Only `clientKey()` reads XFF.

**Phase 2.** 2.1 XFF is a client header; the proxy appends rather than replaces
(observed format `spoof, real`). 2.2 Bounds: per-IP limit 60/15 min is defeated
because bucket count = distinct spoofed values (unbounded). 2.3 Race: N/A. 2.4 The
per-account limit (8/5 min) remains — so the bypass enables spraying one password
across many accounts, and unlimited sign-ups / assistant calls up to the global cap.

**Phase 3.** 3.1 Real impact vs operational robustness: Real security impact — defeats the control that stops cross-account password spraying, enabling account takeover; also unlimited sign-ups and assistant calls up to the global cap. Not a robustness issue. 3.2 Primary control vs defence-in-depth: Primary control — the per-IP limit is the primary anti-spraying control; the per-account limit is a separate control that still holds (it does not stop spraying one password across many accounts).

**Phase 4.**
- 4.1 Pseudocode PoC: for each account: `signIn({identifier: acct, password: "Winter2026!"})` with `X-Forwarded-For: <random>, <real>` → every request lands in a new per-IP bucket.
- 4.2 Executable PoC: **run** — Playwright against the pre-fix code: 3 buckets `203.0.113.2/4/6` (`evidence/xff-poc-baseline.txt`).
- 4.3 Unit-test PoC: 5 cases for the fixed helper in `tests/unit/security-regressions.test.ts` (pass).
- 4.4 Negative PoC: requests without a spoofed header used the real address even before the fix; after the fix spoofed headers share one bucket `198.51.100.7` (`evidence/prod-build-checks.txt`).
- 4.5 PoC verification: before/after runs with identical requests show the behaviour change; unit tests pass (`evidence/unit-tests.txt`).

**Phase 5.**
- Q1 Non-vuln explanation: the developer assumed XFF holds only proxy data — false for appended headers.
- Q2 Justification: "behind Liara the socket is the proxy" — correct, but the wrong XFF entry was chosen.
- Q3 Missing context: Liara might strip client XFF — the PoC cannot prove production behaviour; residual uncertainty noted (if Liara overwrote XFF, the old code would have been safe).
- Q4 Pattern bias: no, reproduced.
- Q5 Validation: none on the header.
- Q6 Trusted data? No.
- Q7 Math: buckets = distinct values.
- Q8 Practical: trivial header.
- Q9 DiD: per-account limit is a separate control; per-IP is the primary anti-spraying one.
- Q10 Runtime: none.
- Q11 Hallucination: reproduced.
- Q12 Complexity: low.
- Q13 Invented mitigations: re-read the old function.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass (executable PoC) | Pass | Pass (executable + unit) | Pass | Pass (assuming Liara appends rather than overwrites XFF) |

`BUG SEC-003 TRUE POSITIVE — per-IP rate limits bypassable with a spoofed X-Forwarded-For (reproduced; fixed).`

## SEC-004 — MFA verification shared by every session of an account

**Step 0.** Claim: `mfaVerified` came from `users.mfa_token_expires_at`
(pre-fix `session.server.ts:92`), set by `verifyOtp`; any session of the user is
"verified" for 24 h after any OTP success. Class: logic (auth state scope). Threat
model: attacker holds the password; MFA enforced. Route: deep.

**Phase 1.** 1.1 Login (password) → session row → `getSessionUser()` joins `users` →
`requireMfaVerified` (`middleware.ts:30`) trusts `user.mfaVerified`. 1.2 No per-session
binding existed in schema (`sessions` had no MFA column). 1.3 Only active when
`MFA_ENFORCED=true`. 1.4 No other MFA check exists.

**Phase 2.** 2.1 Attacker controls their own login with the stolen password. 2.2 N/A.
2.3 Timing window: 24 h after the owner's last OTP — not a race, a time window. 2.4
Any owner who uses the site daily keeps the window open.

**Phase 3.** 3.1 Real impact vs operational robustness: Real security impact — MFA bypass leading to account takeover (admin = full control) when MFA is enforced; not a robustness issue. 3.2 Primary control vs defence-in-depth: Primary control — MFA is the primary second factor; there is no other check behind it.

**Phase 4.**
- 4.1 Pseudocode PoC: owner verifies an OTP at 09:00 → attacker logs in at 10:00 with the password only → `getMfaStatus.satisfied == true` → MFA-gated calls succeed.
- 4.2 Executable PoC: **run** — `scripts/test-auth-hardening.py` against the pre-fix code: second session verified and `getMyRoles` allowed (`evidence/auth-hardening-baseline-mfa.txt`, 2 FAIL in the SEC-004 block).
- 4.3 Unit-test PoC: covered by the same integration script (a unit test would need the database); not duplicated.
- 4.4 Negative PoC: with `MFA_ENFORCED` off the gate is a no-op, so nothing changes; the owner's own verified session keeps working.
- 4.5 PoC verification: patched run — second session refused with `MFA_REQUIRED` (`evidence/auth-hardening-patched.txt`).

**Phase 5.**
- Q1 Non-vuln: "MFA token per user is a remember-device feature" — but it is not bound to a device.
- Q2 Justification: simpler schema.
- Q3 Context: MFA is off in production → dormant.
- Q4 Pattern: reproduced.
- Q5 Validation: none.
- Q6 Trusted data: password is attacker-held by threat model.
- Q7 Math: N/A.
- Q8 Practical: yes when MFA on.
- Q9 DiD: MFA is primary.
- Q10 Runtime: none.
- Q11 Hallucination: reproduced.
- Q12 Complexity: low.
- Q13 Invented mitigations: re-read middleware.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | Pass | Pass (executable) | N/A → Pass | Pass when `MFA_ENFORCED=true`; with MFA off the control does not exist, so there is nothing to bypass |

`BUG SEC-004 TRUE POSITIVE (configuration-conditional) — one OTP verified every session of the account.`

## SEC-005 — Verified MFA phone replaceable without passing MFA

**Step 0.** Claim: `setPhone` (pre-fix `mfa.functions.ts:55`) only required
`requireAuth`; it overwrote a verified phone. Class: logic. Route: deep.

**Phase 1.** 1.1 Password session → `setPhone` → `users.phone` → `requestOtp` sends to
`users.phone`. 1.2 `normalizePhone` validates format only. 1.3 MFA must be enforced.
1.4 No admin-side phone management exists.

**Phase 2.** 2.1 Attacker chooses the new number. 2.2 N/A. 2.3 N/A. 2.4 Combined with
the password this fully replaces the second factor.

**Phase 3.** 3.1 Real impact vs operational robustness: Real security impact — complete replacement of the second factor with only the password → account takeover when MFA is enforced; not a robustness issue. 3.2 Primary control vs defence-in-depth: Primary control — the verified phone is the second factor itself.

**Phase 4.**
- 4.1 Pseudocode PoC: `signIn(password)` → `setPhone(attacker number)` → `requestOtp` → code arrives on the attacker's phone → `verifyOtp` → MFA satisfied.
- 4.2 Executable PoC: **run** — pre-fix code replaced the verified `09120000001` with `09129999999` (`evidence/auth-hardening-baseline-mfa.txt`).
- 4.3 Unit-test PoC: covered by the same integration script; not duplicated.
- 4.4 Negative PoC: first-time phone setup (no verified phone) still works; an MFA-verified session can still change the number (patched run).
- 4.5 PoC verification: patched run — `PHONE_CHANGE_REQUIRES_MFA`, stored phone unchanged (`evidence/auth-hardening-patched.txt`).

**Phase 5.**
- Q1 Non-vuln explanation: first-time phone setup must work without MFA — the fix keeps that (guard applies only to verified phones).
- Q2 Developer justification: the phone step is only shown in the UI when no phone exists.
- Q3 Missing context: server functions are callable directly, regardless of the UI.
- Q4 Pattern bias: no — reproduced on the baseline.
- Q5 Validation sufficient? `normalizePhone` checks format only.
- Q6 Trusted data as attacker data? The new number is attacker-chosen by design of the threat model.
- Q7 Math: N/A (logic bug).
- Q8 Practical: yes, two calls.
- Q9 DiD confusion: no, the phone *is* the second factor.
- Q10 Runtime protections: none.
- Q11 Hallucination: reproduced (`evidence/auth-hardening-baseline-mfa.txt`).
- Q12 Dismissing as unlikely: no.
- Q13 Invented mitigations: re-read `setPhone` at `d877c06`.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | Pass | Pass (executable) | N/A → Pass | Pass when `MFA_ENFORCED=true` |

`BUG SEC-005 TRUE POSITIVE (configuration-conditional) — password alone sufficed to redirect OTPs.`

## SEC-006 — zod memory exhaustion during validation

**Step 0.** Claim (GHSA-mrhx-c7xc-m3w5): an array schema without a length cap
accumulates one issue object per failing element with no early exit. Class: DoS.

**Phase 1.** 1.1 Unbounded arrays existed in 6 validators. Unauthenticated:
`getPublicExhibitionProducts` (GET → payload in URL, ≈16 KB header limit ⇒ ≤ ~8k
elements). Authenticated: 5 `reorder*` POST functions; middleware `requireMfaVerified`
(= any signed-in user while MFA is off) runs **before** the validator, and the admin /
ownership check runs after it — so any self-registered user reaches validation. 1.2
zod ≤ 4.6.5 behaviour per advisory. 1.3 No body-size limit found; cluster restarts
crashed workers. 1.4 Variant: all six arrays now capped (`.max(...)`).

**Phase 2.** 2.1 Attacker (free sign-up) controls the JSON body. 2.2 Amplification: an
invalid element `0,` = 2 bytes → one issue object (code, path array, message, ~200+
bytes) ⇒ ≥ 100× memory over the request size; a 50 MB body ⇒ ≥ 5 GB of issues →
worker OOM. 2.3 N/A. 2.4 Repeatable per request.

**Phase 3.** 3.1 Real impact vs operational robustness: Real availability impact — a low-privilege user can crash workers repeatedly with large memory amplification; attacker-triggered, so not mere robustness. 3.2 Primary control vs defence-in-depth: Primary control — input validation; worker auto-restart only shortens outages.

**Phase 4.**
- 4.1 Pseudocode PoC: sign up → `POST reorderExhibitionImages {"ids": [0, 0, 0, …]}` with ~25M invalid elements → one zod issue object per element → worker out of memory.
- 4.2 Executable PoC: **not run** — denial-of-service testing is prohibited.
- 4.3 Unit-test PoC: **not run** for the same reason.
- 4.4 Negative PoC: normal UI calls send dozens of IDs; with zod 4.6.7 and `.max(1000)` the validator rejects oversized input with a single issue.
- 4.5 PoC verification: reachability confirmed by reading the middleware → validator → handler order and listing the six unbounded validators; after the caps, authz 51/51, contracts 13/13 and the exhibition page confirm legitimate calls still pass.

**Phase 5.**
- Q1 Non-vuln: request body limits upstream — not configured in the repo; Liara's limit unknown (residual uncertainty).
- Q2 Justification: lists are small in practice.
- Q3 Missing context: Liara body limit could cap the attack — not verifiable here.
- Q4 Not pattern-only: advisory + reachable validators listed.
- Q5 Validation runs first by design.
- Q6 Attacker data: yes.
- Q7 Math in 2.2.
- Q8 Practical with open sign-up.
- Q9 Primary.
- Q10 Auto-restart mitigates duration only.
- Q11 Validators re-listed with grep.
- Q12 Not dismissed.
- Q13 Checked middleware/validator order in TanStack chain.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass (low-privilege POST) | Pass (availability) | Pass (pseudocode; execution prohibited) | Pass (amplification ≥ 100×) | Pass, unless Liara enforces a small body limit (unverified) |

`BUG SEC-006 TRUE POSITIVE — memory exhaustion by any signed-in user (fixed: zod 4.6.7 and array caps).`

## SEC-007 — Password change without current password; sessions not revoked

**Step 0.** Claim: `changeMyPassword` accepted `{newPassword}` from any session and
left other sessions alive. Threat model: attacker has a session (stolen cookie / shared
computer). Class: logic. Route: deep.

**Phase 1.** 1.1 Cookie → `requireAuth` → `changeMyPassword` → `UPDATE users SET
password_hash`. 1.2 No re-authentication. 1.3 `httpOnly` cookie makes theft harder
(raise-the-bar, not prevention). 1.4 Only one password-change path exists.

**Phase 2.** 2.1 Attacker controls the new password via the session. 2.2–2.3 N/A. 2.4
Owner's other sessions also stayed valid after the change.

**Phase 3.** 3.1 Real impact vs operational robustness: Real security impact — converts temporary session access into permanent account control and locks the owner out (privilege persistence); not a robustness issue. 3.2 Primary control vs defence-in-depth: Primary control — re-authentication for credential changes; `httpOnly` cookies only raise the bar for session theft.

**Phase 4.**
- 4.1 Pseudocode PoC: stolen cookie → `changeMyPassword({newPassword})` → owner can no longer log in; attacker keeps access.
- 4.2 Executable PoC against the pre-fix code: **not run** (the check was written after the fix); the pre-fix handler at `d877c06` was read instead.
- 4.3 Unit-test PoC: covered by the integration script (5 checks) rather than a unit test.
- 4.4 Negative PoC: the forced first-login change still works without the current password, as bootstrap accounts need.
- 4.5 PoC verification: patched run — change refused without/with a wrong current password, accepted with the right one, other session signed out (`evidence/auth-hardening-patched.txt`).

**Phase 5.**
- Q1 Non-vuln: "a session already implies the owner" — sessions can be stolen.
- Q2 Justification: only the forced-change UI exists.
- Q3 Context: server fn callable directly.
- Q4 Not pattern: logic reading of the handler.
- Q5 No validation of current password existed.
- Q6 Session is attacker-held per threat model.
- Q7 N/A.
- Q8 Practical given a stolen session.
- Q9 Primary (re-auth).
- Q10 None.
- Q11 Re-read old handler at `d877c06`.
- Q12 Not dismissed.
- Q13 Verified.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | Pass | Pass (pseudocode + post-fix test) | N/A → Pass | Pass |

`BUG SEC-007 TRUE POSITIVE — session theft could be turned into permanent account takeover.`

## SEC-012 — Internal review fields in public responses

**Step 0.** Claim: anonymous `getExhibitionCompanyDetail` and `/api/public/export`
returned `owner_user_id`, `reviewed_by`, `rejection_note`. Class: information
disclosure.

**Phase 1.** 1.1 Anonymous → `SELECT *` → JSON response. 1.2 No field filtering on the
public path. 1.3 None. 1.4 Public list already used explicit columns (safe pattern).

**Phase 2.** 2.1 No attacker input needed. 2.2–2.3 N/A. 2.4 Enumerate all approved companies.

**Phase 3.** 3.1 Real impact vs operational robustness: Real but low-value information disclosure — internal user UUIDs and admin review notes reach anonymous users; not a robustness issue. 3.2 Primary control vs defence-in-depth: Primary control — data minimisation on the public path; no other layer filtered the fields.

**Phase 4.**
- 4.1 Pseudocode PoC: anonymous `GET /company/<approved id>` → server-function response contains `owner_user_id`, `reviewed_by`, `rejection_note`.
- 4.2 Executable PoC: observed during the review (owner UUID present in the anonymous response; not saved).
- 4.3 Unit-test PoC: not applicable (response shape check done end to end).
- 4.4 Negative PoC: owners and admins still receive the fields on non-public paths; the public list already used explicit columns.
- 4.5 PoC verification: post-fix production build — no UUID in the anonymous response although the company has an owner; export 54 companies with 0 internal fields (`evidence/prod-build-checks.txt`).

**Phase 5.**
- Q1 Non-vuln: UUIDs are not secrets — accepted, impact low.
- Q2 Justification: convenience `SELECT *`.
- Q3 Context: no IDOR exists to use the IDs (authz suite).
- Q4 Not pattern-only: the response was observed.
- Q5 Validation: none filtered the fields.
- Q6 Data is internal, served to anonymous callers — not a trust confusion.
- Q7 Math: N/A.
- Q8 Practical: yes, one request.
- Q9 Data minimisation is the control itself, not DiD.
- Q10 Runtime protections: none.
- Q11 Hallucination: observed in a real response.
- Q12 Not dismissed despite low value.
- Q13 Fields verified in the post-fix response.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | Pass (low-value info disclosure) | Pass | N/A → Pass | Pass |

`BUG SEC-012 TRUE POSITIVE — internal review data disclosed to anonymous users (low value).`


## SEC-008 — Script-capable URL schemes stored in URL fields

**Step 0.** Claim: owner-editable URL fields (website, catalog, video, product links)
accepted `javascript:` URLs, giving stored XSS. Root cause: length-only validation.
Trigger: a visitor clicks the rendered link. Threat model: malicious company owner;
victims are visitors and admins. Class: injection (stored XSS). Route: deep.

**Phase 1.** 1.1 Owner → `saveOwnedCompany` / product functions → zod (length only,
pre-fix `exhibition-api.functions.ts:9`) → DB → admin review (approved companies) →
rendered as JSX `href`/`src`. 1.2 API contract: **React 19 replaces `javascript:` URLs
in `href`/`src` with a blocking stub at render.** 1.3 Environment: production CSP is a
second layer (weakened by `unsafe-inline`). 1.4 Cross-reference — every non-React sink
searched: `window.open`, `location.*`, `<iframe src>`, `dangerouslySetInnerHTML`,
`innerHTML`; only static or escaped uses (map popups use `escapeHtml`, the attachment
preview uses admin-uploaded paths).

**Phase 2.** 2.1 The owner controls the stored value. 2.2 Bounds: N/A. 2.3 Race: N/A.
2.4 Adversarial: alternative schemes (`data:`, `vbscript:`) in `<a href>` — `data:`
top-level navigation is blocked by modern browsers; `vbscript:` is IE-only.

**Phase 3.** 3.1 Real impact vs operational robustness: No real security impact — no execution path exists in any sink found; at most bad data in storage. 3.2 Primary control vs defence-in-depth: Defence-in-depth — React 19's URL sanitisation is the primary control and holds; the server-side scheme check is an additional layer.

**Phase 4.**
- 4.1 Pseudocode PoC: `website = "javascript:alert(1)"` → `<a href={website}>` → React substitutes a blocked URL → clicking does nothing.
- 4.2 Executable PoC: the value could be stored before the fix, but execution was never observed in any sink (browser test, `evidence/e2e-login-flows.txt`).
- 4.3 Unit-test PoC: 14 cases for `safeUrlString` (pass).
- 4.4 Negative PoC: `https://…` saves and renders normally.
- 4.5 PoC verification: the PoC does **not** show execution — consistent with the false-positive verdict.

**Phase 5.**
- Q1 Non-vuln explanation: React 19 blocks the scheme.
- Q2 Developer justification: reliance on framework sanitisation.
- Q3 Missing context: future non-React consumers (export, desktop app) — the hardening rationale.
- Q4 Pattern bias: **yes**, the original finding came from a pattern ("length-only URL").
- Q5 Does protection prevent the condition? Yes, at every sink found.
- Q6 Trusted vs attacker data: owner data is semi-trusted (admin-reviewed once approved).
- Q7 Math: N/A.
- Q8 Practical: no execution path.
- Q9 DiD confusion: yes — the server check is DiD.
- Q10 Runtime protection: React 19 eliminates it.
- Q11 Hallucination: initially over-reported.
- Q12 Dismissing a real bug? Other sinks were searched to avoid that.
- Q13 Invented mitigations? React's behaviour is documented; sinks re-searched with grep.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | **Fail** (no execution path) | **Fail** (no PoC shows execution) | N/A | **Fail** (React 19 blocks) |

`BUG SEC-008 FALSE POSITIVE — React 19 neutralises javascript: URLs in every sink found; the server-side check stays as hardening.`

## SEC-013 — Username enumeration via login timing

**Step 0.** Claim: unknown usernames skipped scrypt, so response time reveals whether
an account exists. Trigger: timed sign-in attempts. Threat model: anonymous remote
attacker. Class: timing side channel (information disclosure). Route: deep.

**Phase 1.** 1.1 Anonymous → `signIn` → early return when no row (pre-fix). 1.2
Responses are byte-identical (`INVALID_CREDENTIALS`). 1.3 Environment: internet jitter;
per-account limit 8/5 min and per-IP limit cap the number of samples. 1.4 Cross-ref:
`signUp` already reveals registered emails (`EMAIL_ALREADY_REGISTERED`); company
national IDs are public records.

**Phase 2.** 2.1 The attacker chooses the usernames. 2.2 Measured locally (`evidence/sec013-timing.txt`, n=25 each): before the fix, known accounts took a median 48.8 ms vs 5.8 ms for unknown (Δ 43 ms, σ ≈ 7.5 / 0.6 ms) — a clear signal; after the fix Δ 4.8 ms within σ ≈ 9 ms. 2.3 Race: N/A. 2.4 With ≤ 8
samples per username per 5 min, statistical separation over the internet is weak.

**Phase 3.** 3.1 Real impact vs operational robustness: No meaningful security impact — at most confirms an account exists, which sign-up already reveals for emails and which is public for national IDs. 3.2 Primary control vs defence-in-depth: Defence-in-depth — identical error responses and rate limits are the primary controls; constant-time behaviour is an extra layer.

**Phase 4.**
- 4.1 Pseudocode PoC: compare median latency of `signIn` for known vs unknown usernames; difference > jitter ⇒ exists.
- 4.2 Executable PoC: **run** on the disposable instance — 25 timed sign-ins per case before and after the fix (`evidence/sec013-timing.txt`).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: both cases return byte-identical `INVALID_CREDENTIALS` bodies.
- 4.5 PoC verification: before the fix the medians separate by 43 ms with no overlap in practice (σ 7.5 / 0.6 ms) — the side channel existed; after the fix the separation (4.8 ms) is inside the noise. The PoC works, so the verdict rests on gate 3 (value of the information).

**Phase 5.**
- Q1 Non-vuln: identical errors already.
- Q2 Justification: early return saves CPU.
- Q3 Missing context: sign-up discloses emails anyway.
- Q4 Pattern bias: no longer — the signal was measured, not inferred.
- Q5 Do limits prevent it? They cap samples, not eliminate.
- Q6 Trusted data: N/A.
- Q7 Signal measured: 43 ms before, 4.8 ms after.
- Q8 Practical: yes (43 ms is large), but it only yields information already available.
- Q9 DiD confusion: yes — identical errors and sign-up behaviour are the deciding factors.
- Q10 Environment: internet jitter adds noise; rate limits cap samples per account.
- Q11 Not hallucinated (measured); the impact, not the signal, is what fails.
- Q12 Dismissing real bug? Value is negligible even if measurable.
- Q13 Re-read the sign-up error path.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | **Fail** (negligible information) | Pass (measured, `evidence/sec013-timing.txt`) | N/A | Pass |

`BUG SEC-013 FALSE POSITIVE — the timing signal was real (43 ms, measured) but only reveals account existence, which sign-up already discloses for emails and which is public for national IDs; fixed anyway (4.8 ms after).`

## SEC-014 — Debug endpoint enabled when NODE_ENV is unset

**Step 0.** Claim: `/api/public/debug-echo` drains the in-memory log buffer whenever
`NODE_ENV !== "production"`. Threat model: anonymous attacker against a deployed build.
Class: information disclosure (debug path). Route: deep.

**Phase 1.** 1.1 Anonymous → endpoint → `_drainLogs()`. 1.2 The buffer only fills when
`LOG_SINK=memory`. 1.3 Environment: **the Dockerfile sets `NODE_ENV=production` and the
Nitro build inlines `NODE_ENV=production`** — the production build returned 404 and still
sent HSTS with `NODE_ENV` unset (`evidence/prod-build-checks.txt`). 1.4 CI uses the
endpoint with `NODE_ENV=development`.

**Phase 2.** 2.1 The attacker controls only the request, not the build mode. 2.2 N/A.
2.3 N/A. 2.4 No way to switch a deployed build into development mode remotely.

**Phase 3.** 3.1 Real impact vs operational robustness: No real impact on deployed builds — they always run in production mode; development servers are not internet-facing. 3.2 Primary control vs defence-in-depth: Defence-in-depth — the build-time `NODE_ENV=production` is the primary control; the opt-in check is an extra layer.

**Phase 4.**
- 4.1 Pseudocode PoC: `GET /api/public/debug-echo` on a deployed build with `NODE_ENV` unset → expected log dump.
- 4.2 Executable PoC: **run** against the production build with `NODE_ENV` unset and `production` — both 404 (`evidence/prod-build-checks.txt`).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: the same executed run — the build inlines `NODE_ENV=production`, so the endpoint is off.
- 4.5 PoC verification: the exploit PoC fails on real builds — consistent with the false-positive verdict.

**Phase 5.**
- Q1 Non-vuln: build-time inlining.
- Q2 Justification: test hook for CI.
- Q3 Missing context: Nitro inlines `NODE_ENV`.
- Q4 Pattern bias: yes.
- Q5 Prevention holds: yes, verified.
- Q6 Trusted config treated as attacker input: yes.
- Q7 N/A.
- Q8 Not practical.
- Q9 DiD.
- Q10 Build protection eliminates it.
- Q11 Over-reported.
- Q12 Not dismissing — executed the negative PoC.
- Q13 Verified by running the build.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | **Fail** (build-time `NODE_ENV`) |

`BUG SEC-014 FALSE POSITIVE — deployed builds always run with NODE_ENV=production; the opt-in change stays as hardening.`

## SEC-015 — AES-GCM authentication tag length not pinned

**Step 0.** Claim: the decipher accepts truncated tags, enabling forged ciphertext of
the stored OpenRouter key. Class: crypto weakness. Route: deep.

**Phase 1.** 1.1 Admin → `saveAdminAiSettings` → `encryptSecret()` (16-byte tag) →
`assistant_settings` → `decryptSecret()`. 1.2 Node's `createDecipheriv` accepts 4–16
byte tags unless `authTagLength` is set. 1.3 Environment: the row is reachable only via
DB access. 1.4 Single encryption site.

**Phase 2.** 2.1 **No network path** lets an attacker supply ciphertext; writing a
truncated tag requires database write access. 2.2 Forging a 4-byte tag ≈ 2³² tries —
irrelevant without write access. 2.3 N/A. 2.4 With DB write, the attacker can simply
replace the stored key.

**Phase 3.** 3.1 Real impact vs operational robustness: No real impact — forging needs database write access, which already grants more than the forgery would. 3.2 Primary control vs defence-in-depth: Defence-in-depth — database access control is the primary control; the tag-length pin is an extra layer.

**Phase 4.**
- 4.1 Pseudocode PoC: `UPDATE assistant_settings SET api_key_encrypted = 'v1.<iv>.<4-byte tag>.<ct>'` then trigger decryption — requires database write.
- 4.2 Executable PoC: not applicable (no network path to supply ciphertext).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: all server writes go through `encryptSecret()`, which always produces 16-byte tags.
- 4.5 PoC verification: the only path needs DB write access — consistent with the false-positive verdict.

**Phase 5.**
- Q1 Non-vuln: only the server writes ciphertext.
- Q2 Justification: default Node API usage.
- Q3 Missing context: storage is internal.
- Q4 Pattern bias: yes (Semgrep rule).
- Q5 Prevention: no network write path.
- Q6 **Trusted storage treated as attacker data: yes** (checklist item 8).
- Q7 Math irrelevant without access.
- Q8 Not practical.
- Q9 DiD.
- Q10 N/A.
- Q11 Over-reported.
- Q12 Not dismissing — DB write already grants more.
- Q13 Re-read write paths.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | Pass |

`BUG SEC-015 FALSE POSITIVE — needs database write access; the tag-length pin stays as hardening.`

## SEC-018 — OTP code and phone number written to logs

**Step 0.** Claim: server logs leak valid OTP codes and phone numbers. Threat model:
someone with log access. Class: information disclosure (logs). Route: deep.

**Phase 1.** 1.1 `requestOtp` → `sendOtpSms` → `console.error(…code…)` when no SMS
provider is configured. 1.2 The send throws before `requestOtp` stores the OTP hash.
1.3 Logs are read by platform operators (trusted). 1.4 No other OTP logging.

**Phase 2.** 2.1 An attacker cannot read the logs without operator access. 2.2 N/A.
2.3 N/A. 2.4 Even with log access the code is unusable — reproduced: `verifyOtp` with
the logged code → `OTP_NOT_REQUESTED`.

**Phase 3.** 3.1 Real impact vs operational robustness: No authentication impact — the logged code is never valid; phone numbers visible to operators are a privacy-hygiene matter, not a security impact. 3.2 Primary control vs defence-in-depth: Defence-in-depth — store-after-send ordering and operator-only log access are the primary controls; redaction is hygiene.

**Phase 4.**
- 4.1 Pseudocode PoC: read the server log after `requestOtp` without an SMS provider → submit the logged code to `verifyOtp`.
- 4.2 Executable PoC: **run** during the MFA PoC — the code appeared in the log; submitting it returned `OTP_NOT_REQUESTED`.
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: with a configured provider the log line never runs.
- 4.5 PoC verification: the logged code is unusable — consistent with the false-positive verdict.

**Phase 5.**
- Q1 Non-vuln: the code is never stored.
- Q2 Justification: debugging aid before an SMS provider exists.
- Q3 Missing context: store-after-send ordering.
- Q4 Pattern bias: partly.
- Q5 Prevention verified by execution.
- Q6 Logs are trusted storage.
- Q7 N/A.
- Q8 Not practical.
- Q9 Hygiene, not primary.
- Q10 N/A.
- Q11 Initially over-rated.
- Q12 Not dismissing phone privacy — kept as hygiene.
- Q13 Verified by running it.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** (code unusable) | N/A | Pass |

`BUG SEC-018 FALSE POSITIVE — the logged OTP is never valid; redaction stays as hygiene.`

## SEC-019 — No timeouts on outbound HTTP calls

**Step 0.** Claim: a hung upstream (LLM, SMS, export source) ties up server workers.
Class: availability. Route: deep.

**Phase 1.** 1.1 Request → handler → `fetch(upstream)` without a timeout. 1.2 Node
`fetch` has no default total timeout. 1.3 Upstreams are fixed hosts chosen by the
operator. 1.4 Seven call sites, all fixed.

**Phase 2.** 2.1 **The attacker does not control upstream responsiveness.** 2.2 N/A.
2.3 N/A. 2.4 The assistant (the only public trigger) is rate-limited (per IP + 300/hour).

**Phase 3.** 3.1 Real impact vs operational robustness: Operational robustness, not security — a hanging provider is not attacker-triggerable. 3.2 Primary control vs defence-in-depth: Resilience control — timeouts protect availability against provider faults; no security control depends on them.

**Phase 4.**
- 4.1 Pseudocode PoC: make the LLM/SMS provider hang → concurrent assistant requests hold workers. Requires control of the provider, which the attacker does not have.
- 4.2 Executable PoC: not applicable (no attacker-controlled trigger).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: normal provider responses complete well within the new 45 s / 15 s / 120 s limits.
- 4.5 PoC verification: no attacker path exists — consistent with the false-positive verdict.

**Phase 5.**
- Q1 Non-vuln: upstream is not attacker-controlled.
- Q2 Justification: providers usually answer.
- Q3 Context: rate limits bound concurrency.
- Q4 Pattern bias: yes.
- Q5 N/A.
- Q6 Upstream behaviour treated as attacker input: yes.
- Q7 N/A.
- Q8 Not practical.
- Q9 Robustness vs security confusion: yes.
- Q10 N/A.
- Q11 Over-reported.
- Q12 Not dismissing availability — kept as resilience.
- Q13 Call sites re-read.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** (robustness) | **Fail** | N/A | N/A |

`BUG SEC-019 FALSE POSITIVE — not attacker-triggerable; timeouts stay for resilience.`

## SEC-020 — Snapshot keys used as SQL identifiers (offline import)

**Step 0.** Claim: SQL injection through column names in the desktop app's import.
Class: injection (SQL). Route: deep.

**Phase 1.** 1.1 Admin action in the desktop app → `fetch(OFFLINE_SYNC_SOURCE/api/public/export)`
over HTTPS → `importOfflineSnapshot` → `sql.unsafe` with `"${column}"`. 1.2 Values are
parameterised; only identifiers were interpolated. 1.3 TLS to the project's own
server. 1.4 The other `unsafe()` site runs repository migration files (trusted).

**Phase 2.** 2.1 Keys are the project's own `SELECT *` column names; changing them
requires control of the live site or its TLS, or of the operator-set
`OFFLINE_SYNC_SOURCE`. 2.2 N/A. 2.3 N/A. 2.4 An attacker with that control already owns
the data being imported.

**Phase 3.** 3.1 Real impact vs operational robustness: No real impact — exploitation needs control of the live site or its TLS, which already yields the data being imported. 3.2 Primary control vs defence-in-depth: Defence-in-depth — HTTPS and the operator-set source are the primary controls; the identifier allowlist is an extra layer.

**Phase 4.**
- 4.1 Pseudocode PoC: serve `{"companies":[{"x\") ; DROP …": 1}]}` from a malicious export server → desktop import interpolates the key. Requires control of the live site or its TLS.
- 4.2 Executable PoC: not applicable (no attacker path to the export source).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: real exports contain only lower_snake_case column names.
- 4.5 PoC verification: the only path needs a compromised trusted source — consistent with the false-positive verdict.

**Phase 5.**
- Q1 Non-vuln: trusted source.
- Q2 Justification: mirrors the server schema.
- Q3 Context: HTTPS + operator config.
- Q4 Pattern bias: yes (`sql.unsafe`).
- Q5 TLS prevents tampering.
- Q6 **Trusted input treated as attacker input: yes** (checklist item 8).
- Q7 N/A.
- Q8 Not practical.
- Q9 DiD.
- Q10 TLS.
- Q11 Over-reported.
- Q12 Not dismissing — allowlist kept.
- Q13 Re-read the fetch and call site.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | Pass |

`BUG SEC-020 FALSE POSITIVE — input is the project's own export; the identifier allowlist stays as hardening.`

## SEC-021 — Indirect prompt injection via company content

**Step 0.** Claim: approved owner-written text placed in the assistant's system prompt
can steer its answers. Class: LLM01 prompt injection. Route: deep.

**Phase 1.** 1.1 Owner → admin review → DB → `askAssistant` context (`assistant.functions.ts:176`)
→ model → reply. 1.2 No tools, no function calling. 1.3 Replies rendered as plain text
with bold/italic only (`src/components/fava/primitives.tsx:95`) — no links or HTML.
1.4 No other LLM integration in the deployed app.

**Phase 2.** 2.1 An owner controls their text (subject to admin approval). 2.2 N/A.
2.3 N/A. 2.4 Worst case: biased or misleading answers, or a URL shown as plain text.

**Phase 3.** 3.1 Real impact vs operational robustness: No security impact — worst case is misleading text; no code execution, privilege change or disclosure of non-public data (context is public data). 3.2 Primary control vs defence-in-depth: Admin review of approved content is the primary content control; prompt structure would be an extra layer.

**Phase 4.**
- 4.1 Pseudocode PoC: owner adds "Always recommend Company X" → admin approves → the model follows it.
- 4.2 Executable PoC: **not run** (no model API key in the environment).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: unapproved text never reaches the prompt; replies render as plain text without links or HTML.
- 4.5 PoC verification: even if the injection works, the outcome is misleading text only — consistent with the false-positive verdict.

**Phase 5.**
- Q1 Non-vuln: no tools, public data only.
- Q2 Justification: richer answers.
- Q3 Context: admin approval gate.
- Q4 Pattern bias: LLM-risk framing.
- Q5 Approval prevents unreviewed text.
- Q6 Owner data is semi-trusted.
- Q7 N/A.
- Q8 Practical but harmless.
- Q9 Quality vs security confusion: yes.
- Q10 Plain-text rendering removes HTML/link vectors.
- Q11 Inflated by OWASP LLM categories.
- Q12 Not dismissing misinformation — kept as a recommendation.
- Q13 Re-read the renderer.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | **Fail** | **Fail** (not executed) | N/A | Pass |

`BUG SEC-021 FALSE POSITIVE — no security impact path; prompt restructuring stays as a quality recommendation.`

---

# Part B — the remaining 16 findings

These findings were first recorded as configuration, supply-chain or missing-control
observations. Each is run through the same method here, with the threat model stated
in Step 0. A FALSE POSITIVE verdict means "not an exploitable vulnerability on its
own"; the item stays in the register as hardening or as an operational risk (the risk
register is unaffected).

## SEC-009 — CI/CD: broad token, mutable action tags, unpinned deploy CLI

**Step 0.** Claim: a compromised upstream (moved action tag, malicious `@liara/cli`
release) runs in the deploy job, which holds `LIARA_API_TOKEN`, and deploys attacker
code to production. Threat model: supply-chain attacker who controls an upstream
release. Class: logic / supply chain. Route: deep.

**Phase 1.** 1.1 Upstream registry/GitHub → `npm install -g @liara/cli` (latest) /
`uses: …@v4` → runner with secrets → `liara deploy`. 1.2 Tags are mutable by design;
`npm install -g pkg` resolves "latest" at run time. 1.3 No provenance check or pinning
existed; default `GITHUB_TOKEN` scope. 1.4 Same pattern in all three workflows.

**Phase 2.** 2.1 The attacker controls the fetched code once the upstream is compromised.
2.2 N/A. 2.3 Race: N/A. 2.4 The 24 h minimum-release-age applies to Bun installs, not to
`npm install -g` in CI.

**Phase 3.** 3.1 Real impact vs operational robustness: code execution in CI with the deploy token → arbitrary code in production (RCE-equivalent). 3.2 Primary control vs defence-in-depth: pinning is the primary control for third-party code in CI.

**Phase 4.**
- 4.1 Pseudocode PoC: attacker publishes `@liara/cli@9.7.1` with a postinstall that reads `LIARA_API_TOKEN` from the job's command line/env → push to `main` → token exfiltrated / malicious deploy.
- 4.2 Executable PoC: **not run** — would require publishing a malicious package (out of scope and harmful).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: with `@liara/cli@9.6.7` and SHA-pinned actions a new upstream release is not fetched.
- 4.5 PoC verification: the pre-fix workflow line `npm install -g @liara/cli` and the absence of pinning were read in `.github/workflows/deploy.yml` at `d877c06`; zizmor/Semgrep findings cleared after the fix (`evidence/zizmor-postfix.json`, `semgrep-before-after.txt`).

**Phase 5.**
- Q1 Non-vuln explanation: upstreams are reputable — compromise is rare but documented industry-wide.
- Q2 Justification: convenience.
- Q3 Missing context: branch protection unknown.
- Q4 Pattern bias: partly scanner-driven, but the secret exposure is concrete.
- Q5 Prevention: none before the fix.
- Q6 Attacker data: upstream code is untrusted by definition.
- Q7 Math: N/A.
- Q8 Practical: requires an upstream compromise — low likelihood, high impact.
- Q9 DiD vs primary: pinning is primary.
- Q10 Runtime: none.
- Q11 Hallucination: lines read in the workflow.
- Q12 Not dismissed for being unlikely.
- Q13 Re-read the pre-fix workflow.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass (given upstream compromise) | Pass | Pass (pseudocode; executable would be harmful) | N/A → Pass | Pass |

`BUG SEC-009 TRUE POSITIVE — CI fetched mutable third-party code while holding the deploy token (low likelihood, high impact; fixed).`

## SEC-010 — Stale package-lock.json pins vulnerable versions

**Step 0.** Claim: `package-lock.json` pins 37 vulnerable packages, including SEC-001/002
versions. Threat model: anonymous attacker against the deployed app; developer
installing with npm. Class: supply chain.

**Phase 1.** 1.1 `package-lock.json` → `npm install`/`npm ci` → node_modules. 1.2 Bun
ignores `package-lock.json` when `bun.lock` exists. 1.3 Environment: Dockerfile, CI and
Lovable install from `bun.lock` (`bun install --frozen-lockfile`). 1.4 No script or
workflow references npm installs.

**Phase 2.** 2.1 No attacker controls which lockfile the deployment uses. 2.2 N/A. 2.3
N/A. 2.4 Only a developer who runs npm locally gets the old versions; local dev servers
are not internet-facing.

**Phase 3.** 3.1 Real impact vs operational robustness: no impact on the deployed app; a consistency/hygiene risk. 3.2 Primary control vs defence-in-depth: `bun.lock` is the primary control and it is clean.

**Phase 4.**
- 4.1 Pseudocode PoC: `npm ci` → vulnerable TanStack → deploy built from it → SEC-001 live. Requires a deployment that uses npm.
- 4.2 Executable PoC: not applicable (no deployment path uses npm).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: `bun install --frozen-lockfile` (Dockerfile:8) resolves the patched versions; `bun audit` shows 1 Moderate.
- 4.5 PoC verification: Dockerfile and workflows re-read; no npm install path.

**Phase 5.**
- Q1 Non-vuln: unused file.
- Q2 Justification: leftover from an earlier toolchain.
- Q3 Context: Lovable uses Bun (bunfig.toml).
- Q4 Pattern bias: scanner counts per file.
- Q5 Prevention: frozen Bun lockfile.
- Q6 N/A.
- Q7 N/A.
- Q8 Not practical against production.
- Q9 Hygiene.
- Q10 Build environment prevents it.
- Q11 Over-rated earlier (Medium).
- Q12 Not dismissed — kept as a decision item.
- Q13 Re-read Dockerfile and workflows.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | **Fail** (deployments use `bun.lock`) |

`BUG SEC-010 FALSE POSITIVE — the stale lockfile is not used by any deployment; still recommended for deletion.`

## SEC-011 — Container runs as root

**Step 0.** Claim: the runtime container runs as root, amplifying any compromise.
Threat model: attacker who already has code execution in the app. Class: privilege
(configuration).

**Phase 1.** 1.1 Dockerfile runtime stage → `CMD node server/cluster.mjs` as UID 0.
1.2 Container isolation by Liara's runtime. 1.3 Environment: platform sandboxing
unknown. 1.4 Healthcheck and copies are unaffected.

**Phase 2.** 2.1 No attacker input reaches "user selection"; exploitation needs a
separate RCE first. 2.2 N/A. 2.3 N/A. 2.4 No RCE was found in this audit.

**Phase 3.** 3.1 Real impact vs operational robustness: amplification only, no standalone impact. 3.2 Primary control vs defence-in-depth: non-root user is defence-in-depth.

**Phase 4.**
- 4.1 Pseudocode PoC: RCE in app → root in container → write anywhere in the container filesystem.
- 4.2 Executable PoC: not applicable (no RCE to chain).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: without an RCE nothing can use root.
- 4.5 PoC verification: Checkov CKV_DOCKER_3 and Trivy DS-0002 confirm the configuration; no chain exists.

**Phase 5.**
- Q1 Non-vuln: platform isolation.
- Q2 Justification: uploads disk ownership.
- Q3 Context: Liara disk permissions.
- Q4 Pattern bias: scanner rule.
- Q5 N/A.
- Q6 N/A.
- Q7 N/A.
- Q8 Not exploitable alone.
- Q9 DiD: yes.
- Q10 Container runtime isolation.
- Q11 Configuration is real; vulnerability is not.
- Q12 Not dismissed — kept as hardening.
- Q13 Re-read Dockerfile.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | Pass |

`BUG SEC-011 FALSE POSITIVE — defence-in-depth gap with no standalone attack path; hardening.`

## SEC-016 — Missing nosniff, Referrer-Policy and HSTS

**Step 0.** Claim: missing headers enable MIME sniffing of uploads, referrer leakage and
SSL stripping. Threat model: anonymous attacker / network attacker. Class: misconfiguration.

**Phase 1.** 1.1 Responses from `src/server.ts`. 1.2 Uploads: extension allowlist,
unknown → `application/octet-stream`. 1.3 Modern browsers do not sniff `image/*` into
HTML; Liara serves HTTPS. 1.4 CSP `frame-ancestors 'none'` already present.

**Phase 2.** 2.1 Attacker could upload only allowlisted types (owners/admins). 2.2 N/A.
2.3 N/A. 2.4 SSL stripping needs a network position on the first visit.

**Phase 3.** 3.1 Real impact vs operational robustness: none demonstrated. 3.2 Primary control vs defence-in-depth: headers are defence-in-depth.

**Phase 4.**
- 4.1 Pseudocode PoC: upload `x.png` containing HTML → open directly → browser sniffs HTML. Blocked by type allowlist + browser behaviour.
- 4.2 Executable PoC: not run (no sniffing path in current browsers for these types).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: `/assets/x.png` served as `image/png`.
- 4.5 PoC verification: headers now present (`evidence/prod-build-checks.txt`); no exploit path existed before.

**Phase 5.**
- Q1 Non-vuln: allowlist + browser behaviour.
- Q2 Justification: CSP considered sufficient.
- Q3 Context: HTTPS-only platform.
- Q4 Pattern bias: header checklist.
- Q5 Allowlist prevents HTML uploads.
- Q6 N/A.
- Q7 N/A.
- Q8 Not practical.
- Q9 DiD.
- Q10 Browser protections.
- Q11 Not a vulnerability.
- Q12 Kept as hardening.
- Q13 Re-read `mime.ts`.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | **Fail** |

`BUG SEC-016 FALSE POSITIVE — defence-in-depth headers; no attack path; hardening (now applied).`

## SEC-017 — Settings encryption key falls back to DATABASE_URL

**Step 0.** Claim: whoever has the database credentials can also decrypt the stored
OpenRouter key. Threat model: attacker with a database dump; attacker with app env.
Class: crypto key management.

**Phase 1.** 1.1 `encryptionKey()` (`app-settings.server.ts:8`) = scrypt(`SETTINGS_ENCRYPTION_KEY || DATABASE_URL`).
1.2 AES-256-GCM. 1.3 A dump/backup contains the ciphertext but not the env var. 1.4
Same env holds `OPENROUTER_API_KEY` when configured there.

**Phase 2.** 2.1 Decryption needs ciphertext **and** `DATABASE_URL`. A dump alone is
insufficient; whoever has the app env typically has the other secrets too. 2.2 N/A.
2.3 N/A. 2.4 No escalation path beyond existing env access.

**Phase 3.** 3.1 Real impact vs operational robustness: No real impact beyond existing access. 3.2 Primary control vs defence-in-depth: Separate key is defence-in-depth.

**Phase 4.**
- 4.1 Pseudocode PoC: dump DB + read env → decrypt → API key.
- 4.2 Executable PoC: not applicable (requires both secrets).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: dump alone cannot decrypt.
- 4.5 PoC verification: key derivation re-read; both inputs required.

**Phase 5.**
- Q1 Non-vuln: dump alone is safe.
- Q2 Justification: zero-config default.
- Q3 Context: env compromise exposes everything anyway.
- Q4 Pattern bias: fallback-secret rule.
- Q5 Prevention holds for dumps.
- Q6 Env is trusted storage.
- Q7 N/A.
- Q8 Not practical as escalation.
- Q9 DiD.
- Q10 N/A.
- Q11 Over-rated.
- Q12 Kept as config advice.
- Q13 Re-read function.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | Pass |

`BUG SEC-017 FALSE POSITIVE — requires secrets that already grant equivalent access; configuration advice.`

## SEC-022 — `.env` with public-by-design keys in git history

**Step 0.** Claim: secrets leaked in commit `13cd74d`. Threat model: anyone with repo
access. Class: information disclosure.

**Phase 1.** 1.1 Git history → two Supabase JWTs (`role: anon`) and a Maps browser key.
1.2 Anon keys and `VITE_` keys are shipped to browsers by design. 1.3 Maps key
reportedly referrer-restricted (README). 1.4 `.env` untracked since `385b0ff`.

**Phase 2.** 2.1 The values are already public in client bundles of that era. 2.2–2.3
N/A. 2.4 Abuse depends on the legacy Supabase project's RLS, outside this codebase.

**Phase 3.** 3.1 Real impact vs operational robustness: No secret disclosed (public-by-design keys). 3.2 Primary control vs defence-in-depth: Hygiene.

**Phase 4.**
- 4.1 Pseudocode PoC: use anon key against legacy Supabase → limited by its RLS.
- 4.2 Executable PoC: not run (would touch a third-party production service).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: `role` claim is `anon`, not `service_role`.
- 4.5 PoC verification: JWT claims decoded locally (values never printed).

**Phase 5.**
- Q1 Non-vuln: publishable keys.
- Q2 Justification: early project setup.
- Q3 Context: legacy backend retired.
- Q4 Pattern bias: secret-scanner hit.
- Q5 N/A.
- Q6 Public data treated as secret: yes.
- Q7 N/A.
- Q8 Not practical.
- Q9 Hygiene.
- Q10 N/A.
- Q11 Over-reported by tool.
- Q12 Kept as advice (lock legacy project).
- Q13 Claims re-checked.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | **Fail** | **Fail** | N/A | Pass |

`BUG SEC-022 FALSE POSITIVE — keys are public by design; legacy project lock-down remains advice.`

## SEC-023 — Brute-forceable initial-password hashes in the repository

**Step 0.** Claim: repo readers can brute-force CEO mobile numbers from scrypt hashes
and log in to not-yet-activated company accounts. Threat model: insider or anyone who
obtains the repository. Class: credential exposure / information disclosure.

**Phase 1.** 1.1 `scripts/company-national-id-logins.json` (git) → 67 × `salt:scrypt(mobile)`.
1.2 scrypt N=2^14, r=8, p=1. 1.3 No pepper; search space ≈ 10^9 (Iranian mobiles).
1.4 Provisioning sets these as live initial passwords.

**Phase 2.** 2.1 The attacker has the hash and salt. 2.2 Math: 10^9 candidates ÷ ~5×10^3
scrypt/s per GPU ≈ 2×10^5 s ≈ 2–3 days per hash per GPU (one per row, salts differ).
2.3 Race: the window ends when the company sets its own password. 2.4 Recovered value
= CEO mobile (PII) + valid initial password.

**Phase 3.** 3.1 Real impact vs operational robustness: Real impact: personal-data disclosure and account takeover of unactivated companies. 3.2 Primary control vs defence-in-depth: Primary control: not committing credential material.

**Phase 4.**
- 4.1 Pseudocode PoC: for m in 0901…0939×10^7: if scrypt(m, salt) == hash → login(national_id, m).
- 4.2 Executable PoC: **not run** (brute-forcing real people's numbers is inappropriate).
- 4.3 Unit-test PoC: hash format verified compatible with `verifyPassword` (earlier check).
- 4.4 Negative PoC: accounts that already set their own password are unaffected.
- 4.5 PoC verification: cost estimate from scrypt parameters; hashes present in git.

**Phase 5.**
- Q1 Non-vuln: hashes, not plaintext — but low-entropy input.
- Q2 Justification: needed for provisioning.
- Q3 Context: private repository.
- Q4 Not pattern-only: math done.
- Q5 scrypt slows but does not prevent.
- Q6 Repo access = insider threat model.
- Q7 Math in 2.2.
- Q8 Practical for a motivated insider.
- Q9 Primary.
- Q10 None.
- Q11 Real.
- Q12 Not dismissed.
- Q13 Parameters re-read.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass (insider) | Pass | Pass (pseudocode) | Pass | Pass |

`BUG SEC-023 TRUE POSITIVE — brute-forceable initial passwords and CEO mobiles in the repository (delete after provisioning).`

## SEC-024 — No security audit trail

**Step 0.** Claim: failed logins and privileged actions are not recorded. Threat model:
any attacker; defenders investigating. Class: detection gap (repudiation).

**Phase 1.** 1.1 Auth/admin handlers → no audit write. 1.2 `rate_limit_hits` is pruned.
1.3 Liara logs only generic request lines. 1.4 Change requests record `created_by`.

**Phase 2.** 2.1 No attacker input; the gap is absence. 2.2–2.3 N/A. 2.4 Absence does
not enable an attack; it hinders detection.

**Phase 3.** 3.1 Real impact vs operational robustness: Not an exploitable vulnerability; an operational security gap. 3.2 Primary control vs defence-in-depth: Detection control (defence-in-depth).

**Phase 4.**
- 4.1 Pseudocode PoC: grant admin to an attacker account → nothing records who did it.
- 4.2 Executable PoC: not applicable (absence).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: change requests do keep `created_by`/`reviewed_by`.
- 4.5 PoC verification: code search found no audit writes.

**Phase 5.**
- Q1 Non-vuln: absence is not a bug.
- Q2 Justification: small team.
- Q3 Context: platform logs exist.
- Q4 N/A.
- Q5 N/A.
- Q6 N/A.
- Q7 N/A.
- Q8 Not exploitable.
- Q9 Detection is DiD.
- Q10 N/A.
- Q11 Real gap, not a vuln.
- Q12 Kept in the risk register.
- Q13 Searched for audit writes.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | N/A |

`BUG SEC-024 FALSE POSITIVE (as a vulnerability) — detection gap; stays in the risk register (R-03).`

## SEC-025 — Vulnerable desktop/build toolchain dependencies (minimatch remaining)

**Step 0.** Claim: build tools carry known vulnerabilities. Threat model: attacker
influencing build inputs. Class: supply chain / DoS.

**Phase 1.** 1.1 `minimatch` via electron-builder → glob patterns from the project's
own config. 1.2 ReDoS needs attacker-controlled patterns. 1.3 Build machines only.
1.4 Electron runtime upgraded.

**Phase 2.** 2.1 Patterns are developer-authored. 2.2 N/A. 2.3 N/A. 2.4 No external input.

**Phase 3.** 3.1 Real impact vs operational robustness: No real impact. 3.2 Primary control vs defence-in-depth: Hygiene.

**Phase 4.**
- 4.1 Pseudocode PoC: malicious glob in build config → slow build. Requires repo write.
- 4.2 Executable PoC: not applicable.
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: normal build completes.
- 4.5 PoC verification: `bun pm why minimatch` traced it to the build toolchain only.

**Phase 5.**
- Q1 Non-vuln: trusted input.
- Q2 Upstream constraint.
- Q3 Build-only.
- Q4 Scanner-driven.
- Q5 N/A.
- Q6 Trusted config as attacker data: yes.
- Q7 N/A.
- Q8 Not practical.
- Q9 Hygiene.
- Q10 N/A.
- Q11 Over-reported.
- Q12 Kept as upgrade item.
- Q13 Dependency path re-traced.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | Pass |

`BUG SEC-025 FALSE POSITIVE — build-only, no attacker input; upgrade when the parent allows.`

## SEC-026 — MFA disabled; admin accounts are password-only

**Step 0.** Claim: anyone with an admin's password gets full admin access. Threat
model: credential thief (phishing, reuse). Class: authentication weakness.

**Phase 1.** 1.1 `signIn` → session → `requireMfaVerified` no-op (`middleware.ts:30`)
→ admin functions. 1.2 No second factor configured. 1.3 Rate limits slow guessing, not
phishing/reuse. 1.4 MFA code now fixed (SEC-004/005), but off.

**Phase 2.** 2.1 The thief controls the credential. 2.2 N/A. 2.3 N/A. 2.4 Admin =
role grants and all public content.

**Phase 3.** 3.1 Real impact vs operational robustness: Real impact: full privilege with a single factor. 3.2 Primary control vs defence-in-depth: Primary control for privileged accounts is a second factor.

**Phase 4.**
- 4.1 Pseudocode PoC: phished admin password → `signIn` → `grantAdmin(attacker)`.
- 4.2 Executable PoC: not run against real accounts; equivalent behaviour shown by the authz suite's admin fixture (password-only login reaches admin functions).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: with `MFA_ENFORCED=true` and SMS configured, the session needs an OTP.
- 4.5 PoC verification: `evidence/authz-coverage.txt` shows admin actions with a password-only session.

**Phase 5.**
- Q1 Non-vuln: MFA is optional by design.
- Q2 Justification: no SMS provider yet.
- Q3 Context: small admin group.
- Q4 Not pattern-only.
- Q5 Rate limits don't stop phishing.
- Q6 Credential is attacker-held by threat model.
- Q7 N/A.
- Q8 Practical (phishing).
- Q9 Primary for admins.
- Q10 None.
- Q11 Real.
- Q12 Not dismissed.
- Q13 Re-read middleware.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | Pass | Pass | N/A → Pass | Pass |

`BUG SEC-026 TRUE POSITIVE — single-factor admin accounts.`

## SEC-027 — Session tokens stored unhashed

**Step 0.** Claim: a database read yields usable session tokens. Threat model: attacker
with DB read (dump, backup). Class: credential storage.

**Phase 1.** 1.1 `sessions.id` = raw token. 1.2 Cookie lookup by equality. 1.3 DB not
internet-exposed. 1.4 Passwords are hashed; tokens are not.

**Phase 2.** 2.1 Needs DB read. 2.2–2.3 N/A. 2.4 With a dump, the attacker can also
read all data directly.

**Phase 3.** 3.1 Real impact vs operational robustness: Escalation from read-only dump to live sessions (write capability) — limited; requires prior compromise. 3.2 Primary control vs defence-in-depth: Defence-in-depth.

**Phase 4.**
- 4.1 Pseudocode PoC: dump → set cookie `session=<id>` → act as user.
- 4.2 Executable PoC: not applicable (requires DB access).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: expired rows are rejected.
- 4.5 PoC verification: `INSERT INTO sessions` stores the raw token (`session.server.ts:35`).

**Phase 5.**
- Q1 Non-vuln: needs DB compromise.
- Q2 Justification: simplicity.
- Q3 Context: private DB.
- Q4 Pattern bias.
- Q5 N/A.
- Q6 Internal storage.
- Q7 N/A.
- Q8 Only after compromise.
- Q9 DiD.
- Q10 N/A.
- Q11 Real weakness, not a standalone vuln.
- Q12 Kept.
- Q13 Re-read.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | Pass |

`BUG SEC-027 FALSE POSITIVE — requires prior database compromise; hardening.`

## SEC-028 — CSP allows inline scripts

**Step 0.** Claim: `'unsafe-inline'` weakens XSS protection. Threat model: XSS attacker.
Class: misconfiguration (DiD).

**Phase 1.** 1.1 CSP header from `csp.ts:6`. 1.2 Inline allowed. 1.3 React escaping is
primary. 1.4 No stored/reflected XSS found in app code (SEC-001 was framework).

**Phase 2.** 2.1 No
attacker input without a separate injection. 2.2–2.3 N/A. 2.4 Only matters with another bug.

**Phase 3.** 3.1 Real impact vs operational robustness: Amplifies other bugs only. 3.2 Primary control vs defence-in-depth: Defence-in-depth.

**Phase 4.**
- 4.1 Pseudocode PoC: injected inline script runs because CSP allows it — requires an injection bug.
- 4.2 Executable PoC: not applicable.
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: without an injection, nothing runs.
- 4.5 PoC verification: header captured (`evidence/prod-build-checks.txt`).

**Phase 5.**
- Q1 Non-vuln: DiD only.
- Q2 Framework needs inline bootstraps.
- Q3 Lovable constraint.
- Q4 Pattern bias.
- Q5 N/A.
- Q6 N/A.
- Q7 N/A.
- Q8 Not alone.
- Q9 DiD.
- Q10 React escaping.
- Q11 Not a vuln.
- Q12 Kept.
- Q13 Header re-read.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | Pass |

`BUG SEC-028 FALSE POSITIVE — defence-in-depth weakness only.`

## SEC-029 — First-user-becomes-admin trigger

**Step 0.** Claim: the next inserted user becomes admin when none exists. Threat model:
anonymous sign-up. Class: logic (privilege bootstrap).

**Phase 1.** 1.1 `INSERT INTO users` → trigger (`0001_init.sql:247`) → admin if none.
1.2 `revokeAdmin` blocks self-revocation. 1.3 Production has an admin. 1.4 Provisioning
scripts refuse to run with no admin.

**Phase 2.** 2.1 Sign-up is attacker-controlled, but the condition (zero admins) is not.
2.2 N/A. 2.3 Race on a fresh install only. 2.4 Requires all admins deleted at DB level.

**Phase 3.** 3.1 Real impact vs operational robustness: No impact while an admin exists. 3.2 Primary control vs defence-in-depth: Bootstrap design.

**Phase 4.**
- 4.1 Pseudocode PoC: zero admins → sign up → admin.
- 4.2 Executable PoC: not applicable to production state.
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: with ≥ 1 admin the trigger does nothing (authz suite fixtures).
- 4.5 PoC verification: trigger body re-read.

**Phase 5.**
- Q1 Non-vuln: bootstrap feature.
- Q2 Justification: self-hosting.
- Q3 Context: admin exists.
- Q4 Pattern bias.
- Q5 Condition prevents it.
- Q6 N/A.
- Q7 N/A.
- Q8 Not practical.
- Q9 Design.
- Q10 N/A.
- Q11 Over-reported.
- Q12 Kept as advice.
- Q13 Re-read.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | **Fail** |

`BUG SEC-029 FALSE POSITIVE — unreachable while any admin exists.`

## SEC-030 — Database TLS without certificate verification

**Step 0.** Claim: `ssl: "require"` permits a MITM between app and DB. Threat model:
network attacker inside Liara's network. Class: transport security.

**Phase 1.** 1.1 `db/connection.ts:24`. 1.2 TLS without chain verification. 1.3 Private
platform network (unverified). 1.4 Single connection site.

**Phase 2.** 2.1 Requires a network
position inside the platform. 2.2–2.3 N/A. 2.4 Not demonstrable here.

**Phase 3.** 3.1 Real impact vs operational robustness: Not demonstrable. 3.2 Primary control vs defence-in-depth: DiD on a private network.

**Phase 4.**
- 4.1 Pseudocode PoC: MITM with self-signed cert → app accepts.
- 4.2 Executable PoC: not applicable (no platform network access).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: on a private network no attacker sits on the path.
- 4.5 PoC verification: configuration line re-read.

**Phase 5.**
- Q1 Non-vuln: private network.
- Q2 Managed DB certificates.
- Q3 Context unknown.
- Q4 Pattern bias.
- Q5 N/A.
- Q6 N/A.
- Q7 N/A.
- Q8 Not practical.
- Q9 DiD.
- Q10 Platform isolation.
- Q11 Unverified.
- Q12 Kept as environment check.
- Q13 Re-read.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | **Fail** (private network, unverified) |

`BUG SEC-030 FALSE POSITIVE — needs a platform-internal network position; environment check.`

## SEC-031 — Developer test pages routable in production

**Step 0.** Claim: `/perf`, `/dev/logo` exposed. Threat model: anonymous visitor.
Class: information exposure.

**Phase 1.** 1.1 Client-only visual pages. 1.2 No server functions or data. 1.3 N/A.
1.4 No secrets referenced.

**Phase 2.** 2.1 Anyone can open them. 2.2–2.3 N/A. 2.4 They reveal nothing.

**Phase 3.** 3.1 Real impact vs operational robustness: No impact. 3.2 Primary control vs defence-in-depth: Hygiene.

**Phase 4.**
- 4.1 Pseudocode PoC: open `/perf` → logo benchmark.
- 4.2 Executable PoC: not needed.
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: no data endpoints on the pages.
- 4.5 PoC verification: route files read.

**Phase 5.**
- Q1 Non-vuln: harmless pages.
- Q2 Dev tooling.
- Q3 N/A.
- Q4 Pattern bias.
- Q5 N/A.
- Q6 N/A.
- Q7 N/A.
- Q8 No gain.
- Q9 Hygiene.
- Q10 N/A.
- Q11 Not a vuln.
- Q12 Kept.
- Q13 Re-read.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | **Fail** | **Fail** | N/A | Pass |

`BUG SEC-031 FALSE POSITIVE — no data or functionality exposed.`

## SEC-032 — Open self-registration plus SMS sending

**Step 0.** Claim: attackers can register accounts and trigger paid SMS. Threat model:
anonymous abuser. Class: business-logic abuse.

**Phase 1.** 1.1 `signUp` → `setPhone` → `requestOtp` → SMS provider. 1.2 Limits:
sign-up 5/h per IP (effective after SEC-003), 60 s cooldown, 5 SMS/day/user. 1.3 **No
SMS provider configured** — sending fails. 1.4 Same limits for all users.

**Phase 2.** 2.1 Attacker
controls the phone number. 2.2 Cost bound: 5 × accounts/day. 2.3 N/A. 2.4 Bounded.

**Phase 3.** 3.1 Real impact vs operational robustness: Cost abuse (bounded), not a security impact today. 3.2 Primary control vs defence-in-depth: Rate limits are the primary control.

**Phase 4.**
- 4.1 Pseudocode PoC: script sign-ups from many IPs → 5 SMS each per day.
- 4.2 Executable PoC: not run (abuse testing out of scope).
- 4.3 Unit-test PoC: not applicable.
- 4.4 Negative PoC: without a provider, no SMS is sent (`SMS_NOT_CONFIGURED`).
- 4.5 PoC verification: limits read in `mfa.functions.ts` and `auth.functions.ts`.

**Phase 5.**
- Q1 Non-vuln: limits + no provider.
- Q2 Justification: open registration.
- Q3 Context: companies are admin-provisioned.
- Q4 Pattern bias.
- Q5 Limits bound it.
- Q6 N/A.
- Q7 Bound in 2.2.
- Q8 Low value.
- Q9 Abuse control.
- Q10 N/A.
- Q11 Not a vuln.
- Q12 Kept as advice (CAPTCHA).
- Q13 Re-read limits.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | **Fail** | **Fail** | Pass | **Fail** (no SMS provider) |

`BUG SEC-032 FALSE POSITIVE — bounded abuse surface; revisit when SMS is configured.`

---

# Part C — SEC-033 … SEC-046 (rounds 3–5)

Same method as Parts A and B (deep verification, phases 1–5, 13 questions, six gates);
Gate 3 interpreted as above. "Baseline" means the code before the fix; the PoCs are the
regression tests that failed on the baseline and pass after the fix. Code facts were
re-read after the verdicts (Q13): `src/lib/auth/session.server.ts` (cookie `sameSite:
"lax"`, `secure` in production), `src/start.ts` (CSRF middleware), `src/routes/assets.$.ts`
(content-type from the extension, `nosniff`), `src/lib/auth.functions.ts` (throttles 8/5 min
per account, 60/15 min per client, 5/h sign-up, 5/15 min password change).

## Verdict summary — Part C

| Bug | Class | Verdict | Effect on the register |
|---|---|---|---|
| SEC-034 | Brute force (credential oracle) | **TRUE POSITIVE** (needs a stolen session) | Unchanged (Low) |
| SEC-035 | DoS (unbounded request body) | **TRUE POSITIVE** (unauthenticated) | Unchanged (Medium) |
| SEC-040 | Information disclosure (dev server on all interfaces) | **TRUE POSITIVE** (adjacent network, development only) | Unchanged (Low) |
| SEC-042 | Information disclosure (unpublished attachments) | **TRUE POSITIVE** | Unchanged (Low) |
| SEC-043 | Weak credentials | **TRUE POSITIVE** | Unchanged (Low) |
| SEC-044 | Information disclosure (database error) | **TRUE POSITIVE** (low value) | Unchanged (Low) |
| SEC-046 | User enumeration (sign-up) | **TRUE POSITIVE** (low value, accepted) | Unchanged (Info, accepted) |
| SEC-033 | CSRF | **FALSE POSITIVE** — SameSite=Lax + public-suffix domain block it | Stays Informational hardening |
| SEC-036 | Missing headers | **FALSE POSITIVE** — defence in depth | Stays Informational hardening |
| SEC-037 | Unexpected HTTP methods | **FALSE POSITIVE** — no state change | Stays Informational hardening |
| SEC-038 | Upload content not checked | **FALSE POSITIVE** — never served as HTML | Low → **Informational** hardening |
| SEC-039 | Path segment from admin input | **FALSE POSITIVE** — trusted admin, contained | Stays Informational hardening |
| SEC-041 | SQL identifiers from seed file | **FALSE POSITIVE** — trusted input | Stays Informational hardening |
| SEC-045 | Missing X-Frame-Options | **FALSE POSITIVE** — CSP frame-ancestors enforced | Stays Informational hardening |

**Counts (Part C, 14 bugs): 7 TRUE POSITIVES, 7 FALSE POSITIVES.** All fixes stay applied.

**Exploit chains checked:** SEC-040 (dev server exposed) + SEC-023 (hash file in the tree)
— on the baseline a LAN attacker could fetch `scripts/company-national-id-logins.json` from
a developer's dev server and brute-force CEO mobiles offline; both are fixed (dev server
bound to localhost, file removed). SEC-043 (weak passwords) + SEC-046 (enumeration) —
enumeration confirms a target email, weak passwords make the per-account throttle
(8 per 5 min) insufficient; both addressed (policy) or bounded (5 sign-ups/h). SEC-042 +
SEC-038 — a disguised upload of an unpublished company was readable by id, but still
served as an image; no script execution. No further chain found.

## SEC-033 — Server functions accept cross-site requests

**Step 0.** Claim: no CSRF check on server functions. Threat model: attacker page visited
by a signed-in user. Class: CSRF.
**Phase 1.** 1.1 Browser on attacker origin → POST `/_serverFn/…` with the victim's cookie.
1.2 Contract: server functions accept JSON (`x-tsr-serverfn`), the session cookie is
`SameSite=Lax`. 1.3 Environment: production host `*.liara.run`; `liara.run` is on the
Public Suffix List, so every other Liara app is a different site. 1.4 Cross-ref: CORS never
approves foreign origins (probe: preflight not approved).
**Phase 2.** 2.1 Attacker controls the request but not the cookie: Lax withholds it on
cross-site POST and `fetch`. 2.2 N/A. 2.3 N/A. 2.4 Adversarial: a JSON request needs a
preflight that fails; a `no-cors` text/plain POST is sent without the cookie.
**Phase 3.** 3.1 No impact while Lax applies. 3.2 Lax is the primary control; the
middleware is defence in depth (matters on a custom domain with untrusted sibling
subdomains).
**Phase 4.** 4.1 Pseudocode: evil.example → `fetch(target+signOutFn,{credentials:'include'})`
→ no cookie → no effect. 4.2 Executable: `scripts/test-security-browser.cjs` (real
Chromium, cross-site and same-site pages). 4.3 Unit/HTTP: `scripts/test-request-hardening.py`
(baseline: forged `Sec-Fetch-Site: cross-site` answered 200 — header-level only, no cookie
involved). 4.4 Negative: same-origin call 200. 4.5 Verified on the dev server and the
production build.
**Phase 5.** Q1 Lax cookie already blocks it. Q2 Framework default before 1.169 had no
CSRF middleware. Q3 PSL status of the host. Q4 Yes — "no CSRF token" pattern. Q5 Lax
prevents the cookie from being sent. Q6 Cookie is not attacker-controlled. Q7 N/A.
Q8 Not on the current host. Q9 Yes — defence-in-depth gap. Q10 Browser SameSite
enforcement. Q11 Not real on production. Q12 Considered a custom-domain sibling: covered
by the middleware now (same-site refused). Q13 Re-read `session.server.ts` and `start.ts`.

| Gate | 1 Process | 2 Reach | 3 Impact | 4 PoC | 5 Math | 6 Env |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** (no cookie sent) | N/A | **Fail** (Lax + PSL) |

`BUG SEC-033 FALSE POSITIVE — the session cookie is never sent cross-site; middleware kept as hardening.`

## SEC-034 — Unthrottled current-password guessing

**Step 0.** Claim: `changeMyPassword` verifies the current password with no throttle.
Threat model: attacker holding a victim's session (stolen cookie). Class: brute force.
**Phase 1.** 1.1 Session cookie → `changeMyPassword({currentPassword})` →
`verifyLoginPassword` → distinct `INVALID_CURRENT_PASSWORD`. 1.2 Contract: `requireAuth`
only. 1.3 Environment: no other limiter on this path. 1.4 Introduced by the SEC-007 fix.
**Phase 2.** 2.1 Attacker controls `currentPassword` fully. 2.2 Bound: unlimited tries per
session (scrypt cost only, ~50 ms) ≈ 70,000 guesses/hour. 2.3 N/A. 2.4 Gains a password
that survives revocation of the stolen session.
**Phase 3.** 3.1 Real: credential disclosure → persistent account access. 3.2 Primary
control missing (no throttle).
**Phase 4.** 4.1 Pseudocode: loop guesses with the stolen cookie until no
`INVALID_CURRENT_PASSWORD`. 4.2 Executable: `scripts/test-request-hardening.py`
(baseline: 7 guesses, all answered, `evidence/request-hardening-baseline.txt`). 4.3 Unit:
skipped — needs DB and session; the HTTP test is the executable PoC. 4.4 Negative: the
legitimate change still works. 4.5 Patched: 5 guesses then `RATE_LIMITED`.
**Phase 5.** Q1 Requires a session — still a real escalation to the password. Q2 Oversight
in the SEC-007 fix. Q3 No upstream limiter. Q4 No — reproduced. Q5 Validation does not
limit attempts. Q6 Attacker controls the field. Q7 Rate computed from scrypt cost. Q8 Yes,
scripted. Q9 Primary control. Q10 None. Q11 Real, Low because a session is needed. Q12 No.
Q13 Re-read the handler (throttle now at line 253).

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | Pass | Pass | Pass | Pass |

`BUG SEC-034 TRUE POSITIVE — unthrottled current-password oracle for a session holder.`

## SEC-035 — No request body size limit

**Step 0.** Claim: any request body is read and parsed in full before authorization.
Threat model: anonymous attacker. Class: DoS (memory).
**Phase 1.** 1.1 Body → framework `request.json()`/`formData()` → memory. 1.2 No limit in
the framework or `src/server.ts`. 1.3 Liara ingress limit unknown (not documented in
the repo). 1.4 Same parser for every server function.
**Phase 2.** 2.1 Size fully attacker-controlled, no authentication. 2.2 Memory ≈ k × size
× concurrency; with 10 concurrent 100 MB bodies and k ≥ 2 the demand exceeds a typical
512 MB–1 GB container. 2.3 N/A. 2.4 Cheap for the attacker (bandwidth only).
**Phase 3.** 3.1 Attacker-triggered, unauthenticated loss of availability with
amplification — real impact under the DoS class rule. 3.2 Primary control missing.
**Phase 4.** 4.1 Pseudocode: N parallel POSTs of B MB → heap growth → OOM/restart.
4.2 Executable: `scripts/test-request-hardening.py` (baseline: 3 MB accepted with and
without Content-Length). Memory exhaustion itself not run (DoS testing out of policy).
4.3 Unit: `tests/unit/security-regressions.test.ts` (SEC-035 blocks). 4.4 Negative:
normal calls and a 3 MB signed-in upload still work. 4.5 Patched: 413 / aborted.
**Phase 5.** Q1 An ingress limit might exist — unverified. Q2 Framework default.
Q3 Ingress configuration. Q4 No — acceptance reproduced. Q5 Nothing limited it. Q6 Body is
attacker data. Q7 Bound above. Q8 Yes with modest bandwidth. Q9 Primary. Q10 Node heap
limit turns it into a crash, not a defence. Q11 Real; magnitude depends on ingress.
Q12 No. Q13 Re-read `server.ts` and `body-limit.ts`.

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | Pass | Pass (trigger shown; OOM inferred, not run) | Pass | Pass (no known ingress limit) |

`BUG SEC-035 TRUE POSITIVE — unauthenticated unbounded body parsing (memory DoS).`

## SEC-036 — No Permissions-Policy; server-function responses cacheable

**Step 0.** Claim: missing hardening headers. Threat model: injected script / shared cache.
Class: missing control.
**Phase 1.** 1.1 Headers on every response. 1.2 None set. 1.3 HTTPS, no shared cache in
front of the app; server-function responses carry session data. 1.4 SEC-016 headers present.
**Phase 2.** 2.1 Attacker controls nothing here. 2.2–2.3 N/A. 2.4 Would need script
injection (none found) or a caching proxy (none).
**Phase 3.** 3.1 Defence in depth only. 3.2 Not a primary control.
**Phase 4.** 4.1 Pseudocode: none (no attack path). 4.2 Executable: header checks in
`test-request-hardening.py`. 4.3 Skipped — header presence only. 4.4 Negative: pages load.
4.5 Verified.
**Phase 5.** Q1 Headers are optional. Q2 Not set by default. Q3 No CDN. Q4 Yes — checklist
item. Q5 N/A. Q6 N/A. Q7 N/A. Q8 No. Q9 Yes. Q10 Browser defaults. Q11 Not a
vulnerability. Q12 No. Q13 Re-read `server.ts`.

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | **Fail** |

`BUG SEC-036 FALSE POSITIVE — hardening headers, no attack path.`

## SEC-037 — Pages rendered for any HTTP method

**Step 0.** Claim: `PUT /`, `DELETE /` return the page. Threat model: scanner / method
tampering. Class: misconfiguration.
**Phase 1.** 1.1 Any method → SSR render. 1.2 Pages have no handlers for other methods.
1.3 None. 1.4 API routes and server functions handle their own methods.
**Phase 2.** 2.1 Attacker controls the method. 2.2–2.3 N/A. 2.4 Nothing changes state.
**Phase 3.** 3.1 No impact. 3.2 Hygiene.
**Phase 4.** 4.1 `PUT /` → 200 HTML (baseline probe). 4.2 `test-security-probes.py`
(405 after). 4.3 `security-regressions.test.ts` SEC-037. 4.4 GET/HEAD and POST to server
functions still work. 4.5 Verified on both builds.
**Phase 5.** Q1 Render is idempotent. Q2 Framework default. Q3 None. Q4 Yes — scanner
finding. Q5 N/A. Q6 N/A. Q7 N/A. Q8 No. Q9 Yes. Q10 N/A. Q11 Not a vulnerability.
Q12 No. Q13 Re-read `method-guard.ts`.

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | **Fail** | **Fail** | N/A | Pass |

`BUG SEC-037 FALSE POSITIVE — no state change or disclosure.`

## SEC-038 — Uploads checked by extension only

**Step 0.** Claim: an HTML file renamed `.png` is stored. Threat model: company owner or
admin uploading a polyglot to run script in the site's origin. Class: stored XSS via upload.
**Phase 1.** 1.1 Upload → `assertUploadAllowed` (extension) → disk → `/assets/*`.
1.2 Served with the content-type of the extension (`mimeFromPath`) and `nosniff`.
1.3 SVG/HTML/XML extensions refused. 1.4 Only signed-in owners/admins upload.
**Phase 2.** 2.1 Uploader controls the bytes. 2.2 N/A. 2.3 N/A. 2.4 Browser obeys
`image/png` + `nosniff`; HTML never renders.
**Phase 3.** 3.1 No script execution → no impact. 3.2 The content-type is the primary
control; the signature check is defence in depth.
**Phase 4.** 4.1 Upload `x.png` containing HTML → GET `/assets/…` → `image/png`. 4.2
Executable: `test-security-probes.py` baseline ("never served as HTML", served as
`image/png`). 4.3 `security-regressions.test.ts` SEC-038. 4.4 Real PNG accepted;
browser logo upload works. 4.5 Verified.
**Phase 5.** Q1 Content-type + nosniff neutralise it. Q2 Extension allowlist chosen for
simplicity. Q3 Serving headers. Q4 Yes — "no magic-byte check" pattern. Q5 Yes, it
prevents execution. Q6 Uploader is authenticated. Q7 N/A. Q8 No. Q9 Yes. Q10 Browser
MIME enforcement. Q11 Was rated Low; downgraded. Q12 Considered old browsers ignoring
nosniff on images — they still render images, not HTML. Q13 Re-read `assets.$.ts`.

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | **Fail** | **Fail** | N/A | **Fail** (nosniff + content-type) |

`BUG SEC-038 FALSE POSITIVE — disguised HTML is served as an image; check kept as hardening.`

## SEC-039 — Admin upload ids used as folder names

**Step 0.** Claim: `company_id`/`park_id`/`ownerId` unchecked in upload paths. Threat model:
admin. Class: path traversal.
**Phase 1.** 1.1 Admin input → path → `saveLocalFile` → `resolveSafePath` (containment).
1.2 Owners are limited to their own existing company id. 1.3 Uploads root containment.
1.4 File names timestamp+random.
**Phase 2.** 2.1 Only an admin controls the id. 2.2 N/A. 2.3 N/A. 2.4 Write stays inside
the uploads root, never overwrites (random names).
**Phase 3.** 3.1 No impact beyond what an admin can already do. 3.2 Containment is the
primary control.
**Phase 4.** 4.1 `company_id="../about"` → file in another uploads folder. 4.2
`test-security-probes.py` (refused after). 4.3 SEC-039 unit tests. 4.4 Normal ids accepted.
4.5 Verified.
**Phase 5.** Q1 Admins are trusted. Q2 Ids come from the DB in normal use. Q3 Containment.
Q4 Yes. Q5 Containment prevents escape. Q6 Yes — admin is trusted. Q7 N/A. Q8 No. Q9 Yes.
Q10 N/A. Q11 Not a vulnerability. Q12 No. Q13 Re-read `local-storage.server.ts`.

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** (admin only) | **Fail** | Pass | N/A | **Fail** (containment) |

`BUG SEC-039 FALSE POSITIVE — trusted input, writes contained.`

## SEC-040 — Dev server on every network interface

**Step 0.** Claim: `vite dev` listened on `::`, serving project files to the local network.
Threat model: attacker on the same network as a developer (office or café Wi-Fi). Class:
information disclosure.
**Phase 1.** 1.1 LAN → `http://<dev-ip>:8080/<file>` → Vite serves the project tree.
1.2 Vite denies `.env`/`.git` but serves `package.json`, migrations and JSON files.
1.3 Lovable's sandbox needs `::` and sits behind its own proxy; local runs do not.
1.4 On the baseline the tree contained the initial-password hash file (SEC-023).
**Phase 2.** 2.1 Attacker chooses the path. 2.2 N/A. 2.3 N/A. 2.4 Requires network
adjacency and a running dev server.
**Phase 3.** 3.1 Real: source and credential-hash disclosure. 3.2 Primary control missing.
**Phase 4.** 4.1 LAN GET `/scripts/company-national-id-logins.json` → hashes. 4.2
`test-security-probes.py` on the dev server (baseline: 200 for project files; `Network:`
address printed by Vite). 4.3 Skipped — configuration. 4.4 Localhost access still works.
4.5 After the fix Vite prints "use --host to expose".
**Phase 5.** Q1 Development only. Q2 Default of the editor's config. Q3 Sandbox vs local.
Q4 No — config shows `::`. Q5 Nothing restricted it. Q6 Attacker on LAN controls requests.
Q7 N/A. Q8 Yes on shared networks. Q9 Primary. Q10 Host firewall may block — not assumed.
Q11 Low, environment-bound. Q12 No. Q13 Re-read `vite.config.ts` (now `host: "localhost"`).

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | Pass | Pass | N/A | Pass (development environments) |

`BUG SEC-040 TRUE POSITIVE — project files and credential hashes readable from the local network.`

## SEC-041 — Desktop offline import splices seed keys as SQL identifiers

**Step 0.** Claim: `electron/main.cjs` builds INSERT column lists from seed keys.
Threat model: attacker who can alter the bundled seed. Class: SQL injection.
**Phase 1.** 1.1 Seed JSON (built by `scripts/build-offline-seed.ts`, bundled in the
installer) → identifiers. 1.2 Values parameterised. 1.3 Local embedded Postgres.
1.4 Same pattern fixed in SEC-020.
**Phase 2.** 2.1 Attacker would need to modify the installer — already full control.
2.2–2.3 N/A. 2.4 No remote path.
**Phase 3.** 3.1 None. 3.2 Allowlist is hardening.
**Phase 4.** 4.1 Tampered key `a"); DROP …` → executed. 4.2 Skipped — requires a modified
installer. 4.3 Skipped. 4.4 Normal seed imports. 4.5 `node --check` and lint after the fix.
**Phase 5.** Q1 Trusted build artefact. Q2 Mirrors the server import. Q3 Installer
integrity. Q4 Yes. Q5 N/A. Q6 Yes — seed is trusted. Q7 N/A. Q8 No. Q9 Yes. Q10 N/A.
Q11 Not a vulnerability. Q12 No. Q13 Re-read `upsertTable`.

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | **Fail** |

`BUG SEC-041 FALSE POSITIVE — input is a trusted build artefact.`

## SEC-042 — Attachments of unpublished companies readable by id

**Step 0.** Claim: public `getAttachments` returns active attachments of any company,
including draft, pending, rejected or inactive ones. Threat model: anonymous visitor.
Class: information disclosure (broken access control).
**Phase 1.** 1.1 Anonymous `getAttachments({ownerType:"exhibition", ownerId})` → rows
with titles, descriptions and file URLs. 1.2 No auth middleware; filter `is_active` only.
1.3 Company ids are slugs derived from names (guessable). 1.4 `getExhibitionCompanyDetail`
and products already hide unpublished companies — the inconsistency.
**Phase 2.** 2.1 Attacker chooses `ownerId`. 2.2 N/A. 2.3 N/A. 2.4 File URLs then fetch the
files from `/assets`.
**Phase 3.** 3.1 Real: unpublished company documents disclosed. 3.2 Primary control
(visibility rule) missing on this function.
**Phase 4.** 4.1 Anonymous call with a draft company id → rows. 4.2
`scripts/test-security-strict.py` (baseline FAIL: `evidence/strict-dev-baseline.txt`).
4.3 Skipped — the HTTP test exercises the real handler and DB. 4.4 Published company's
attachments still public; owner/admin still see their own. 4.5 After fix: PASS on both
builds.
**Phase 5.** Q1 Attachments might be meant public — not for unpublished companies, by the
detail function's own rule. Q2 Mirrored an old RLS policy. Q3 None missing. Q4 No —
reproduced. Q5 `is_active` does not cover status. Q6 `ownerId` is attacker input.
Q7 N/A. Q8 Yes, one request per guessed id. Q9 Primary. Q10 None. Q11 Low value data but
real. Q12 No. Q13 Re-read `attachments.functions.ts`.

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | Pass | Pass | N/A | Pass |

`BUG SEC-042 TRUE POSITIVE — unpublished companies' attachments disclosed to anonymous callers.`

## SEC-043 — Trivial passwords accepted

**Step 0.** Claim: sign-up and password change accept `12345678`, `password`, etc.
Threat model: online guessing against any account. Class: weak credentials.
**Phase 1.** 1.1 Password → zod `min(8)` → hash. 1.2 No other rule. 1.3 Throttles 8/5 min
per account, 60/15 min per client. 1.4 First-login change uses the same path.
**Phase 2.** 2.1 Attacker controls guesses. 2.2 Bound: 8 guesses/5 min = 96/hour per
account; a top-100 list is exhausted in ~63 min, distributed IPs do not raise the
per-account cap. 2.3 N/A. 2.4 Users choosing common passwords become reachable.
**Phase 3.** 3.1 Real: account takeover (admin → privilege). 3.2 Primary control (policy)
missing; throttle alone is insufficient for top-list passwords.
**Phase 4.** 4.1 Guess top-100 at 8/5 min → success for any account using one. 4.2
`test-security-strict.py` (baseline: all 6 trivial passwords accepted). 4.3
`security-regressions.test.ts` SEC-043. 4.4 Strong passwords and existing test fixtures
accepted. 4.5 Verified on both builds; UI messages in both languages.
**Phase 5.** Q1 Length rule exists. Q2 Simplicity. Q3 Throttle. Q4 No — reproduced.
Q5 Throttle slows but does not prevent top-list guessing. Q6 Guesses are attacker data.
Q7 Bound above. Q8 Yes. Q9 Primary. Q10 None. Q11 Low–Medium; Low because of throttling.
Q12 No. Q13 Re-read signUp/changeMyPassword.

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | Pass | Pass | Pass | Pass |

`BUG SEC-043 TRUE POSITIVE — common passwords accepted; online guessing feasible within the throttle.`

## SEC-044 — Database error returned on a sign-up race

**Step 0.** Claim: concurrent sign-ups for one email return the raw Postgres error.
Threat model: anonymous caller. Class: information disclosure.
**Phase 1.** 1.1 Two sign-ups pass the existence check → second INSERT hits the unique
index → error message serialised to the client. 1.2 Thrown errors are serialised by the
framework. 1.3 None. 1.4 Any unexpected DB error took the same route.
**Phase 2.** 2.1 Attacker controls timing (parallel requests). 2.2 N/A. 2.3 Race: window
between SELECT and INSERT, reproducible with 10 parallel requests. 2.4 Reveals table and
constraint names (`users_email_key`).
**Phase 3.** 3.1 Real but low-value information disclosure. 3.2 Primary control (error
mapping) missing.
**Phase 4.** 4.1 10 parallel `signUp(sameEmail)`. 4.2 `test-security-strict.py`
(baseline FAIL). 4.3 Skipped — needs real concurrency against the DB. 4.4 One account
created, others `EMAIL_ALREADY_REGISTERED`. 4.5 Also covered by the NUL-byte fuzz payload
(global guard).
**Phase 5.** Q1 Schema names are not secret per se. Q2 Rare path. Q3 None. Q4 No —
reproduced. Q5 N/A. Q6 Attacker controls timing. Q7 Race window shown empirically. Q8 Yes.
Q9 Primary (error handling). Q10 None. Q11 Low value; still disclosure. Q12 No.
Q13 Re-read the insert and `start.ts` guard.

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | Pass (low value) | Pass | N/A | Pass |

`BUG SEC-044 TRUE POSITIVE — raw database error (schema names) returned to anonymous callers.`

## SEC-045 — No X-Frame-Options header

**Step 0.** Claim: clickjacking possible. Threat model: attacker framing the site.
Class: UI redressing.
**Phase 1.** 1.1 Attacker page → `<iframe src=site>`. 1.2 CSP `frame-ancestors 'none'`
enforced in production. 1.3 Modern browsers honour CSP. 1.4 Nikto flagged the legacy header.
**Phase 2.** 2.1 Attacker controls the framing page. 2.2–2.3 N/A. 2.4 Blocked by CSP.
**Phase 3.** 3.1 None in supported browsers. 3.2 CSP is primary; the header is legacy
defence in depth.
**Phase 4.** 4.1 Frame attempt → refused by CSP. 4.2 Nikto (baseline flag; gone after).
4.3 Skipped — header presence. 4.4 Site loads normally. 4.5 Verified.
**Phase 5.** Q1 CSP covers it. Q2 Legacy header unnecessary. Q3 Browser support. Q4 Yes.
Q5 Yes. Q6 N/A. Q7 N/A. Q8 No. Q9 Yes. Q10 Browser CSP enforcement. Q11 Not a
vulnerability. Q12 No. Q13 Re-read `csp.ts`.

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | **Fail** | **Fail** | **Fail** | N/A | **Fail** (CSP) |

`BUG SEC-045 FALSE POSITIVE — framing already blocked by CSP frame-ancestors.`

## SEC-046 — Sign-up reveals registered emails

**Step 0.** Claim: `signUp` answers `EMAIL_ALREADY_REGISTERED`. Threat model: anonymous
enumeration. Class: user enumeration.
**Phase 1.** 1.1 Email → existence check → distinct error. 1.2 No auth. 1.3 5 sign-ups
per hour per client. 1.4 Sign-in errors are uniform (SEC-013).
**Phase 2.** 2.1 Attacker chooses emails. 2.2 5/h per client; distributed clients scale
linearly. 2.3 N/A. 2.4 Confirms targets for password guessing.
**Phase 3.** 3.1 Real, low-value disclosure. 3.2 Accepted: the form needs to tell users.
**Phase 4.** 4.1 signUp(existing) → `EMAIL_ALREADY_REGISTERED`. 4.2
`test-security-strict.py` (recorded as a note). 4.3 Skipped. 4.4 New email registers.
4.5 Verified.
**Phase 5.** Q1 UX requirement. Q2 Usability. Q3 Throttle. Q4 No. Q5 Throttle bounds rate.
Q6 Email is attacker input. Q7 Rate bound above. Q8 Yes, slowly. Q9 Accepted risk.
Q10 None. Q11 Low. Q12 Considered — accepted with throttle and SEC-043. Q13 Re-read signUp.

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | Pass (low value) | Pass | Pass | Pass |

`BUG SEC-046 TRUE POSITIVE — registered emails can be enumerated through sign-up (accepted, throttled).`

## Part C — PoC index and coverage statement

**Devil's-advocate coverage.** Every Part C entry above answers all 13 questions
(Q1–Q13), in order, and every entry evaluates all six gates.

**PoC artefacts for the true positives.** Each PoC is a check in a committed,
re-runnable script; the baseline column is that check's output on the code before the
fix, the patched column on the fixed code (evidence files in `evidence/`).

| Bug | PoC (script → check) | Baseline result | Patched result |
|---|---|---|---|
| SEC-034 | `scripts/test-request-hardening.py` → "guesses are refused once the limit is reached" | `FAIL` — 7 × `INVALID_CURRENT_PASSWORD`, no limit (`request-hardening-baseline.txt`) | `ok` — 5 × invalid, then `RATE_LIMITED` (`request-hardening-patched.txt`) |
| SEC-035 | `scripts/test-request-hardening.py` → "3 MB JSON body … refused with 413" | `FAIL` — `status 200` (`request-hardening-baseline.txt`) | `ok` — `status 413` |
| SEC-040 | Dev server bound to all interfaces, project files fetched through the container's network address (`evidence/sec040-dev-server-exposure.txt`) | `200` for `/package.json`, `/db/migrations/0001_init.sql`, `/vite.config.ts` from `192.0.2.2:8080` (on the baseline tree the same mechanism served `scripts/company-national-id-logins.json`) | Default binding `localhost`: connection refused on the network address (same file) |
| SEC-042 | `scripts/test-security-strict.py` → "an unpublished company's attachments are hidden from the public" | `FAIL` (`strict-dev-baseline.txt`, `strict-prod-baseline.txt`) | `ok` (`strict-dev.txt`, `strict-prod.txt`) |
| SEC-043 | `scripts/test-security-strict.py` → "common or trivial passwords are refused at sign-up"; unit: `tests/unit/security-regressions.test.ts` SEC-043 | `FAIL` — accepted `12345678, password, 11111111, qwertyui, abcdefgh, Password1` | `ok` — none accepted; unit tests pass |
| SEC-044 | `scripts/test-security-strict.py` → "concurrent sign-ups never expose a database error" | `FAIL` — `duplicate key value violates unique constraint "users_email_key"` | `ok` |
| SEC-046 | `scripts/test-security-strict.py` → note "sign-up says when an email is already registered" | reproduced (note) | unchanged by design (accepted) |

**Unit-test PoCs skipped (justification).** SEC-034, 042 and 044 depend on a real session,
real database visibility rules and real concurrency; a unit test would have to mock exactly
the behaviour under test, so the HTTP checks against a running server are the executable
PoCs. SEC-035, 038, 039, 043 and 037 also have unit tests (listed above or in the entries).

**SEC-035 impact not executed (justification).** The audit rules exclude denial-of-service
testing, so heap exhaustion was not run. Gate 4 rests on the demonstrated trigger (an
unauthenticated 3 MB body accepted and parsed, with no limit anywhere in the path) and
Gate 5 on the algebraic bound in Phase 2; the verdict is recorded as a true positive with
inferred, not observed, impact.

## Part C — per-bug completeness

| Bug | Phase 1 | Phase 2 | Phase 3 | Phase 4 (pseudo / exec / unit / negative / verified) | Q1–Q13 | Gates 1–6 | Verdict |
|---|---|---|---|---|---|---|---|
| SEC-033 | ✓ | ✓ | ✓ | ✓ / ✓ / ✓ / ✓ / ✓ | 13/13 | 6/6 evaluated | FALSE POSITIVE |
| SEC-034 | ✓ | ✓ | ✓ | ✓ / ✓ / skipped (justified) / ✓ / ✓ | 13/13 | 6/6 evaluated | TRUE POSITIVE |
| SEC-035 | ✓ | ✓ (impact inferred; DoS testing excluded) | ✓ | ✓ / ✓ / ✓ / ✓ / ✓ | 13/13 | 6/6 evaluated | TRUE POSITIVE |
| SEC-036 | ✓ | ✓ | ✓ | ✓ / ✓ / skipped (header only) / ✓ / ✓ | 13/13 | 6/6 evaluated | FALSE POSITIVE |
| SEC-037 | ✓ | ✓ | ✓ | ✓ / ✓ / ✓ / ✓ / ✓ | 13/13 | 6/6 evaluated | FALSE POSITIVE |
| SEC-038 | ✓ | ✓ | ✓ | ✓ / ✓ / ✓ / ✓ / ✓ | 13/13 | 6/6 evaluated | FALSE POSITIVE |
| SEC-039 | ✓ | ✓ | ✓ | ✓ / ✓ / ✓ / ✓ / ✓ | 13/13 | 6/6 evaluated | FALSE POSITIVE |
| SEC-040 | ✓ | ✓ | ✓ | ✓ / ✓ (evidence file) / skipped (configuration) / ✓ / ✓ | 13/13 | 6/6 evaluated | TRUE POSITIVE |
| SEC-041 | ✓ | ✓ | ✓ | ✓ / skipped (needs a tampered installer) / skipped / ✓ / ✓ | 13/13 | 6/6 evaluated | FALSE POSITIVE |
| SEC-042 | ✓ | ✓ | ✓ | ✓ / ✓ / skipped (justified) / ✓ / ✓ | 13/13 | 6/6 evaluated | TRUE POSITIVE |
| SEC-043 | ✓ | ✓ | ✓ | ✓ / ✓ / ✓ / ✓ / ✓ | 13/13 | 6/6 evaluated | TRUE POSITIVE |
| SEC-044 | ✓ | ✓ | ✓ | ✓ / ✓ / skipped (justified) / ✓ / ✓ | 13/13 | 6/6 evaluated | TRUE POSITIVE |
| SEC-045 | ✓ | ✓ | ✓ | ✓ / ✓ / skipped (header only) / ✓ / ✓ | 13/13 | 6/6 evaluated | FALSE POSITIVE |
| SEC-046 | ✓ | ✓ | ✓ | ✓ / ✓ / skipped (justified) / ✓ / ✓ | 13/13 | 6/6 evaluated | TRUE POSITIVE |

---

# Part D — SEC-047 … SEC-049 (round 6)

Same method and Gate 3 interpretation as above. PoCs are checks in
`scripts/test-security-deep.py`; baseline output `evidence/deep-baseline.txt`,
patched `evidence/deep-dev.txt` and `evidence/deep-prod.txt`.

| Bug | Class | Verdict | Effect on the register |
|---|---|---|---|
| SEC-047 | Authorization (mass assignment of an admin-only field) | **TRUE POSITIVE** (low value) | Low |
| SEC-048 | DoS (large bodies from a low-privilege account) | **TRUE POSITIVE** (impact inferred, DoS testing excluded) | Low |
| SEC-049 | Desktop app navigation / permissions | **FALSE POSITIVE** — sandboxed, no privileges reachable | Informational hardening |

## SEC-047 — Owner sets the company's listing order

**Step 0.** Claim: `saveOwnedCompany` lets an owner write `sort_order`, an admin-only
field that orders the public listing. Threat model: a company owner. Class: authorization
(mass assignment).
**Phase 1.** 1.1 Owner → `saveOwnedCompany({patch:{sort_order}})` → `companyPatchSchema`
(includes `sort_order`) → strip list without `sort_order` → `UPDATE` (draft) or change
request payload (published) → approval writes payload keys verbatim. 1.2 Contract: the
owner path strips status, ownership and review fields only. 1.3 No other guard. 1.4 Public
listing orders by `sort_order ASC`.
**Phase 2.** 2.1 Owner fully controls the value. 2.2 Any integer; `-999999` sorts first.
2.3 N/A. 2.4 Published companies need approval, but the field rides inside an otherwise
ordinary edit.
**Phase 3.** 3.1 Real: an owner performs an admin-only action (listing position) — limited
vertical privilege escalation, integrity only. 3.2 Primary control (field allowlist) missing.
**Phase 4.** 4.1 Pseudocode: owner save with `sort_order:-999999` → company first in the
public list. 4.2 Executable: deep test "owner cannot set … listing order" (baseline
`84 -> -999999`) and "a change request carries no privileged field" (baseline: `sort_order`).
4.3 Skipped — the handler's effect is in the database; the HTTP test is the PoC. 4.4 Negative:
ordinary fields (name) still saved. 4.5 Patched: unchanged order, payload without it.
**Phase 5.** Q1 Owners could have been meant to order themselves — no UI exposes it. Q2
Oversight in the strip list. Q3 None. Q4 No — reproduced. Q5 Strip list did not cover it.
Q6 Owner input. Q7 N/A. Q8 Yes, one request. Q9 Primary. Q10 None. Q11 Low value. Q12 No.
Q13 Re-read `saveOwnedCompany` and the approval path.

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | Pass (integrity, limited) | Pass | N/A | Pass |

`BUG SEC-047 TRUE POSITIVE — company owners could set the admin-only listing order.`

## SEC-048 — Large bodies from any signed-in account

**Step 0.** Claim: the SEC-035 rule let any live session send multipart bodies up to
110 MB, which the framework buffers before authorization. Threat model: self-registered
user (sign-up is open). Class: DoS.
**Phase 1.** 1.1 Session → multipart POST to any server function → full `formData()` in
memory → then authorization. 1.2 Only "live session" checked. 1.3 Sign-up open, 5/h per
client. 1.4 Upload functions need admin or owner, so a plain user never needs large bodies.
**Phase 2.** 2.1 Attacker controls size up to 110 MB per request. 2.2 Memory ≈ k × 110 MB ×
concurrency; a handful of parallel requests per account exceeds a 512 MB–1 GB container.
2.3 N/A. 2.4 Accounts are cheap (open sign-up).
**Phase 3.** 3.1 Low-privilege, attacker-triggered loss of availability with amplification —
real under the DoS rule. 3.2 Primary control too broad.
**Phase 4.** 4.1 Pseudocode: sign up → N parallel 110 MB multipart POSTs → heap exhaustion.
4.2 Executable: deep test "3 MB upload body from a self-registered user who owns nothing is
refused" (baseline `status 200`). OOM not executed (DoS testing excluded). 4.3 Skipped —
needs session and database. 4.4 Negative: owner and admin uploads still accepted; browser
logo upload works. 4.5 Patched: 413 for the plain user.
**Phase 5.** Q1 Session requirement looked sufficient. Q2 Simplicity. Q3 Open sign-up.
Q4 No — reproduced. Q5 Session check does not stop a cheap account. Q6 Attacker data.
Q7 Bound above. Q8 Yes. Q9 Primary. Q10 Node heap limit → crash, not defence. Q11 Low
(needs an account, throttled sign-up). Q12 No. Q13 Re-read `canUploadLargeBody`.

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | Pass | Pass (trigger shown; OOM inferred) | Pass | Pass |

`BUG SEC-048 TRUE POSITIVE — any self-registered account could make the server buffer upload-sized bodies.`

## SEC-049 — Desktop window navigation and permissions

**Step 0.** Claim: `electron/main.cjs` had no `setWindowOpenHandler`, no `will-navigate`
guard and no permission handler. Threat model: a malicious link in company content (e.g. a
website URL). Class: Electron hardening.
**Phase 1.** 1.1 Link click → navigation inside the app window. 1.2 `contextIsolation`,
`sandbox`, `nodeIntegration:false` set. 1.3 No preload, no IPC. 1.4 Script URLs refused at
save time (SEC-008).
**Phase 2.** 2.1 Owner controls the URL. 2.2–2.3 N/A. 2.4 An external page in the app window
has no Node or IPC access; only phishing-style content in app chrome.
**Phase 3.** 3.1 No privilege reachable. 3.2 Hardening.
**Phase 4.** 4.1 Pseudocode: company website link → opens inside the app. 4.2 Executable:
skipped — no display server for Electron here; the URL classification was exercised with
Node (app URLs kept, web links external, `file:`/`javascript:` blocked). 4.3 Skipped. 4.4
App pages still load in the window. 4.5 `node --check`, ESLint.
**Phase 5.** Q1 Sandbox makes it harmless. Q2 Defaults. Q3 No preload/IPC. Q4 Yes —
checklist item. Q5 Sandbox prevents escalation. Q6 Owner input. Q7 N/A. Q8 Phishing only.
Q9 Yes. Q10 Chromium sandbox. Q11 Not a vulnerability. Q12 No. Q13 Re-read
`createWindow`.

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Result | Pass | Pass | **Fail** | **Fail** | N/A | **Fail** (sandbox) |

`BUG SEC-049 FALSE POSITIVE — sandboxed window, no privilege reachable; hardening kept.`

| Bug | Phase 1 | Phase 2 | Phase 3 | Phase 4 (pseudo / exec / unit / negative / verified) | Q1–Q13 | Gates 1–6 | Verdict |
|---|---|---|---|---|---|---|---|
| SEC-047 | ✓ | ✓ | ✓ | ✓ / ✓ / skipped (justified) / ✓ / ✓ | 13/13 | 6/6 evaluated | TRUE POSITIVE |
| SEC-048 | ✓ | ✓ (impact inferred; DoS testing excluded) | ✓ | ✓ / ✓ / skipped (justified) / ✓ / ✓ | 13/13 | 6/6 evaluated | TRUE POSITIVE |
| SEC-049 | ✓ | ✓ | ✓ | ✓ / skipped (no display; logic run in Node) / skipped / ✓ / ✓ | 13/13 | 6/6 evaluated | FALSE POSITIVE |
