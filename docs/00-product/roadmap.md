# Roadmap

Status as of 1 September 2026.

---

## Done

| | |
|---|---|
| **Foundation** | Next 16.3 + React 19.2 + Tailwind v4 + Biome, React Compiler and Cache Components on |
| **Money core** | Integer cents, FX with per-transaction rates, landed-cost allocation, weighted-average COGS — 37 passing tests, fixtures locked to the real PO-001 and V001 figures |
| **Database** | Supabase project `Nextly`, 19 tables, 11 enums, 5 views, RLS on everything, zero security advisories |
| **Migration** | Master Sheet imported, P001/P002 merged into variants, reconciliation report written |
| **Design system** | Instrument language, both themes, `/design-system` living reference |
| **Auth** | Supabase password sign-in, invite claiming by email, `/no-access`, role guards |
| **Shell** | Sidebar, topbar, ⌘K command palette, theme toggle |
| **Overview** | Position strip with server-rendered sparklines, cash flow chart, margin waterfall, inventory health, owner equity, and the alerts panel that independently rediscovered both spreadsheet discrepancies |
| **List pages** | Products, Inventory, Purchase orders, Sales, Customers, Ledger, Expenses, Owners, Categories, Suppliers, Settings — every one searchable, filterable, sortable and paginated, state kept in the URL ([ADR-0009](../adr/0009-list-state-in-the-url.md)), two distinct empty states (onboarding vs. no-matches) |
| **Write layer** | Server Actions with an authorisation boundary that cannot be forgotten, transactional posting, gapless numbering |
| **Entry flows** | Record a sale with live margin, raise and receive a purchase order with a landed-cost preview, create and edit products with variants, customers, expenses, cash movements, categories, suppliers, exchange rates, team invitations, stock adjustments |
| **Full CRUD** | Every entity — products, categories, suppliers, customers, expenses, sales and purchase order drafts — can be created, edited and deleted, not just created. Deletes are owner-only, matching the RLS policy behind them; a supplier with open purchase orders or a customer with non-void sales refuses deletion with a legible reason instead of silently orphaning references |
| **Detail pages** | `/sales/[id]`, `/purchase-orders/[id]` (with the full overhead breakdown — subtotal, allocated shipping and tax, landed cost, landed cost per unit, footing to the total), `/customers/[id]`, `/suppliers/[id]`, alongside the existing `/products/[id]`. Each carries an activity trail and, for drafts, an in-place edit |
| **Reports** | Profit and loss with a prior-period comparison, margin ranked by product (lifetime — `v_product_margins` has no date scope), FX exposure with unrealised gain/loss and an SRD share of revenue and cash |
| **Product images** | Upload via a client token to `@vercel/blob`, 1600px AVIF display and 400px WebP thumbnail derivatives, reorder, set primary, owner-only delete. Designed to work locally too: the client `upload()` result calls a server action directly, since the `onUploadCompleted` webhook cannot reach a machine behind NAT |
| **Row actions** | Three tiers of destructive friction: a written reason for anything that removes a posting (void, cancel, reverse), a confirm dialog for a delete that only orphans references, no prompt for a reversible flip (mark shipped, archive) |
| **Testing** | A Playwright smoke test (`pnpm e2e`) walks the full workflow through the interface — create a product, receive a purchase order, sell it, and assert stock, landed cost and each document's own ledger entry all moved by the right amount |

## Then

**The public catalog.** The schema is ready: `catalog_published`, `slug`,
`summary`, `specs`, `seo_*` and `product_images` all exist. The storefront reads
these same rows behind a published filter — no second migration, no second
source of truth for price or availability.

Likely a separate route group in this app rather than a separate deployment, so
the catalog and the dashboard cannot disagree about what is in stock.

## Deliberately deferred

| | Why |
|---|---|
| **FIFO costing** | Weighted average is enough for one product line. `inventory_movements` records every receipt's cost, so layers can be reconstructed with no back-fill when it matters. |
| **Multi-location stock** | One location today. `inventory_movements` would take a `location_id`. |
| **Supplier payment terms / partial payments** | Orders are paid in full on card. |
| **Returns** | The `movement_kind` enum already has `return`; no workflow behind it yet. |
| **Barcode scanning** | `product_variants.barcode` exists and is unused. |
| **Multi-currency purchasing** | Everything is bought in USD today. `purchase_orders` already carries `currency` and `fx_rate_micros`. |
| **Real branding** | The wordmark is a provisional type lockup and one file to replace. |
