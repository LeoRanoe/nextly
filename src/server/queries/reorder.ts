import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import { calculateReorderRecommendations, type ReorderRecommendation } from '@/lib/reorder';
import { db } from '../db/client';
import { getSettings } from './reference';
import { num, text } from './row';

export async function getReorderRecommendations(): Promise<ReorderRecommendation[]> {
  if (!isDatabaseConfigured()) return [];
  const settings = await getSettings();
  const policy = {
    reviewHorizonDays: settings?.reviewHorizonDays ?? 14,
    safetyStockDays: settings?.safetyStockDays ?? 7,
    weeklyBudgetCents: settings?.weeklyPurchaseBudgetCents ?? null,
  };
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT v.id AS variant_id, COALESCE(p.supplier_id, NULL)::text AS supplier_id,
      CONCAT(p.name, ' · ', v.name, ' (', v.sku, ')') AS name,
      COALESCE((SELECT SUM(si.quantity - si.quantity_returned)
        FROM sale_items si JOIN sales s ON s.id = si.sale_id
        WHERE si.variant_id = v.id AND s.status = 'confirmed'
          AND s.sold_at >= CURRENT_DATE - INTERVAL '90 days'), 0)::text AS units_sold,
      COALESCE((SELECT SUM(si.line_total_usd_cents - si.cogs_cents)
        FROM sale_items si JOIN sales s ON s.id = si.sale_id
        WHERE si.variant_id = v.id AND s.status = 'confirmed'
          AND s.sold_at >= CURRENT_DATE - INTERVAL '90 days'), 0)::text AS profit_cents,
      COALESCE((SELECT SUM(si.line_total_usd_cents)
        FROM sale_items si JOIN sales s ON s.id = si.sale_id
        WHERE si.variant_id = v.id AND s.status = 'confirmed'
          AND s.sold_at >= CURRENT_DATE - INTERVAL '90 days'), 0)::text AS revenue_cents,
      COALESCE((SELECT SUM(sl.on_hand) FROM v_stock_levels sl WHERE sl.variant_id = v.id), 0)::text AS on_hand,
      COALESCE((SELECT SUM(i.quantity - i.quantity_received) FROM purchase_order_items i
        JOIN purchase_orders o ON o.id = i.purchase_order_id
        WHERE i.variant_id = v.id AND o.status IN ('draft','ordered','shipped')), 0)::text AS inbound,
      COALESCE((SELECT ROUND(SUM(i.landed_cost_cents)::numeric / NULLIF(SUM(i.quantity_received), 0))
        FROM purchase_order_items i JOIN purchase_orders o ON o.id = i.purchase_order_id
        WHERE i.variant_id = v.id AND o.status = 'received' AND i.quantity_received > 0), v.reference_cost_cents, 0)::text AS landed_cost,
      COALESCE(s.lead_time_days, ${policy.reviewHorizonDays + policy.safetyStockDays})::text AS lead_time
    FROM product_variants v JOIN products p ON p.id = v.product_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE v.is_active = true AND p.status <> 'archived'
    ORDER BY p.name, v.name
  `);
  return calculateReorderRecommendations(
    rows.map((row) => ({
      variantId: text(row.variant_id),
      supplierId: row.supplier_id ?? null,
      name: text(row.name),
      unitsSold90d: num(row.units_sold),
      grossProfitCents90d: num(row.profit_cents),
      revenueCents90d: num(row.revenue_cents),
      onHand: num(row.on_hand),
      inbound: num(row.inbound),
      landedUnitCostCents: num(row.landed_cost),
      supplierLeadTimeDays: num(row.lead_time, 28),
      hasEnoughHistory: num(row.units_sold) >= 3,
    })),
    policy,
  );
}
