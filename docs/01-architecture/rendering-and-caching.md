# Rendering and caching

Next.js 16 Cache Components. Nothing is cached unless it says so.

---

## The model

`cacheComponents: true` inverts the old App Router default. Every page, layout
and route handler executes at request time **unless** a function opts in with
`'use cache'`.

That is a better default for an operations tool, where a stale number is worse
than a slow one, and it makes caching a decision someone made rather than a
behaviour they inherited.

## Where each route lands

| Route | Mode | Why |
|---|---|---|
| `/login`, `/auth/error`, `/no-access` | **Partial prerender** | The shell is static and paints instantly; only the part that reads `searchParams` or the session streams in. |
| `/design-system` | Static | No data. |
| `/auth/callback` | Dynamic | It is a route handler that exchanges a code. |
| Everything under `(app)` | **Dynamic** (`instant = false`) | Explained below. |

### Why the dashboard is dynamic

The `(app)` layout calls `requireMember()`, which reads cookies before anything
renders. Cache Components correctly refuses to prerender that.

Deferring the guard into a Suspense boundary would restore a static shell — and
would also let a signed-in non-member begin rendering page content before the
guard resolved. That trade is wrong: a login-gated dashboard gains little from a
prerendered shell and loses a great deal from a guard that runs late.

So the segment declares `export const instant = false` and blocks. The public
routes, which are the ones a cold visitor actually waits on, keep partial
prerendering.

**Within** those dynamic pages, every widget still streams independently.

## Streaming

Each panel sits behind its own `<Suspense>` with a skeleton that matches its
final geometry:

```tsx
<Suspense fallback={<PositionStripSkeleton />}>
  <PositionStrip />
</Suspense>
```

A skeleton of the wrong height causes exactly the layout shift Suspense was
meant to avoid, so `SkeletonNumber` is sized in `ch` against the mono stack —
it occupies the width the real figure will, rather than a guess in pixels.

The Overview runs six independent queries. A slow aggregate delays one card.

### Passing promises down

When a component needs `searchParams`, the page takes the prop and passes the
**unawaited promise** into the boundary:

```tsx
export default function Page({ searchParams }: { searchParams: Promise<Query> }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Explanation searchParams={searchParams} />   {/* awaited inside */}
    </Suspense>
  );
}
```

Awaiting at the top makes the whole page dynamic. Awaiting inside keeps the
shell prerenderable. This is the pattern for every dynamic value.

## Caching read models

Read models in `src/server/queries/` opt in:

```ts
export async function getPosition(): Promise<Position> {
  'use cache';
  cacheTag(...OVERVIEW_TAGS);
  cacheLife('max');
  // ...
}
```

Cached functions **cannot read cookies**, which enforces a useful split: auth is
dynamic and per-request, business data is cached and shared. A cached query that
accidentally depended on the current user would be a data leak, and the
framework makes it impossible.

Tags are named once in
[`src/server/queries/cache.ts`](../../src/server/queries/cache.ts). Reads declare
what they depend on; writes declare what they invalidate. Naming them in one
place is what stops the two halves drifting apart.

## Invalidating

Server Actions call **`updateTag`**, not `revalidateTag`:

```ts
'use server';
export async function receivePurchaseOrder(id: string) {
  await requireWrite();
  // ...
  updateTag(TAGS.purchaseOrders);
  updateTag(TAGS.inventory);
  updateTag(TAGS.ledger);
}
```

`updateTag` gives **read-your-writes** inside the same request: a member who
receives a purchase order sees the new stock level immediately.
`revalidateTag` is stale-while-revalidate — correct for a blog, wrong for
someone who just changed the books and needs to see it took.

`revalidateTag`'s single-argument form is deprecated in Next 16; it now requires
a `cacheLife` profile as the second argument.

## Performance choices worth keeping

- **Sparklines are server-rendered SVG.** `d3-shape` computes a path string; no
  runtime reaches the browser. Four of them appear above the fold, and shipping
  a charting library to draw sixty pixels of line would be absurd.
- **Tables are plain server-rendered markup.** No headless table runtime for
  lists that are read rather than manipulated.
- **Recharts appears once**, in the interactive cash flow chart, code-split by
  the `'use client'` boundary.
- **`next/font`** self-hosts both faces, latin subset only.
- **React Compiler** memoises automatically. Do not hand-write `useMemo` unless
  a profile says to.

## Gotchas

**Do not run `pnpm build` while `next dev` is running.** Next 16 generates route
types into `.next/types` and `.next/dev/types` separately, and `tsconfig.json`
includes both. Two copies of the same global `Route` declarations conflict, and
the failure surfaces as `"/products" is not assignable to type 'Route'` on routes
that plainly exist. Stop the dev server, or `rm -rf .next`.

**A build needs `DATABASE_URL`.** `'use cache'` functions are evaluated at build
time, so they connect. The database client is built lazily behind a Proxy
(`src/server/db/client.ts`) so *importing* a route does not open a connection,
but actually prerendering a cached query does.
