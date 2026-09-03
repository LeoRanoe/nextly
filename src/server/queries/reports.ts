import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import { toBase } from '@/lib/fx';
import type { Cents } from '@/lib/money';
import { db } from '../db/client';
import { getCurrentRate } from './overview';
import { listRates } from './reference';
import { num, text } from './row';

/**
 * The `isDatabaseConfigured()` guard on each function below is a SETUP
 * state, not an outage — see the same note in overview.ts. One query per
 * report, matching the convention there: an aggregate is easiest to reason
 * about, and fastest, written as the one query it actually is.
 */

/* ── Profit and loss ─────────────────────────────────────────────────────── */

export type ProfitAndLossTotals = {
  revenueCents: Cents;
  cogsCents: Cents;
  grossCents: Cents;
  expensesCents: Cents;
  netCents: Cents;
};

export type ProfitAndLoss = ProfitAndLossTotals & {
  expensesByCategory: { name: string; amountCents: Cents }[];
  /** The immediately preceding window of equal length — a P&L without a
   *  comparison is a number without a scale. */
  previous: ProfitAndLossTotals;
};

/**
 * Revenue and cost of goods are reported NET of returns: a sale stays
 * immutable in its own row, and the return's reversing postings — the refund
 * entry and the restock movement, both sourced to the sale — are what take it
 * back out of the period. Only postings sourced to a sale count here; a
 * hand-entered refund or adjustment is someone's categorisation, not an
 * unwinding of revenue.
 */
async function pnlTotals(from: Date, to: Date): Promise<ProfitAndLossTotals> {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const [row] = await db.execute<{
    revenue: string;
    cogs: string;
    expenses: string;
    refunds: string;
    restocked: string;
  }>(sql`
    SELECT
      COALESCE((
        SELECT SUM(total_usd_cents) FROM sales
         WHERE status = 'confirmed' AND sold_at >= ${fromIso} AND sold_at < ${toIso}
      ), 0)::text AS revenue,
      COALESCE((
        SELECT SUM(cogs_cents) FROM sales
         WHERE status = 'confirmed' AND sold_at >= ${fromIso} AND sold_at < ${toIso}
      ), 0)::text AS cogs,
      COALESCE((
        SELECT SUM(amount_usd_cents) FROM expenses
         WHERE occurred_at >= ${fromIso} AND occurred_at < ${toIso}
      ), 0)::text AS expenses,
      COALESCE((
        SELECT SUM(amount_usd_cents) FROM ledger_entries
         WHERE category = 'refund' AND source_kind = 'sale'
           AND (
             source_id IN (SELECT id FROM sales)
             OR source_id IN (SELECT id FROM sale_refunds)
           )
           AND occurred_at >= ${fromIso} AND occurred_at < ${toIso}
      ), 0)::text AS refunds,
      COALESCE((
        SELECT SUM(value_cents) FROM inventory_movements
         WHERE kind = 'return' AND source_kind = 'sale'
           AND occurred_at >= ${fromIso} AND occurred_at < ${toIso}
      ), 0)::text AS restocked
  `);

  const revenueCents = num(row?.revenue) - num(row?.refunds);
  const cogsCents = num(row?.cogs) - num(row?.restocked);
  const expensesCents = num(row?.expenses);
  const grossCents = revenueCents - cogsCents;

  return {
    revenueCents,
    cogsCents,
    grossCents,
    expensesCents,
    netCents: grossCents - expensesCents,
  };
}

export async function getProfitAndLoss({
  from,
  to,
}: {
  from: Date;
  to: Date;
}): Promise<ProfitAndLoss> {
  const zero: ProfitAndLossTotals = {
    revenueCents: 0,
    cogsCents: 0,
    grossCents: 0,
    expensesCents: 0,
    netCents: 0,
  };
  if (!isDatabaseConfigured()) {
    return { ...zero, expensesByCategory: [], previous: zero };
  }

  const durationMs = to.getTime() - from.getTime();
  const previousFrom = new Date(from.getTime() - durationMs);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const [current, previous, categoryRows] = await Promise.all([
    pnlTotals(from, to),
    pnlTotals(previousFrom, from),
    db.execute<Record<string, string | null>>(sql`
      SELECT COALESCE(c.name, 'Uncategorised') AS name, SUM(e.amount_usd_cents)::text AS amount
        FROM expenses e
        LEFT JOIN expense_categories c ON c.id = e.category_id
       WHERE e.occurred_at >= ${fromIso} AND e.occurred_at < ${toIso}
       GROUP BY c.name
       ORDER BY amount DESC
    `),
  ]);

  return {
    ...current,
    previous,
    expensesByCategory: categoryRows.map((row) => ({
      name: text(row.name, 'Uncategorised'),
      amountCents: num(row.amount),
    })),
  };
}

