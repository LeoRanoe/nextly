# What Nextly is

An IoT import and resale business operating from Suriname. It buys consumer
devices in USD from Amazon and AliExpress, imports them, and sells locally in
USD and SRD.

Two owners: **Leonardo** and **Youri**. Both hold capital in the business, and
their contributions and draws are tracked in the cash ledger.

At the time this system was built, Nextly had one product line (the Wyze Cam
Pan V3, in two colourways), one purchase order, one customer and one sale. The
system is built for what happens after that, but nothing in it assumes scale
that does not exist.

## How the money works

```
capital in  →  purchase order  →  stock  →  sale  →  cash in
                    ↓                         ↓
              freight, tax, fees        cost of goods
                    ↓                         ↓
              landed unit cost  ────────────→ margin
```

The whole point of the system is the arrow across the bottom. What Nextly pays
to get a unit onto a shelf in Paramaribo — including the shipping and the card
fee — is what that unit costs, and that is what a sale must be measured against.

Revenue less landed cost is **gross profit**. Gross profit less running costs
(marketing, tools, transport) is the **net result**.

## Currency

The books are kept in **USD**, because that is what stock is bought in and what
determines whether a purchase was a good idea. **SRD** is a display currency,
converted at the rate recorded on each transaction.

## What replaced what

This dashboard replaces `Nextly Master Sheet.xlsx`, a twelve-tab Dutch
spreadsheet. Everything that was a formula there is a view or a derived read
model here; everything that was typed there is a table.

Three things changed substantively in the move, all documented in
[../02-data/excel-migration.md](../02-data/excel-migration.md):

1. Two products became one product with two variants.
2. Cost of goods is now real landed cost, which changed the reported margin on
   the only sale from 29.1% to 46.3%.
3. The exchange rate became a dated series, so history stops moving.

## The public catalog

The catalog is the site's home page — `/` and `/p/[slug]`, not `/dashboard`
— see [ADR-0010](../adr/0010-storefront-at-root.md). It reads these same
product rows — `slug`, `summary`, `description`, `specs`, `seo_title`,
`catalog_published` — behind the published filter and its own search,
category and sort, with ledger-derived availability and no cost figure
anywhere. Buying from the site, rather than browsing it, is the open
question; see the [roadmap](roadmap.md).
