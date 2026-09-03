import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents } from '@/lib/money';
import { OVERDUE_AFTER_DAYS } from '@/lib/payment-status';
import { db } from '../db/client';
import { bool, maybe, text } from './row';

/**
 * The `isDatabaseConfigured()` guard on each function below is a SETUP state,
 * not an outage. Only an ABSENT connection string returns empty; a failing
 * query still throws, because an empty dashboard must never be able to mean
 * "the database is down". See src/app/setup/page.tsx.
 */

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

/**
 * Revenue to net, the way the business actually earns it.
 *
 * The window scoping — including the netting of returns against revenue and
 * cost of goods — mirrors `pnlTotals` in queries/reports.ts exactly, so the
 * waterfall for a period and the P&L for the same period cannot disagree.
 */
export async function getWaterfall({ from, to }: { from: Date; to: Date }): Promise<Waterfall> {
  if (!isDatabaseConfigured())
    return { revenueCents: 0, cogsCents: 0, grossCents: 0, expensesCents: 0, netCents: 0 };

  // Bind ISO strings rather than Date objects. This keeps the parameter
  // representation stable in Vercel's bundled postgres client while
  // PostgreSQL still infers the timestamp type from the compared columns.
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
           AND occurred_at >= ${fromIso} AND occurred_at < ${toIso}
      ), 0)::text AS refunds,
      COALESCE((
        SELECT SUM(value_cents) FROM inventory_movements
         WHERE kind = 'return' AND source_kind = 'sale'
           AND occurred_at >= ${fromIso} AND occurred_at < ${toIso}
      ), 0)::text AS restocked
  `);

  const revenueCents = Number(row?.revenue ?? 0) - Number(row?.refunds ?? 0);
  const cogsCents = Number(row?.cogs ?? 0) - Number(row?.restocked ?? 0);
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

export type MoneyOwedRow = {
  id: string;
  number: string;
  customerName: string | null;
  soldAt: string;
  /** Outstanding in the currency of the sale — what the customer was quoted in. */
  balanceCents: Cents;
  currency: string;
  /** Same balance normalised, so rows of mixed currencies can be totalled. */
  balanceUsdCents: Cents;
  overdue: boolean;
};

export type MoneyOwed = {
  totalUsdCents: Cents;
  overdueUsdCents: Cents;
  oldestSoldAt: string | null;
  /** Count of every unpaid sale, not just the `limit` rows returned — the
   *  headline must not understate a book with more debtors than the panel. */
  salesCount: number;
  rows: MoneyOwedRow[];
};

/**
 * Accounts receivable (F-4): confirmed sales whose money has not all arrived.
 *
 * The per-row balance is computed in the currency of the sale and converted
 * with that sale's own rate rather than summed in one currency and converted
 * once — a receipt banked at 38.5 SRD/USD should leave the books at the USD it
 * actually represents, not today's rate applied to an aggregate.
 *
 * `OVERDUE_AFTER_DAYS` comes from lib/payment-status so the age at which a
 * row turns red here is the same age the sales list calls Overdue.
 */
export async function getMoneyOwed(limit = 6): Promise<MoneyOwed> {
  if (!isDatabaseConfigured())
    return {
      totalUsdCents: 0,
      overdueUsdCents: 0,
      oldestSoldAt: null,
      salesCount: 0,
      rows: [],
    };

  const rows = await db.execute<Record<string, string | null>>(sql`
    WITH unpaid AS (
      SELECT
        s.id, s.number, c.name AS customer_name, s.sold_at, s.currency,
        GREATEST(s.total_cents - COALESCE(p.paid_cents, 0), 0) AS balance_cents,
        GREATEST(s.total_usd_cents - COALESCE(p.paid_usd_cents, 0), 0) AS balance_usd_cents
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN (
        SELECT sale_id,
               SUM(paid_cents) AS paid_cents,
               SUM(paid_usd_cents) AS paid_usd_cents
          FROM (
            SELECT sp.sale_id,
                   SUM(CASE WHEN le.direction = 'in' THEN le.amount_cents
                            ELSE -le.amount_cents END) AS paid_cents,
                   SUM(CASE WHEN le.direction = 'in' THEN le.amount_usd_cents
                            ELSE -le.amount_usd_cents END) AS paid_usd_cents
              FROM sale_payments sp
              JOIN ledger_entries le ON le.source_kind = 'sale' AND le.source_id = sp.id
             GROUP BY sp.sale_id
            UNION ALL
            SELECT le.source_id AS sale_id,
                   SUM(CASE WHEN le.direction = 'in' THEN le.amount_cents
                            ELSE -le.amount_cents END) AS paid_cents,
                   SUM(CASE WHEN le.direction = 'in' THEN le.amount_usd_cents
                            ELSE -le.amount_usd_cents END) AS paid_usd_cents
              FROM ledger_entries le
             WHERE le.source_kind = 'sale'
               AND le.category = 'sales_receipt'
               AND le.source_id IS NOT NULL
             GROUP BY le.source_id
          ) paid_parts
         GROUP BY sale_id
      ) p ON p.sale_id = s.id
      WHERE s.status = 'confirmed'
        AND s.total_cents > COALESCE(p.paid_cents, 0)
    )
    SELECT
      id, number, customer_name, currency,
      sold_at::text, balance_cents::text, ROUND(balance_usd_cents)::text AS balance_usd_cents,
      SUM(ROUND(balance_usd_cents)) OVER ()::text AS total_usd_cents,
      SUM(ROUND(balance_usd_cents)) FILTER (
        WHERE sold_at < now() - make_interval(days => ${OVERDUE_AFTER_DAYS})
      ) OVER ()::text AS overdue_usd_cents,
      MIN(sold_at) OVER ()::text AS oldest_sold_at,
      COUNT(*) OVER ()::text AS sales_count
    FROM unpaid
    ORDER BY sold_at ASC
    LIMIT ${limit}
  `);

  const first = rows[0];
  const overdueCutoff = new Date(Date.now() - OVERDUE_AFTER_DAYS * 86_400_000).toISOString();
  return {
    totalUsdCents: Number(first?.total_usd_cents ?? 0),
    overdueUsdCents: Number(first?.overdue_usd_cents ?? 0),
    oldestSoldAt: first?.oldest_sold_at ?? null,
    salesCount: Number(first?.sales_count ?? 0),
    rows: rows.map((row) => ({
      id: text(row.id),
      number: text(row.number),
      customerName: maybe(row.customer_name),
      soldAt: text(row.sold_at),
      balanceCents: Number(row.balance_cents ?? 0),
      currency: text(row.currency, 'USD'),
      balanceUsdCents: Number(row.balance_usd_cents ?? 0),
      overdue: (row.sold_at ?? '') < overdueCutoff,
    })),
  };
}

export type ImportPipelineData = {
  openOrders: number;
  inboundOrders: number;
  receivedUnpaid: number;
  committedUsdCents: Cents;
};

/** P2P control totals for an importer buying through Amazon and AliExpress. */
export async function getImportPipeline(): Promise<ImportPipelineData> {
  if (!isDatabaseConfigured())
    return { openOrders: 0, inboundOrders: 0, receivedUnpaid: 0, committedUsdCents: 0 };
  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('ordered','shipped'))::text AS open_orders,
      COUNT(*) FILTER (WHERE status = 'shipped')::text AS inbound_orders,
      COUNT(*) FILTER (WHERE status = 'received' AND COALESCE((SELECT SUM(amount_cents) FROM purchase_order_payments pp WHERE pp.purchase_order_id = p.id), 0) < (SELECT COALESCE(SUM(subtotal_cents + overhead_cents), 0) FROM purchase_order_items i WHERE i.purchase_order_id = p.id))::text AS received_unpaid,
      COALESCE(SUM(CASE WHEN status IN ('draft','ordered','shipped') THEN (SELECT COALESCE(SUM(subtotal_cents + overhead_cents), 0) FROM purchase_order_items i WHERE i.purchase_order_id = p.id) ELSE 0 END), 0)::text AS committed_usd_cents
    FROM purchase_orders p
  `);
  return {
    openOrders: Number(row?.open_orders ?? 0),
    inboundOrders: Number(row?.inbound_orders ?? 0),
    receivedUnpaid: Number(row?.received_unpaid ?? 0),
    committedUsdCents: Number(row?.committed_usd_cents ?? 0),
  };
}

