# ADR-0005 — Products and variants, catalog-ready from day one

**Date** 2026-09-01 · **Status** Accepted

## Context

The Master Sheet listed P001 "Wyze Cam Pan V3 - Black" and P002 "Wyze Cam Pan
V3 - White" as two products. They are one product in two colourways.

A public catalog is planned. Its shape was known before the first migration ran.

## Decision

A **product** is what a customer recognises. A **variant** is what is stocked
and sold. Stock, cost and price live on the variant; every product has at least
one, flagged `is_default`, even when it has no real options.

Catalog fields exist from the first migration: `slug`, `summary`, `description`,
`specs jsonb`, `seo_title`, `seo_description`, `catalog_published`,
`catalog_published_at`. `product_images` is a separate table with ordering, a
primary flag and alt text.

## Consequences

- The catalog reads these same rows behind `catalog_published = true`. There is
  no second migration waiting, and no risky splitting of products into variants
  after the fact — which would mean rewriting historical sale lines.
- One product page with a colour picker, rather than two near-identical
  listings competing in search.
- Slightly more indirection today: every sale line points at a variant, not a
  product.

## Alternatives

**Products only, variants later** — the migration that splits them has to
rewrite every historical `sale_item` and `inventory_movement`. Cheap now,
expensive and risky later.

**A separate catalog database** — two sources of truth for price and
availability. The failure mode is selling something that is out of stock.
