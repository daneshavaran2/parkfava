# Production Security Checklist

**Date:** 2026-11-24 · Part of the [security audit](SECURITY_AUDIT.md).

The audit tested local instances only. Nothing here has been checked on the
live site; each item says how to check it. "Verified locally" means the code
behaves this way on the production build in the test environment.

## Before deploying

| # | Item | How | Status |
|---|---|---|---|
| 1 | Back up the database and the uploads disk, and prove the backup restores | `scripts/backup-restore-drill.sh` with `RESTORE_DATABASE_URL` pointing at a new empty database (it refuses anything else); store the backup encrypted, since it holds password hashes and the encrypted assistant key | To do (drill verified on a test copy) |
| 2 | Deploy this code; migrations apply themselves | The new container applies 0022, 0023, 0024 at start-up (logs: `[auto-migrate] applying …`, once each). Tested on a copy in the production state: users stay signed in, uploads stay writable. `AUTO_MIGRATE=0` turns it off | To do |
| 3 | `NODE_ENV=production` | Set in the Dockerfile; enables HSTS, the enforced CSP, `Secure` cookies, and turns off the debug endpoint and test pages | Verified locally |
| 4 | `SETTINGS_ENCRYPTION_KEY` set to a long random value | `openssl rand -hex 32`, stored as a Liara environment variable and in the recovery instructions (not in the backup); re-save the assistant API key in the admin page afterwards. Without it the key is lost after a restore or a database password change (SEC-017, shown in the drill) | To do |
| 5 | `DATABASE_URL` uses TLS | `?sslmode=require`; verify the certificate if the database is ever reached over the internet (SEC-030) | To check |
| 6 | `TRUSTED_PROXY_HOPS` matches the proxies in front of the app | 1 for Liara's router alone; add one per CDN or proxy in front of it. Wrong values weaken the per-client limits (SEC-003) | To check |
| 7 | Uploads disk writable by the app | Automatic: `server/docker-entrypoint.sh` re-owns the disk to uid 1000 at start-up (files from older root images), then runs the app as `node` | Verified locally |
| 8 | SMS provider configured, then `MFA_ENFORCED=true` | `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_LINE`. Test: (a) one code to your own phone arrives and verifies; (b) a code to an invalid number, or with a wrong sender line, must show an error in the app, not "code sent". If (b) shows "sent", the provider reports failures inside an HTTP 200 answer and `src/lib/sms/send-sms.server.ts` must also check the response body. Then enable MFA at least for admins (SEC-026) | To do |
| 9 | A CAPTCHA on sign-up before SMS goes live | Open sign-up plus SMS sending (SEC-032); the OTP cap now holds under bursts (SEC-051) | Recommended |
| 10 | `CSP_ENFORCE` not set to `0` | Leave unset; production enforces the CSP | Verified locally |
| 11 | Admin accounts reviewed | `SELECT u.email, u.national_id FROM user_roles r JOIN users u ON u.id = r.user_id WHERE r.role = 'admin';` should list only the intended people. On a brand-new empty database, create the first admin before the site is reachable (SEC-029) | To check |
| 12 | Keys from old git history rotated | Any key in the old `.env` (commit `13cd74d`) that was ever private: revoke and replace (SEC-022) | To check |
| 13 | Default branch protected | Pull requests with review, no force pushes, deploy secret (`LIARA_API_TOKEN`) limited to the deploy workflow | To do |
| 14 | Review-workflow decision | Decide SEC-055 (freeze edits while pending, or version-checked approval) | Open |
| 15 | Edge protection and capacity | CDN for static files and public pages, rate limiting at the edge, CPU sized for peak traffic: one CPU served about 370 mixed requests per second cleanly (SEC-059, SEC-060) | Recommended |
| 16 | Keep `PORT` at 3000 | The image's HEALTHCHECK calls port 3000 | Verified locally |
| 17 | Rebuild the image regularly | Picks up Debian security fixes for the base image (SEC-061) | Ongoing |

## After deploying (read-only checks against the live site)

Replace `<site>` with the production address. These send ordinary requests
only.

| # | Check | Command | Expected |
|---|---|---|---|
| 1 | Security headers | `curl -sI https://<site>/` | `strict-transport-security`, `content-security-policy` (not report-only) with `frame-ancestors 'none'`, `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy`, `permissions-policy`; no `x-powered-by` |
| 2 | Debug and test pages off | `curl -s -o /dev/null -w '%{http_code}\n' https://<site>/api/public/debug-echo` (and `/perf`, `/dev/logo`) | `404` |
| 3 | Unexpected methods refused | `curl -s -o /dev/null -w '%{http_code}\n' -X PUT https://<site>/` | `405` |
| 4 | Export carries only public data | `curl -s https://<site>/api/public/export \| jq '([.parks[] \| select(.is_active == false)] \| length), ([.companies[] \| select(.status != "approved")] \| length)'` | `0` and `0` |
| 5 | Migrations applied | `SELECT name FROM _migrations ORDER BY name DESC LIMIT 3;` | `0024_first_admin_only_once.sql` first |
| 6 | Sessions stored hashed | `SELECT count(*) FROM sessions WHERE id !~ '^[0-9a-f]{64}$';` | `0` |
| 7 | Password hashes being upgraded | `SELECT count(*) FILTER (WHERE password_hash LIKE 'scrypt$%') AS current, count(*) AS total FROM users;` | `current` grows as people sign in |
| 8 | Session cookie flags | Sign in, then browser developer tools → cookies | `HttpOnly`, `Secure`, `SameSite=Lax`, host-only |
| 9 | Throttling works behind the real proxy | Ten wrong passwords for a test account | The ninth and tenth answer "too many attempts" |
| 10 | Container user | Liara console: `id` | `uid=1000(node)` |
| 11 | Logs carry request ids, no secrets | Liara logs after a failed sign-in | A request id; no password, code or token |

## Ongoing

- Run the security suites (see [SECURITY_TEST_COVERAGE.md](SECURITY_TEST_COVERAGE.md))
  against a staging copy before each release that touches authentication,
  sessions, uploads or server functions.
- `bun audit` and the dependency scanners monthly, and on every dependency
  change.
- Watch the logs for `db_error`, `rate_limit_unavailable` and CSP reports
  (`/api/public/csp-report`).
- Add an audit trail of sign-ins and admin actions (SEC-024) and move to a
  nonce-based CSP (SEC-028) when the framework allows it.
- Before moving to a custom domain shared with other sites, rename the
  session cookie to `__Host-session` (SEC-057).
