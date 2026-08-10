# Parkfava Index

Vault for **اطلس شرکت‌های پارک فاوا** — a virtual exhibition of companies
across Iran's science & technology parks.

Open this folder as an Obsidian vault (`Open folder as vault` → `docs/`), or
copy the notes into an existing vault. Everything here is flat and linked;
this note is the entry point.

## How this relates to the README

The [README](../README.md) is the canonical, self-contained reference — the
thing a new contributor or CI reader needs. These notes are the *thinking*
layer: short, linked, and biased toward **why** a thing is the way it is.

They deliberately do not restate the README. Where a note needs detail, it
links to the README section or to the source file. One fact, one home —
duplicating the content across both would guarantee they drift, which is the
exact failure this vault was written in response to.

## Notes

- [[Architecture]] — how a request actually flows, and where the server/client line sits
- [[Data Model]] — tables, the company workflow, migrations
- [[Security And Auth]] — sessions, roles, the middleware chain, rate limiting
- [[AI Assistant]] — grounding, OpenRouter wiring, cost control
- [[Performance And Scale]] — search indexing, asset streaming, using more than one core
- [[Operations]] — deploy, migrations, environment, seeding
- [[Testing]] — the suites, what each proves, and how they rotted
- [[Decision Log]] — the reasoning behind the choices above

## Current state (2026-08-09)

- Backend is self-hosted Postgres. Supabase is fully gone from the app; see [[Decision Log]].
- The AI assistant is live in code but **needs `OPENROUTER_API_KEY` set on the
  server** and migration `0004` applied. See [[AI Assistant]], [[Operations]].
- All test suites pass. Two dead scripts remain flagged in [[Testing]].
- Deploys are manual and currently blocked on a GitHub billing issue — the
  Actions workflow cannot run. See [[Operations]].
