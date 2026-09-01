# Nextly documentation

Written as the system was built, not reconstructed afterwards. If something here
disagrees with the code, the code is right and this file is a bug.

## Start here

| If you want to | Read |
|---|---|
| Understand what Nextly is and how it makes money | [00-product/overview.md](00-product/overview.md) |
| Map a Dutch spreadsheet term to an English one | [00-product/glossary.md](00-product/glossary.md) |
| Know why the stack is what it is | [01-architecture/stack.md](01-architecture/stack.md) |
| Understand caching and why some pages are dynamic | [01-architecture/rendering-and-caching.md](01-architecture/rendering-and-caching.md) |
| Know who can do what, and where that is enforced | [01-architecture/security.md](01-architecture/security.md) |
| Understand the tables | [02-data/data-model.md](02-data/data-model.md) |
| Understand why money is an integer | [02-data/money-and-fx.md](02-data/money-and-fx.md) |
| Understand how a unit is costed | [02-data/cost-accounting.md](02-data/cost-accounting.md) |
| See what the spreadsheet import changed | [02-data/excel-migration.md](02-data/excel-migration.md) |
| Design a new screen | [03-design/design-system.md](03-design/design-system.md) |
| Set the project up or deploy it | [05-operations/environments.md](05-operations/environments.md) |
| Know why a decision was made | [adr/](adr/) |

## The three things most worth knowing

**Money is never a float.** Every amount is an integer number of USD cents.
Stock is held as `{ quantity, valueCents }`, both integers, and unit cost is
derived rather than stored — which is how a unit can cost $29.548 without a
fraction of a cent ever going missing. See
[02-data/money-and-fx.md](02-data/money-and-fx.md).

**Freight is part of what a product costs.** A purchase order's shipping, tax
and card fees are allocated across its lines on receipt. The spreadsheet did
not do this, and as a result understated Nextly's real margin by roughly 17
percentage points on its first sale. See
[02-data/cost-accounting.md](02-data/cost-accounting.md).

**Stock and cash are ledgers, not numbers.** Nobody edits a stock level or a
cash balance; both are the sum of an append-only table, and corrections are made
with a reversing entry. This is what makes "why is this wrong?" an answerable
question. See [adr/0004-append-only-ledgers.md](adr/0004-append-only-ledgers.md).

## Layout

```
docs/
  00-product/       what the business is
  01-architecture/  how the application is put together
  02-data/          the database, the money rules, the migration
  03-design/        the Instrument design language
  04-engineering/   conventions and the media pipeline
  05-operations/    environments, deployment, runbook
  adr/              decision records, numbered and dated
```