/* ── Margin by product ───────────────────────────────────────────────────── */

export type ProductMarginRow = {
  productId: string;
  code: string;
  name: string;
  unitsSold: number;
  revenueCents: Cents;
  cogsCents: Cents;
  grossCents: Cents;
  marginRate: number;
};

export type ProductMarginSort = 'gross' | 'revenue' | 'units';

/** Period-aware margin by product, net of returns.
 *
 *  Replaces the lifetime view read that P1-2 flagged: the previous
 *  implementation queried `v_product_margins`, which has no date scope and
 *  does not net returns out — so a heavily-returned product still looked
 *  like a winner, and the panel sat under a period selector it ignored.
 *
 *  A return in this codebase reverses the sale's postings rather than
 *  rewriting `sale_items`, so we prorate each line's revenue and COGS by
 *  `(quantity − quantityReturned) / quantity`. The view is left alone for
 *  its other consumers (overview's margin leaders). */
export async function listProductMargins(
  sort: ProductMarginSort = 'gross',
  range?: { from: Date; to: Date },
): Promise<ProductMarginRow[]> {
  if (!isDatabaseConfigured()) return [];

  const column =
    sort === 'revenue' ? 'revenue_cents' : sort === 'units' ? 'units_sold' : 'gross_cents';

  const scope = range
    ? sql`AND s.sold_at >= ${range.from.toISOString()} AND s.sold_at < ${range.to.toISOString()}`
    : sql``;

  const rows = await db.execute<Record<string, string>>(sql`
    WITH sale_base AS (
      SELECT si.id AS sale_item_id, si.sale_id, si.variant_id, si.bundle_id,
             si.quantity, si.quantity_returned,
             GREATEST(si.quantity - si.quantity_returned, 0) AS net_quantity,
             si.line_total_usd_cents, si.cogs_cents
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
       WHERE s.status = 'confirmed' ${scope}
    ),
    bundle_components AS (
      SELECT sb.sale_item_id, sb.quantity, sb.net_quantity, sb.line_total_usd_cents,
             sic.variant_id, sic.quantity_per_bundle, sic.cogs_cents AS component_cogs_cents,
             SUM(sic.cogs_cents) OVER (PARTITION BY sic.sale_item_id) AS bundle_cogs_cents,
             COUNT(*) OVER (PARTITION BY sic.sale_item_id) AS component_count
        FROM sale_base sb
        JOIN sale_item_components sic ON sic.sale_item_id = sb.sale_item_id
       WHERE sb.bundle_id IS NOT NULL
    ),
    line_margins AS (
      SELECT variant_id, net_quantity AS units_sold,
             ROUND(line_total_usd_cents::numeric * net_quantity / NULLIF(quantity, 0)) AS revenue_cents,
             ROUND(cogs_cents::numeric * net_quantity / NULLIF(quantity, 0)) AS cogs_cents
        FROM sale_base
       WHERE bundle_id IS NULL
      UNION ALL
      SELECT variant_id,
             SUM(net_quantity * quantity_per_bundle)::numeric AS units_sold,
             SUM(ROUND(
               line_total_usd_cents::numeric
               * CASE WHEN bundle_cogs_cents > 0
                   THEN component_cogs_cents::numeric / bundle_cogs_cents
                   ELSE 1::numeric / NULLIF(component_count, 0)
                 END
               * net_quantity / NULLIF(quantity, 0)
             )) AS revenue_cents,
             SUM(ROUND(component_cogs_cents::numeric * net_quantity / NULLIF(quantity, 0))) AS cogs_cents
        FROM bundle_components
       GROUP BY sale_item_id, variant_id
    ),
    margins AS (
      SELECT p.id AS product_id, p.code, p.name,
             SUM(lm.units_sold) AS units_sold,
             SUM(lm.revenue_cents) AS revenue_cents,
             SUM(lm.cogs_cents) AS cogs_cents
        FROM line_margins lm
        JOIN product_variants v ON v.id = lm.variant_id
        JOIN products p ON p.id = v.product_id
       GROUP BY p.id, p.code, p.name
      HAVING SUM(lm.units_sold) > 0
    )
    SELECT product_id, code, name,
           units_sold::text,
           revenue_cents::text,
           cogs_cents::text,
           (revenue_cents - cogs_cents)::text AS gross_cents
      FROM margins
     ORDER BY ${sql.raw(column)} DESC, name
  `);

  return rows.map((row) => {
    const revenueCents = num(row.revenue_cents);
    const grossCents = num(row.gross_cents);
    return {
      productId: text(row.product_id),
      code: text(row.code),
      name: text(row.name),
      unitsSold: num(row.units_sold),
      revenueCents,
      cogsCents: num(row.cogs_cents),
      grossCents,
      marginRate: revenueCents === 0 ? 0 : grossCents / revenueCents,
    };
  });
}

