import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents } from '@/lib/money';
import { hashPublicToken } from '@/lib/public-token';
import { db } from '../db/client';
import { maybe, num, text } from './row';

export type PublicInvoice = {
  id: string;
  number: string;
  invoiceNumber: string | null;
  status: 'confirmed';
  customerName: string | null;
  currency: 'USD' | 'SRD';
  fxRateMicros: number;
  totalCents: Cents;
  discountCents: Cents;
  discountReason: string | null;
  paymentMethod: string;
  soldAt: string;
  dueAt: string | null;
  notes: string | null;
  items: {
    productName: string;
    variantName: string;
    sku: string;
    quantity: number;
    unitPriceCents: Cents;
  }[];
};

/** Resolve only a confirmed invoice by its SHA-256 token hash. */
export async function getPublicInvoice(token: string): Promise<PublicInvoice | null> {
  if (!isDatabaseConfigured() || !token || token.length < 32) return null;
  const hash = hashPublicToken(token);
  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT s.id::text, s.number, s.invoice_number, s.status::text,
           c.name AS customer_name, s.currency::text, s.fx_rate_micros::text,
           s.total_cents::text, s.discount_cents::text, s.discount_reason,
           s.payment_method::text, s.sold_at::text, s.due_at::text, s.notes
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.public_token_hash = ${hash}
       AND s.status = 'confirmed'
     LIMIT 1
  `);
  if (!row) return null;

  const items = await db.execute<Record<string, string | null>>(sql`
    SELECT COALESCE(si.bundle_name, p.name) AS product_name,
           si.id::text AS id,
           CASE WHEN si.bundle_id IS NOT NULL THEN 'Bundle' ELSE v.name END AS variant_name,
           COALESCE(si.bundle_sku, v.sku) AS sku,
           si.quantity::text, si.unit_price_cents::text
      FROM sale_items si
      JOIN product_variants v ON v.id = si.variant_id
      JOIN products p ON p.id = v.product_id
     WHERE si.sale_id = ${row.id}
     ORDER BY si.position
  `);

  return {
    id: text(row.id),
    number: text(row.number),
    invoiceNumber: maybe(row.invoice_number),
    status: 'confirmed',
    customerName: maybe(row.customer_name),
    currency: text(row.currency, 'USD') as 'USD' | 'SRD',
    fxRateMicros: num(row.fx_rate_micros, 1_000_000),
    totalCents: num(row.total_cents),
    discountCents: num(row.discount_cents),
    discountReason: maybe(row.discount_reason),
    paymentMethod: text(row.payment_method),
    soldAt: text(row.sold_at),
    dueAt: maybe(row.due_at),
    notes: maybe(row.notes),
    items: items.map((item) => ({
      id: text(item.id),
      productName: text(item.product_name),
      variantName: text(item.variant_name),
      sku: text(item.sku),
      quantity: num(item.quantity),
      unitPriceCents: num(item.unit_price_cents),
    })),
  };
}
