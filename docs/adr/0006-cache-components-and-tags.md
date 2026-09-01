# ADR-0006 — Cache Components, tag invalidation, and a dynamic dashboard

**Date** 2026-09-01 · **Status** Accepted

## Context

Next.js 16 replaces the App Router's implicit caching with Cache Components:
everything is dynamic unless a function opts in with `'use cache'`.

For an operations dashboard, a stale number is worse than a slow one.

## Decision

`cacheComponents: true`. Read models in `src/server/queries/` opt in with
`'use cache'`, `cacheTag(...)` and `cacheLife('max')`.

Server Actions invalidate with **`updateTag`**, not `revalidateTag`.
`updateTag` gives read-your-writes within the same request, so someone who
receives a purchase order immediately sees the new stock. `revalidateTag` is
stale-while-revalidate: right for a blog, wrong for someone who just changed
the books and needs to see it took.

Tags are declared once in `src/server/queries/cache.ts`. Reads name what they
depend on, writes name what they invalidate.

**The entire `(app)` segment sets `instant = false`.** Its layout calls
`requireMember()`, which reads cookies before anything renders. Moving the
guard into a Suspense boundary would restore a static shell and would also let
a signed-in non-member begin rendering content before the guard resolved. A
login-gated dashboard gains little from a prerendered shell and loses a great
deal from a late guard.

The public routes (`/login`, `/auth/error`, `/no-access`) keep partial
prerendering, because those are the ones a cold visitor waits on.

## Consequences

- Cached functions cannot read cookies. This enforces a useful split — auth is
  per-request, business data is shared — and makes a user-dependent cached
  query impossible rather than merely discouraged.
- A production build needs `DATABASE_URL`, because cached read models are
  evaluated during prerendering. The database client is therefore lazy behind a
  Proxy so that *importing* a route does not open a connection.
- Within dynamic pages, every widget still streams behind its own Suspense
  boundary, so one slow aggregate delays one card.
