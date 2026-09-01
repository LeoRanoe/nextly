# ADR-0009 — List state lives in the URL

**Date** 2026-09-01 · **Status** Accepted

## Context

Every list page (Products, Inventory, Sales, Purchase orders, Customers,
Ledger, Expenses, Categories, Suppliers) shipped with a hardcoded `LIMIT 200`
that no caller could override, no search, no sort beyond an implicit
`ORDER BY created_at desc`, and no filter. Row 201 of the ledger was
permanently unreachable, and finding one sale meant scrolling.

Fixing that meant answering three separate questions: where search, sort,
filter and page state lives; how a list query composes its SQL from that
state; and how pagination is computed and rendered. This ADR is the answer to
all three, because the choices are coupled — the state model decides what the
SQL layer has to accept, and the SQL layer decides what the pagination model
can promise.

## Decision

### State lives in the URL, via `nuqs`

Search (`q`), filter selects, `sort`, `dir` and `page` are all query
parameters, read with `nuqs`'s `useQueryState`/`useQueryStates`. A list is a
link: reload, share, or back-button through it and you land on the same rows.

Sort headers and pagination links are plain server-rendered `<Link>`s
(`<THSort>` in `src/components/ui/table.tsx`, `src/components/ui/
pagination.tsx`) — zero client JS, composes with `typedRoutes`. Only search
(`<ListSearch>`, throttled 300ms) and filter selects (`<ListFilter>`), in
`src/components/patterns/list-toolbar.tsx`, are client components, because
only those two genuinely need to react to keystrokes/selection without a full
navigation. Both write with `shallow: false` (forces the server to
re-render, since there is no client-side row cache to update from) and
`history: 'replace'`, and both reset `page` to 1 — a filter that leaves you
on page 7 of a 2-page result is the bug this is written to avoid.

**Conflict resolved in the same change:** `useUrlSheet` (which opens create/
edit sheets via a URL flag) already built its next URL from a
`useSearchParams()` snapshot and called `router.replace` directly. Two
uncoordinated writers to the same URL — a sheet closing mid-flight racing a
throttled search update — is a bug that reproduces intermittently and is
miserable to debug from a report. `useUrlSheet` was reimplemented on top of
`useQueryState` behind its **identical** exported signature
(`[boolean, (open: boolean) => void]`), so all six existing callers needed no
changes, and there is now exactly one writer.

Query-param names are reserved deliberately: sheet keys (`new`,
`new-customer`, `new-category`, `new-supplier`, `invite`) don't collide with
list state (`q`, `status`, `from`, `to`, `sort`, `dir`, `page`), and detail
pages use `editing` rather than `edit`, leaving `?edit=<uuid>` free for a
possible future row-edit-in-place. The reserved list is kept as a comment in
`src/lib/use-url-sheet.ts`.

### Offset pagination, not cursor

Lists are hundreds of rows now, low thousands in five years — the regime
where `OFFSET n` costs nothing and a cursor buys nothing back. Offset gives
page numbers and a total the footer wants to print (`Page 3 of 11`); cursor
pagination cannot express that and needs a composite cursor the moment a list
sorts on more than one column, which every list here does (most sort keys are
"X, then created_at" for a stable order). Revisit only if a single list nears
~100k rows — nothing here is close.

`src/server/queries/paginate.ts` defines `Page<T> = { rows, total, page,
perPage, pageCount }`, `clampPage`/`clampPerPage` (garbage input degrades to
page 1 / the default size, never a 500), and `toPage()`, which assembles a
`Page<T>` from rows that each already carry the total via
`COUNT(*) OVER() AS total_count` — one round trip per page, and the count can
never disagree with the rows because it comes from the same scan.

### SQL composes as fragments, never strings

Each list query in `src/server/queries/lists.ts` (and `reference.ts`) builds
its `WHERE` from `SQL` fragments joined with `` sql.join(conditions, sql`
AND `) ``, and its `ORDER BY` from a `Record<SortKey, SQL>` whitelist with a
fallback — a hand-edited or stale URL degrades to the default sort rather
than erroring. `sql.raw()` never touches user input. Search is
`` ILIKE '%' || ${term} || '%' ``; at a few hundred rows a sequential scan
beats maintaining an index, which is noted in the query's own comment before
someone "optimises" it.

`src/lib/list-params.ts` holds one Zod schema per list (`saleQuerySchema`,
`productQuerySchema`, …), every field using `.catch()` so a malformed URL
renders page 1 with defaults instead of failing the page.

### Two empty states, not one

`total === 0 && !hasFilters` is the onboarding empty state ("no sales
recorded yet, here's how to record one"). `rows.length === 0` with filters
active is "no sales match these filters" plus a clear-filters link. Collapsing
these into one state means an owner filtering to a quiet month reads "no
sales recorded yet" about a business that has sales — which is a worse bug
than the missing pagination this ADR set out to fix.

### Not chosen: a client table library

TanStack Table was installed early in the project and never adopted (removed
entirely once C20 confirmed it): these lists are read far more than
manipulated, a server-rendered `<table>` ships zero JS for sorting and
pagination, and a headless table runtime earns its place on a grid that needs
real client-side interaction — drag-reorder, inline edit, virtualisation —
none of which any list here does.

## Consequences

- A list URL is a durable link. Bookmarking, sharing or reloading page 4 of
  filtered sales lands back on page 4 of filtered sales.
- Sorting and paging cost no client JS; only search and filter selects do.
- `Page<T>` is a breaking return-type change, which is why it landed on one
  list (`/sales`) first as the reference conversion before the other ten
  adopted the shape.
- The whitelist-`ORDER BY` and `.catch()`-everywhere pattern means a
  hand-crafted or stale query string can never 500 a list page — it just
  falls back to the default view.
- `useUrlSheet` has exactly one implementation and one writer to the URL, so
  a sheet and a list filter on the same page cannot race each other.
