import { sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents } from '@/lib/money';
import { db } from '../db/client';
import { OVERVIEW_TAGS, TAGS } from './cache';

/**
 * Read models for the Overview.
 *
 * Each function is a single round trip that returns exactly what one widget
 * renders. Widgets each sit behind their own Suspense boundary, so a slow
 * query delays one panel rather than the page.
 *
 * Raw SQL rather than the query builder in most places here: these are
 * aggregate reports over views, where the SQL *is* the specification and
 * expressing it through a fluent API would only obscure it.
 */

export type Position = {
  cashCents: Cents;
  inventoryCents: Cents;
  /** Value of goods ordered from suppliers but not yet received. */
  committedCents: Cents;
  /** Cash plus stock at cost. What the business is worth on paper. */
  netCents: Cents;
};

export async function getPosition(): Promise<Position> {
  'use cache';
  cacheTag(...OVERVIEW_TAGS);
  cacheLife('max');

  // Before Supabase credentials exist this is a setup state, not an outage.
  // Only an ABSENT connection string degrades; a failing query still throws,
  // because an empty dashboard must never be able to mean 'the database is down'.
  if (!isDatabaseConfigured())
    return { cashCents: 0, inventoryCents: 0, committedCents: 0, netCents: 0 };

  const [row] = await db.execute<{
    cash: string;
    inventory: string;
    committed: string;
  }>(sql`
    SELECT
      COALESCE((
        SELECT SUM(CASE WHEN direction = 'in' THEN amount_usd_cents
                        ELSE -amount_usd_cents END)
          FROM ledger_entries
      ), 0)::text AS cash,
      COALESCE((SELECT SUM(value_cents) FROM v_stock_levels), 0)::text AS inventory,
      COALESCE((
        SELECT SUM(i.landed_cost_cents)
          FROM purchase_order_items i
          JOIN purchase_orders p ON p.id = i.purchase_order_id
         WHERE p.status IN ('ordered', 'shipped')
      ), 0)::text AS committed
  `);

  const cashCents = Number(row?.cash ?? 0);
  const inventoryCents = Number(row?.inventory ?? 0);

  return {
    cashCents,
    inventoryCents,
    committedCents: Number(row?.committed ?? 0),
    netCents: cashCents + inventoryCents,
  };
}

export type CashPoint = { date: string; inCents: Cents; outCents: Cents; balanceCents: Cents };

/** Weekly money in and out, plus the closing balance each week. */
export async function getCashFlow(weeks = 12): Promise<CashPoint[]> {
  'use cache';
  cacheTag(TAGS.ledger);
  cacheLife('max');

  // Before Supabase credentials exist this is a setup state, not an outage.
  // Only an ABSENT connection string degrades; a failing query still throws,
  // because an empty dashboard must never be able to mean 'the database is down'.
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<{
    week: string;
    inflow: string;
    outflow: string;
    balance: string;
  }>(sql`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', now()) - make_interval(weeks => ${weeks - 1}),
        date_trunc('week', now()),
        interval '1 week'
      ) AS week
    ),
    movement AS (
      SELECT
        date_trunc('week', occurred_at) AS week,
        SUM(amount_usd_cents) FILTER (WHERE direction = 'in')  AS inflow,
        SUM(amount_usd_cents) FILTER (WHERE direction = 'out') AS outflow
      FROM ledger_entries
      GROUP BY 1
    )
    SELECT
      w.week::date::text AS week,
      COALESCE(m.inflow, 0)::text  AS inflow,
      COALESCE(m.outflow, 0)::text AS outflow,
      COALESCE((
        SELECT SUM(CASE WHEN e.direction = 'in' THEN e.amount_usd_cents
                        ELSE -e.amount_usd_cents END)
          FROM ledger_entries e
         WHERE e.occurred_at < w.week + interval '1 week'
      ), 0)::text AS balance
    FROM weeks w
    LEFT JOIN movement m ON m.week = w.week
    ORDER BY w.week
  `);

  return rows.map((row) => ({
    date: row.week,
    inCents: Number(row.inflow),
    outCents: Number(row.outflow),
    balanceCents: Number(row.balance),
  }));
}

export type Waterfall = {
  revenueCents: Cents;
  cogsCents: Cents;
  grossCents: Cents;
  expensesCents: Cents;
  netCents: Cents;
};

