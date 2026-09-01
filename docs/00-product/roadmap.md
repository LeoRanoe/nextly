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
| **List pages** | Products, Inventory, Purchase orders, Sales, Customers, Ledger, Expenses, Owners, Categories, Suppliers, Settings |
| **Write layer** | Server Actions with an authorisation boundary that cannot be forgotten, transactional posting, gapless numbering |
| **Entry flows** | Record a sale with live margin, raise and receive a purchase order with a landed-cost preview, create and edit products with variants, customers, expenses, cash movements, categories, suppliers, exchange rates, team invitations, stock adjustments |
| **Row actions** | Confirm and void sales, mark shipped, cancel orders, reverse ledger entries, delete expenses, remove members — destructive ones gated behind a written reason |

## Next

**1. Detail pages.** `/purchase-orders/[id]`, `/sales/[id]`, `/customers/[id]`.
The product page already exists and the other three follow its shape.

**2. Image upload.** Designed in
[../04-engineering/media-pipeline.md](../04-engineering/media-pipeline.md);
needs a Blob store provisioned. Two constraints are already established:
`putImage()` needs OIDC rather than a read-write token, and
`onUploadCompleted` never fires on localhost.

**3. Reports.** Profit and loss over a period, margin ranked by product, FX
exposure. Everything they need is already in the ledgers.

**4. Filtering and date ranges.** `nuqs` is installed and the sheets already
keep their state in the URL; the topbar date scope should propagate to every
widget the same way.

**5. Playwright smoke test.** Sign in, create a product, receive an order,
record a sale, and assert stock, cost of goods and the ledger all moved. The
logic is unit-tested and has been replayed against the live database by hand;
this closes the loop through the interface.

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
