# Rendering and caching

Next.js 16 Cache Components. **Nothing is cached**, deliberately — see
[ADR-0006](../adr/0006-cache-components-and-tags.md) for how that was learned
the hard way.

---

## The model

`cacheComponents: true` inverts the old App Router default. Every page, layout
and route handler executes at request time **unless** a function opts in with
`'use cache'`.

Nothing opts in. Read models in `src/server/queries/` are plain async functions.

That is the right posture for these books: every figure is live, every write
touches most of them, and there are two or three users. The one thing caching
reliably bought was a build that could not run without a database — which is
exactly how the first Vercel deploy failed.

## Where each route lands

| Route | Mode | Why |
|---|---|---|
| `/login`, `/setup`, `/design-system` | **Static** | No data at all. |
| `/auth/error`, `/no-access`, `/products/[id]` | **Partial prerender** | Static shell paints instantly; only the part reading `searchParams` or the session streams in. |
| `/auth/callback` | Dynamic | A route handler that exchanges a code. |
| Everything under `(app)` | **Dynamic** (`instant = false`) | Explained below. |

### Why the dashboard is dynamic

The `(app)` layout calls `requireMember()`, which reads cookies before anything
renders. Cache Components correctly refuses to prerender that.

Deferring the guard into a Suspense boundary would restore a static shell — and
would also let a signed-in non-member begin rendering page content before the
guard resolved. That trade is wrong: a login-gated dashboard gains little from
a prerendered shell and loses a great deal from a guard that runs late.

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

### No `loading.tsx`, anywhere — deliberate

Every page already wraps its data in `<Suspense>` with a skeleton sized to
match, which is what streams the *table*, the *chart*, the *panel* in behind
a static shell. A route-level `loading.tsx` would compete with that: at
`(app)/loading.tsx` it would replace the **entire shell** — sidebar and
topbar included — with one fallback on every navigation, discarding the
per-widget streaming the Overview is built around for something coarser. The
same mistake at smaller scale applies to any single route's `loading.tsx`.
So there are none, on purpose, and the per-widget `<Suspense>` boundaries
above are the actual answer to "what does someone see while this loads".

## Error and not-found boundaries

Five files, split by which shell they need to preserve:

| File | Covers | Why here |
|---|---|---|
| `src/app/global-error.tsx` | A throw in the root layout itself | The only boundary that replaces `<html>`/`<body>` entirely — `ThemeProvider` and the font providers in `src/app/layout.tsx` never ran, so it cannot depend on either. Inline-styled, no Tailwind classes. |
| `src/app/error.tsx` | The public routes (`/login`, `/setup`, `/no-access`, `/auth/error`, `/design-system`) | Root layout rendered fine; a page below it threw. |
| `src/app/not-found.tsx` | A dead URL outside `(app)` | Mistyped or stale link, no session to speak of. |
| `src/app/(app)/error.tsx` | Any of the 17 routes under the shell | Renders **inside** the `(app)` layout, so the sidebar and topbar survive. Every route here is fully dynamic and hits the database on every request (see "Where each route lands" above), so a dropped connection is a live failure path, not a theoretical one — and the copy says so, deliberately unlike the setup banner below. |
| `src/app/(app)/not-found.tsx` | `notFound()` calls from inside the shell | The highest-value of the five: before it existed, `notFound()` in `products/[id]:42` fell through to the root 404, stranding the visitor with no sidebar and no way back. Every future detail route's `notFound()` lands here too. |

## Freshness after a write

`router.refresh()` in the form, after the action resolves. The page re-renders
on the server and re-queries. There is no cache to invalidate, so there is no
second mechanism that can disagree with the first.

## The setup state

Read models return empty **only when `DATABASE_URL` is absent**, never when a
query fails. That distinction is the whole point: an absent connection string
is a setup state, a failing query is an incident, and an empty dashboard must
never be able to mean the second one. A banner and `/setup` say which it is.

## Performance choices worth keeping

- **Sparklines are server-rendered SVG.** `d3-shape` computes a path string; no
  runtime reaches the browser. Four appear above the fold, and shipping a
  charting library to draw sixty pixels of line would be absurd.
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
the failure surfaces as `"/products" is not assignable to type 'Route'` on
routes that plainly exist. Stop the dev server, or `rm -rf .next`.

**Dynamic routes need `as Route`.** `typedRoutes` cannot verify a template
literal, so `` href={`/products/${id}` as Route} `` is the escape hatch.

**A build must never need the database.** It does not today, and that is worth
protecting. To check after any change:

```bash
DATABASE_URL="postgresql://u:p@203.0.113.9:6543/postgres" pnpm build
```

`203.0.113.0/24` is reserved and unroutable, so if the build completes, nothing
in it reached for Postgres.
