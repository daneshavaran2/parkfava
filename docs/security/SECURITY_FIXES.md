# Security Fixes

**Date:** 2026-11-24 · Part of the [security audit](SECURITY_AUDIT.md).
Each fix was made after the issue was reproduced on the unfixed code; each
regression test failed before the fix and passes after it. No security
control was weakened to make a test pass.

## Fixes in this round

### SEC-050: rate-limit race

| | |
|---|---|
| Severity | Medium |
| Root cause | Count of recent hits and insert of the new hit were separate statements, so simultaneous requests all saw the old count |
| Files | `src/lib/rate-limit.server.ts` |
| Change | `enforceRateLimit` runs the count and the insert in one transaction that first takes `pg_advisory_xact_lock(7301, hashtext(bucket))`. Requests for the same bucket queue for the few milliseconds the previous one needs; other buckets are unaffected. The two-key lock cannot collide with the migration runner's single-key lock |
| Behaviour change | None visible. Sign-in, sign-up, password change and the assistant keep their limits |
| Regression tests | `tests/unit/security-regressions.test.ts` "SEC-050" (40 simultaneous calls, limit 5: exactly 5 pass; other buckets not held up); `scripts/test-security-concurrency.py` "Rate limits under parallel requests" |
| Before → after | 40 → 5 calls through (unit); 10 → 8 and 20 → 5 checked (HTTP) |

### SEC-053: admin promotion and revocation

| | |
|---|---|
| Severity | Medium |
| Root cause | The `assign_first_user_admin` trigger promoted any new account while no admin role existed; `revokeAdmin` could remove every admin when two admins acted at once |
| Files | `db/migrations/0024_first_admin_only_once.sql` (new), `src/lib/admin-users.functions.ts`, `README.md`, `docs/Security And Auth.md` |
| Change | The trigger promotes only when the new row is the only row in `users` and no admin exists, checked again under an advisory lock so two simultaneous first sign-ups cannot both win. `revokeAdmin` locks all admin rows (`SELECT … FOR UPDATE`) and refuses with `FORBIDDEN` if the caller is no longer an admin |
| Behaviour change | Matches the documented rule ("the first user who ever signs up"). If a database already has accounts but no admin, nobody is promoted automatically; grant the role with the SQL in the README. A revocation sent by an admin who has just been revoked is refused |
| Regression tests | Unit "SEC-053" (a new account gets no role when no admin is left; runs in a rolled-back transaction); concurrency suite "Admin role under concurrency" (mutual revocation ×8 rounds, zero-admin sign-up) |
| Before → after | 0 admins left and the newcomer became admin → 1 admin left, newcomer has no role. Empty database: exactly one of two simultaneous first sign-ups becomes admin |

### SEC-051: OTP send race

| | |
|---|---|
| Severity | Low (Medium once SMS is live) |
| Root cause | Cooldown and daily cap read before sending and recorded after |
| Files | `src/lib/mfa.functions.ts` |
| Change | `requestOtp` claims the send slot first with one conditional `UPDATE` that checks the 60-second cooldown and the 5-per-day cap and records the send in the same statement; only the request that updates the row sends a text. If the SMS call fails, the slot is handed back, so a provider outage does not use up the account's daily sends |
| Behaviour change | None for a single request. Parallel requests get `OTP_COOLDOWN` instead of extra texts |
| Regression tests | Concurrency suite "OTP sends" (with a stand-in SMS panel: 10 parallel requests send 1 text; counter matches texts sent; daily cap; new window; cooldown; fresh code left to verify) and "OTP sends without an SMS panel" (failed sends use up nothing) |
| Before → after | 10 texts, counter 1 → 1 text, counter 1 |

### SEC-054: hidden content in public reads

