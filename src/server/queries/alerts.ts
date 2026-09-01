import { sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents } from '@/lib/money';
import { db } from '../db/client';
import { OVERVIEW_TAGS } from './cache';

/**
 * Things that need a human.
 *
 * This is the widget that earns the dashboard its keep. Every check here
 * corresponds to a mistake the spreadsheet either already made or could not
 * detect at all, so the list is derived from real failures rather than
 * invented to fill a panel.
 */

export type Alert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  href?: string;
};

export async function getAlerts(): Promise<Alert[]> {
  'use cache';
  cacheTag(...OVERVIEW_TAGS);
  cacheLife('max');

  // Before Supabase credentials exist this is a setup state, not an outage.
  // Only an ABSENT connection string degrades; a failing query still throws,
  // because an empty dashboard must never be able to mean 'the database is down'.
  if (!isDatabaseConfigured()) return [];

  const [row] = await db.execute<{
    low_stock: string;
    out_of_stock: string;
    overdue_pos: string;
    unallocated_pos: string;
    negative_stock: string;
    oversold_lines: string;
    rate_age_days: string | null;
    ledger_po_drift: string;
    ledger_sales_drift: string;
    draft_sales: string;
  }>(sql`
    WITH threshold AS (
      SELECT COALESCE((SELECT low_stock_threshold FROM settings LIMIT 1), 5) AS value
    )
    SELECT
      (SELECT COUNT(*) FROM v_stock_levels, threshold
        WHERE on_hand > 0 AND on_hand <= threshold.value)::text AS low_stock,
      (SELECT COUNT(*) FROM v_stock_levels s
        WHERE s.on_hand = 0 AND s.total_sold > 0)::text AS out_of_stock,
      (SELECT COUNT(*) FROM purchase_orders
        WHERE status IN ('ordered', 'shipped')
          AND expected_at IS NOT NULL AND expected_at < now())::text AS overdue_pos,

      -- A received order whose freight and fees never reached the goods. Every
      -- unit it stocked is undercosted, and every sale from it overstates margin.
      (SELECT COUNT(*) FROM purchase_orders p
        WHERE p.status = 'received'
          AND (p.tax_cents + p.card_fee_cents + p.delivery_cents
               + p.shipping_cents + p.shipping_tax_cents) > 0
          AND COALESCE((SELECT SUM(i.overhead_cents) FROM purchase_order_items i
                         WHERE i.purchase_order_id = p.id), 0) = 0)::text AS unallocated_pos,

      (SELECT COUNT(*) FROM v_stock_levels WHERE on_hand < 0)::text AS negative_stock,
      (SELECT COUNT(*) FROM sale_items WHERE shortfall > 0)::text AS oversold_lines,

      (SELECT EXTRACT(DAY FROM now() - MAX(effective_from))::int
         FROM fx_rates WHERE base = 'USD' AND quote = 'SRD')::text AS rate_age_days,

      -- Cash booked against purchase orders, versus what those orders cost.
      (COALESCE((SELECT SUM(amount_usd_cents) FROM ledger_entries
                  WHERE category = 'purchase'), 0)
       - COALESCE((SELECT SUM(i.landed_cost_cents) FROM purchase_order_items i
                     JOIN purchase_orders p ON p.id = i.purchase_order_id
                    WHERE p.status = 'received'), 0))::text AS ledger_po_drift,

      -- Cash booked as sales receipts, versus what was actually sold.
      (COALESCE((SELECT SUM(amount_usd_cents) FROM ledger_entries
                  WHERE category = 'sales_receipt'), 0)
       - COALESCE((SELECT SUM(total_usd_cents) FROM sales
                    WHERE status = 'confirmed'), 0))::text AS ledger_sales_drift,

      (SELECT COUNT(*) FROM sales WHERE status = 'draft')::text AS draft_sales
  `);

  if (!row) return [];

  const alerts: Alert[] = [];
  const count = (value: string | null) => Number(value ?? 0);
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

  const negativeStock = count(row.negative_stock);
  if (negativeStock > 0) {
    alerts.push({
      id: 'negative-stock',
      severity: 'critical',
      title: `${negativeStock} ${plural(negativeStock, 'product is', 'products are')} below zero stock`,
      detail:
        'More units were sold than were ever received. Either a receipt is missing or a sale was recorded twice.',
      href: '/inventory',
    });
  }

  const unallocated = count(row.unallocated_pos);
  if (unallocated > 0) {
    alerts.push({
      id: 'unallocated-overhead',
      severity: 'critical',
      title: `${unallocated} received ${plural(unallocated, 'order has', 'orders have')} unallocated freight`,
      detail:
        'Shipping, tax and fees were recorded but never costed into the goods, so those units are valued too low and their margin reads too high.',
      href: '/purchase-orders',
    });
  }

  const poDrift = Number(row.ledger_po_drift);
  if (Math.abs(poDrift) >= 100) {
    alerts.push({
      id: 'ledger-po-drift',
      severity: 'warning',
      title: 'Cash paid for stock does not match the purchase orders',
      detail: `The ledger records ${formatDrift(poDrift)} ${poDrift > 0 ? 'more' : 'less'} against purchases than the received orders actually cost.`,
      href: '/ledger',
    });
  }

  const salesDrift = Number(row.ledger_sales_drift);
  if (Math.abs(salesDrift) >= 100) {
    alerts.push({
      id: 'ledger-sales-drift',
      severity: 'warning',
      title: 'Cash received does not match recorded sales',
      detail: `The ledger shows ${formatDrift(salesDrift)} ${salesDrift > 0 ? 'more' : 'less'} collected than the confirmed sales account for. A sale may be missing.`,
      href: '/sales',
    });
  }

  const oversold = count(row.oversold_lines);
  if (oversold > 0) {
    alerts.push({
      id: 'oversold',
      severity: 'warning',
      title: `${oversold} sale ${plural(oversold, 'line was', 'lines were')} sold short`,
      detail:
        'These lines drew on stock that had not been received, so their cost of goods is understated.',
      href: '/sales',
    });
  }

  const outOfStock = count(row.out_of_stock);
  if (outOfStock > 0) {
    alerts.push({
      id: 'out-of-stock',
      severity: 'warning',
      title: `${outOfStock} ${plural(outOfStock, 'product has', 'products have')} sold out`,
      detail: 'These have sold before and have nothing left on the shelf.',
      href: '/inventory',
    });
  }

  const lowStock = count(row.low_stock);
  if (lowStock > 0) {
    alerts.push({
      id: 'low-stock',
      severity: 'warning',
      title: `${lowStock} ${plural(lowStock, 'product is', 'products are')} running low`,
      detail: 'At or below the reorder threshold set in Settings.',
      href: '/inventory',
    });
  }

  const overdue = count(row.overdue_pos);
  if (overdue > 0) {
    alerts.push({
      id: 'overdue-po',
      severity: 'warning',
      title: `${overdue} purchase ${plural(overdue, 'order is', 'orders are')} overdue`,
      detail: 'Expected before today and still not marked received.',
      href: '/purchase-orders',
    });
  }

  const rateAge = row.rate_age_days === null ? null : Number(row.rate_age_days);
  if (rateAge === null) {
    alerts.push({
      id: 'no-rate',
      severity: 'critical',
      title: 'No exchange rate has been set',
      detail: 'Every SRD amount needs a USD rate to convert against.',
      href: '/settings',
    });
  } else if (rateAge > 7) {
    alerts.push({
      id: 'stale-rate',
      severity: 'info',
      title: `Exchange rate is ${rateAge} days old`,
      detail:
        'New transactions will be converted at this rate. Past ones keep the rate they were recorded with.',
      href: '/settings',
    });
  }

  const drafts = count(row.draft_sales);
  if (drafts > 0) {
    alerts.push({
      id: 'draft-sales',
      severity: 'info',
      title: `${drafts} ${plural(drafts, 'sale is', 'sales are')} still in draft`,
      detail: 'Drafts do not move stock, cash or margin until they are confirmed.',
      href: '/sales',
    });
  }

  return alerts;
}

function formatDrift(cents: Cents): string {
  return `$${(Math.abs(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