/* ── Setup checklist (F-13) ──────────────────────────────────────────────── */

export type SetupStepCode = 'rate' | 'supplier' | 'product' | 'order' | 'sale';

export type SetupState = {
  /** False once the whole checklist is done — the banner never shows again. */
  complete: boolean;
  done: SetupStepCode[];
};

/**
 * Which of the five founding facts a fresh deployment already has (F-13).
 *
 * One cheap aggregate query, not five round trips: each step is an EXISTS (or
 * a MIN over the small rates table), so the whole thing stays index-only. The
 * steps are deliberately about data existing, not screens being visited — a
 * checklist that asks "did you click Settings?" completes itself by accident.
 */
export async function getSetupState(): Promise<SetupState> {
  if (!isDatabaseConfigured()) return { complete: false, done: [] };

  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT
      (EXISTS (SELECT 1 FROM fx_rates))::text AS rate,
      (EXISTS (SELECT 1 FROM suppliers))::text AS supplier,
      (EXISTS (SELECT 1 FROM products WHERE status <> 'archived'))::text AS product,
      (EXISTS (SELECT 1 FROM purchase_orders WHERE status <> 'draft'))::text AS order,
      (EXISTS (SELECT 1 FROM sales WHERE status = 'confirmed'))::text AS sale
  `);

  const done = (['rate', 'supplier', 'product', 'order', 'sale'] as const).filter((step) =>
    bool(row?.[step]),
  );
  return { complete: done.length === 5, done };
}
