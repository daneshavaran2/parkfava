# Remediation Plan

Ordered by risk reduction per unit of effort. "Done" items are on branch
`claude/epic-meitner-ctcy12` and reach production only after merge to `main`.

## Phase A — deploy what is done (owner: maintainers, effort: merge + deploy)

| Order | Item | Findings | State |
|---|---|---|---|
| 1 | Merge the branch and deploy; migrations `0021`/`0022` apply automatically (additive) | SEC-001…009, 012…016, 018…020, 025 | Done in code |
| 2 | After deploy: run `bun run scripts/provision-national-id-logins.ts` (dry run) then `--apply` against production, then **delete** `scripts/company-national-id-logins.json` | SEC-023 | Pending |

Rollback: the branch is a normal merge; migrations only add nullable columns and
constraints (`0021` makes `users.email` nullable — rolling back code while keeping
national-ID-only users would leave rows without email; keep `0021` in place on rollback).

## Phase B — configuration (no code), this week

| Order | Item | Findings |
|---|---|---|
| 3 | Set a dedicated `SETTINGS_ENCRYPTION_KEY` on Liara, then re-save the OpenRouter key in `/admin/ai` | SEC-017 |
| 4 | Confirm the Google Maps browser key is HTTP-referrer restricted; delete or lock the legacy Supabase project | SEC-022 |
| 5 | Decide on `package-lock.json`: delete it if nobody installs with npm (recommended), otherwise regenerate it with a working npm version and audit it | SEC-010 |
| 6 | Turn on branch protection for `main` (required review + required CI checks) | SEC-009 residual |

## Phase C — code changes proposed (not yet applied)

| Order | Item | Findings | Proposed change | Effort |
|---|---|---|---|---|
| 7 | Security audit trail | SEC-024 | Table `security_events(id, at, actor_user_id, event, target, ip, meta jsonb)`; write on sign-in success/failure, role grant/revoke, owner assignment, approvals/rejections, password/phone change; admin view | M |
| 8 | Enforce MFA for admins | SEC-026 | Configure SMS provider; extend `requireMfaVerified` to require MFA for users with the `admin` role even when `MFA_ENFORCED` is off; admin recovery runbook | M |
| 9 | Non-root container | SEC-011 | `USER node` in runtime stage after verifying the Liara disk is writable by UID 1000 (test on a staging app first) | S |
| 10 | Hash session tokens at rest | SEC-027 | Store `sha256(token)`, look up by hash; one-time sign-out of all users | S |
| 11 | Prompt-injection hardening | SEC-021 | See ai-agent-security.md | S |
| 12 | Drop the first-user-admin trigger in production | SEC-029 | Migration `DROP TRIGGER trg_users_first_admin` (keep for the desktop/offline bootstrap path, which has its own watcher) | S |
| 13 | Remove or gate `/perf` and `/dev/logo` | SEC-031 | Return 404 when `NODE_ENV=production` | S |
| 14 | Pin base images by digest | — | `FROM node:22-slim@sha256:…`, `FROM oven/bun:1@sha256:…` with Dependabot/Renovate updates | S |
| 15 | Separate DB roles | — | Migration role with DDL rights; runtime role with DML only; set `AUTO_MIGRATE=0` in production once migrations run in the deploy step | M |
| 16 | Nonce-based CSP | SEC-028 | Requires TanStack Start/Lovable support for script nonces | L |
| 17 | Abuse controls for sign-up | SEC-032 | CAPTCHA or disable public sign-up if only provisioned companies should log in | S |

## Phase D — continuous controls

| Order | Item |
|---|---|
| 18 | Adopt [`proposed-security-workflow.yml`](proposed-security-workflow.yml) as `.github/workflows/security.yml` (dependency gate at High, Gitleaks on new commits, Semgrep ERROR gate, zizmor, Hadolint, unit security regressions, optional CodeQL) |
| 19 | Add `scripts/test-auth-hardening.py`, `test-authz-coverage.py` and `test-api-contracts.py` to CI (they need a dev server + disposable database, like the existing e2e jobs) |
| 20 | Dependabot/Renovate for `bun.lock` and GitHub Actions SHAs |
| 21 | Quarterly re-run of this audit's tool set; install the OWASP skill plugins (skill-inventory.md) for checklist coverage |
