# ADR-0001 — Money is an integer number of minor units

**Date** 2026-09-01 · **Status** Accepted

## Context

Nextly's books must foot. The spreadsheet used floating point throughout, which
is survivable in a spreadsheet and is not survivable in a system that will run
for years and be asked to reproduce a figure from eighteen months ago.

`0.1 + 0.2 !== 0.3` in IEEE 754.

## Decision

Every monetary amount is an integer number of USD cents. Every exchange rate is
an integer number of micro-units (rate x 1,000,000).

Database columns are `bigint`. TypeScript uses `number`, exact to 2^53 (about
$90 trillion in cents), because `bigint` makes every JSON and React boundary
awkward for no gain at this scale. Where an intermediate product could exceed
2^53, `mulDivRound` routes through `BigInt` and throws rather than degrade.

Rounding is half away from zero, not banker's rounding: banker's is right for
statistical aggregates and wrong for individual commercial documents, where it
makes an invoice look inexplicably a cent off from hand arithmetic.

## Consequences

- Parsing goes through `parseMoney`, which never calls `parseFloat`.
- Display goes through `<Money>`. No component formats an amount itself.
- Sub-cent values (a landed unit cost of $29.548) cannot be stored — which is
  why stock holds `value` and derives unit cost. See ADR-0003.

## Alternatives

**`decimal.js`** — correct, and adds a dependency plus a wrapper type at every
boundary to solve a problem integers already solve.
**Postgres `numeric`** — exact in the database, but arrives in JavaScript as a
string and has to be handled anyway. `bigint` is the same work with a cheaper
representation.
