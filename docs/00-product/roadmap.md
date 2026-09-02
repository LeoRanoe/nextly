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
| **Overview** | Position strip with server-rendered sparklines, cash flow chart, period-aware margin waterfall, inventory health, owner equity, margin leaders, the recent-activity feed that reads back the audit trail, and the alerts panel that independently rediscovered both spreadsheet discrepancies |
| **List pages** | Products, Inventory, Purchase orders, Sales, Customers, Ledger, Expenses, Owners, Categories, Suppliers, Settings — every one searchable, filterable, sortable and paginated, state kept in the URL ([ADR-0009](../adr/0009-list-state-in-the-url.md)), two distinct empty states (onboarding vs. no-matches) |
| **Write layer** | Server Actions with an authorisation boundary that cannot be forgotten, transactional posting, gapless numbering |
| **Entry flows** | Record a sale with live margin, raise and receive a purchase order with a landed-cost preview, create and edit products with variants, customers, expenses, cash movements, categories, suppliers, exchange rates, team invitations, stock adjustments |
| **Full CRUD** | Every entity — products, categories, suppliers, customers, expenses, sales and purchase order drafts — can be created, edited and deleted, not just created. Deletes are owner-only, matching the RLS policy behind them; a supplier with open purchase orders or a customer with non-void sales refuses deletion with a legible reason instead of silently orphaning references |
| **Detail pages** | `/sales/[id]`, `/purchase-orders/[id]` (with the full overhead breakdown — subtotal, allocated shipping and tax, landed cost, landed cost per unit, footing to the total), `/customers/[id]`, `/suppliers/[id]`, alongside the existing `/products/[id]`. Each carries an activity trail and, for drafts, an in-place edit |
| **Reports** | Profit and loss with a prior-period comparison, margin ranked by product (lifetime — `v_product_margins` has no date scope), FX exposure with unrealised gain/loss and an SRD share of revenue and cash |
| **Product images** | Upload via a client token to `@vercel/blob`, 1600px AVIF display and 400px WebP thumbnail derivatives, reorder, set primary, owner-only delete. Designed to work locally too: the client `upload()` result calls a server action directly, since the `onUploadCompleted` webhook cannot reach a machine behind NAT |
| **Row actions** | Three tiers of destructive friction: a written reason for anything that removes a posting (void, cancel, reverse), a confirm dialog for a delete that only orphans references, no prompt for a reversible flip (mark shipped, archive) |
| **Returns** | Return items from a confirmed sale, in the ledger's own idiom: the sale row is never rewritten, the goods come back in at the cost they left at (`movement_kind.return`), the refund goes out in the currency it arrived in at the rate the sale fixed (`ledger_category.refund`), and `sale_items.quantity_returned` caps what can still come back. Partial returns foot exactly, because each share is a cumulative portion of the line. P&L and the waterfall report net of returns. Written reason required — the same tier of friction as void and reversal |
| **Public catalog** | `/` and `/p/[slug]` — the site's home page ([ADR-0010](../adr/0010-storefront-at-root.md)), the dashboard moved to `/dashboard` to make room. Its own route group: no auth guard, no cost figure selected anywhere, everything filtered on `catalog_published AND status = 'active'` by the queries themselves. Search, category and sort reuse the admin lists' own `ListToolbar`. Same rows, same ledger-derived availability the dashboard sees — the two cannot disagree |
| **Mobile tables** | Every dense list (the eleven admin ones, plus the line-item and order-history tables inside the four detail pages) renders a card list below `lg` instead of a `<table>` forced into horizontal scroll |
| **Testing** | A Playwright smoke test (`pnpm e2e`) walks the full workflow through the interface — create a product, receive a purchase order, sell it, and assert stock, landed cost and each document's own ledger entry all moved by the right amount |

## Then

The catalog is browsable; buying from it is the open question — checkout and
fulfilment, if and when the business wants orders to arrive through the site
rather than over the counter. The deliberately deferred list below is the
standing shortlist for everything else.

## Deliberately deferred

| | Why |
|---|---|
| **FIFO costing** | Weighted average is enough for one product line. `inventory_movements` records every receipt's cost, so layers can be reconstructed with no back-fill when it matters. |
| **Multi-location stock** | One location today. `inventory_movements` would take a `location_id`. |
| **Supplier payment terms / partial payments** | Orders are paid in full on card. |
| **Barcode scanning** | `product_variants.barcode` exists and is unused. |
| **Multi-currency purchasing** | Everything is bought in USD today. `purchase_orders` already carries `currency` and `fx_rate_micros`. |
| **Real branding** | The wordmark is a provisional type lockup and one file to replace. |
