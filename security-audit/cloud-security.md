# Cloud, Container and Infrastructure Security

Evidence is limited to configuration in the repository (`Dockerfile`, `liara.json`,
workflows, server code). The Liara account, network, database service, backups and
logs were **not accessible**; items marked *Requires environment access* are untested.

| Area | Observation | Status | Finding |
|---|---|---|---|
| Platform | Liara Docker platform, region `iran`, app `favapark`, port 3000 | Observed | — |
| TLS | Terminated by Liara; app now sends HSTS in production | Fixed in code | SEC-016 |
| Reverse proxy | Liara router appends `X-Forwarded-For`; app trusts 1 hop (`TRUSTED_PROXY_HOPS`) | Fixed in code | SEC-003 |
| Container user | Runtime stage runs as root | Open | SEC-011 |
| Base images | `oven/bun:1`, `node:22-slim` by tag (not digest) | Open (hardening) | — |
| Linux capabilities, read-only rootfs, resource limits | Not configurable in `liara.json` as used; platform defaults unknown | Requires environment access | — |
| Healthcheck | `/api/public/health` checks DB connectivity | Present | — |
| Process model | Node cluster, `WEB_CONCURRENCY` | Present | — |
| Persistent storage | One Liara disk `uploads` at `/app/data/uploads`; image ships read-only seed assets | Present | — |
| Database exposure | `DATABASE_URL` in env; `ssl: "require"` without certificate verification | Requires environment access | SEC-030 |
| Database privileges | App connects with one role that runs migrations at startup (`AUTO_MIGRATE`) → needs DDL rights | Observed | Remediation-plan: separate migration role |
| Secrets | Env vars on Liara; GitHub secrets synced by the deploy job (`liara env:set`) | Observed | SEC-017 |
| Outbound access | App calls OpenRouter, SMS providers, Google; no egress restriction visible | Requires environment access | — |
| Backups / restore | Nothing in the repository | Requires environment access | risk-register R-08 |
| Logging / monitoring | JSON logs to stdout; CSP reports; no alerting configured in repo | Observed | SEC-024 |
| Desktop build | Embedded Postgres bound to 127.0.0.1 with a random password; Electron sandboxed | Present | — |

## CIS-style container checks (from Checkov/Hadolint/Trivy)

| Check | Result |
|---|---|
| Hadolint (all rules) | Pass (0 findings) |
| Checkov Dockerfile | 51 pass, 1 fail (CKV_DOCKER_3 non-root user) |
| Trivy misconfiguration | DS-0002 (root user, High in Trivy's scale) |
| HEALTHCHECK present | Pass |
| No secrets in image layers | `.env` is git-ignored; `COPY . .` in build stage only; runtime stage copies `.output`, `server`, seed images — no secrets observed |
