import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import { type WarrantyState, warrantyExpiresAt, warrantyState } from '@/lib/warranty';
import { db } from '../db/client';
import { maybe, num, text } from './row';

/**
 * Serial numbers and the warranty they carry (F-6).
 *
 * A serial only means something because of the sale it rode out on, so every
 * read here joins through `sale_items` to `sales`: who bought it, when, and
 * whether the product's term has run out. Expiry is derived from `sold_at`
 * plus the product's current `warranty_months` — see src/lib/warranty.ts for
 * why it is never stored.
 */

export type WarrantyItem = {
  serial: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  saleId: string;
  saleNumber: string;
  /** Name of whoever bought it — meaningful on the product view, redundant
   *  on the customer's own page. Null for a walk-in sale. */
  customerName: string | null;
  soldAt: string;
  warrantyMonths: number;
  /** ISO timestamp, or null when the product carries no warranty. */
  expiresAt: string | null;
  state: WarrantyState;
};

function toWarrantyItem(row: Record<string, string | null>, now: Date): WarrantyItem {
  const months = num(row.warranty_months);
  const soldAt = text(row.sold_at);
  const expiresAt = warrantyExpiresAt(soldAt, months);
  return {
    serial: text(row.serial),
    productId: text(row.product_id),
    productName: text(row.product_name),
    variantName: text(row.variant_name),
    sku: text(row.sku),
    saleId: text(row.sale_id),
    saleNumber: text(row.sale_number),
    customerName: maybe(row.customer_name),
    soldAt,
    warrantyMonths: months,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    state: warrantyState(expiresAt, now),
  };
}

/** Everything this customer bought that has a serial, newest first. */
export async function listCustomerWarrantyItems(customerId: string): Promise<WarrantyItem[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      ser.serial, p.id AS product_id, p.name AS product_name,
      v.name AS variant_name, v.sku,
      s.id AS sale_id, s.number AS sale_number, s.sold_at::text,
      c.name AS customer_name,
      COALESCE(p.warranty_months, 0)::text AS warranty_months
    FROM sale_item_serials ser
    JOIN sale_items si ON si.id = ser.sale_item_id
    JOIN sales s ON s.id = si.sale_id
    JOIN product_variants v ON v.id = si.variant_id
    JOIN products p ON p.id = v.product_id
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.customer_id = ${customerId} AND s.status <> 'void'
    ORDER BY s.sold_at DESC, ser.serial
  `);

  const now = new Date();
  return rows.map((row) => toWarrantyItem(row, now));
}

/** Everything of this product's that went out with a serial, newest first.
 *  `productWarrantyMonths` overrides the stored term when given (the detail
 *  page passes its own already-loaded value so the section cannot disagree
 *  with the form above it). */
export async function listProductWarrantyItems(
  productId: string,
  productWarrantyMonths?: number,
): Promise<WarrantyItem[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      ser.serial, p.id AS product_id, p.name AS product_name,
      v.name AS variant_name, v.sku,
      s.id AS sale_id, s.number AS sale_number, s.sold_at::text,
      c.name AS customer_name,
      COALESCE(p.warranty_months, 0)::text AS warranty_months
    FROM sale_item_serials ser
    JOIN sale_items si ON si.id = ser.sale_item_id
    JOIN sales s ON s.id = si.sale_id
    JOIN product_variants v ON v.id = si.variant_id
    JOIN products p ON p.id = v.product_id
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE p.id = ${productId} AND s.status <> 'void'
    ORDER BY s.sold_at DESC, ser.serial
  `);

  const now = new Date();
  return rows.map((row) => {
    const item = toWarrantyItem(row, now);
    if (productWarrantyMonths === undefined) return item;
    const expiresAt = warrantyExpiresAt(item.soldAt, productWarrantyMonths);
    return {
      ...item,
      warrantyMonths: productWarrantyMonths,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      state: warrantyState(expiresAt, now),
    };
  });
}

export type SerialHit = {
  serial: string;
  saleId: string;
  saleNumber: string;
  productName: string;
  customerName: string | null;
};

/**
 * Prefix search for the command palette: type the beginning of a serial and
 * find the sale it went out on.
 *
 * Prefix (`LIKE 'x%'`) rather than infix: an infix `%…%` cannot use the index
 * and turns a keystroke-debounce into a table scan. Someone reading a serial
 * off a box types it from the front, which is exactly what this serves. Short
 * queries are refused because they would return half the shelf.
 */
export async function searchSerials(term: string, limit = 8): Promise<SerialHit[]> {
  const prefix = term.trim();
  if (!isDatabaseConfigured() || prefix.length < 3) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      ser.serial, s.id AS sale_id, s.number AS sale_number,
      p.name AS product_name, c.name AS customer_name
    FROM sale_item_serials ser
    JOIN sale_items si ON si.id = ser.sale_item_id
    JOIN sales s ON s.id = si.sale_id
    JOIN product_variants v ON v.id = si.variant_id
    JOIN products p ON p.id = v.product_id
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE ser.serial ILIKE ${`${prefix}%`} AND s.status <> 'void'
    ORDER BY ser.serial
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    serial: text(row.serial),
    saleId: text(row.sale_id),
    saleNumber: text(row.sale_number),
    productName: text(row.product_name),
    customerName: maybe(row.customer_name),
  }));
}
