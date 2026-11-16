# Tools Execution Evidence

All tools ran inside the isolated cloud container against the repository checkout
(branch `claude/epic-meitner-ctcy12`) and a disposable local PostgreSQL 16 instance.
No scan touched production (`favapark.liara.run`) or any real account.

Binaries were downloaded from official GitHub releases into `/root/.local/sectools`
(outside the repository) and **verified against the release's published SHA-256
checksums** before use. Python tools came from PyPI via `uv tool install`.

Raw outputs live in [`evidence/`](evidence/); exit codes in
[`evidence/exit-codes.txt`](evidence/exit-codes.txt). Secrets in Gitleaks output are
redacted (`--redact`).

## Network constraints that shaped coverage

| Host | Status | Effect |
|---|---|---|
| `semgrep.dev` | Blocked (proxy 403) | Semgrep registry rulesets (`p/*`) unavailable; the same rules were run from the `semgrep/semgrep-rules` GitHub repository |
| `api.osv.dev` | Blocked | Live OSV queries unavailable; OSV-Scanner used its offline database (GCS bucket reachable) |
| GitHub API with `gh` | Token invalid | supply-chain-risk-auditor repository criteria (Scorecard, archived status) unassessable |
| GitHub releases, PyPI, npm, ghcr/mirror.gcr.io | Reachable | Tool downloads, Trivy DB |

## Scanner execution log

