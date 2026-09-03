import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents } from '@/lib/money';
import { OVERDUE_AFTER_DAYS } from '@/lib/payment-status';
import { db } from '../db/client';

/**
 * The `isDatabaseConfigured()` guard on each function below is a SETUP state,
 * not an outage. Only an ABSENT connection string returns empty; a failing
 * query still throws, because an empty dashboard must never be able to mean
 * "the database is down". See src/app/setup/page.tsx.
 */

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
    unposted_sales: string;
    unposted_orders: string;
    receivable_usd: string;
    overdue_sales: string;
    open_reconciliation: string;
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
      -- Since F-9 each supplier payment posts its own entry tagged with the
      -- payment's id; before that, receiving an order posted one entry tagged
      -- with the order. The fallback clause keeps counting those legacy rows:
      -- a source_id that is not a payment id but does name some purchase_order
      -- can only be an order-tagged posting. Manual ledger entries never carry
      -- a real uuid in source_id, so they cannot leak in either way.
      (COALESCE((SELECT SUM(CASE WHEN le.direction = 'out' THEN le.amount_usd_cents
                                 ELSE -le.amount_usd_cents END)
                  FROM ledger_entries le
                  WHERE le.source_kind = 'purchase_order'
                    AND (le.source_id IN (SELECT id FROM purchase_order_payments)
                         OR le.source_id IN (SELECT id FROM purchase_orders))), 0)
       - COALESCE((SELECT SUM(GREATEST(LEAST(COALESCE(paid.paid_usd_cents, legacy.posted_usd_cents, 0),
                                             o.landed_usd_cents), 0))
                    FROM (
                      SELECT p.id, SUM(i.landed_cost_cents)::bigint AS landed_usd_cents
                        FROM purchase_orders p
                        JOIN purchase_order_items i ON i.purchase_order_id = p.id
                        WHERE p.status = 'received' AND p.currency = 'USD'
                        GROUP BY p.id
                      ) o
                      LEFT JOIN (
                        SELECT pp.purchase_order_id,
                               SUM(CASE WHEN le.direction = 'out' THEN le.amount_usd_cents
                                        ELSE -le.amount_usd_cents END) AS paid_usd_cents
                          FROM purchase_order_payments pp
                          JOIN ledger_entries le
                            ON le.source_kind = 'purchase_order' AND le.source_id = pp.id
                         GROUP BY pp.purchase_order_id
                      ) paid ON paid.purchase_order_id = o.id
                      LEFT JOIN (
                        SELECT le.source_id AS purchase_order_id,
                               SUM(CASE WHEN le.direction = 'out' THEN le.amount_usd_cents
                                        ELSE -le.amount_usd_cents END) AS posted_usd_cents
                          FROM ledger_entries le
                          WHERE le.source_kind = 'purchase_order'
                            AND le.category = 'purchase'
                            AND le.source_id IN (SELECT id FROM purchase_orders)
                          GROUP BY le.source_id
                      ) legacy ON legacy.purchase_order_id = o.id), 0))::text AS ledger_po_drift,

      -- Cash booked as sales receipts, versus what should have been collected:
      -- every confirmed sale minus whatever is still outstanding (F-4). Credit
      -- sales legitimately hold cash back; over-collecting or losing a receipt
      -- does not. The overpayment of one sale cannot mask the shortfall of
      -- another because each line is clamped before it is summed.
      (COALESCE((SELECT SUM(CASE WHEN direction = 'in' THEN amount_usd_cents
                                 ELSE -amount_usd_cents END)
                  FROM ledger_entries
                  WHERE category = 'sales_receipt'), 0)
       - COALESCE((SELECT SUM(GREATEST(LEAST(COALESCE(p.paid_usd_cents, 0), s.total_usd_cents), 0))
                    FROM sales s
                    LEFT JOIN (
                      SELECT sale_id, SUM(paid_usd_cents) AS paid_usd_cents
                        FROM (
                          SELECT sp.sale_id,
                                 SUM(CASE WHEN le.direction = 'in' THEN le.amount_usd_cents
                                          ELSE -le.amount_usd_cents END) AS paid_usd_cents
                            FROM sale_payments sp
                            JOIN ledger_entries le
                              ON le.source_kind = 'sale' AND le.source_id = sp.id
                           GROUP BY sp.sale_id
                          UNION ALL
                          SELECT le.source_id AS sale_id,
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
                    WHERE s.status = 'confirmed'), 0))::text AS ledger_sales_drift,

      (SELECT COUNT(*) FROM sales WHERE status = 'draft')::text AS draft_sales,

      -- Confirmed sales with no trace in the ledger at all — a broken
      -- invariant. Before F-4 every one posted a single receipt tagged with
      -- the sale; a credit sale instead posts one entry per payment, each
      -- tagged with that payment's id. Either counts.
      (SELECT COUNT(*) FROM sales s
        WHERE s.status = 'confirmed'
          AND NOT EXISTS (SELECT 1 FROM ledger_entries l
                           WHERE l.source_kind = 'sale'
                             AND l.source_id = s.id
                             AND l.category = 'sales_receipt')
          AND NOT EXISTS (
            SELECT 1
              FROM sale_payments sp
              JOIN ledger_entries l
                ON l.source_kind = 'sale'
               AND l.source_id = sp.id
               AND l.category = 'sales_receipt'
             WHERE sp.sale_id = s.id
          )
      )::text AS unposted_sales,

      -- Received purchase orders with no payment of their own. Before F-9 a
      -- received order posted a single entry tagged with the order; since F-9
      -- each payment posts one tagged with the payment's id. Either counts,
      -- and an order whose payment was deliberately skipped at receive time
      -- is exactly what this should catch.
      (SELECT COUNT(*) FROM purchase_orders p
        WHERE p.status = 'received'
          AND NOT EXISTS (SELECT 1 FROM ledger_entries l
                           WHERE l.source_kind = 'purchase_order'
                             AND l.source_id = p.id
                             AND l.category = 'purchase')
          AND NOT EXISTS (
            SELECT 1
              FROM purchase_order_payments pp
              JOIN ledger_entries l
                ON l.source_kind = 'purchase_order'
               AND l.source_id = pp.id
               AND l.category = 'purchase'
             WHERE pp.purchase_order_id = p.id
          )
      )::text AS unposted_orders,

      -- Accounts receivable (F-4): money the business has earned and not yet
      -- holds. Not an error, so never more than info — but invisible in the
      -- spreadsheet, which is how it quietly became working capital.
      COALESCE((
        SELECT SUM(GREATEST(s.total_usd_cents - COALESCE(p.paid_usd_cents, 0), 0))
          FROM sales s
          LEFT JOIN (
            SELECT sale_id, SUM(paid_usd_cents) AS paid_usd_cents
              FROM (
                SELECT sp.sale_id,
                       SUM(CASE WHEN le.direction = 'in' THEN le.amount_usd_cents
                                ELSE -le.amount_usd_cents END) AS paid_usd_cents
                  FROM sale_payments sp
                  JOIN ledger_entries le ON le.source_kind = 'sale' AND le.source_id = sp.id
                 GROUP BY sp.sale_id
                UNION ALL
                SELECT le.source_id AS sale_id,
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
      ), 0)::text AS receivable_usd,

      (SELECT COUNT(*) FROM sales s
        WHERE s.status = 'confirmed'
          AND s.total_cents > (
            COALESCE((
              SELECT SUM(CASE WHEN l.direction = 'in' THEN l.amount_cents ELSE -l.amount_cents END)
                FROM ledger_entries l
               WHERE l.source_kind = 'sale'
                 AND l.category = 'sales_receipt'
                 AND l.source_id = s.id
            ), 0)
            + COALESCE((
              SELECT SUM(sp.amount_cents)
                FROM sale_payments sp
               WHERE sp.sale_id = s.id
            ), 0)
          )
          AND s.sold_at < now() - make_interval(days => ${OVERDUE_AFTER_DAYS})
      )::text AS overdue_sales
      ,(SELECT COUNT(*) FROM reconciliation_exceptions WHERE status = 'open')::text AS open_reconciliation
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

  const overdueSales = count(row.overdue_sales);
  if (overdueSales > 0) {
    alerts.push({
      id: 'overdue-sales',
      severity: 'warning',
      title: `${overdueSales} credit ${plural(overdueSales, 'sale is', 'sales are')} overdue`,
      detail: `Unpaid or only partly paid for more than ${OVERDUE_AFTER_DAYS} days. The money is owed and nobody has chased it.`,
      href: '/sales?status=confirmed',
    });
  }

  const receivable = Number(row.receivable_usd ?? 0);
  if (receivable >= 100) {
    alerts.push({
      id: 'money-owed',
      severity: 'info',
      title: `${formatDrift(receivable)} is owed on credit sales`,
      detail:
        'Confirmed sales whose money has not all arrived. It shows as earned in the P&L but is not yet in the bank.',
      href: '/sales',
    });
  }

  const unpostedSales = count(row.unposted_sales);
  if (unpostedSales > 0) {
    alerts.push({
      id: 'unposted-sales',
      severity: 'critical',
      title: `${unpostedSales} confirmed ${plural(unpostedSales, 'sale has', 'sales have')} no receipt in the ledger`,
      detail:
        'A confirmed sale with no cash receipt is a broken invariant. The cash balance is wrong and the P&L may be understated.',
      href: '/sales',
    });
  }

  const unpostedOrders = count(row.unposted_orders);
  if (unpostedOrders > 0) {
    alerts.push({
      id: 'unposted-orders',
      severity: 'critical',
      title: `${unpostedOrders} received ${plural(unpostedOrders, 'order has', 'orders have')} no payment in the ledger`,
      detail:
        'A received order with no payment posting means the cash balance is understated. The stock was received but the money was never recorded.',
      href: '/purchase-orders',
    });
  }

  const openReconciliation = count(row.open_reconciliation);
  if (openReconciliation > 0) {
    alerts.push({
      id: 'open-reconciliation',
      severity: 'critical',
      title: `${openReconciliation} open reconciliation ${plural(openReconciliation, 'item', 'items')}`,
      detail:
        'Known historical exceptions are documented for review. Resolve them from the original records; do not create replacement receipts or movements.',
      href: '/reports',
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