/** Revenue to net, the way the business actually earns it. */
export async function getWaterfall(): Promise<Waterfall> {
  'use cache';
  cacheTag(TAGS.sales, TAGS.expenses);
  cacheLife('max');

  // Before Supabase credentials exist this is a setup state, not an outage.
  // Only an ABSENT connection string degrades; a failing query still throws,
  // because an empty dashboard must never be able to mean 'the database is down'.
  if (!isDatabaseConfigured())
    return { revenueCents: 0, cogsCents: 0, grossCents: 0, expensesCents: 0, netCents: 0 };

  const [row] = await db.execute<{ revenue: string; cogs: string; expenses: string }>(sql`
    SELECT
      COALESCE((
        SELECT SUM(total_usd_cents) FROM sales WHERE status = 'confirmed'
      ), 0)::text AS revenue,
      COALESCE((
        SELECT SUM(cogs_cents) FROM sales WHERE status = 'confirmed'
      ), 0)::text AS cogs,
      COALESCE((SELECT SUM(amount_usd_cents) FROM expenses), 0)::text AS expenses
  `);

  const revenueCents = Number(row?.revenue ?? 0);
  const cogsCents = Number(row?.cogs ?? 0);
  const expensesCents = Number(row?.expenses ?? 0);
  const grossCents = revenueCents - cogsCents;

  return {
    revenueCents,
    cogsCents,
    grossCents,
    expensesCents,
    netCents: grossCents - expensesCents,
  };
}

export type StockRow = {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  onHand: number;
  inbound: number;
  totalSold: number;
  valueCents: Cents;
};

export async function getInventoryHealth(limit = 8): Promise<StockRow[]> {
  'use cache';
  cacheTag(TAGS.inventory, TAGS.purchaseOrders, TAGS.products);
  cacheLife('max');

  // Before Supabase credentials exist this is a setup state, not an outage.
  // Only an ABSENT connection string degrades; a failing query still throws,
  // because an empty dashboard must never be able to mean 'the database is down'.
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<{
    variant_id: string;
    sku: string;
    product_name: string;
    variant_name: string;
    on_hand: string;
    inbound: string;
    total_sold: string;
    value_cents: string;
  }>(sql`
    SELECT
      s.variant_id, s.sku, s.product_name, s.variant_name,
      s.on_hand::text, s.total_sold::text, s.value_cents::text,
      COALESCE((
        SELECT SUM(i.quantity - i.quantity_received)
          FROM purchase_order_items i
          JOIN purchase_orders p ON p.id = i.purchase_order_id
         WHERE i.variant_id = s.variant_id
           AND p.status IN ('ordered', 'shipped')
      ), 0)::text AS inbound
    FROM v_stock_levels s
    ORDER BY s.on_hand ASC, s.total_sold DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    variantId: row.variant_id,
    sku: row.sku,
    productName: row.product_name,
    variantName: row.variant_name,
    onHand: Number(row.on_hand),
    inbound: Number(row.inbound),
    totalSold: Number(row.total_sold),
    valueCents: Number(row.value_cents),
  }));
}

export type OwnerRow = {
  memberId: string;
  fullName: string;
  contributedCents: Cents;
  drawnCents: Cents;
  netCents: Cents;
  share: number;
};

export async function getOwnerEquity(): Promise<OwnerRow[]> {
  'use cache';
  cacheTag(TAGS.ledger, TAGS.members);
  cacheLife('max');

  // Before Supabase credentials exist this is a setup state, not an outage.
  // Only an ABSENT connection string degrades; a failing query still throws,
  // because an empty dashboard must never be able to mean 'the database is down'.
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<{
    member_id: string;
    full_name: string;
    contributed_cents: string;
    drawn_cents: string;
    net_cents: string;
  }>(sql`
    SELECT member_id, full_name, contributed_cents::text, drawn_cents::text, net_cents::text
      FROM v_owner_equity
     ORDER BY net_cents DESC, full_name
  `);

  const total = rows.reduce((sum, row) => sum + Number(row.net_cents), 0);

  return rows.map((row) => ({
    memberId: row.member_id,
    fullName: row.full_name,
    contributedCents: Number(row.contributed_cents),
    drawnCents: Number(row.drawn_cents),
    netCents: Number(row.net_cents),
    share: total === 0 ? 0 : Number(row.net_cents) / total,
  }));
}

/** Most recent exchange rate on or before now. */
export async function getCurrentRate(): Promise<{
  rateMicros: number;
  effectiveFrom: Date;
} | null> {
  'use cache';
  cacheTag(TAGS.fxRates);
  cacheLife('max');

  // Before Supabase credentials exist this is a setup state, not an outage.
  // Only an ABSENT connection string degrades; a failing query still throws,
  // because an empty dashboard must never be able to mean 'the database is down'.
  if (!isDatabaseConfigured()) return null;

  const [row] = await db.execute<{ rate_micros: string; effective_from: string }>(sql`
    SELECT rate_micros::text, effective_from::text
      FROM fx_rates
     WHERE base = 'USD' AND quote = 'SRD' AND effective_from <= now()
     ORDER BY effective_from DESC
     LIMIT 1
  `);

  if (!row) return null;
  return {
    rateMicros: Number(row.rate_micros),
    effectiveFrom: new Date(row.effective_from),
  };
}
