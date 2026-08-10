# Decision Log

Why things are the way they are. When one of these is revisited, amend the
entry rather than deleting it — the discarded option is usually the reason.

## Row-level security was dropped, not forgotten

Migration `0001` removed every RLS policy and the `has_role()` helpers.

Under Supabase the browser talked to PostgREST directly, so RLS was the *only*
enforcement layer. Here the browser never reaches Postgres — every query goes
through a server function. Keeping RLS would have meant maintaining two
authorization systems that must agree, and a disagreement between them fails
silently in whichever direction is more permissive.

**Cost accepted:** there is no database backstop. A server function with no
middleware is public. This is why the contract suite asserts unauthenticated
writes are rejected. See [[Security And Auth]].

## The OpenRouter key is server-only

The repo is public. A key in client code is a key in the bundle, and the bundle
is on GitHub. It is read only in `assistant-ai.server.ts`, never prefixed
`VITE_`, and lives in `.env` (gitignored) and Liara's panel.

Related: a key pasted into chat during development should be treated as
compromised and rotated, regardless of where it ended up afterwards.

## UNION, not OR EXISTS, for candidate search

Measured, not assumed: 38.5 ms → 1.6 ms on 20k companies. The `OR` form
prevents Postgres from using a bitmap scan on the company side. Full numbers
in [[Performance And Scale]].

## Rate limiting lives in Postgres

An in-memory counter is cheaper, but the app runs as several worker processes
(each would hold its own count, multiplying the allowance) and resets on every
deploy — which is exactly when an abusive client benefits most. One small
`INSERT` is negligible against an OpenRouter call that takes seconds and costs
money. See [[Security And Auth]].

## The assistant falls back to general knowledge

Product decision, not a technical one. The alternative — refusing anything not
in the database — was rejected as unhelpful for a public-facing assistant. The
prompt therefore separates the two modes explicitly: never invent specifics
about companies *in this exhibition*, but do answer broader questions.

## Foreign keys added NOT VALID

Adding them validating would fail the migration on any pre-existing orphan row
in production. `NOT VALID` binds all future writes immediately and defers the
historical check to a later `VALIDATE CONSTRAINT` once data is cleaned. Chosen
over deleting orphans, which is destructive and irreversible. See [[Data Model]].

## The PCB substrate is its own layer

The background lattice is on `body::before`, not inside `.bg-wash`. The latter
is the coloured ambient bloom and is `display:none` in the light theme — which
is the default — so the substrate would have been invisible for most visitors.
Found by debugging in the browser after it failed to appear twice.

Design rationale: the site's mark is a circuit board, so the surface everything
sits on is drawn from the same vocabulary rather than a generic gradient.

## Documentation is split, not duplicated

[README](../README.md) is canonical and self-contained; this vault is the
linked *why*. Two full copies would drift — and stale documentation is worse
than missing documentation, because it is trusted. Several sections of the
README were confidently describing a PostgREST/RLS/Supabase system that had not
existed for months, including a CSP policy that never matched the code.

## Related

- [[Parkfava Index]]
- [[Architecture]]
- [[Security And Auth]]
- [[Performance And Scale]]
- [[Testing]]
