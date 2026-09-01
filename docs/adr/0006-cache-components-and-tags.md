# ADR-0006 — Dynamic by default, and why nothing is cached

**Date** 2026-09-01 · **Status** Accepted
**Supersedes** the original form of this ADR, which had read models opt into
`'use cache'` with tag invalidation. That decision was wrong and is recorded
below rather than deleted, because the reason it failed is the useful part.

## Context

Next.js 16 replaces the App Router's implicit caching with Cache Components:
everything is dynamic unless a function opts in with `'use cache'`.

The first design took that invitation. Every read model in
`src/server/queries/` was marked `'use cache'` with `cacheTag(...)` and
`cacheLife('max')`, and every Server Action called `updateTag` for what it
invalidated. Tags were declared once in `src/server/queries/cache.ts`.

## What went wrong

**`'use cache'` entries are filled during `next build`.** That makes the build
connect to Postgres, which turned the database into a build-time dependency.

The first Vercel deploy failed on it. The build hung for 54 seconds inside
`listProducts` and hit Next's prerender timeout:

```
Error: Filling a cache during prerender timed out, likely because
request-specific arguments ... were used inside "use cache".
    at src/server/queries/lists.ts:32
```

The proximate cause was a `DATABASE_URL` pointing at Supabase's direct
connection, which is IPv6-only while Vercel's build network is IPv4-only — so
it hung rather than refusing. But the proximate cause is not the interesting
part. **A transient database problem should not be able to fail a deploy.**
The architecture made it able to.

## Decision

`cacheComponents: true` stays. Nothing uses `'use cache'`.

Read models are plain async functions called inside Suspense boundaries on
routes that are already dynamic (`instant = false` on the `(app)` layout). The
tag module and every `updateTag` call are deleted, because invalidation of
nothing is nothing.

Freshness now comes from the request itself, and from `router.refresh()` after
a mutation.

This is the right posture for these books regardless of the deploy failure:

- Every figure is live. A stale cash balance is worse than a slow one.
- Every write invalidated almost everything anyway. Recording one sale touched
  inventory, sales, ledger and customers, so the cache was being thrown away
  about as fast as it was built.
- There are two or three users, not two or three thousand. The query cost this
  was saving is not a cost anyone was paying.

The caching machinery was solving a problem this application does not have,
while creating one it now did.

## Consequences

- **`next build` never touches the database.** Verified by building against a
  deliberately unroutable address: the build completes.
- Public routes (`/login`, `/auth/error`, `/no-access`, `/setup`,
  `/design-system`) still prerender, and the two that read a dynamic value keep
  Partial Prerendering. Those are the routes a cold visitor waits on.
- Every widget still streams behind its own Suspense boundary, so one slow
  aggregate delays one card rather than the page.
- If a query ever does become expensive enough to need caching, it can opt in
  on its own — but the same build-time question has to be answered first.

## What was kept from the original decision

`cacheComponents: true` itself. Dynamic-by-default is the correct posture for a
set of books, and having to write `'use cache'` deliberately is exactly the
friction that should exist before anything here is cached again.
