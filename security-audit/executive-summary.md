# Executive Summary

**System:** parkfava (FAVA technology-park company atlas): web app, AI assistant,
admin/owner portals, offline desktop build. **Date:** 2026-11-16. **Scope:** repository
`daneshavaran2/parkfava`, branch `claude/epic-meitner-ctcy12`, tested on an isolated
local instance. Production was not tested.

## Bottom line

The application's core access control is sound: every admin-only and owner-scoped
function rejects unauthorised callers (51/51 automated checks), uploads and file
serving are well protected, and SQL is parameterised. The serious problems were in
**third-party framework code** (a Critical and a High advisory in the server-function layer),
in **abuse controls** (rate limits that a header could bypass), and in the **dormant
MFA feature**, which would not have protected anyone if switched on. All of these are
patched on the branch. The code-level flaws were reproduced against the pre-fix code and
are covered by regression tests; the framework vulnerabilities are version-based
(vendor advisories) and verified by re-auditing the lockfile. **None is fixed in
production until the branch is merged and deployed.**

The largest remaining risks are operational rather than code: MFA is off (admins
are protected by a password alone), there is no security audit trail, and backups
could not be verified.

No overall security score is given: coverage gaps (below) would make any single number
misleading.

## Dashboard

| Metric | Value |
|---|---|
| Total findings | 36 (32 + 4 in round 3: SEC-033…036) |
| Confirmed vulnerabilities (incl. 3 advisory-confirmed) | 11 · Hardening / risk items (fp-check false positive as vulnerabilities) 21 |
| fp-check verification of all 32 findings | 11 TRUE POSITIVE · 21 FALSE POSITIVE — [fp-check-verification.md](fp-check-verification.md) |
| By severity | Critical 1 · High 3 (2 conditional on MFA) · Medium 6 · Low 3 · Informational 23 |
| Rejected candidates (false positives, grouped) | 23 groups — [false-positives.md](false-positives.md) |
| Fixes applied | 22 complete + 1 partial (round 3: SEC-010, 033, 034, 035, 036) |
| Fixes verified by an executed test or rescan (raw output in `evidence/`) | 19 (3 more verified by code review only) |
| Proposed, not applied | 10 (mostly configuration or need a product decision) |
| Not started | 2 · Accepted with controls 1 |
| Remaining high-risk items | Deployment gap (R-01), MFA off (R-02), backups unverified (R-08) |
| Known dependency advisories in the build lockfile | 88 → 1 (Moderate, build-only) |

### Tools

Executed successfully (12 tools): Semgrep (official + Trail of Bits + elttam + Apiiro +
kondukto rules), Gitleaks (history + tree), Hadolint, zizmor, Checkov, Bandit, Trivy,
OSV-Scanner (offline DB), bun audit, npm audit, Syft SBOM, Trail of Bits
supply-chain collector. In addition: the project's own authz/contract suites and the
new regression tests.

Failed, blocked or not run: Semgrep registry rulesets (network policy), CodeQL
(execution refused by session permission policy), insecure-defaults automated pipeline
(tool unavailable — run manually instead), OWASP ZAP (not run), Grype/TruffleHog
(redundant). Details: [tools-execution.md](tools-execution.md).

### Coverage by domain (11 domains, Phase 4 A–K)

| Domain | Coverage |
|---|---|
| A Authentication and identity | Tested (exploit reproductions + regression suite) |
| B Authorization and access control | Tested (51-check suite) |
| C Injection and input validation | Scanned + reviewed; no CodeQL, no DAST |
| D API security | Tested (OWASP API Top 10 mapping) |
| E Cloud and infrastructure | Partial — repository configuration only; Liara account not accessible |
| F Secrets and cryptography | Tested (full-history secret scan, crypto review) |
| G Supply chain and CI/CD | Tested (5 tools) |
| H Browser and frontend | Partial — headers tested, CSP reviewed; no DOM-XSS dynamic scan |
| I Business logic | Reviewed (approval workflow); payments etc. not applicable |
| J AI agent security | Reviewed; not tested against a live model |
| K Availability and resilience | Reviewed; no load testing (out of policy) |

Tested in 5 of 11 domains (A, B, D, F, G); partially tested or reviewed in 6. This is
test coverage, not assurance: a clean scanner result does not prove the absence of
vulnerabilities.

## Top five risks (before patching)

1. **SEC-001 (Critical) / SEC-002 (High) — framework vulnerabilities** in TanStack Start and seroval: reflected XSS, and unauthenticated denial of service in deserialization (the advisory's critical callable-invocation impact was not demonstrated). Confirmed by version against vendor advisories and by tracing the reachable code path; not exploited here. *Patched by upgrade.*
2. **SEC-004/005 — MFA bypass by design**: one OTP verified every session of the account, and a password-only session could swap the verified phone. *Reproduced and patched.*
3. **SEC-003 — Rate-limit bypass** through a spoofed `X-Forwarded-For`, disabling per-IP brute-force and AI-cost limits. *Reproduced and patched.*
4. **SEC-009 — CI/CD supply chain**: the deploy job installed an unpinned CLI while holding the deploy token; mutable action tags; broad token. *Patched.*
5. **SEC-026 — MFA off (Medium)**, together with the missing audit trail (SEC-024, a detection gap tracked as risk R-03): account takeover by password alone would be hard to detect. *Open; needs configuration and a code change.*

## Decisions needed from you

1. Merge and deploy the branch.
2. ~~Delete or regenerate `package-lock.json` (SEC-010)~~ — regenerated in round 3.
3. Approve the proposed CI security workflow.
4. Approve installing the reviewed OWASP skill plugins (optional).
5. Allow CodeQL execution in a future session, or enable it in GitHub.