/* ── FX exposure ──────────────────────────────────────────────────────────── */

export type FxExposure = {
  currentRateMicros: number | null;
  /** SRD amounts, booked at each entry's own historic rate. */
  srdBookedUsdCents: Cents;
  /** The same SRD total, revalued at today's rate. */
  srdRevaluedUsdCents: Cents;
  /** revalued − booked: the unrealised gain or loss a rate move has caused. */
  unrealizedCents: Cents;
  /** Share of confirmed sales revenue that was charged in SRD. */
  srdRevenueShare: number;
  /** Share of total cash movement (in or out) that was in SRD. */
  srdCashShare: number;
  rateSeries: { effectiveFrom: string; rateMicros: number }[];
  /** ISO date of the earliest rate on record — used by the collapsed
   *  one-line summary when there is no SRD exposure to show (P1-3). */
  srdEarliestFrom: string | null;
};

export async function getFxExposure(): Promise<FxExposure> {
  if (!isDatabaseConfigured()) {
    return {
      currentRateMicros: null,
      srdBookedUsdCents: 0,
      srdRevaluedUsdCents: 0,
      unrealizedCents: 0,
      srdRevenueShare: 0,
      srdCashShare: 0,
      rateSeries: [],
      srdEarliestFrom: null,
    };
  }

  const [rate, ledgerRow, revenueRow, rates] = await Promise.all([
    getCurrentRate(),
    db.execute<{ srd_cents: string; srd_usd_cents: string; total_usd_cents: string }>(sql`
      SELECT
        COALESCE(SUM(amount_cents) FILTER (WHERE currency = 'SRD'), 0)::text AS srd_cents,
        COALESCE(SUM(amount_usd_cents) FILTER (WHERE currency = 'SRD'), 0)::text AS srd_usd_cents,
        COALESCE(SUM(amount_usd_cents), 0)::text AS total_usd_cents
      FROM ledger_entries
    `),
    db.execute<{ srd_usd_cents: string; total_usd_cents: string }>(sql`
      SELECT
        COALESCE(SUM(total_usd_cents) FILTER (WHERE currency = 'SRD'), 0)::text AS srd_usd_cents,
        COALESCE(SUM(total_usd_cents), 0)::text AS total_usd_cents
      FROM sales
      WHERE status = 'confirmed'
    `),
    listRates(52),
  ]);

  const srdCents = num(ledgerRow[0]?.srd_cents);
  const srdBookedUsdCents = num(ledgerRow[0]?.srd_usd_cents);
  const totalCashUsdCents = num(ledgerRow[0]?.total_usd_cents);
  const srdRevenueUsdCents = num(revenueRow[0]?.srd_usd_cents);
  const totalRevenueUsdCents = num(revenueRow[0]?.total_usd_cents);

  const srdRevaluedUsdCents = rate ? toBase(srdCents, rate.rateMicros) : srdBookedUsdCents;

  return {
    currentRateMicros: rate?.rateMicros ?? null,
    srdBookedUsdCents,
    srdRevaluedUsdCents,
    unrealizedCents: srdRevaluedUsdCents - srdBookedUsdCents,
    srdRevenueShare: totalRevenueUsdCents === 0 ? 0 : srdRevenueUsdCents / totalRevenueUsdCents,
    srdCashShare:
      totalCashUsdCents === 0 ? 0 : Math.abs(srdBookedUsdCents) / Math.abs(totalCashUsdCents),
    rateSeries: rates.map((r) => ({
      effectiveFrom: r.effectiveFrom,
      rateMicros: r.rateMicros,
    })),
    srdEarliestFrom: rates.at(-1)?.effectiveFrom ?? null,
  };
}
