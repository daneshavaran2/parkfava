# Data Model

Postgres, schema in `db/migrations/*.sql`, applied by `bun run db:migrate`
(tracked in `_migrations`, transactional, safe to re-run).

## Migrations

| File | What it introduced |
| ---- | ------------------ |
| `0001_init.sql` | Whole schema; replaced `auth.users` with our own `users`; **dropped RLS** |
| `0002_sessions.sql` | Server-side `sessions` table |
| `0003_mfa_columns.sql` | OTP state on `users` |
| `0004_scale_and_integrity.sql` | `pg_trgm` + `search_text` + GIN indexes, composite listing index, missing FKs, `rate_limit_hits` |

## The company workflow

`exhibition_companies.status` drives public visibility, gated together with
`is_active`:

```
draft ──submit──> pending ──approve──> approved   (visible when is_active)
                     └────reject────> rejected
```

**Public means `status='approved' AND is_active=true`, everywhere.** Every
public read repeats that pair. `getPublicExhibitionProducts` re-derives it by
joining back to the parent company rather than trusting the caller's id list —
otherwise anyone could ask for a draft company's products by id. That
behaviour is pinned by a contract test; see [[Testing]].

## Notable columns

- `search_text` on companies/products/parks — generated, normalised Persian,
  trigram-indexed. See [[Performance And Scale]].
- `latitude` / `longitude` — checked ranges; drive the map and directions links.
- `owner_user_id` — the company representative; `saveOwnedCompany` scopes
  updates through it and strips `status`/`is_active` so an owner cannot
  self-publish.

## Foreign keys added late

`0004` added FKs that were missing relative to the rest of the schema
(`park_images`, `park_news`, `companies.park_id`, `reviewed_by`). They were
added `NOT VALID`: enforced for all new writes, existing rows not re-checked,
so the migration cannot fail on pre-existing orphans. Run
`ALTER TABLE ... VALIDATE CONSTRAINT ...` after cleaning historical data to
close the gap.

## Related

- [[Architecture]]
- [[Security And Auth]]
- [[Performance And Scale]]
- [[Operations]]
