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
| Semgrep (via ToB skill, pre-fix) | 1.185.0 | TS/JS, Python, Dockerfile, Actions | `run-scans.sh` with 10 registry rulesets + 4 third-party repos | 0 | **10 registry rulesets FAILED** (semgrep.dev blocked); 4 third-party scans succeeded (elttam, Apiiro marked `partial`: some rules did not compile) | scratchpad SARIF (summarised in findings.md) |
| Semgrep (pre-fix, substitute) | 1.185.0 | same | `run-scans.sh` with `semgrep/semgrep-rules` repo | 0 | 1 scan, 1,280 raw results (1,126 after dedup), 296 files | `evidence/semgrep-before-after.txt` |
| Semgrep (post-fix) | 1.185.0 | same | `run-scans.sh` with semgrep-rules + ToB + elttam + Apiiro + kondukto | 0 | 5 scans, 0 failed, 0 skipped, elttam `partial`; 1,129 results incl. style/i18n | `evidence/semgrep-before-after.txt` |
| Gitleaks (full history) | 8.30.1 | Secrets in git history | `gitleaks git . --redact --log-opts=--all` (after `git fetch --unshallow`: 215 commits) | 1 | 3 leaks, all in `.env` at `13cd74d` | `evidence/gitleaks-history.json` |
| Gitleaks (working tree) | 8.30.1 | Secrets in current files | `gitleaks dir . --redact` | 0 | 0 leaks | `evidence/gitleaks-worktree.json` |
| Hadolint | 2.14.0 (2.15.1 tag has no release assets) | Dockerfile | `hadolint --format json Dockerfile` | 0 | 0 findings | `evidence/hadolint.log` |
| zizmor (pre-fix of `artipacked`) | 1.32.0 | GitHub Actions | `zizmor --offline --format json .github/workflows` | 13 (findings present) | 8× `artipacked` (Medium), 1× `adhoc-packages` (Low) | `evidence/zizmor.log` |
| zizmor (post-fix) | 1.32.0 | GitHub Actions | `zizmor --offline --format plain .github/workflows` | — | 1 Low (`adhoc-packages`), 0 Medium/High | recorded in patch-validation.md |
| Checkov | 3.4.5 | Dockerfile, Actions, secrets | `checkov -d . --framework dockerfile github_actions secrets` | 1 (failures present) | Dockerfile 51 pass / 1 fail (CKV_DOCKER_3 no USER); Actions 296 pass / 0 fail; secrets 67 fail (all = scrypt hashes, SEC-023) | `evidence/checkov/` |
| Bandit | 1.9.4 | Python test scripts | `bandit -r scripts electron -f json` | 1 (issues) | 0 High, 6 Medium, 3 Low — all in test scripts, judged false positives | `evidence/bandit.json` |
| Trivy fs | 0.76.2 | Lockfiles, Dockerfile, secrets | `trivy fs --scanners vuln,misconfig,secret` | 0 | `package-lock.json`: 4 Critical, 25 High, 33 Medium, 6 Low; Dockerfile DS-0002 (root user). Trivy does not read `bun.lock` | `evidence/trivy-fs.json` |
| OSV-Scanner (offline DB) | 2.7.1 | `bun.lock`, `package-lock.json` | `osv-scanner scan source --offline-vulnerabilities --download-offline-databases -L bun.lock -L package-lock.json` | 1 (vulns) | `bun.lock`: 2 packages (minimatch 9.0.9, 10.2.5); `package-lock.json`: 29 packages | `evidence/osv-scanner.json` |
| bun audit (pre-upgrade) | Bun 1.4.4 | `bun.lock` (the lockfile Docker/CI use) | `bun audit --json` | 1 | 88 advisories (4 Critical, 41 High, 33 Moderate, 10 Low) | prior session; summarised in dependency-report.md |
| bun audit (post-upgrade) | Bun 1.4.4 | `bun.lock` | `bun audit --json` | 1 | 1 Moderate (minimatch) | `evidence/bun-audit.log` |
| npm audit | npm 10.9.9 | `package-lock.json` | `npm audit --package-lock-only --json` | 1 | 37 advisories (8 Critical, 13 High, 15 Moderate, 1 Low) | `evidence/npm-audit-package-lock.log` |
| Syft (SBOM) | 1.57.1 | Whole repo | `syft scan dir:. -o cyclonedx-json` | 0 | CycloneDX SBOM generated | `evidence/sbom.cyclonedx.json` |
| supply-chain-risk-auditor collector | skill 2.0.4 | npm deps | `collect.py` + `render.py` | 0 | 84 direct deps; advisories established for 0/84 (OSV blocked); 18 with publisher-concentration findings | prior session (scratchpad) |
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
| X-Forwarded-For bypass PoC — before/after | dev server; Playwright adds spoofed `X-Forwarded-For` per request | `node poc-xff.cjs` then query `rate_limit_hits` | before: 3 distinct buckets; after: 1 bucket | patch-validation.md |
| Login / first-login / URL validation flows | dev server, Chromium (Playwright) | `node e2e-sec.cjs` | 8/8 OK | `evidence/e2e-login-flows.txt` |
| Production build headers + debug endpoint | `node .output/server/index.mjs` with `NODE_ENV=production` and unset | `curl -D -` | headers present; `/api/public/debug-echo` 404 in both | patch-validation.md |
| Unit tests (45, incl. 19 security regressions) | vitest 4.1.12 | `bunx vitest run tests/unit` | 0 | `evidence/unit-tests.txt` |
| Type check | tsc 5.x | `bunx tsc --noEmit` | 2 — 7 errors, all pre-existing (missing `recharts`/`embla-carousel-react` types) | `evidence/tsc.txt` |
| Production build | Vite 8.3.8 / Nitro | `bun run build` | 0 | — |