| Tool | Version | Applicability | Command (abridged) | Exit | Result | Evidence |
|---|---|---|---|---|---|---|
| Semgrep run 1 (via ToB skill, pre-fix) | 1.185.0 | TS/JS, Python, Dockerfile, Actions | `run-scans.sh` with 10 registry rulesets + 4 third-party repos | 0 | **10 registry rulesets FAILED** (semgrep.dev blocked); 4 third-party scans succeeded (elttam, Apiiro marked `partial`: some rules did not compile); 31 raw results | `evidence/semgrep-run1-scans.json`, `semgrep-run1-rulesets.json` |
| Semgrep run 2 (pre-fix, substitute) | 1.185.0 | same | `run-scans.sh` with `semgrep/semgrep-rules` repo | 0 | 1 scan, 1,280 raw results over 296 files (`scans.json`), 1,126 after SARIF merge; runs 1+2 merged = 1,157 | `evidence/semgrep-run2-scans.json`, `evidence/semgrep-before-after.txt` |
| Semgrep run 3 (post-fix) | 1.185.0 | same | `run-scans.sh` with semgrep-rules + ToB + elttam + Apiiro + kondukto | 0 | 5 scans, 0 failed, 0 skipped, elttam `partial`; 1,284 raw results over 305 files, 1,129 after SARIF merge (incl. style/i18n) | `evidence/semgrep-run3-scans.json`, `evidence/semgrep-before-after.txt` |
| Gitleaks (full history) | 8.30.1 | Secrets in git history | `gitleaks git . --redact --log-opts=--all` after `git fetch --unshallow`; re-run after the final commits | 1 | 168 commits scanned (217 in `git rev-list --all` incl. merges); 3 leaks, all in `.env` at `13cd74d` | `evidence/gitleaks-history.json`, `.log` |
| Gitleaks (working tree) | 8.30.1 | Secrets in current files | `gitleaks dir . --redact` | 0 | 0 leaks | `evidence/gitleaks-worktree.json` |
| Hadolint | 2.14.0 (2.15.1 tag has no release assets) | Dockerfile | `hadolint --format json Dockerfile` | 0 | 0 findings | `evidence/hadolint.log` |
| zizmor (pre-fix of `artipacked`) | 1.32.0 | GitHub Actions | `zizmor --offline --format json .github/workflows` | 13 (findings present) | 8× `artipacked` (Medium), 1× `adhoc-packages` (Low) | `evidence/zizmor.log` |
| zizmor (post-fix) | 1.32.0 | GitHub Actions | `zizmor --offline --format json .github/workflows` | 12 (findings present) | 1 Low (`adhoc-packages`), 0 Medium/High | `evidence/zizmor-postfix.json` |
| Checkov | 3.4.5 | Dockerfile, Actions, secrets | `checkov -d . --framework dockerfile github_actions secrets` | 1 (failures present) | Dockerfile 51 pass / 1 fail (CKV_DOCKER_3 no USER); Actions 296 pass / 0 fail; secrets 67 fail (all = scrypt hashes, SEC-023) | `evidence/checkov/` |
| Bandit | 1.9.4 | Python test scripts | `bandit -r scripts electron -f json` | 1 (issues) | 0 High, 6 Medium, 3 Low — all in test scripts, judged false positives | `evidence/bandit.json` |
| Trivy fs | 0.76.2 | Lockfiles, Dockerfile, secrets | `trivy fs --scanners vuln,misconfig,secret` | 0 | `package-lock.json`: 4 Critical, 25 High, 33 Medium, 6 Low; Dockerfile DS-0002 (root user). Trivy does not read `bun.lock` | `evidence/trivy-fs.json` |
| OSV-Scanner (offline DB) | 2.7.1 | `bun.lock`, `package-lock.json` | `osv-scanner scan source --offline-vulnerabilities --download-offline-databases -L bun.lock -L package-lock.json` | 1 (vulns) | `bun.lock`: 2 packages (minimatch 9.0.9, 10.2.5); `package-lock.json`: 29 packages | `evidence/osv-scanner.json` |
| bun audit (pre-upgrade) | Bun 1.4.4 | `bun.lock` at `d877c06` (re-run in an isolated folder with that commit's `package.json` + `bun.lock`) | `bun audit --json` | 1 | 88 advisories (4 Critical, 41 High, 33 Moderate, 10 Low); Electron 8 | `evidence/bun-audit-baseline-d877c06.json` |
| bun audit (post-upgrade) | Bun 1.4.4 | `bun.lock` | `bun audit --json` | 1 | 1 Moderate (minimatch) | `evidence/bun-audit.log` |
| npm audit | npm 10.9.9 | `package-lock.json` | `npm audit --package-lock-only --json` | 1 | 37 advisories (8 Critical, 13 High, 15 Moderate, 1 Low) | `evidence/npm-audit-package-lock.log` |
| Syft (SBOM) | 1.57.1 | Whole repo | `syft scan dir:. -o cyclonedx-json` | 0 | CycloneDX SBOM generated | `evidence/sbom.cyclonedx.json` |
| supply-chain-risk-auditor collector | skill 2.0.4 | npm deps | `collect.py` + `render.py` | 0 | 84 direct deps; advisories established for 0/84 (OSV blocked); 18 with publisher-concentration findings | `evidence/supply-chain-risk-report.md`, `evidence/supply-chain-risk-findings.json` |
| CodeQL | 2.27.4 bundle | JS/TS taint analysis | download + `sha256` check passed | — | **Not executed**: running the binary was refused by the session's permission policy | — |
| OWASP ZAP | — | Dynamic scan | — | — | **Not run** (Java, heavy; replaced by targeted Playwright/HTTP tests listed below) | — |
| Grype | — | — | — | — | Not run (duplicates OSV-Scanner + Trivy; no container image built) | — |
| TruffleHog | — | — | — | — | Not run (duplicates Gitleaks) | — |
| pip-audit | — | — | — | — | Not applicable (no Python runtime dependencies; 9 test scripts use stdlib only) | — |

## Dynamic and regression tests (own harness)

| Test | Environment | Command | Exit | Evidence |
|---|---|---|---|---|
| Authorization coverage (51 checks) | dev server :8080, seeded test DB, MFA off | `python3 scripts/test-authz-coverage.py` | 0 — 51 passed | `evidence/authz-coverage.txt` |
| API visibility contracts (13 checks) | same | `python3 scripts/test-api-contracts.py` | 0 — 13 passed | `evidence/api-contracts.txt` |
| Auth hardening regression — baseline | dev server, `MFA_ENFORCED=true`, MFA patch stashed | `python3 scripts/test-auth-hardening.py` (SEC-004/005 checks only at that point) | 1 — 4 of 6 FAILED (vulnerable) | `evidence/auth-hardening-baseline-mfa.txt` |
| Auth hardening regression — patched | dev server, `MFA_ENFORCED=true` | `python3 scripts/test-auth-hardening.py` | 0 — 11 passed | `evidence/auth-hardening-patched.txt` |
| X-Forwarded-For bypass PoC — before | dev server running `rate-limit.server.ts` from `d877c06`; Playwright sends `X-Forwarded-For: 203.0.113.N, 198.51.100.7` | `node poc-xff.cjs` then query `rate_limit_hits` | 3 distinct buckets (attacker-chosen) | `evidence/xff-poc-baseline.txt` |
| X-Forwarded-For bypass PoC — after | production build of the branch | same | 1 bucket (`198.51.100.7` × 3) | `evidence/prod-build-checks.txt` |
| Login / first-login / URL validation flows | dev server, Chromium (Playwright) | `node e2e-sec.cjs` | 8/8 OK | `evidence/e2e-login-flows.txt` |
| Production build headers, debug endpoint, export and anonymous detail | `node .output/server/index.mjs` with `NODE_ENV=production` and unset | `curl -D -`, Playwright | headers present (HSTS too when unset: the build inlines `NODE_ENV=production`); debug-echo 404 in both; export 0 internal fields; anonymous detail has no owner UUID | `evidence/prod-build-checks.txt` |
| Unit tests (45, incl. 19 security regressions) | vitest 4.1.12 | `bunx vitest run tests/unit` | 0 | `evidence/unit-tests.txt` |
| Type check | tsc 5.x | `bunx tsc --noEmit` | 2 — 7 errors, all pre-existing (missing `recharts`/`embla-carousel-react` types) | `evidence/tsc.txt` |
| Production build | Vite 8.3.8 / Nitro | `bun run build` | 0 | — |

## Round 3 re-runs (2026-11-16)

| Tool | Scope | Result | Evidence |
|---|---|---|---|
| Semgrep 1.185.0 (`semgrep/semgrep-rules` + `trailofbits/semgrep-rules`, JS/TS/Python/secrets) | round-3 changed files | 0 errors; 3 results, all in the test script `scripts/test-request-hardening.py` (`exec` of the repo's own helper, `urlopen` to localhost) — test-only false positives; 0 in application code | `evidence/semgrep-r3-changed-files.json` |
| Gitleaks 8.30.1 | working tree (`dir`) + unpushed commits | 0 findings | `evidence/gitleaks-dir-r3.json` |
| bun audit | `bun.lock` | 1 Moderate (`minimatch`, unchanged) | `evidence/bun-audit-r3.txt` |
| npm audit (npm 11.6.2) | regenerated `package-lock.json` | 12 Moderate, one advisory (`minimatch`) | `evidence/npm-audit-package-lock-regenerated.json` |
| OSV-Scanner (offline DB) | `bun.lock` + `package-lock.json` | 4 entries, all GHSA-g3hv-75wg-m249 (`minimatch`) | `evidence/osv-scanner-r3.json` |
| tsc / vitest / eslint / vite build / lint:i18n | whole repo | 7 pre-existing errors / 55 passed / clean on changed files / OK / pre-existing violations only | `evidence/build-and-lint-r3.txt` |
| CodeQL | — | not run (blocked by session permission policy, as before) | — |
