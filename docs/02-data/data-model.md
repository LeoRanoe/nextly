# Data model

Postgres 17. Schema in [`src/server/db/schema/`](../../src/server/db/schema/),
split per domain. Migrations in
[`src/server/db/migrations/`](../../src/server/db/migrations/).

---

## Shape

```
                    ┌───────────┐
                    │ suppliers │
                    └─────┬─────┘
                          │
  ┌────────────┐    ┌─────▼─────┐    ┌──────────────────┐
  │ categories ├───►│ products  ├───►│ product_images   │
  └────────────┘    └─────┬─────┘    └──────────────────┘
                          │
                   ┌──────▼───────────┐
                   │ product_variants │◄──── the unit that is stocked and sold
                   └──┬────────────┬──┘
                      │            │
      ┌───────────────▼──┐      ┌──▼──────────────────┐
      │ purchase_order_  │      │ sale_items          │
      │ items            │      │                     │
      └────────┬─────────┘      └──────────┬──────────┘
               │                            │
      ┌────────▼────────┐          ┌────────▼────────┐     ┌───────────┐
      │ purchase_orders │          │ sales           ├────►│ customers │
      └────────┬────────┘          └────────┬────────┘     └───────────┘
               │                            │
               └────────────┬───────────────┘
                            ▼
        ┌───────────────────────────────────────┐
        │ inventory_movements   (append-only)   │
        │ ledger_entries        (append-only)   │
        └───────────────────────────────────────┘
                            │
                            ▼
        v_stock_levels · v_cash_ledger · v_owner_equity
        v_product_margins · v_customer_totals
```

Everything above the ledgers is a **document**. Everything below is a
**consequence**, posted by the system from the document that caused it.

---

## Conventions

| | |
|---|---|
| Primary keys | `uuid`, `gen_random_uuid()` |
| Money | `bigint`, always suffixed `_cents`, always USD minor units |
| Exchange rates | `bigint`, suffixed `_micros` (rate × 1,000,000) |
| Timestamps | `timestamptz` |
| Casing | `snake_case` in the database, `camelCase` in TypeScript, mapped by Drizzle's `casing: 'snake_case'` |
| Enums | Postgres enums, defined in `schema/enums.ts` |
| Naming | `*_at` for timestamps, `is_*` for booleans, `*_id` for references |

Every foreign key is indexed. Every column a list sorts on is indexed.

---

## Tables

### Identity

**`members`** — a person with access. `id` is our own key; `auth_user_id` links
to Supabase `auth.users` and is null until first sign-in. Keeping them separate
is what lets an owner hold capital in the ledger before ever logging in. See
[../01-architecture/security.md](../01-architecture/security.md).

`role` is `owner | staff | viewer`. `is_principal` is separate: it marks who
appears in the equity split.

**`settings`** — one row, enforced by a unique index on a constant column rather
than by trusting the application.

**`document_sequences`** — gapless numbering for `PO-` and `V`. A Postgres
`SEQUENCE` is deliberately *not* used: sequences are non-transactional and leave
holes when a transaction rolls back, and a purchase order series with gaps is
the first thing anyone auditing the books asks about.

**`activity_logs`** — append-only audit trail.

### Catalog

**`products`** — what a customer recognises. Carries the catalog fields
(`slug`, `summary`, `description`, `specs`, `seo_*`, `catalog_published`) from
day one so the storefront needs no second migration.

**`product_variants`** — what is actually stocked and sold. `list_price_cents`
is a price list, not a historical record: what a sale charged is snapshotted
onto the sale line, so re-pricing never rewrites past invoices.
`reference_cost_cents` is the supplier's list price, kept for reference and
**never** used to value stock.

**`product_images`** — Vercel Blob URLs plus intrinsic dimensions (so
`next/image` causes no layout shift) and a blur placeholder. `blob_pathname` is
stored so the blob can be deleted when the row goes; without it the store
silently accumulates orphans forever.

**`categories`**, **`suppliers`**, **`customers`** — reference data.

### Procurement

**`purchase_orders`** — the five overhead columns (`tax_cents`,
`card_fee_cents`, `delivery_cents`, `shipping_cents`, `shipping_tax_cents`) are
the whole point of this table. They are costs of the goods, not general
expenses.

**`purchase_order_items`** — `subtotal_cents` is the goods; `overhead_cents` is
this line's allocated share; `landed_cost_cents` is the sum and the
authoritative cost basis. The allocation always foots exactly to the order
total.

### Inventory

**`inventory_movements`** — append-only. `quantity` is signed (receipts
positive, sales negative) and `value_cents` moves with the same sign. Stock on
hand is `SUM(quantity)`; stock value is `SUM(value_cents)`. Neither is stored
anywhere.

`kind` is a closed set — `receipt | sale | return | adjustment | write_off` — so
an unexplained change in inventory is impossible to record.

`seq bigserial` gives deterministic ordering: `created_at` is the *transaction*
timestamp, so rows written together share it exactly and cannot break their own
tie.

### Sales

**`sales`** — two snapshots make this table trustworthy years from now.
`fx_rate_micros` is the rate in force when the sale happened, so a later rate
change cannot re-value it. `cogs_cents` is the weighted-average cost consumed at
that moment, so a later purchase at a different price cannot rewrite the margin.

**`sale_items`** — carries `shortfall`, the number of units sold beyond what was
in stock. Surfaced as a critical alert rather than silently allowed.

### Finance

**`fx_rates`** — a dated series, never updated in place. A new rate is a new row
with a later `effective_from`.

**`expenses`** — running costs only. Anything paid to get goods into stock
belongs on the purchase order.

**`ledger_entries`** — append-only, the single record of every movement of money.
`amount_cents` is always positive; `direction` carries the sign. `source_kind`
and `source_id` tie an entry to the document that caused it, which is what stops
the ledger drifting from the documents it describes — the exact failure found in
the spreadsheet.

---

## Views

All created `WITH (security_invoker = true)`. Without it a view runs with its
owner's rights and becomes a hole straight through RLS.

| View | Answers |
|---|---|
| `v_stock_levels` | On hand, value, received, sold, per variant |
| `v_cash_ledger` | Every entry with a running balance, ordered `(occurred_at, seq)` |
| `v_owner_equity` | Contributed, drawn and net capital per principal |
| `v_product_margins` | Units, revenue, cost and gross per product, confirmed sales only |
| `v_customer_totals` | Order count, lifetime spend, gross earned, last order |

---

## What is deliberately not stored

| Not stored | Derived from |
|---|---|
| Stock on hand | `SUM(inventory_movements.quantity)` |
| Stock value | `SUM(inventory_movements.value_cents)` |
| Unit cost | `value_cents / quantity` — often not a whole cent |
| Cash balance | Window function over `ledger_entries` |
| Owner share | Net capital over total net capital |
| Purchase order total | Items plus overhead |
| Customer lifetime value | `v_customer_totals` |
| SRD amounts | The USD amount and the rate on that transaction |

Every one of these was a stored cell in the spreadsheet, and each is a place two
numbers could disagree.
