# Final Security Audit Report — parkfava

| | |
|---|---|
| Date | 2026-11-16 |
| Scope | Repository `daneshavaran2/parkfava` (branch `claude/epic-meitner-ctcy12`), local isolated test instance, CI configuration. Production and the Liara account were out of reach and not tested. |
| Method | Skill-assisted multi-domain review (Trail of Bits static-analysis, insecure-defaults corpus, supply-chain-risk-auditor), 12 scanning tools, exploit reproduction on a disposable database, patching with regression tests, independent review |
| Rules of engagement | Non-destructive; no production traffic; no real accounts; secrets redacted |

## 1. Overall assessment

Access control, upload handling and SQL usage are well engineered and backed by an
existing authorization test suite. Before this audit the application carried a
Critical and a High framework vulnerability, a bypassable rate limiter, and an MFA design that
would not have stopped a password thief. These are patched and verified on the branch.
What remains is mainly configuration and operations: MFA enforcement, an audit trail,
backups, and a stale npm lockfile. See [executive-summary.md](executive-summary.md)
for the dashboard and coverage table.

## 2. Findings by severity

| Severity | Findings |
|---|---|
| Critical | SEC-001 TanStack Start reflected XSS (patched) |
| High | SEC-002 seroval deserialization DoS (patched) · SEC-004 MFA shared across sessions (patched, conditional on MFA) · SEC-005 verified phone replaceable (patched, conditional on MFA) |
| Medium | SEC-003 rate-limit bypass (patched) · SEC-006 zod DoS (patched) · SEC-007 password change controls (patched) · SEC-009 CI/CD supply chain (patched) · SEC-026 MFA off, admins password-only (open) |
| Low | SEC-012 internal fields in public responses (patched) · SEC-023 initial-password hashes in the repo (open) |
| Informational | 21 hardening or risk-register items judged not exploitable by fp-check: SEC-008, 010, 011, 013, 014, 015, 016, 017, 018, 019, 020, 021, 022, 024, 025, 027, 028, 029, 030, 031, 032 (fixes and recommendations kept) |

Full register with evidence, root cause and remediation: [findings.md](findings.md).
Rejected candidates: [false-positives.md](false-positives.md). Exploitability of every bug claim:
[fp-check-verification.md](fp-check-verification.md) (all 32: 11 true positives, 21 false positives).

## 3. Root-cause themes and variant analysis

| Theme | Instances | Systemic fix |
|---|---|---|
| Trusting client-controlled request metadata | SEC-003 | Single helper `clientIpFromForwardedFor`; no other reader of `X-Forwarded-For` exists (grep) |
| Security state stored at the wrong scope (account vs session) | SEC-004, SEC-005, SEC-007 | MFA and password change now session-aware; session revocation helper reused |
| Fail-open defaults keyed on `NODE_ENV` | SEC-014; checked `secure` cookie, CSP enforcement, HSTS | Debug endpoint now opt-in; the others are fail-safe in production (`NODE_ENV=production` set in the Dockerfile) |
| Length-only validation of URLs | SEC-008 | One shared `safeUrlString()` applied to every URL field in exhibition and park content |
| Raw SQL with interpolated identifiers | SEC-020; checked `auto-migrate.server.ts` (trusted files) | Allowlist on the only untrusted site |
| Dependency hygiene | SEC-001, 002, 006, 010, 025 | Upgrades; proposed CI dependency gate and Dependabot |
| Missing operational security | SEC-024, 026, R-08 | Audit table, MFA for admins, backup verification |

## 4. Patches

| Commit / change | Content |
|---|---|
| `763c1c6` | TanStack Start/Router, seroval, zod 4, Electron, Vite/Vitest, in-range build-tool fixes; `.inputValidator` → `.validator`; route error type |
| `5e9dc7c` | Workflow permissions, SHA-pinned actions, pinned Liara CLI |
| `2377040` | Rate-limit client key, login timing, password-change controls, URL scheme validation, public field stripping, debug endpoint, GCM tag, security headers, `founded_at` validation bug |
| `97d4db0` | Session-bound MFA (`0022` migration), verified-phone guard, OTP log redaction, outbound timeouts, offline-import identifier allowlist, `persist-credentials: false`, `client-ip.ts` refactor, regression tests |
| `72e224e` + review corrections | This report and its evidence |

Details and evidence: [patch-validation.md](patch-validation.md).

## 5. Test results

Authorization suite 51/51 · API contracts 13/13 · auth hardening 11/11 (baseline: 4 of 6
MFA checks failed, proving the flaws) · rate-limit PoC 3 buckets → 1 · unit tests 45/45 · browser flows 8/8 · production
build OK · type check unchanged from baseline (7 pre-existing errors) · bun audit 88 → 1.

## 6. Unresolved risks and limitations

Residual risks: [risk-register.md](risk-register.md). Limitations of this assessment:

- **Not tested:** production configuration, Liara network/database/backups, branch protection, DOM-XSS dynamic scanning (ZAP), CodeQL taint analysis, live-model prompt injection, load/availability behaviour.
- **Network policy** blocked the Semgrep registry and the OSV API; equivalent rule sets and an offline OSV database were used instead.
- Severity for SEC-001/002/006 relies on vendor advisories; exploits were not reproduced.
- SEC-007 was verified only after the fix (no baseline run); SEC-019/020 by code review only.
- `insecure-defaults` and `skill-supply-chain-audit` could not run as designed (missing tool / execution refused); their checks were applied manually or not at all.

## 7. Recommended next actions

1. Merge and deploy the branch; run national-ID provisioning; delete the hash file (SEC-023).
2. Configure `SETTINGS_ENCRYPTION_KEY`, decide on `package-lock.json`, enable branch protection.
3. Configure SMS and enforce MFA for admins; add the security audit trail.
4. Adopt the proposed security workflow; add the auth/authz suites to CI.
5. Confirm backups with a restore test; run CodeQL and a ZAP baseline against a staging copy.

## 8. Independent review

See section "Independent review record" in [README.md](README.md).
