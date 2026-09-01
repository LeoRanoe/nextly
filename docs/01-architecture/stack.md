# Stack

Chosen September 2026. Every version below is what is actually installed —
check `package.json` before trusting this file.

---

## Core

| | Version | Why this |
|---|---|---|
| **Next.js** | 16.3.4 | Active LTS until October 2027. Turbopack is stable and now the default bundler. |
| **React** | 19.2.8 | Ships with Next 16. View Transitions, `<Activity>`, `useEffectEvent`. |
| **React Compiler** | 1.0 (stable) | Automatic memoisation. Costs build time, buys render time on the chart-heavy Overview. Enabled in `next.config.ts`. |
| **TypeScript** | 7.0 | `strict` plus `noUncheckedIndexedAccess`. The latter caught every unguarded database column access. |
| **Tailwind CSS** | v4.3 | CSS-first `@theme`, no JS config file. Tokens live in `src/styles/tokens.css`. |
| **Biome** | 2.5 | Lint and format in one fast tool. `next lint` was removed in Next 16, so ESLint had no incumbency. |
| **pnpm** | 10.15 | |

## Data

| | Version | Why this |
|---|---|---|
| **Supabase Postgres** | 17 | Managed Postgres with auth and RLS in the box. Project `Nextly`, region `us-east-1`. |
| **Drizzle ORM** | 0.45 | ~33 KB, no codegen step, SQL-shaped. |
| **postgres-js** | 3.4 | Driver. `prepare: false` is mandatory on Supabase's transaction pooler. |
| **Zod** | v4 | Validation, shared between Server Actions and forms. |

**Region:** `us-east-1`, not South America. The dashboard is server-rendered, so
what matters is the Vercel function → database hop (Vercel defaults to `iad1`,
also us-east-1), not the distance to Suriname. Co-locating them beats shortening
the browser hop, because the browser makes one round trip and the server makes
several.

**Drizzle over Prisma.** Prisma's ~800 KB query engine hurts serverless cold
starts, and its `prisma generate` step fights Turbopack's fast refresh. Drizzle
has neither, and its query builder stays close enough to SQL that the aggregate
reports in `src/server/queries/` can just *be* SQL where that is clearer.

## Interface

| | Version | Why this |
|---|---|---|
| **Radix UI** | 1.x / 2.x | Behaviour and accessibility. Our own visual layer on top. Six primitives in use: alert-dialog, dialog, dropdown-menu, popover, slot, visually-hidden. |
| **shadcn/ui** | as source | Owned and re-skinned, never installed as a dependency. |
| **Recharts** | 3.10 | One chart: the interactive cash flow. Everything stock about it is overridden. |
| **d3-shape** | 3.2 | Sparklines, rendered as SVG **on the server**. No client JS at all. |
| **cmdk** | 1.1 | Command palette. |
| **nuqs** | 2.10 | URL as state for filters, sorting and pagination on every list. See [ADR-0009](../adr/0009-list-state-in-the-url.md). |
| **next-safe-action** | 8.6 | Validated, middleware-powered Server Actions. |
| **lucide-react** | 1.38 | Icons. |
| **@vercel/blob** | 2.8 | Product image storage — `putImage()` derivatives, uploaded via a client token. See [media-pipeline.md](../04-engineering/media-pipeline.md). |
| **@vercel/analytics**, **@vercel/speed-insights** | 2.0 | Mounted in the root layout. No-op outside a Vercel deployment. |

### Fonts, and what they are avoiding

**Instrument Sans** for interface text, **JetBrains Mono** for every number.

Inter and Geist were rejected on purpose. Both are excellent typefaces and both
are the visual signature of a generated dashboard — a reader recognises the
default before they read a word. Instrument Sans has enough character to read as
a choice without costing legibility at 11px.

### Not chosen

| | Why not |
|---|---|
| **TanStack Table** | The list pages are read far more than manipulated. Server-rendered `<table>` markup ships zero JS. It will earn its place on a grid that needs real client-side interaction. |
| **Tremor** | Good components, but its look *is* the product. Adopting it means adopting a template. |
| **Prisma** | Bundle size and the codegen step. |
| **Better Auth** | Genuinely strong, and the right answer off Supabase. Here, Supabase Auth means RLS keys off `auth.uid()` for free. |
| **A CSS-in-JS library** | Tailwind v4 tokens already give a themeable system with no runtime. |

---

## Rendering

`cacheComponents: true` in `next.config.ts`. Everything is dynamic unless
explicitly marked `'use cache'`. See
[rendering-and-caching.md](rendering-and-caching.md).

---

## Layout

```
src/
  app/
    (app)/            authenticated dashboard; instant = false
    login/  no-access/  auth/   public, partially prerendered
    design-system/    living style documentation, 404 in production
  components/
    ui/               primitives: Button, Surface, Money, Table, Pagination, AlertDialog
    patterns/         compositions: PageHeader, EmptyState, ListToolbar
    forms/            create/edit sheets and pages, one per entity
    reports/          P&L, margin-by-product, FX exposure
    shell/            Sidebar, Topbar, CommandPalette, Wordmark
    charts/           server-rendered SVG
    overview/         one file per dashboard widget
  lib/                money, fx, format, navigation, cn, env, list-params
  server/
    db/schema/        Drizzle, split per domain
    db/migrations/    generated SQL + hand-written RLS
    queries/          read models — dynamic, no cache tags (ADR-0006)
    services/         domain logic (costing, posting, media)
    actions/          Server Actions, one file per entity
    auth.ts           the authorisation boundary
  styles/tokens.css   the entire colour system
```

The rule: `components/ui` knows nothing about Nextly. `components/overview`
knows everything. Anything in between goes in `patterns`.
