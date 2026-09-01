# Glossary

The Master Sheet is in Dutch and the application is in English. This table is
the mapping, and it is the fastest way to answer "where did this tab go?".

## Tabs → screens

| Dutch tab | English | Where it lives now |
|---|---|---|
| Dashboard | Overview | `/` |
| Instellingen | Settings | `/settings` |
| Producten | Products | `/products` |
| Klanten | Customers | `/customers` |
| Inkooporders | Purchase orders | `/purchase-orders` |
| Inkoop Items | Purchase order items | Lines within a purchase order |
| Verkopen | Sales | `/sales` |
| Uitgaven | Expenses | `/expenses` |
| Balans | Cash ledger | `/ledger` |
| Eigenaren | Owners | `/owners` |
| Voorraad | Inventory | `/inventory` |
| Lees Mij | Read me | This documentation |

## Terms

| Dutch | English | Note |
|---|---|---|
| Inkoop | Purchase | |
| Inkooporder | Purchase order | Abbreviated PO |
| Inkoopprijs | Cost price | The sheet's list cost, **not** what values stock here |
| Verkoop | Sale | |
| Verkoopprijs | Sale price | |
| Voorraad | Stock, inventory | |
| Voorraadwaarde | Stock value | At landed cost |
| Winst | Profit | Gross profit unless stated |
| Omzet | Revenue | |
| Kassaldo | Cash balance | |
| Uitgaven | Expenses | Running costs only, never cost of goods |
| Eigen investering | Owner contribution | `ledger_entries.category = 'owner_contribution'` |
| Inzet | Stake, capital | |
| Aandeel | Share | Percentage of net capital |
| Netto inzet | Net capital | Contributions less draws |
| Wisselkoers | Exchange rate | |
| Verzendkosten | Shipping costs | On a PO these become part of landed cost |
| Betaalmethode | Payment method | |
| Inkomend / Uitgaand | Incoming / Outgoing | `ledger_entries.direction` |
| Besteld | Ordered | PO status |
| Verzonden | Shipped | PO status |
| Ontvangen | Received | PO status; triggers cost allocation |
| Geannuleerd | Cancelled | PO status |
| Bron | Source, supplier | |
| Categorie | Category | |
| Aantal | Quantity | |
| Notities | Notes | |
| Voorbeeld | Example | Marked sample data in the sheet; not imported |

## Terms this system introduces

| Term | Meaning |
|---|---|
| **Landed cost** | What a unit actually cost to get into stock: its share of the goods plus its allocated share of freight, tax and fees. |
| **Overhead allocation** | Splitting a purchase order's non-goods costs across its lines, pro-rata by value. |
| **Weighted average cost** | The valuation method. Stock is a pool of `{ quantity, value }`; a sale removes the average share. |
| **Movement** | One row in the append-only inventory ledger. Stock on hand is the sum of these. |
| **Variant** | The thing actually stocked and sold. "Wyze Cam Pan V3" is a product; "Black" is a variant. |
| **Principal** | An owner who appears in the equity split. Distinct from the `owner` role. |
| **Drift** | A disagreement between the cash ledger and the documents it should reflect. The Overview checks for it. |
