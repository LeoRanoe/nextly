# Migrating the Master Sheet

Source: `Nextly Master Sheet.xlsx`, 12 tabs, Dutch.
Imported: 1 September 2026.

The import was **faithful, not corrective**. Where the spreadsheet disagrees
with itself, the disagreement was carried across and reported rather than
quietly resolved, because deciding which of two numbers is the true one is a
business decision, not a migration decision.

---

## Reconciliation report

Three things need a decision from Leonardo and Youri. All three are visible in
the app right now, on the Overview under **Needs attention**.

### 1. PO-001 is booked in the ledger at more than twice its cost

| | |
|---|---|
| `Balans` row 2, 11 Aug 2026, outgoing, "PO-001" | `$294.75` |
| `Inkooporders` PO-001 total | `$147.74` |
| **Difference** | **`$147.01`** |

`$294.75` is also *exactly* Leonardo's opening capital contribution on the same
day, which suggests the row records "the money I put in then spent" rather than
what the order cost. The purchase order itself foots correctly.

**Likely fix:** reduce the ledger entry to `$147.74` and account for the
remaining `$147.01` separately, or split it into two entries. Once corrected,
the app posts purchase payments from the order itself, so this class of drift
cannot recur.

### 2. More cash was received than there are sales to explain

| | |
|---|---|
| `Balans` row 5, 29 Aug 2026, incoming, "Inkomsten" | `$350.00` |
| `Verkopen` confirmed sales (V001 only) | `$220.00` |
| **Difference** | **`$130.00`** |

Either a sale is missing from `Verkopen`, or some of that `$350` was not sales
revenue.

**Likely fix:** record the missing sale. It will move stock and margin as well
as cash, so the difference is not purely cosmetic.

### 3. One expense row is sample data

`Uitgaven` contains a single row labelled **"Voorbeeld: Facebook ads"**,
`$20.00`, Marketing. *Voorbeeld* means *example*.

It was **not imported**. It is currently feeding the `OPERATIONELE KOSTEN` figure
of `$20` on the spreadsheet's own Dashboard, so the app's operating costs read
`$0.00` where the sheet reads `$20.00`. That difference is intentional.

**If the $20 was real,** log it again from the Expenses page.

---

## What changed structurally

### P001 and P002 became one product

The sheet lists "Wyze Cam Pan V3 - Black" and "Wyze Cam Pan V3 - White" as two
products. They are one product in two colourways.

| Sheet | Now |
|---|---|
| P001, P002 | Product `NX-WYZE-PANV3`, "Wyze Cam Pan V3" |
| P001 | Variant `NX-WYZE-PANV3-BLK`, "Black" |
| P002 | Variant `NX-WYZE-PANV3-WHT`, "White" |

This is what lets the future catalog show one product page with a colour
picker, instead of two near-identical listings. Stock, cost and price all live
on the variant.

P002 had no prices in the sheet; it inherited P001's (`$55.00` list, `$38.99`
reference cost) and should be corrected if White is priced differently.

### Cost of goods was recomputed

V001's cost of goods was **not** carried over. The sheet's `$155.96` was priced
at the Amazon list cost; the imported figure is `$118.19`, the weighted-average
landed cost. Gross profit on V001 is therefore `$101.81`, not `$64.04`.

Full working in [cost-accounting.md](cost-accounting.md).

### The exchange rate became a dated series

`Instellingen` holds one rate, `38.5`. It is now a row in `fx_rates` effective
1 January 2026, and every imported transaction stores that rate on itself.

Editing the rate in the sheet silently re-valued all history. It no longer can:
a new rate is a new row, and past transactions keep the rate they were recorded
with.

### Stock became a movement ledger

`Voorraad` was a derived tab. Stock is now the sum of `inventory_movements`, so
the import created two movements — a receipt of 5 from PO-001, and a sale of 4
from V001 — which reproduce the sheet's on-hand figure of 1 while also
explaining it.

---

## Column mapping

**Producten → `products` + `product_variants`**

| Sheet | Column |
|---|---|
| Product ID | *(dropped; `products.code` is the handle now)* |
| Productnaam | `products.name` |
| Categorie | `products.category_id` → `categories` |
| Bron | `products.supplier_id` → `suppliers` |
| Link / URL | `products.source_url` |
| Inkoopprijs per stuk | `product_variants.reference_cost_cents` *(reference only, never values stock)* |
| Verkoopprijs per stuk (USD) | `product_variants.list_price_cents` |
| Verkoopprijs per stuk (SRD) | *(dropped; derived from the USD price and the rate)* |
| Notities | `products.notes` |

**Klanten → `customers`**

`Aantal orders` and `Totaal besteed` were self-maintaining formulas; they are
now the `v_customer_totals` view.

**Inkooporders → `purchase_orders`**

| Sheet | Column |
|---|---|
| PO Nummer | `number` |
| Datum | `ordered_at` |
| Tax / Card fee / Delivery / Shipping / Shipping tax | the five overhead columns |
| Subtotal, Total, Aantal items | *(dropped; all derived from the items)* |
| Status | `status` (`Ontvangen` → `received`) |

**Inkoop Items → `purchase_order_items`**, with `overhead_cents` and
`landed_cost_cents` computed on import. `Prijs per stuk (impliciet)` is dropped;
unit cost is always derived.

**Verkopen → `sales` + `sale_items`.** `Winst (SRD)` is dropped and derived.
`Inkoopprijs per stuk` is replaced by the weighted-average cost snapshot.

**Uitgaven → `expenses`.** One row, sample data, not imported.

**Balans → `ledger_entries`.** All five rows imported verbatim, including the two
discrepancies above, each annotated in `notes`. `Netto` and `Saldo` are dropped
and computed by `v_cash_ledger`.

**Eigenaren, Voorraad, Dashboard** were all derived tabs. They are now the
`v_owner_equity`, `v_stock_levels` and Overview read models.

---

## Verifying the import

These should all still hold. Run them against the database:

```sql
-- Cash balance matches the sheet's KASSALDO of 350.00
SELECT balance_usd_cents FROM v_cash_ledger ORDER BY occurred_at DESC, seq DESC LIMIT 1;
-- → 35000

-- One unit on hand, valued at landed cost rather than list price
SELECT sku, on_hand, value_cents FROM v_stock_levels WHERE on_hand > 0;
-- → NX-WYZE-PANV3-BLK, 1, 2955

-- Real margin on the only sale
SELECT revenue_cents, cogs_cents, gross_cents FROM v_product_margins;
-- → 22000, 11819, 10181

-- Owner split, matching the sheet's 88.05 / 11.95
SELECT full_name, net_cents FROM v_owner_equity ORDER BY net_cents DESC;
-- → Leonardo 29475, Youri 4000
```
