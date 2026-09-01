# ADR-0003 — Landed cost, valued at weighted average

**Date** 2026-09-01 · **Status** Accepted

## Context

The Master Sheet computed cost of goods from the product's list price and
ignored the freight, tax and card fees recorded on the purchase order. On
PO-001 that is $30.77 of real cost never reaching a margin calculation, while
the $38.99 list price overstated the $23.394 actually paid.

Reported gross margin on the only sale: 29.1%. Real: 46.3%.

## Decision

**Landed cost.** A purchase order's tax, card fee, delivery, shipping and
shipping tax are allocated across its lines pro-rata by line value when the
order is received, using the largest remainder method so the parts sum to the
whole exactly.

**Weighted average valuation.** Stock is `{ quantity, valueCents }`, both
integers. A receipt adds its landed cost; a sale removes `round(value x n / q)`.
Unit cost is derived, never stored, so a cost of $29.548 needs no rounding.

**Overselling is allowed** and reported through `shortfall`, rather than
rejected. Stock is sometimes sold before its receipt is entered, and an app
that refuses to record a sale that happened teaches people to work around it.

## Consequences

- Margin is real, and materially different from the spreadsheet's.
- Cents are conserved exactly: draining a $100 holding one unit at a time books
  $100.00, not $99.99. Tested.
- Pro-rata **by value** assumes freight tracks value, which holds for small
  light electronics. Revisit if Nextly imports something heavy and cheap
  alongside something light and expensive.
- Receiving an order is the moment costs are fixed, so it must be a transaction.

## Alternatives

**FIFO** — more precise when prices swing, and what an accountant eventually
wants for tax. Rejected for now as materially more machinery for one product
and one purchase order. The migration path is open: `inventory_movements`
records every individual receipt's cost, so layers can be reconstructed from
history with no back-fill.

**Standard cost with variance** — overkill without a purchasing plan to vary
from.
