# Threat Model (STRIDE)

Scope: the parkfava web application, its database and uploads disk on Liara, the CI/CD
pipeline, the AI assistant, and the Electron offline build. Diagrams: see
[architecture-map.md](architecture-map.md) and [trust-boundaries.md](trust-boundaries.md).

## Valuable assets

Admin accounts (full control of public content and roles); company-owner accounts (their
public profile); session tokens; the OpenRouter key (direct cost); `LIARA_API_TOKEN`
(deploy = code execution in production); the integrity of the public catalogue; personal
data of owners and CEOs (phones, emails).

## Threat actors

| Actor | Capability | Motivation |
|---|---|---|
| Anonymous internet attacker | HTTP requests, botnets, spoofed headers | Defacement, credential stuffing, AI cost abuse, data scraping |
| Malicious or compromised company owner | Owner session for one company | Tamper with other companies, self-approve content, prompt-inject the assistant |
| Credential thief | Stolen password (phishing, reuse) | Take over an owner or admin account |
| Insider with repository / Lovable access | Push code, read history | Exfiltrate secrets, plant backdoors |
| Supply-chain attacker | Malicious npm release or GitHub Action tag | Code execution in CI (deploy token) or production |
| Network attacker (upstream) | Tamper with export JSON / provider responses | Corrupt the desktop app's database |

## Threat register

Likelihood and impact on a 1–3 scale; risk = L × I (1–9). Where L shows `a→b`, `b`
is the likelihood after this audit's patches, and "Residual" = `b` × I.

| ID | STRIDE | Scenario | Entry / boundary | L | I | Existing / added controls | Residual | Findings |
|---|---|---|---|---|---|---|---|---|
| T1 | S | Password spraying across many accounts, rotating `X-Forwarded-For` to defeat per-IP limits | `signIn` / TB1 | 3→1 | 2 | Per-account limit; per-IP limit now keyed on proxy-appended IP | 2 | SEC-003 |
| T2 | S | Stolen password used to pass MFA by riding another session's verification or by swapping the phone | MFA / TB4 | 2→1 | 3 | Per-session MFA, verified phone change requires MFA | 3 | SEC-004, SEC-005, SEC-026 |
| T3 | S | Hijacked session changes the password and locks out the owner | `changeMyPassword` | 2→1 | 2 | Current password required; other sessions revoked | 2 | SEC-007 |
| T4 | S | Database read (backup leak) yields usable session tokens | `sessions` | 1 | 3 | — | 3 | SEC-027 |
| T5 | T | Owner edits another company or approves their own | Owner functions / TB5 | 1 | 3 | `resolveEditMode`, privileged fields stripped; authz suite | 3 | none (verified) |
| T6 | T | Stored script URL in company/product links | URL fields | 2→1 | 2 | React 19 blocks `javascript:` in JSX; server rejects script schemes | 2 | SEC-008 |
| T7 | T | Malicious dependency or moved action tag runs in CI with deploy token | CI / TB12 | 2→1 | 3 | SHA-pinned actions, pinned CLI, read-only token, 24h release age | 3 | SEC-009, SEC-010 |
| T8 | T | Crafted export snapshot injects SQL into desktop DB | Offline import / TB11 | 1 | 2 | HTTPS; identifier allowlist | 2 | SEC-020 |
| T9 | T | Indirect prompt injection in approved company text steers assistant answers | Assistant / TB6 | 2 | 1 | Admin review, no tools, text-only rendering | 2 | SEC-021 |
| T10 | R | Admin denies granting a role or approving content; no record of failed logins | Admin functions | 2 | 2 | `exhibition_change_requests.created_by`, `reviewed_by` only | 4 | SEC-024 |
| T11 | I | Public responses reveal owner IDs and internal review notes | Detail/export | 3→1 | 1 | Fields nulled on public paths | 1 | SEC-012 |
| T12 | I | Server logs reveal OTP codes and phone numbers | SMS sender | 1 | 2 | Code removed, phone masked | 2 | SEC-018 |
| T13 | I | Repository access exposes keys or brute-forceable initial passwords | Git history / TB13 | 2 | 2 | Public-by-design keys; hashes not plaintext | 4 | SEC-022, SEC-023 |
| T14 | I | Encrypted OpenRouter key decrypted by anyone holding `DATABASE_URL` | Settings / TB8 | 1 | 2 | AES-256-GCM | 2 | SEC-017 |
| T15 | I | Reflected XSS via vulnerable TanStack Start server-function responses | Framework | 3→1 | 3 | Upgraded | 3 | SEC-001 |
| T16 | D | Unauthenticated deserialization or validation memory exhaustion | seroval / zod | 3→1 | 2 | Upgraded | 2 | SEC-002, SEC-006 |
| T17 | D | Hung LLM/SMS provider ties up workers | Outbound HTTP / TB10 | 2→1 | 2 | Timeouts 45s/15s/120s | 2 | SEC-019 |
| T18 | D | AI cost exhaustion by flooding the assistant | `askAssistant` | 2 | 2 | Per-IP (now effective) + 300/hour global | 4 | SEC-003 |
| T19 | E | First user created on an empty `user_roles` gets admin | DB trigger / TB7 | 1 | 3 | Admin always exists in production; revoke-self blocked | 3 | SEC-029 |
| T20 | E | Container escape impact amplified by root user | Container / TB9 | 1 | 3 | Platform isolation | 3 | SEC-011 |
| T21 | E | Debug endpoint exposes other requests' logs when `NODE_ENV` unset | `debug-echo` | 1 | 2 | Opt-in only | 2 | SEC-014 |

## Key residual risks

1. MFA is not enforced, so admin and owner accounts depend on passwords alone (T2).
2. No security audit trail (T10).
3. Session tokens and initial-password hashes at rest (T4, T13).
4. CSP still permits inline scripts, which weakens the last line of defence against XSS (SEC-028).