| | |
|---|---|
| Severity | Low |
| Root cause | The export, `getParkContent` and park attachments ignored the park's `is_active` flag; the export also ignored whether an attachment's company was published |
| Files | `src/routes/api/public/export.ts`, `src/lib/park-content.functions.ts`, `src/lib/attachments.functions.ts`, `src/lib/park-visibility.server.ts` (new) |
| Change | The export ships only active parks and their content, images and news, and an attachment only if its company is published (or its park is not deactivated). `getParkContent` and park attachments return nothing for a deactivated park unless the caller is an admin (`isParkHiddenFromViewer`). A park id with no row in `parks` is not hidden, so bundled park data keeps working |
| Behaviour change | The offline desktop app no longer receives deactivated parks or unpublished companies' files, matching the public site. Admin editing of a deactivated park is unchanged |
| Regression tests | Deep suite "Hidden content (SEC-042, SEC-054)": export, anonymous and admin reads of park content and attachments |
| Before → after | 3 failing checks (6 data kinds leaked) → all pass; admins still see the park |

### SEC-056: password hash cost

| | |
|---|---|
| Severity | Low |
| Root cause | Node's default scrypt parameters (N=2^14, r=8, p=1) are a fifth of the OWASP minimum work factor |
| Files | `src/lib/auth/password.server.ts`, `src/lib/auth.functions.ts`, `scripts/generate-national-id-logins.py` |
| Change | New hashes use N=2^14, r=8, p=5 (OWASP-equivalent setting, same 16 MiB memory) stored as `scrypt$16384$8$5$salt$hash`. Old `salt:hash` values still verify; checking one is padded with an extra p=4 computation so it takes as long as a current one; `signIn` replaces an old hash after a correct password (only if it is still the hash just checked). Unknown accounts now go through the same two-step check as real ones, including the second check for passwords typed with Persian digits. The provisioning generator writes the new format |
| Behaviour change | About 150 ms of CPU per password check instead of 35 ms; the first sign-in of each account after deployment also writes the new hash. No sign-out, no password reset |
| Regression tests | Unit "SEC-056" (format, verification, old hashes, malformed values, timing parity); deep suite "Password storage (SEC-013, SEC-056)" (new accounts, upgrade on sign-in, sign-in after upgrade, equal response times); a hash made by the Python generator verifies in the app |
| Before → after | New hashes `salt:hash` (p=1) → `scrypt$16384$8$5$…`; response times unknown / old / current: 161 / 166 / 172 ms |

### SEC-052: upload file names

| | |
|---|---|
| Severity | Info |
| Root cause | `Math.random` was the only unpredictable part of a stored file's URL |
| Files | `src/lib/storage/local-storage.server.ts`, `src/lib/about-sections.functions.ts`, `src/lib/attachments.functions.ts`, `src/lib/exhibition-api.functions.ts`, `src/lib/park-content.functions.ts` |
| Change | `newUploadName()`: upload time plus 96 bits from `crypto.randomBytes`, used by all four upload functions |
| Behaviour change | New file names are 24 hexadecimal characters longer; existing files keep their names |
| Regression tests | Unit "SEC-052" (format, 1,000 names without repeats, every upload function uses it and none uses `Math.random`) |

## Breaking changes

None that require action from users. Two operational notes:

1. Migration 0024 changes who becomes admin automatically: only the very
   first account in an empty database. A database that has accounts but no
   admin needs the role granted with the SQL in the README.
2. Password checks cost about 115 ms more CPU each (SEC-056). The limits
   (8 per account per 5 minutes, 60 per client per 15 minutes) bound what one
   client can make the server compute, but sign-in attempts from many
   addresses now cost the server about four times as much CPU as before.
   Load was not tested; include this in capacity planning.

## Fixes from earlier rounds

SEC-001 to SEC-049: the fix for each is listed in
[`docs/Security Report.md`](../Security%20Report.md#fixed), and the tests
that guard it in [SECURITY_TEST_COVERAGE.md](SECURITY_TEST_COVERAGE.md).
Every one of those tests was re-run on the final code of this round (see
[PENETRATION_TEST_RESULTS.md](PENETRATION_TEST_RESULTS.md#final-re-run)).

## Verification of the fixes

- Unit tests: 111 passed (2 against the test database).
- All security suites on the dev server and the production build, for the
  repository and the client export: all passed (numbers in
  [PENETRATION_TEST_RESULTS.md](PENETRATION_TEST_RESULTS.md#final-re-run)).
- Type check: 7 errors, the same 7 as before the changes (unrelated UI
  component typings). Lint: no new errors in any changed file.
