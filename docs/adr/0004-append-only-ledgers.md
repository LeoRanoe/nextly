# ADR-0004 — Inventory and cash are append-only ledgers

**Date** 2026-09-01 · **Status** Accepted

## Context

The spreadsheet stored stock and cash as computed cells. When one disagreed
with reality there was no way to ask why — only the current answer existed, not
how it was reached.

Both discrepancies found during migration ($147.01 on PO-001, $130 of
unexplained receipts) are exactly the kind that a derived total hides.

## Decision

`inventory_movements` and `ledger_entries` are append-only. RLS grants `INSERT`
and defines no `UPDATE` or `DELETE` policy, so those actions are refused by
Postgres rather than by convention.

Stock on hand is `SUM(inventory_movements.quantity)`. Cash balance is a window
function over `ledger_entries`. Neither is stored.

Corrections are reversing entries.

Entries caused by a document (paying for a purchase order, collecting a sale)
are posted **by the system from that document**, carrying `source_kind` and
`source_id`, so the ledger cannot drift from the documents it describes.

Both tables carry `seq bigserial`. `created_at` is the transaction timestamp in
Postgres, so several entries posted together share it exactly and cannot break
their own tie — a running balance ordered on a tie is nondeterministic. This was
observed in the seeded data before the column was added: the balance briefly
went negative because two same-instant rows sorted by random UUID.

## Consequences

- "Why is this wrong?" is always answerable.
- History is auditable and cannot be quietly rewritten.
- More rows than a mutable counter. Irrelevant at this scale, and indexed.
- Read performance comes from views, and later from a materialised rollup if
  the movement table ever grows enough to need one.
