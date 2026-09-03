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
    defaultSupplierLeadTimeDays: settings?.defaultSupplierLeadTimeDays ?? 28,
    weeklyBudgetCents: settings?.weeklyPurchaseBudgetCents ?? null,
  };
  const rows = await db.execute<Record<string, string | null>>(sql`
    WITH sale_base AS (
      SELECT si.id AS sale_item_id, si.sale_id, si.variant_id, si.bundle_id,
             si.quantity, si.quantity_returned,
             GREATEST(si.quantity - si.quantity_returned, 0) AS net_quantity,
             si.line_total_usd_cents, si.cogs_cents,
             si.bundle_name
        FROM sale_items si
        JOIN sales sale ON sale.id = si.sale_id
       WHERE sale.status = 'confirmed'
         AND sale.sold_at >= CURRENT_DATE - INTERVAL '90 days'
    ),
    normal_stats AS (
      SELECT variant_id,
             SUM(net_quantity)::numeric AS units_sold,
             SUM(ROUND(line_total_usd_cents::numeric * net_quantity / NULLIF(quantity, 0)))::numeric AS revenue_cents,
             SUM(ROUND((line_total_usd_cents - cogs_cents)::numeric * net_quantity / NULLIF(quantity, 0)))::numeric AS profit_cents
        FROM sale_base
       WHERE bundle_id IS NULL
       GROUP BY variant_id
    ),
    bundle_component_sales AS (
      SELECT sb.sale_item_id, sb.sale_id, sb.bundle_id, sb.quantity, sb.net_quantity,
             sb.line_total_usd_cents, sic.variant_id, sic.quantity_per_bundle,
             sic.cogs_cents AS component_cogs_cents,
             SUM(sic.cogs_cents) OVER (PARTITION BY sic.sale_item_id) AS bundle_cogs_cents,
             COUNT(*) OVER (PARTITION BY sic.sale_item_id) AS component_count
        FROM sale_base sb
        JOIN sale_item_components sic ON sic.sale_item_id = sb.sale_item_id
       WHERE sb.bundle_id IS NOT NULL
    ),
    bundle_stats AS (
      SELECT variant_id,
             SUM(quantity_per_bundle * net_quantity)::numeric AS units_sold,
             SUM(ROUND(
               line_total_usd_cents::numeric
               * CASE WHEN bundle_cogs_cents > 0
                   THEN component_cogs_cents::numeric / bundle_cogs_cents
                   ELSE 1::numeric / NULLIF(component_count, 0)
                 END
               * net_quantity / NULLIF(quantity, 0)
             ))::numeric AS revenue_cents,
             SUM(ROUND(component_cogs_cents::numeric * net_quantity / NULLIF(quantity, 0)))::numeric AS cogs_cents
        FROM bundle_component_sales
       GROUP BY variant_id
    ),
    sales_by_variant AS (
      SELECT variant_id, SUM(units_sold)::numeric AS units_sold,
             SUM(revenue_cents)::numeric AS revenue_cents,
             SUM(profit_cents)::numeric AS profit_cents
        FROM (
          SELECT variant_id, units_sold, revenue_cents, profit_cents FROM normal_stats
          UNION ALL
          SELECT variant_id, units_sold, revenue_cents, revenue_cents - cogs_cents FROM bundle_stats
        ) stats
       GROUP BY variant_id
    ),
    sale_variant_map AS (
      SELECT sale_item_id, sale_id, variant_id, net_quantity AS quantity
        FROM sale_base
       WHERE bundle_id IS NULL
      UNION ALL
      SELECT bcs.sale_item_id, bcs.sale_id, bcs.variant_id,
             bcs.net_quantity * bcs.quantity_per_bundle
        FROM bundle_component_sales bcs
    ),
    bundle_support AS (
      SELECT bcs.variant_id,
             CONCAT('bundle ', b.name) AS supporting_for,
             SUM(bcs.quantity)::numeric AS signal
        FROM bundle_component_sales bcs
        JOIN bundles b ON b.id = bcs.bundle_id
       GROUP BY bcs.variant_id, b.name
    ),
    co_purchase_support AS (
      SELECT a.variant_id,
             CONCAT(p2.name, ' · ', v2.name) AS supporting_for,
             SUM(LEAST(a.quantity, b.quantity))::numeric AS signal
        FROM sale_variant_map a
        JOIN sale_variant_map b
          ON b.sale_id = a.sale_id AND b.variant_id <> a.variant_id
        JOIN product_variants v2 ON v2.id = b.variant_id
        JOIN products p2 ON p2.id = v2.product_id
       GROUP BY a.variant_id, p2.name, v2.name
    ),
    support_ranked AS (
      SELECT candidate.variant_id, candidate.supporting_for, candidate.signal,
             ROW_NUMBER() OVER (
               PARTITION BY candidate.variant_id
               ORDER BY candidate.signal DESC, candidate.supporting_for
             ) AS position
        FROM (
          SELECT * FROM bundle_support
          UNION ALL
          SELECT * FROM co_purchase_support
        ) candidate
    )
    SELECT v.id AS variant_id, p.supplier_id::text AS supplier_id,
      s.name AS supplier_name, s.kind::text AS supplier_kind,
      CONCAT(p.name, ' · ', v.name, ' (', v.sku, ')') AS name,
      p.source_url,
      COALESCE(stats.units_sold, 0)::text AS units_sold,
      COALESCE(stats.profit_cents, 0)::text AS profit_cents,
      COALESCE(stats.revenue_cents, 0)::text AS revenue_cents,
      COALESCE((SELECT SUM(sl.on_hand) FROM v_stock_levels sl WHERE sl.variant_id = v.id), 0)::text AS on_hand,
      COALESCE((SELECT SUM(i.quantity - i.quantity_received) FROM purchase_order_items i
        JOIN purchase_orders o ON o.id = i.purchase_order_id
        WHERE i.variant_id = v.id AND o.status IN ('ordered','shipped')), 0)::text AS inbound,
      COALESCE((SELECT ROUND(SUM(i.landed_cost_cents)::numeric / NULLIF(SUM(i.quantity_received), 0))
        FROM purchase_order_items i JOIN purchase_orders o ON o.id = i.purchase_order_id
        WHERE i.variant_id = v.id AND o.status = 'received' AND i.quantity_received > 0), v.reference_cost_cents, 0)::text AS landed_cost,
      COALESCE(s.lead_time_days, ${policy.defaultSupplierLeadTimeDays})::text AS lead_time,
      v.is_strategic::text AS is_strategic,
      v.weight_grams::text AS weight_grams,
      support.supporting_for,
      COALESCE(LEAST(1, support.signal / NULLIF(stats.units_sold, 0)), 0)::text AS supporting_score
    FROM product_variants v JOIN products p ON p.id = v.product_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    LEFT JOIN sales_by_variant stats ON stats.variant_id = v.id
    LEFT JOIN support_ranked support ON support.variant_id = v.id AND support.position = 1
    WHERE v.is_active = true AND p.status <> 'archived'
      AND (COALESCE(stats.units_sold, 0) > 0 OR v.is_strategic = true)
    ORDER BY p.name, v.name
  `);
  return calculateReorderRecommendations(
    rows.map((row) => ({
      variantId: text(row.variant_id),
      supplierId: row.supplier_id ?? null,
      supplierName: row.supplier_name ?? null,
      supplierKind: row.supplier_kind ?? null,
      name: text(row.name),
      unitsSold90d: num(row.units_sold),
      grossProfitCents90d: num(row.profit_cents),
      revenueCents90d: num(row.revenue_cents),
      onHand: num(row.on_hand),
      inbound: num(row.inbound),
      landedUnitCostCents: num(row.landed_cost),
      supplierLeadTimeDays: num(row.lead_time, policy.defaultSupplierLeadTimeDays),
      hasEnoughHistory: num(row.units_sold) >= 3,
      strategicStock: row.is_strategic === 'true',
      supportingFor: row.supporting_for ?? null,
      supportingScore: num(row.supporting_score),
      weightGrams: num(row.weight_grams),
    })),
    policy,
  );
}

