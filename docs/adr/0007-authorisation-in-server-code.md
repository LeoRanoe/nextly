# ADR-0007 — Authorisation in server code, RLS for the public surface

**Date** 2026-09-01 · **Status** Accepted

## Context

Drizzle connects with the database password as the `postgres` role, which
bypasses Row Level Security. Meanwhile Supabase exposes a PostgREST API on the
public internet, reachable by anyone holding the publishable key.

These are two different threat surfaces, and it would be a mistake to assume one
mechanism covers both.

## Decision

**Server code authorises explicitly.** Every Server Action begins with
`requireMember()`, `requireWrite()` or `requireOwner()`. The `(app)` layout
calls `requireMember()` once, so a new page is protected by existing — but a
layout cannot protect a POST, so actions guard themselves.

**RLS protects the REST surface.** Every table has RLS enabled *and* forced,
with policies keyed to `private.is_member()`. Views are `security_invoker`.
Append-only tables have no UPDATE or DELETE policy at all.

Passing a JWT through the Drizzle connection so RLS applies to server code was
considered and rejected: it means a session-scoped `SET` on every request, which
does not compose with connection pooling, in exchange for redundancy with guards
that must exist anyway.

## Consequences

- **Forgetting a guard in a Server Action is a real vulnerability.** This is the
  one thing a reviewer must check, and it is written at the top of
  `src/server/auth.ts` for exactly that reason.
- RLS is defence in depth for the app, and the *primary* control for the REST
  API that the catalog will eventually use from the browser.
- `SECURITY DEFINER` helpers live in the `private` schema, because PostgREST
  exposes everything in `public` as an RPC endpoint. Supabase's advisor caught
  this on the first pass: `next_document_number()` was callable over HTTP by any
  signed-in user, which would have let them burn purchase order numbers.
