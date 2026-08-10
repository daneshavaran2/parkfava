# Architecture

TanStack Start (React 19) on Nitro, built to `.output/server/index.mjs` and
run by plain Node in a Docker container on Liara. **Not** a static SPA and not
Cloudflare Workers, despite the Lovable config defaulting Nitro to
`cloudflare-module` — `vite.config.ts` pins `node-server`.

That single fact is what makes everything else possible: there is a real
server process, so secrets and privileged queries have somewhere to live.

## The one boundary that matters

The browser never talks to Postgres. Every read and write goes through a
**server function** (`createServerFn`) in `src/lib/*.functions.ts`, which runs
only on the server and is reachable over RPC at `/_serverFn/<token>`.

```
browser ──RPC──> server function ──> db/connection.ts ──> Postgres
                      │
                      └── middleware: requireAuth → requireAdmin / requireMfaVerified
```

Consequences worth internalising:

- **Authorization lives in middleware, not the database.** There is no RLS —
  it was dropped deliberately (see [[Decision Log]]). A new server function
  with no middleware is public, and nothing else will stop it.
- **A file that touches `process.env` secrets or `getDb()` must never be
  imported from client code.** The convention is a `.server.ts` suffix
  (`assistant-ai.server.ts`, `send-sms.server.ts`, `local-storage.server.ts`).
- `import.meta.env.VITE_*` is the only thing that reaches the browser. A
  secret prefixed `VITE_` is a published secret.

## Request entry

`src/server.ts` is the Nitro fetch entry and wraps every request: it mints the
request id, opens the AsyncLocalStorage context, and stamps response headers
(request id + CSP). `src/start.ts` adds router-level middleware on top.

There are also a few plain HTTP routes that bypass the RPC layer:
`/assets/*` (uploaded files), `/api/public/health`, `/api/public/csp-report`,
`/api/public/debug-echo`.

## Related

- [[Data Model]]
- [[Security And Auth]]
- [[Performance And Scale]]
- [[Decision Log]]