export type ReorderSnapshotLine = {
  variantId: string;
  recommendedQty: number;
  budgetQty: number;
  deferredQty: number;
  score: number;
  reasons: string[];
  lowConfidence: boolean;
};

export type ReorderSnapshot = {
  id: string;
  runDate: string;
  status: string;
  error: string | null;
  createdAt: string;
  lines: ReorderSnapshotLine[];
};

/** The most recent run is used for a comparison hint in the review queue. */
export async function getLatestReorderSnapshot(): Promise<ReorderSnapshot | null> {
  if (!isDatabaseConfigured()) return null;
  const [run] = await db.execute<Record<string, string | null>>(sql`
    SELECT id::text, run_date::text, status, error, created_at::text
      FROM reorder_runs
     ORDER BY run_date DESC
     LIMIT 1
  `);
  if (!run) return null;
  const lines = await db.execute<Record<string, string | null>>(sql`
    SELECT variant_id::text, recommended_qty::text, budget_qty::text,
           deferred_qty::text, score::text, reasons, low_confidence::text
      FROM reorder_recommendations
     WHERE run_id = ${run.id}
     ORDER BY score DESC, recommended_qty DESC
  `);
  return {
    id: text(run.id),
    runDate: text(run.run_date),
    status: text(run.status),
    error: run.error ?? null,
    createdAt: text(run.created_at),
    lines: lines.map((line) => ({
      variantId: text(line.variant_id),
      recommendedQty: num(line.recommended_qty),
      budgetQty: num(line.budget_qty),
      deferredQty: num(line.deferred_qty),
      score: num(line.score),
      reasons: Array.isArray(line.reasons) ? line.reasons.map(String) : [],
      lowConfidence: line.low_confidence === 'true',
    })),
  };
}

export type ReorderHistoryRow = {
  id: string;
  runDate: string;
  status: string;
  error: string | null;
  createdAt: string;
  lineCount: number;
  recommendedUnits: number;
  budgetCostCents: number;
};

/** A compact history read model; full rationale remains on each run's lines. */
export async function listReorderHistory(limit = 12): Promise<ReorderHistoryRow[]> {
  if (!isDatabaseConfigured()) return [];
  const safeLimit = Math.min(52, Math.max(1, Math.floor(limit)));
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT r.id::text, r.run_date::text, r.status, r.error, r.created_at::text,
           COUNT(rr.id)::text AS line_count,
           COALESCE(SUM(rr.recommended_qty), 0)::text AS recommended_units,
           COALESCE(SUM(rr.budget_qty * rr.landed_unit_cost_cents), 0)::text AS budget_cost_cents
      FROM reorder_runs r
      LEFT JOIN reorder_recommendations rr ON rr.run_id = r.id
     GROUP BY r.id
     ORDER BY r.run_date DESC
     LIMIT ${safeLimit}
  `);
  return rows.map((row) => ({
    id: text(row.id),
    runDate: text(row.run_date),
    status: text(row.status),
    error: row.error ?? null,
    createdAt: text(row.created_at),
    lineCount: num(row.line_count),
    recommendedUnits: num(row.recommended_units),
    budgetCostCents: num(row.budget_cost_cents),
  }));
}
