# Cost accounting

How a unit gets a cost, and how that cost becomes a margin.

Implementation: [`src/server/services/costing.ts`](../../src/server/services/costing.ts).
Tests: [`tests/unit/costing.test.ts`](../../tests/unit/costing.test.ts).

---

## The problem this solves

The Master Sheet priced cost of goods at the product's **list** cost. PO-001
recorded shipping, tax and a card fee in their own columns and then never used
them again. The result is a margin figure that is wrong in two directions at
once, and the error is not small.

### PO-001, worked through

From the `Inkooporders` tab:

| | |
|---|---|
| Goods (5 × Wyze Cam Pan V3, Black) | `$116.97` |
| Tax | `$0.00` |
| Card fee | `$1.05` |
| Delivery | `$0.00` |
| Shipping | `$27.02` |
| Shipping tax | `$2.70` |
| **Order total** | **`$147.74`** |

Overhead to allocate is everything that is not the goods:

```
1.05 + 27.02 + 2.70 = $30.77
```

One line takes all of it, so the landed cost of the line is
`116.97 + 30.77 = $147.74`, and the landed unit cost is:

```
14774 cents / 5 units = 2954.8 cents = $29.548 per unit
```

Note that this is **not a whole number of cents**. That is normal and it is why
unit cost is never stored. See "Why value is the invariant" below.

### V001, the sale

Four of those five units sold for `$55.00` each.

| | Master Sheet | Landed cost |
|---|---|---|
| Cost per unit | `$38.99` (Amazon list) | `$29.548` (what was paid) |
| Cost of goods on 4 units | `$155.96` | `$118.19` |
| Revenue | `$220.00` | `$220.00` |
| **Gross profit** | **`$64.04`** | **`$101.81`** |
| **Gross margin** | **29.1%** | **46.3%** |
| Remaining unit valued at | `$38.99` | `$29.55` |

The spreadsheet understated the profit on this single sale by **`$37.77`**.

It is worth being clear about *why*, because the two effects pull in opposite
directions and it would be easy to assume they cancel:

- Using the Amazon **list** price of `$38.99` instead of the `$23.394` actually
  paid overstates cost. This is the larger effect.
- Ignoring `$30.77` of freight and fees understates cost.

Net, cost was overstated by `$9.44` per unit, so real margin is much better than
the sheet reported. The lesson is not "the sheet was pessimistic" — it is that a
cost basis assembled from the wrong sources will be wrong by an unpredictable
amount and in an unpredictable direction.

---

## Allocating overhead

`allocateOverhead(lines, overheadCents)` splits an order's overhead across its
lines **pro-rata by line value**, using the largest remainder method.

Pro-rata by value, rather than by unit count, because freight cost roughly
tracks what the goods are worth for the small, light electronics Nextly imports.
If Nextly starts shipping something heavy and cheap alongside something light
and expensive, this is the assumption to revisit.

Largest remainder, rather than rounding each share independently, because
independent rounding **leaks cents**. Splitting `$1.00` across three equal lines
gives `33.33…` each; rounding each to `33` loses a cent and the order no longer
foots. Largest remainder floors every share and then hands the leftover cents to
the lines with the largest fractional remainders, so:

```
allocateOverhead(three equal lines, 100) → [34, 33, 33]   // sums to exactly 100
```

A test asserts this holds for every overhead value from 1 to 200 cents across
three unequal lines. An order that does not foot is an order nobody trusts.

Two fallbacks, in order: if every line has zero value (a free or sample
shipment), overhead splits by quantity; if quantity is also zero, it splits
evenly.

---

## Why value is the invariant

Stock is held as:

```ts
type Valuation = { quantity: number; valueCents: Cents };
```

Both integers. Unit cost is **derived**, never stored.

This matters because the true unit cost is frequently not a whole number of
cents — PO-001 lands at exactly `$29.548`. Storing a rounded `2955` and then
multiplying by quantity would drift a little on every transaction, and a ledger
that drifts is a ledger that eventually has to be argued about.

Instead, selling `n` of `q` units removes:

```
cogs = round(valueCents × n / q)
```

and leaves `valueCents - cogs` behind. Selling the entire holding returns
exactly `valueCents` and leaves a clean zero, with no orphaned fraction.

Draining three units bought for `$100.00` one at a time books
`33.33 + 33.34 + 33.33 = $100.00`, not `$99.99`. A test covers precisely this.

The intermediate `valueCents × n` can exceed `2^53`, so `mulDivRound` routes it
through `BigInt` and throws rather than silently losing precision.

---

## Weighted average, and why not FIFO

Cost is **weighted average**: a receipt adds its landed cost to the pool, and a
sale removes the pool's average share.

FIFO would be more precise when purchase prices swing, and it is what an
accountant would eventually want for tax. It was not chosen now because it
requires holding cost layers per receipt and consuming them in order, which is
materially more machinery for a business with one product and one purchase
order.

The migration path is deliberately open: `inventory_movements` already records
the cost of every individual receipt, so the layers can be reconstructed from
history whenever FIFO is worth it. Nothing needs to be back-filled.

See [adr/0003-landed-cost-and-weighted-average.md](../adr/0003-landed-cost-and-weighted-average.md).

---

## Overselling

`consumeStock` permits selling more than is on hand, and reports how much
through `shortfall`. It does not throw.

This is a judgement call in favour of matching reality. Stock is sometimes sold
before its receipt has been entered, and an app that refuses to record a sale
that actually happened trains people to work around it. Instead the sale is
recorded, `sale_items.shortfall` remembers how many units were uncovered, stock
goes negative, and the Overview raises it as a critical alert. The books stay
honest and someone gets told.

---

## Where each number ends up

| Figure | Column | Written when |
|---|---|---|
| Line overhead share | `purchase_order_items.overhead_cents` | Order marked received |
| Line landed cost | `purchase_order_items.landed_cost_cents` | Order marked received |
| Stock added | `inventory_movements` (`kind = 'receipt'`) | Order marked received |
| Cost consumed | `sale_items.cogs_cents` | Sale confirmed |
| Stock removed | `inventory_movements` (`kind = 'sale'`) | Sale confirmed |
| Margin | `sales.gross_profit_cents` | Sale confirmed |

Stock on hand and stock value are never written directly. They are
`SUM(inventory_movements)`, exposed through the `v_stock_levels` view.
