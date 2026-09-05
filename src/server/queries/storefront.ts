import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import { db } from '../db/client';
import { maybe, num, text } from './row';

/** Dashboard-only operational totals. This is intentionally separate from the
 * public catalog query and includes no supplier or cost values. */
export async function getStorefrontOverview() {
  if (!isDatabaseConfigured()) return { published: 0, inStock: 0, outOfStock: 0, incoming: 0, waitingRestocks: 0, recentQuotes: 0 };
  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT
      (SELECT COUNT(*) FROM products WHERE catalog_published AND status = 'active')::text AS published,
      (SELECT COUNT(*) FROM products p WHERE p.catalog_published AND p.status = 'active' AND EXISTS (SELECT 1 FROM product_variants v JOIN v_stock_levels s ON s.variant_id = v.id WHERE v.product_id = p.id AND v.is_active AND s.on_hand > 0))::text AS in_stock,
      (SELECT COUNT(*) FROM products p WHERE p.catalog_published AND p.status = 'active' AND NOT EXISTS (SELECT 1 FROM product_variants v JOIN v_stock_levels s ON s.variant_id = v.id WHERE v.product_id = p.id AND v.is_active AND s.on_hand > 0))::text AS out_of_stock,
      (SELECT COALESCE(SUM(i.quantity - i.quantity_received), 0) FROM purchase_order_items i JOIN purchase_orders o ON o.id = i.purchase_order_id WHERE o.status IN ('ordered', 'shipped'))::text AS incoming,
      (SELECT COUNT(*) FROM restock_requests WHERE status = 'waiting')::text AS waiting_restocks,
      (SELECT COUNT(*) FROM quote_requests WHERE created_at >= now() - interval '30 days')::text AS recent_quotes
  `);
  return { published: num(row?.published), inStock: num(row?.in_stock), outOfStock: num(row?.out_of_stock), incoming: num(row?.incoming), waitingRestocks: num(row?.waiting_restocks), recentQuotes: num(row?.recent_quotes) };
}

export async function listRestockRequests() {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT r.id, r.contact, r.channel, r.status, r.created_at::text,
           p.name AS product_name, v.name AS variant_name
      FROM restock_requests r JOIN products p ON p.id = r.product_id
      LEFT JOIN product_variants v ON v.id = r.variant_id
     ORDER BY r.created_at DESC
  `);
  return rows.map((row) => ({ id: text(row.id), contact: text(row.contact), channel: text(row.channel), status: text(row.status) as 'waiting' | 'contacted' | 'converted' | 'cancelled', createdAt: text(row.created_at), productName: text(row.product_name), variantName: maybe(row.variant_name) }));
}

/** Private collection management read model. It intentionally includes only
 * merchandising state, never supplier, cost, or inventory valuation data. */
export async function listStorefrontCollectionsForDashboard() {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT c.id, c.name, c.slug, c.description, c.active::text,
           c.homepage_visible::text, c.position::text,
           COUNT(cp.product_id)::text AS product_count
      FROM storefront_collections c
      LEFT JOIN storefront_collection_products cp ON cp.collection_id = c.id
     GROUP BY c.id
     ORDER BY c.position, c.name
  `);
  return rows.map((row) => ({
    id: text(row.id), name: text(row.name), slug: text(row.slug),
    description: maybe(row.description), active: row.active === 'true',
    homepageVisible: row.homepage_visible === 'true', position: num(row.position),
    productCount: num(row.product_count),
  }));
}
