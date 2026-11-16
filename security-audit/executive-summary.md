# Executive Summary

**System:** parkfava (FAVA technology-park company atlas): web app, AI assistant,
admin/owner portals, offline desktop build. **Date:** 2026-11-16. **Scope:** repository
`daneshavaran2/parkfava`, branch `claude/epic-meitner-ctcy12`, tested on an isolated
local instance. Production was not tested.

## Bottom line

The application's core access control is sound: every admin-only and owner-scoped
function rejects unauthorised callers (51/51 automated checks), uploads and file
serving are well protected, and SQL is parameterised. The serious problems were in
**third-party framework code** (two Critical advisories in the server-function layer),
in **abuse controls** (rate limits that a header could bypass), and in the **dormant
MFA feature**, which would not have protected anyone if switched on. All of these are
patched on the branch and covered by regression tests. **None is fixed in production
until the branch is merged and deployed.**

The largest remaining risks are operational rather than code: MFA is off (admins
are protected by a password alone), there is no security audit trail, and backups
could not be verified.

No overall security score is given: coverage gaps (below) would make any single number
misleading.

## Dashboard

| Metric | Value |
|---|---|
| Total findings | 32 |
| Confirmed (incl. advisory-confirmed) | 29 · Potential 2 · Requires environment access 1 |
| By severity | Critical 2 · High 2 (conditional on MFA) · Medium 5 · Low 16 · Informational 7 |
| Rejected candidates (false positives, grouped) | 23 groups — [false-positives.md](false-positives.md) |
| Fixes applied | 17 complete + 1 partial |
| Fixes verified by an executed test or rescan | 13 (4 more verified by code review only) |
| Proposed, not applied | 10 (mostly configuration or need a product decision) |
| Not started | 3 · Accepted with controls 1 |
| Remaining high-risk items | Deployment gap (R-01), MFA off (R-02), backups unverified (R-08) |
| Known dependency advisories in the build lockfile | 88 → 1 (Moderate, build-only) |

### Tools

Executed successfully (13): Semgrep (official + Trail of Bits + elttam + Apiiro +
kondukto rules), Gitleaks (history + tree), Hadolint, zizmor, Checkov, Bandit, Trivy,
OSV-Scanner (offline DB), bun audit, npm audit, Syft SBOM, Trail of Bits
supply-chain collector, plus the project's own authz/contract suites and new
regression tests.

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

Tested in 6 of 11 domains, partially or by review in 5. This is test coverage, not
assurance: a clean scanner result does not prove the absence of vulnerabilities.

## Top five verified risks (before patching)

1. **SEC-001/002 — Critical framework vulnerabilities** in TanStack Start and seroval (reflected XSS, unsafe deserialization), reachable without login. *Patched by upgrade.*
2. **SEC-004/005 — MFA bypass by design**: one OTP verified every session of the account, and a password-only session could swap the verified phone. *Reproduced and patched.*
3. **SEC-003 — Rate-limit bypass** through a spoofed `X-Forwarded-For`, disabling per-IP brute-force and AI-cost limits. *Reproduced and patched.*
4. **SEC-009 — CI/CD supply chain**: the deploy job installed an unpinned CLI while holding the deploy token; mutable action tags; broad token. *Patched.*
5. **SEC-026/024 — MFA off and no audit trail**: account takeover by password alone would be hard to detect. *Open; needs configuration and a code change.*

## Decisions needed from you

1. Merge and deploy the branch.
2. Delete or regenerate `package-lock.json` (SEC-010).
3. Approve the proposed CI security workflow.
4. Approve installing the reviewed OWASP skill plugins (optional).
5. Allow CodeQL execution in a future session, or enable it in GitHub.
