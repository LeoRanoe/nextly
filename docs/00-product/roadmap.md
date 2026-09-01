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
| **Auth** | Email link sign-in, invite claiming, `/no-access`, role guards |
| **Shell** | Sidebar, topbar, ⌘K command palette, theme toggle |
| **Overview** | Position strip with server-rendered sparklines, cash flow chart, margin waterfall, inventory health, owner equity, and the alerts panel that independently rediscovered both spreadsheet discrepancies |
| **List pages** | Products, Inventory, Purchase orders, Sales, Customers, Ledger, Expenses, Owners, Categories, Suppliers, Settings |

## Next

**1. Entry forms and Server Actions.** The five `/new` routes are honest
placeholders today. Each needs a form and a transactional Server Action:

- **Record a sale** — the highest-frequency action, and the one worth the most
  care. Customer combobox with create-inline, line items priced from the price
  list, USD/SRD toggle at the live rate, and a live margin readout as you type.
  One submit writes the sale, its items, the inventory movements and the ledger
  entry in a single transaction.
- **Raise and receive a purchase order** — the core value-add. Receiving
  allocates overhead, writes landed cost, creates stock receipts and posts the
  cash entry, atomically.
- **Add a product** with variants and the Blob image manager.
- **Log an expense**, **record a cash movement**.

**2. Detail pages.** `/products/[id]`, `/purchase-orders/[id]`,
`/sales/[id]`, `/customers/[id]`.

**3. Image upload.** Design is written in
[../04-engineering/media-pipeline.md](../04-engineering/media-pipeline.md);
needs a Blob store provisioned.

**4. Reports.** Profit and loss over a period, margin ranked by product, FX
exposure. Everything they need is already in the ledgers.

**5. Filtering and date ranges.** `nuqs` is installed; the topbar date scope
should propagate to every widget through the URL.

**6. Playwright smoke test.** Sign in → create a product → receive an order →
record a sale → assert stock, COGS and the ledger all moved correctly.

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
