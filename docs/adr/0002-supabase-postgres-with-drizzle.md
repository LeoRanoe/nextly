# ADR-0002 — Supabase Postgres with Drizzle

**Date** 2026-09-01 · **Status** Accepted

## Context

A greenfield Next.js app on Vercel needs a database, authentication and, later,
a public catalog reading the same data.

The user's Supabase organisation already existed, with one unrelated project.

## Decision

A new Supabase project (`Nextly`, `us-east-1`, Postgres 17), with **Drizzle** as
the query layer and migration authoring tool, and **Supabase Auth** for sign-in.

New project rather than a schema inside the existing one: the two businesses
should not share a database or a blast radius.

`us-east-1` rather than South America. The dashboard is server-rendered, so the
latency that matters is Vercel function to database (Vercel defaults to `iad1`,
also us-east-1). The browser makes one round trip; the server makes several.

Drizzle over Prisma: no code generation step to fight Turbopack's fast refresh,
~33 KB instead of an ~800 KB query engine that hurts serverless cold starts, and
a query builder close enough to SQL that aggregate reports can simply be SQL.

Supabase Auth over Better Auth: Better Auth is genuinely strong and would be the
right answer off Supabase. On Supabase, RLS keys off `auth.uid()` for free,
which is what protects the public PostgREST surface.

## Consequences

- The transaction pooler requires `prepare: false`. Omitting it produces
  intermittent "prepared statement already exists" failures under concurrency
  rather than an obvious startup error.
- Two connection strings: pooled for runtime, direct for DDL.
- Drizzle connects as `postgres` and **bypasses RLS**, so server code must
  authorise explicitly. See ADR-0007 and `01-architecture/security.md`.
