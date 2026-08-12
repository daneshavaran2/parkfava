# Operations

## Deploying

There is no automated deploy. `liara deploy` uploads from the local working
directory, so **merging on GitHub does not change what is live**:

```bash
git pull origin main
liara deploy
bun run db:migrate      # against the production DATABASE_URL, when the release adds one
```

The container runs `server/cluster.mjs` and reports health via
`/api/public/health`, which runs `SELECT 1` — so a process that is listening
but cannot reach Postgres is unhealthy rather than quietly serving errors.

> **Currently blocked:** the GitHub Actions deploy workflow cannot run. Every
> run fails in ~2 seconds without a runner being assigned, because the
> account's Actions budget is at $0 with "stop usage" set and the payment
> method is rejected. GitHub will not even let the budget be deleted without a
> valid card. Until that is resolved, deploys are manual as above.

## After deploying the 2026-08-09 release

1. Set `OPENROUTER_API_KEY` in Liara → Environment Variables (see [[AI Assistant]]).
2. Run `bun run db:migrate` — migration `0004` is required or the assistant errors.

## Environment

Full table in the [README](../README.md#environment-variables). The ones that
bite:

- `DATABASE_URL` — required; append `?sslmode=require` for managed Postgres.
- `UPLOAD_DIR` — **must** point at a mounted persistent disk on Liara, or
  uploads vanish on every redeploy.


### When images stop loading

`/api/public/asset-audit` (admin session required) counts every image path in
the database and reports whether the bytes are on the uploads disk, baked into
the container image, or absent entirely. Check it before theorising: "the
images are gone" and "the app cannot serve them" look identical in a browser
and have completely different fixes.

The 135 product images imported from the atlas are baked into the image, so a
wiped or unmounted disk no longer takes them with it. Anything uploaded through
the admin panel still lives only on the disk — if those come back `missing`,
the disk is the problem.
- `OPENROUTER_API_KEY` — secret, never `VITE_`-prefixed.
- `LOG_SINK=memory` — dev/test only.

## Local setup

```bash
bun install
cp .env.example .env      # fill DATABASE_URL
bun run db:migrate
bun run seed
bun dev                   # http://localhost:8080
```

`bun run seed` is idempotent, tags rows `[SEED]`, and creates a deliberate
mix: four approved companies plus one `pending` and one `draft`, so hidden-row
behaviour is testable. `bun run reset:dev` clears it.

## Observability

Request ids correlate a request across handlers and log envelopes — but only
from 2026-08-09 onward. Before that the propagation was silently broken and
older logs carry no id at all; see [[Decision Log]].

## Related

- [[AI Assistant]]
- [[Testing]]
- [[Performance And Scale]]
- [[Decision Log]]
