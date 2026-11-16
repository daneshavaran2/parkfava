# Risk Register (residual, after this audit's patches)

Likelihood (L) and impact (I) on 1–3; risk = L × I. Assumes the branch is deployed.
Until then SEC-001/002/003 remain exploitable in production; SEC-004/005 are present
but dormant while MFA is off (they would undermine MFA the moment it is enabled).

| ID | Risk | Source | L | I | Risk | Treatment | Owner | Due |
|---|---|---|---|---|---|---|---|---|
| R-01 | Production still runs the pre-audit code | Deployment gap | 3 | 3 | **9** | Merge + deploy (remediation step 1) | Maintainers | Now |
| R-02 | Admin/owner takeover with a stolen password (no MFA) | SEC-026 | 2 | 3 | **6** | Enable MFA for admins (step 8) | Maintainers | 2 weeks |
| R-03 | Privileged actions and failed logins leave no trail | SEC-024 | 2 | 2 | 4 | Audit table (step 7) | Maintainers | 1 month |
| R-04 | npm users install known-critical versions (closed in round 3: lockfile regenerated) | SEC-010 | 1 | 1 | 1 | Delete/regenerate lockfile (step 5) | Maintainers | 1 week |
| R-05 | Repo access reveals CEO mobiles / initial passwords | SEC-023 | 1 | 2 | 2 | Delete JSON after provisioning (step 2) | Maintainers | After provisioning |
| R-06 | DB credential holder decrypts OpenRouter key | SEC-017 | 1 | 2 | 2 | Separate key (step 3) | Ops | 1 week |
| R-07 | Container compromise has root inside the container | SEC-011 | 1 | 3 | 3 | Non-root user (step 9) | Ops | 1 month |
| R-08 | Data loss without tested restore | Not observable (no backup config in repo) | 2 | 3 | **6** | Confirm Liara DB + disk backups and run a restore test | Ops | 2 weeks |
| R-09 | DB dump exposes live session tokens | SEC-027 | 1 | 3 | 3 | Hash tokens (step 10) | Maintainers | 1 month |
| R-10 | XSS impact amplified by `'unsafe-inline'` | SEC-028 | 1 | 3 | 3 | Nonce CSP when the framework allows (step 16) | Maintainers | Backlog |
| R-11 | Assistant manipulated by approved company text | SEC-021 | 2 | 1 | 2 | Prompt structure change (step 11) | Maintainers | Backlog |
| R-12 | Legacy Supabase project / Maps key misuse | SEC-022 | 1 | 2 | 2 | Verify restrictions (step 4) | Ops | 1 week |
| R-13 | Unauthorised merge to `main` deploys code | Branch protection not observable | 1 | 3 | 3 | Branch protection (step 6) | Repo admins | 1 week |
| R-14 | SMS/AI cost abuse | SEC-032, LLM10 | 2 | 1 | 2 | Existing limits; CAPTCHA (step 17) | Maintainers | Backlog |
| R-15 | Lovable editor access = code push | Platform design | 1 | 3 | 3 | Restrict Lovable project members; review Lovable commits like PRs | Owner | Ongoing |
| R-16 | Untested areas (CodeQL, DAST, production config) hide issues | Coverage gaps | 2 | 2 | 4 | Allow CodeQL; run ZAP baseline against a staging copy | Security | 1 month |
