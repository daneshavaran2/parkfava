# Performance And Scale

## Search: filter in Postgres, rank in Node

`exhibition_companies`, `exhibition_products` and `parks` each carry a
generated `search_text` column with a GIN trigram index (`pg_trgm`,
migration `0004`).

The column normalises Persian on write — Arabic yeh/kaf (`ي`/`ك`) → Persian
(`ی`/`ک`), ZWNJ → space — using the same rules `src/lib/assistant/match.ts`
applies to the question. This is not cosmetic: a company entered as
`كيان‌شبكه` is only findable by a search for `کیان` because both sides get
folded to the same canonical form. Verified against a real database.

### Write the candidate query as a UNION

Measured on 20k companies / 40k products:

| Formulation | Result |
| ----------- | ------ |
| `company_matches OR EXISTS (product subquery)` | **38.5 ms** — 20 001 rows filtered by hand, company trigram index unused |
| `UNION` of two indexed lookups | **1.6 ms** — both trigram indexes used |

Postgres cannot use a bitmap scan for the company side of that `OR`, so it
falls back to scanning every published row. Identical results, ~24× the cost.
This is easy to reintroduce by "simplifying" the query — don't.

The public listing has its own composite index on
`(status, is_active, sort_order)`, which serves the filter *and* the sort.

### A note on measuring

Right after a bulk insert, a GIN index has a pending list and the planner will
reasonably prefer a sequential scan. `ANALYZE` and let autovacuum settle
before concluding an index "isn't used".

## Serving uploads

`/assets/*` streams from disk (`src/routes/assets.$.ts`). Previously it read
the whole file into a Buffer — a 50 MB catalogue meant a 50 MB allocation per
concurrent request. It now also answers `304` on `If-None-Match` and honours
byte ranges, which is what makes seeking inside an uploaded video work.

## Using more than one core

Node is single-threaded, so the plain entry uses one core regardless of
container size. Production runs `server/cluster.mjs`: workers share a
listening socket, a dead worker is replaced, and after 10 crashes in 60
seconds it gives up rather than fork-bombing when the app simply cannot boot.

Because workers are separate processes, anything that must be consistent
between them cannot live in module memory — which is why rate limiting is in
Postgres ([[Security And Auth]]).

## Known ceiling

Uploads are on a container-local disk, so the app **cannot scale beyond one
container** without moving to object storage. Clustering raises the ceiling
within a machine; it does not remove this one.

## Related

- [[Data Model]]
- [[AI Assistant]]
- [[Operations]]
- [[Decision Log]]
