# ADR-0010 — The storefront is `/`; the dashboard moves to `/dashboard`

**Date** 2026-09-01 · **Status** Accepted

## Context

The public catalog ([ADR-0005](0005-catalog-ready-product-schema.md)) shipped
at `/catalog` and `/catalog/[slug]`, in its own `(store)` route group beside
`(app)`, which kept `/`. That was a reasonable default for the first version:
the dashboard existed, the storefront did not, and giving the new thing a
sub-path was the smaller change.

Once both exist, `/` is worth more to the storefront than to the dashboard.
The dashboard's only visitors are the two owners, who will bookmark or type
whatever path it lives at either way. `/` is what a customer, a supplier, or
a search engine follows a link to — and a sign-in-gated dashboard sitting
behind it means the business's actual site, to anyone outside the company,
is a login form.

## Decision

The storefront takes `/`. The dashboard moves to `/dashboard`. Concretely:

- `(store)/catalog/page.tsx` → `(store)/page.tsx`, so the grid is `/`.
- `(store)/catalog/[slug]/page.tsx` → `(store)/p/[slug]/page.tsx`. Not kept at
  `/catalog/[slug]`: once the listing isn't there, a URL still carrying
  `/catalog/` refers to a page that no longer exists. `/p/` is a plain, short
  prefix that means nothing else.
- `(app)/page.tsx` → `(app)/dashboard/page.tsx`.
- `proxy.ts`'s public-path check matches `/` exactly (not as a prefix, or
  every path would count as public) and gains `/p/` in place of `/catalog`;
  the post-login redirect target becomes `/dashboard`.
- Every other place that meant "go to the dashboard" — the sidebar wordmark,
  `/setup`'s post-configuration redirect, `/auth/callback`'s default `next`,
  the login form's own redirect (which now also honours a `?next=` it
  previously ignored, guarded the same way `/auth/callback` already guards
  its own) — points at `/dashboard` instead of `/`. The admin product page's
  "View in catalog" link and the storefront's own internal links move to
  match the new paths.
- The topbar gained a "View catalog" link, since staff still need to reach
  the storefront from inside the dashboard.

The storefront also gained search, a category filter and a sort order on
this same pass — reusing `ListToolbar`/`ListSearch`/`ListFilter` from the
admin lists ([ADR-0009](0009-list-state-in-the-url.md)) rather than building
a parallel set, plus a small fixed-option `CatalogSort` for the one control
those generic pieces don't fit.

## Consequences

- A cold visitor to the business's actual domain sees products, not a
  sign-in form.
- `robots.ts` and `sitemap.ts` exist for the first time, scoped to `/` and
  `/p/*`; every admin path stays disallowed, on top of the root layout's
  existing blanket `noindex`.
- Bookmarks and links to the old `/catalog` now 404 — through
  `(store)/not-found.tsx`, added alongside the existing `(app)` one so that
  a stale link keeps the storefront's own header and footer rather than
  falling through to the bare root 404. Internal — the only consumers were
  staff and the pages this same change updated.

## Alternatives

**Leave the storefront at `/catalog`** — correct the day it shipped, wrong
once it is the thing meant to be found. The whole point of a public catalog
is being where a stranger looks first.

**One route group for both** — would need a per-page choice between the
`(app)` layout's sidebar and the storefront's header, undoing the reason a
layout exists: that a route's chrome follows from where it lives.
