# Money and foreign exchange

Implementation: [`src/lib/money.ts`](../../src/lib/money.ts),
[`src/lib/fx.ts`](../../src/lib/fx.ts).
Tests: [`tests/unit/money.test.ts`](../../tests/unit/money.test.ts),
[`tests/unit/fx.test.ts`](../../tests/unit/fx.test.ts).

---

## Rule 1: every amount is an integer

No float ever touches the books. Every monetary column is a `bigint` of minor
units — USD cents — and every rate is a `bigint` of micro-units.

`0.1 + 0.2 !== 0.3` in IEEE 754. On one line item nobody notices; across a
year of purchase orders it is the reason a ledger stops footing and nobody can
say when it started.

In TypeScript amounts are `number`, not `bigint`. JS integers are exact to
2^53, which is about `$90 trillion` in cents, and `bigint` would make every
JSON boundary and React prop awkward for no gain at this scale. The database
column is `bigint`; Drizzle maps it back with `mode: 'number'`. Where an
intermediate product could exceed 2^53 — `value × quantity` in a weighted
average — `mulDivRound` routes through `BigInt` and throws rather than silently
degrading.

### Parsing

`parseMoney('29.548')` → `2955`. It splits on the decimal point and does integer
arithmetic on the digits; it never calls `parseFloat`. The discarded digit
rounds half-up.

```ts
parseMoney('38.99')     // 3899
parseMoney('23.394')    // 2339   (23.394 → 2339.4 → 2339)
parseMoney('1,234.50')  // 123450
parseMoney('-40')       // -4000
parseMoney('')          // 0
parseMoney('abc')       // throws TypeError
```

### Rounding

Half **away from zero**, not banker's rounding.

Banker's rounding is right for large statistical aggregates, where it avoids
bias. It is wrong for individual commercial documents, where it makes a single
invoice look inexplicably a cent off from what anyone would compute by hand.
`mulDivRound(10, 1, 4)` is `3`, and `mulDivRound(-10, 1, 4)` is `-3`.

---

## Rule 2: the rate lives on the transaction

USD is the base currency and the books are kept in USD cents. SRD is a
quotation.

Rates are stored as integer **micro-units**: `38.5 SRD/USD` is `38_500_000`.
That makes conversion exact integer arithmetic instead of a float multiply.

```ts
fromBase(parseMoney('55.00'), parseRate('38.5'))  // 211750 → SRD 2,117.50
toBase(parseMoney('2117.50'), parseRate('38.5'))  //   5500 → USD 55.00
```

Both directions round-trip on the sheet's own figures, which is asserted in the
tests.

### Why `fx_rates` is a series, not a setting

The spreadsheet holds a single rate in `Instellingen`. Every formula reads it,
so **editing the rate silently re-values every historical transaction**. A sale
made in January reports a different SRD profit in September, and no report from
before the edit can be reproduced.

Here, a new rate is a new row with a later `effective_from`. Nothing is ever
updated in place. Every transaction that involves a conversion stores
`fx_rate_micros` on itself, so:

- past transactions keep the rate they were recorded with, forever;
- a report run today and the same report run next year agree;
- changing today's rate affects only what happens after it.

`normaliseToUsd` never rounds an amount already in USD. Converting a base-currency
value through a rate of 1 would introduce rounding for nothing.

### Staleness

`isRateStale` flags a rate older than seven days, surfaced as an informational
alert on the Overview. It is deliberately not an error: the rate being old does
not make anything wrong, it just means new transactions will convert at a rate
someone should look at.

---

## Rule 3: one component renders money

Everything monetary goes through `<Money>`
([`src/components/ui/money.tsx`](../../src/components/ui/money.tsx)). Always
monospaced, always `font-variant-numeric: tabular-nums`, always right-aligned in
tables.

A column of amounts that lines up on the decimal is the single detail that most
makes a finance interface feel engineered rather than assembled. It also makes
an outlier visible at a glance, because a longer number is physically wider.

`tone="flow"` colours by sign, for ledger deltas and profit. Everything else
stays ink-coloured. A balance sheet where every figure is green or red is
unreadable; colour is spent only where direction is the point.

---

## Display precision

| Context | Precision | Why |
|---|---|---|
| Tables, ledgers, totals | 2 decimals | It is money |
| Unit cost | 4 decimals | The true figure is often not a whole cent: `$29.5480` |
| Chart axes | Compact (`$12k`) | Axis labels compete with the data |
| Margins | 1 decimal percent | More digits imply precision the inputs do not have |

Unit cost is the only place extra precision is shown, and it is always
**derived** from `valueCents / quantity` rather than read from a column. There is
no stored unit cost anywhere in the schema.
