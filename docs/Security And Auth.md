# Security And Auth

## Sessions

Opaque random token in an `HttpOnly` cookie; the session itself lives in the
`sessions` table. Not a JWT — so revoking access is a single `DELETE`, with no
blocklist and no waiting for expiry.

Expired rows are pruned opportunistically on login (~10% of the time). Before
that they accumulated forever: `getSessionUser()` filtered them out but never
removed them.

## The middleware chain

`src/lib/auth/middleware.ts`, layered:

```
requireAuth  ──> requireAdmin          (role check)
             └─> requireMfaVerified    (step-up OTP; no-op unless MFA_ENFORCED=true)
```

A server function's protection is exactly the middleware it declares. **A new
function with none is public** — there is no database-level backstop, because
RLS was dropped on purpose (see [[Decision Log]]). This is the single easiest
way to introduce a hole in this codebase, which is why
`scripts/test-api-contracts.py` asserts unauthenticated writes are rejected;
see [[Testing]].

Roles live in `user_roles`, deliberately separate from `users` so that
updating a profile can never escalate a role. The first user to sign up
becomes admin (`assign_first_user_admin` trigger); everyone after gets nothing
until an admin grants it.

## Rate limiting

`src/lib/rate-limit.server.ts`, backed by `rate_limit_hits`.

Only the assistant uses it today, because it is public, unauthenticated, and
**spends money on every call**. Two layers: 15 per 5 minutes per caller, plus
a global 300/hour that bounds the worst case under a distributed flood. The
check runs before any database or OpenRouter work.

It is in Postgres rather than process memory for two reasons: the app runs as
several workers, and an in-memory counter resets on every deploy — precisely
when an abusive client would most benefit. See [[Decision Log]].

## Secrets

Server-only, read inside handler bodies. `.env` is gitignored; production
values live in Liara's Environment Variables panel. `OPENROUTER_API_KEY` is
the one with a direct financial blast radius.

## Related

- [[Architecture]]
- [[AI Assistant]]
- [[Testing]]
- [[Decision Log]]
