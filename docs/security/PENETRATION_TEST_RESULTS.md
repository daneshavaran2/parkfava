# Penetration Test Results

**Date:** 2026-11-24 · Part of the [security audit](SECURITY_AUDIT.md).

## Rules of engagement

- Targets: local instances only. Dev server on `http://localhost:8080`, the
  production build (`NODE_ENV=production node .output/server/index.mjs`) on
  `http://localhost:3000`, and a second production instance on `:3001` with
  a stand-in SMS panel. Database: a disposable PostgreSQL 16 copy with seed
  data. The production site was not scanned or contacted.
- Passive checks first (headers, Nikto, crawling), then active tests
  (sqlmap, Wapiti attack modules, own suites). sqlmap ran at `--risk 1`, which
  avoids payloads that change data.
- Every result below comes from a tool that actually ran; tools that could
  not run are listed as such.
- The same tests were run on the client export of the source (identical
  security code), with the same results.

## Static analysis

| Tool (version) | Command (abridged) | Result |
|---|---|---|
| CodeQL 2.27.4 | `codeql database create db --language=javascript-typescript --source-root .` (node_modules, build output excluded); `codeql database analyze db javascript-security-and-quality.qls javascript-security-experimental.qls`; same for `--language=actions` with `codeql/actions-queries` | 222 JS/TS queries: 41 security results, 0 confirmed (triage in [VULNERABILITY_REPORT.md](VULNERABILITY_REPORT.md#false-positives-scanner-results)); Actions: 0 |
| Semgrep 1.185.0 | `semgrep scan --metrics=off --config <ruleset> .` for semgrep/semgrep-rules, trailofbits/semgrep-rules, elttam/semgrep-rules, apiiro/malicious-code-ruleset, kondukto-io/semgrep-rules | 1,302 results, 0 confirmed; new since the previous round only in test scripts, plus the constant `X-Frame-Options: DENY` |
| Gitleaks 8.30.1 | `gitleaks dir . --redact`; `gitleaks git . --redact --log-opts=--all` | Working tree: no leaks. History: 3 items in one old `.env` (SEC-022) |
| Trivy 0.76.2 | `trivy fs --scanners vuln,misconfig,secret .` | No vulnerabilities, misconfigurations or secrets |
| OSV-Scanner | `osv-scanner scan source --offline-vulnerabilities --download-offline-databases -L bun.lock -L package-lock.json` (database downloaded the same day; the online API is blocked in the test network) | `minimatch` GHSA-g3hv-75wg-m249 (Moderate), dev tooling only |
| bun audit / npm audit | `bun audit`; `npm audit --package-lock-only` | Same single advisory (npm lists the 12 packages that depend on it) |
| Checkov 3.4.5 | `checkov -d . --framework dockerfile github_actions secrets` | Dockerfile 70 passed / 0 failed; GitHub Actions 296 / 0 |
| Hadolint 2.14.0 | `hadolint Dockerfile` | No findings |
| zizmor 1.32.0 | `zizmor --offline .github/workflows` | 1 Low (`adhoc-packages`: pinned CLI installed with `npm install -g`), accepted |
| Bandit | `bandit -r scripts electron` | Test scripts only; no finding in the desktop app |

## Dynamic scanners

| Tool | Command (abridged) | Result |
|---|---|---|
| sqlmap | `sqlmap --batch --level 3 --risk 1 --dbms PostgreSQL --technique BEUST --time-sec 2 -r <request>` (POST bodies) or `-u <url> -H "x-tsr-serverfn: true"` (GET); the injection point marked inside the serialized payload | Not injectable: sign-in identifier, assistant question, company detail id, attachments owner id, park content id, signed-in owner's company save and product save, admin role revocation (8 targets, 22 techniques each). A loop cleared the sign-in counter during the run so the throttle did not hide results |
| Wapiti 3.3.5 | `wapiti -u http://localhost:3000/ --scope folder -m xss,permanentxss,sql,timesql,exec,file,crlf,redirect,ssrf,methods,backup,htaccess,csrf,xxe,log4shell,shellshock,spring4shell,upload,buster -d 5` | 29 pages crawled; 0 vulnerabilities in every category; anomalies: allowed HTTP methods, robots.txt. SSRF and Log4Shell modules inconclusive (their callback host is unreachable from the test network) |
| Nikto 2.1.5 | `nikto -h http://localhost:3000 -maxtime 1200s` | 6,544 checks; 9 items, all informational: the security headers themselves ("uncommon header"), an ETag false positive, allowed methods GET and HEAD |
| OWASP ZAP | not run | Only the core library could be obtained; the scan add-ons are not available in the test environment |

## Authentication and authorization tests

All requests go straight to the server, bypassing the user interface, so
these test server-side enforcement.

| Area | What was tried | Result |
|---|---|---|
| Unauthenticated access | Every one of the 67 server functions called without a session, with no input and with empty input | All non-public functions refused; the 12 public ones are on an explicit allowlist |
| User → admin | Every admin function called by a signed-in non-admin; admin reads by a non-admin | Refused (51 authorization tests, 181 inventory checks) |
| Cross-user access | Owner A saving, deleting, re-ordering or uploading for owner B's company; product and image ids of another company; save redirected to another company id | Refused, nothing changed |
| Privilege escalation | Owner sending status, activation, ownership, review fields, listing order; two admins revoking each other at once; sign-up with no admin left | Refused (SEC-047); SEC-053 found and fixed |
| Server-side role changes | Admin rights revoked while the admin is signed in | Next request refused (`FORBIDDEN`) |
| Session expiry | `expires_at` in the past | Refused |
| Session revocation | Session row deleted; sign-out; password change | Refused at once; other sessions signed out after a password change |
| Session fixation | Token planted before sign-in | Not accepted; sign-in issues a new token |
| Cookie tampering | Stored hash as the cookie, one character changed, 6 KB value, SQL metacharacters, NUL byte, duplicate cookies | Refused or handled, no server error |
| Cookie flags | Production cookie attributes | `HttpOnly; Secure; SameSite=Lax; Path=/`, host-only |
| Rate limiting | 10 wrong passwords; case and whitespace variants of the identifier; spoofed `X-Forwarded-For`; 30 parallel wrong passwords; 20 parallel current-password guesses | Throttled; variants share one bucket; spoofing ignored; SEC-050 found and fixed |
| Enumeration | Unknown user vs wrong password: message and response time | Same message; same time (161 / 166 / 172 ms for unknown, old-hash and new-hash accounts) |
| CSRF | Requests from another origin and from a same-site origin; missing `Sec-Fetch-Site` | Refused (403) without signing the user out |
| MFA (with `MFA_ENFORCED=true`) | MFA-gated function from a password-only session; one verified session used to vouch for another; replacing the verified phone without MFA | Refused; MFA state is per session. The 5-attempts-per-code limit (one atomic `UPDATE`) was reviewed in the code but not exercised end to end, because a test cannot read the code that was texted |

## Business logic and concurrency

There is no payment flow. The equivalent sensitive flow is company review:
an owner proposes changes, an admin approves or rejects them.

| Test | Result |
|---|---|
| Owner edit of a published company | Becomes a pending change request; nothing live before approval |
| Owner approving their own request; another user approving it | Refused |
| 10 parallel approvals of one "new product" request | Applied exactly once; others `ALREADY_REVIEWED` |
| 10 parallel owner saves | One pending request |
| 10 parallel OTP requests (stand-in SMS panel) | SEC-051 found: 10 texts; after the fix 1 text |
| Daily OTP cap, new window, cooldown, failed send | Enforced; a failed send uses nothing up |
| Hidden content in public reads and the export | SEC-054 found and fixed |
| Content changed between review and approval | SEC-055, open (design) |
| Worst-case inputs at maximum length (ReDoS) | All processed in under 2 s |

## Docker image

The image was built from the repository's `Dockerfile`. The only difference
was in the discarded build stage: the test network's HTTPS proxy certificate
was trusted there so `bun install` could download packages. It was run the way
production runs it: `node server/cluster.mjs`, user `node` (uid 1000),
HEALTHCHECK, an uploads volume, limited to 1 CPU and 1 GB of memory.

| Check | Result |
|---|---|
| User and permissions | uid 1000; application files not writable; uploads volume writable |
| Health check | healthy (it calls port 3000; keep `PORT` at 3000 as in `liara.json`) |
| Trivy image scan | Before: 23 Node.js package advisories in npm/corepack (SEC-058, fixed) and Debian OS packages: 1 Critical, 37 High, none fixable (SEC-061). After: 0 Node.js advisories |
| Suites against the container | probes 126/126, strict 204/204, deep 34/34, concurrency 20/20, browser 14/14, flows 8/8 |
| Proxy certificate in the final image | No (only in the build stage) |

## Load tests

autocannon 7.15.0 against the container (1 CPU, 4 workers), 20–60 s per run,
load generators on separate CPU cores.

| Load | Result |
|---|---|
| 50 clients, one route each | home 263 req/s (p99 353 ms), exhibition 428 (219 ms), company list function 519 (178 ms), export 182 (400 ms), static JS 1,190 (83 ms), health 4,469 (54 ms); 0 errors |
| 210 clients on one route (exhibition) | 534 req/s, p99 493 ms, 0 errors |
| 90 clients across three routes | about 370 req/s, p99 under 0.8 s, 0 timeouts; a few requests up to 10 s |
| 210 clients across three routes | past capacity: most requests under 0.5 s, a small share 20–30 s, some time-outs (SEC-060); 1 or 4 workers alike |
| After all load | memory back to 90 MiB (peak 384 MiB of 1 GiB), no restart, healthy |

## Denial-of-service tests

`scripts/test-dos-resilience.py`, 20 s per attack (slowloris 150 s), while a
probe made the requests an ordinary visitor makes:

| Attack | Visitors during the attack | Notes |
|---|---|---|
| Sign-in flood, one address (13,000 attempts) | p95 97–111 ms | Throttled; a real user's sign-in 0.67 s |
| Sign-in flood, many addresses | p95 20 ms | A real user's sign-in 0.19 s → about 9 s (SEC-059) |
| Export flood (3,600 exports) | p95 327 ms | — |
| Slowloris, 2,000 connections | p95 6 ms | All closed by the header timeout |
| 5,000 idle connections | p95 6 ms | — |
| 1,573 bodies of 1.9 MiB | p95 251 ms | Peak memory 384 MiB |
| 76,774 requests announcing 100 MiB | p95 15 ms | All answered 413 before the body was read |

All 28 checks passed: no crash, no restart, memory under the limit, normal
again within a second after each attack.

## Backup and restore

`scripts/backup-restore-drill.sh`: `pg_dump` (custom format) plus an archive
of the uploads, checksummed, restored into an empty database and an empty
folder.

| Check | Result |
|---|---|
| Row counts, 16 tables | identical |
| 72 uploaded files | byte-identical; served by the restored app with the same checksum |
| Migrations | identical (up to 0024) |
| App on the restored copy | healthy; probes 126/126, deep 34/34; a session from before the backup still valid |
| Backup files | readable by the owner only (mode 0600) |
| Stored assistant key, `SETTINGS_ENCRYPTION_KEY` unset | lost after the restore to a new database address (SEC-017) |
| Stored assistant key, `SETTINGS_ENCRYPTION_KEY` set | kept |

## SMS provider and live site

- **SMS:** no provider account exists, so no real text was sent. The
  providers' documentation could not be read from the test network.
  Verification steps for the first real account are in the production
  checklist.
- **Live site (favapark.liara.run):** read-only checks were approved, but the
  test network blocks the host, and the approval needed to allow it was not
  available at the time. Nothing was sent to the live site. The
  checks to run are in the production checklist; the live site also still
  runs the code from before this audit.

## Exploit reproduction (before → after)

| Finding | Before the fix | After the fix |
|---|---|---|
| SEC-050 | 30 parallel sign-ins: 10 checked (limit 8); 20 parallel current-password guesses: 20 checked (limit 5) | 8 and 5 |
| SEC-051 | 10 parallel OTP requests: 10 texts, counter 1 | 1 text, counter 1 |
| SEC-053 | Mutual revocation: 0 admins; next sign-up: role `admin` | 1 admin; next sign-up: no role |
| SEC-054 | Export: deactivated park with content, images, news and attachments; unpublished company's attachment; anonymous `getParkContent` and park attachments | Nothing hidden is returned; admins still see it |
| SEC-056 | New hash `salt:hash` (p=1) | `scrypt$16384$8$5$…`; old hashes upgraded at sign-in |

## Final re-run

On the final code, repository and client export, against a disposable
database:

| Suite | Dev server | Production build |
|---|---|---|
| `scripts/test-security-probes.py` | 98/98 | 126/126 |
| `scripts/test-security-strict.py` | 203/203 | 204/204 |
| `scripts/test-security-deep.py` | 34/34 | 34/34 |
| `scripts/test-security-concurrency.py` | 20/20 (25/25 with the stand-in SMS panel) | 20/20 (25/25) |
| `scripts/test-security-browser.cjs` | 14/14 | 14/14 |
| `scripts/test-authz-coverage.py` | 51/51 | — |
| `scripts/test-api-contracts.py` | 13/13 | — |
| `scripts/test-request-hardening.py` | all passed | — |
| `scripts/test-auth-hardening.py` (`MFA_ENFORCED=true`) | all passed | — |
| Browser flows (first login, forced password change, URL validation, admin, public page) | — | 8/8 |
| `tests/unit` (vitest) | 111/111 | — |
| Docker container (production image) | — | probes 126, strict 204, deep 34, concurrency 20, browser 14, flows 8 |
| `scripts/test-dos-resilience.py` (container) | — | 28/28 |
| `scripts/backup-restore-drill.sh` | — | restore verified |

<!-- repo-only -->
Raw outputs: `security-audit/evidence/r7/` (scanners, `dast/`,
`before-after/`, `final-repo/`, `final-export/`).
<!-- /repo-only -->
