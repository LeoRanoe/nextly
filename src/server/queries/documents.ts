import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents } from '@/lib/money';
import { db } from '../db/client';
import { maybe, num, text } from './row';

/**
 * A document (a sale, a purchase order) together with everything it caused —
 * its line items and the ledger entries and stock movements it posted. Kept
 * apart from `lists.ts` (list read models) and `reference.ts` (slow-moving
 * reference data): a document with its consequences is a different shape of
 * thing from either, and one detail page's queries growing here does not
 * erode the boundary those two files each hold.
 */

/* ── Sales ───────────────────────────────────────────────────────────────── */

export type SaleDetail = {
  id: string;
  number: string;
  status: 'draft' | 'confirmed' | 'void';
  customerId: string | null;
  customerName: string | null;
  currency: 'USD' | 'SRD';
  fxRateMicros: number;
  totalCents: Cents;
  totalUsdCents: Cents;
  discountCents: Cents;
  discountReason: string | null;
  cogsCents: Cents;
  grossProfitCents: Cents;
  paymentMethod: string;
  soldAt: string;
  notes: string | null;
  items: {
    id: string;
    variantId: string;
    productId: string;
    productName: string;
    variantName: string;
    sku: string;
    quantity: number;
    quantityReturned: number;
    unitPriceCents: Cents;
    unitPriceUsdCents: Cents;
    lineTotalUsdCents: Cents;
    cogsCents: Cents;
    shortfall: number;
    /** F-6: serials captured at the point of sale, in the order typed. */
    serials: string[];
  }[];
  ledgerEntries: {
    id: string;
    direction: 'in' | 'out';
    description: string;
    amountUsdCents: Cents;
    occurredAt: string;
  }[];
  /** Money received against this sale (F-4). `paidCents` is in the currency of
   *  the sale, like `totalCents`; the legacy ledger fallback keeps old direct
   *  receipts truthful until the one-off reconciliation migrates them. */
  payments: {
    id: string;
    amountCents: Cents;
    method: string;
    receivedAt: string;
    notes: string | null;
  }[];
  paidCents: Cents;
  movements: {
    id: string;
    variantId: string;
    sku: string;
    quantity: number;
    valueCents: Cents;
    occurredAt: string;
  }[];
};

export async function getSale(id: string): Promise<SaleDetail | null> {
  if (!isDatabaseConfigured()) return null;

  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT
      s.id, s.number, s.status::text, s.customer_id, c.name AS customer_name,
      s.currency::text, s.fx_rate_micros::text,
      s.total_cents::text, s.total_usd_cents::text, s.discount_cents::text,
      s.discount_reason,
      s.cogs_cents::text, s.gross_profit_cents::text,
      s.payment_method::text, s.sold_at::text, s.notes,
      COALESCE((
        SELECT SUM(CASE WHEN l.direction = 'in' THEN l.amount_cents ELSE -l.amount_cents END)
          FROM ledger_entries l
         WHERE l.source_kind = 'sale'
           AND l.source_id = s.id
           AND l.category = 'sales_receipt'
      ), 0)::text AS legacy_paid_cents
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.id = ${id}
    LIMIT 1
  `);

  if (!row) return null;

  const [items, ledgerEntries, movements, payments, serials] = await Promise.all([
    db.execute<Record<string, string | null>>(sql`
      SELECT
        si.id, si.variant_id, v.product_id, p.name AS product_name,
        v.name AS variant_name, v.sku,
        si.quantity, si.quantity_returned,
        si.unit_price_cents::text, si.unit_price_usd_cents::text,
        si.line_total_usd_cents::text, si.cogs_cents::text, si.shortfall
      FROM sale_items si
      JOIN product_variants v ON v.id = si.variant_id
      JOIN products p ON p.id = v.product_id
      WHERE si.sale_id = ${id}
      ORDER BY si.position
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT id, direction::text, description, amount_usd_cents::text, occurred_at::text
        FROM ledger_entries
       WHERE source_kind = 'sale'
         AND (source_id = ${id}
              OR source_id IN (SELECT id FROM sale_payments WHERE sale_id = ${id}))
       ORDER BY occurred_at, seq
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT m.id, m.variant_id, v.sku, m.quantity, m.value_cents::text, m.occurred_at::text
        FROM inventory_movements m
        JOIN product_variants v ON v.id = m.variant_id
       WHERE m.source_kind = 'sale' AND m.source_id = ${id}
       ORDER BY m.occurred_at, m.seq
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT id, amount_cents::text, method::text, received_at::text, notes
        FROM sale_payments
       WHERE sale_id = ${id}
       ORDER BY received_at, created_at
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT sale_item_id, serial
        FROM sale_item_serials
       WHERE sale_item_id IN (SELECT id FROM sale_items WHERE sale_id = ${id})
       ORDER BY created_at, serial
    `),
  ]);

  const serialsByLine = new Map<string, string[]>();
  for (const row of serials) {
    const lineId = text(row.sale_item_id);
    const existing = serialsByLine.get(lineId);
    if (existing) existing.push(text(row.serial));
    else serialsByLine.set(lineId, [text(row.serial)]);
  }

  return {
    id: text(row.id),
    number: text(row.number),
    status: text(row.status) as SaleDetail['status'],
    customerId: maybe(row.customer_id),
    customerName: maybe(row.customer_name),
    currency: text(row.currency, 'USD') as SaleDetail['currency'],
    fxRateMicros: num(row.fx_rate_micros, 1_000_000),
    totalCents: num(row.total_cents),
    totalUsdCents: num(row.total_usd_cents),
    discountCents: num(row.discount_cents),
    discountReason: maybe(row.discount_reason),
    cogsCents: num(row.cogs_cents),
    grossProfitCents: num(row.gross_profit_cents),
    paymentMethod: text(row.payment_method),
    soldAt: text(row.sold_at),
    notes: maybe(row.notes),
    items: items.map((item) => ({
      id: text(item.id),
      variantId: text(item.variant_id),
      productId: text(item.product_id),
      productName: text(item.product_name),
      variantName: text(item.variant_name),
      sku: text(item.sku),
      quantity: num(item.quantity),
      quantityReturned: num(item.quantity_returned),
      unitPriceCents: num(item.unit_price_cents),
      unitPriceUsdCents: num(item.unit_price_usd_cents),
      lineTotalUsdCents: num(item.line_total_usd_cents),
      cogsCents: num(item.cogs_cents),
      shortfall: num(item.shortfall),
      serials: serialsByLine.get(text(item.id)) ?? [],
    })),
    ledgerEntries: ledgerEntries.map((entry) => ({
      id: text(entry.id),
      direction: text(entry.direction) as 'in' | 'out',
      description: text(entry.description),
      amountUsdCents: num(entry.amount_usd_cents),
      occurredAt: text(entry.occurred_at),
    })),
    payments: payments.map((payment) => ({
      id: text(payment.id),
      amountCents: num(payment.amount_cents),
      method: text(payment.method),
      receivedAt: text(payment.received_at),
      notes: maybe(payment.notes),
    })),
    paidCents:
      payments.reduce((total, payment) => total + num(payment.amount_cents), 0) +
      num(row.legacy_paid_cents),
    movements: movements.map((movement) => ({
      id: text(movement.id),
      variantId: text(movement.variant_id),
      sku: text(movement.sku),
      quantity: num(movement.quantity),
      valueCents: num(movement.value_cents),
      occurredAt: text(movement.occurred_at),
    })),
  };
}

/* ── Purchase orders ─────────────────────────────────────────────────────── */

export type PurchaseOrderDetail = {
  id: string;
  number: string;
  status: 'draft' | 'ordered' | 'shipped' | 'received' | 'cancelled';
  supplierId: string | null;
  supplierName: string | null;
  currency: 'USD' | 'SRD';
  fxRateMicros: number;
  taxCents: Cents;
  cardFeeCents: Cents;
  deliveryCents: Cents;
  shippingCents: Cents;
  shippingTaxCents: Cents;
  orderedAt: string | null;
  expectedAt: string | null;
  receivedAt: string | null;
  reference: string | null;
  notes: string | null;
  items: {
    id: string;
    variantId: string;
    productId: string;
    productName: string;
    variantName: string;
    sku: string;
    quantity: number;
    quantityReceived: number;
    subtotalCents: Cents;
    overheadCents: Cents;
    landedCostCents: Cents;
  }[];
  ledgerEntries: {
    id: string;
    direction: 'in' | 'out';
    description: string;
    amountUsdCents: Cents;
    occurredAt: string;
  }[];
  movements: {
    id: string;
    variantId: string;
    sku: string;
    quantity: number;
    valueCents: Cents;
    occurredAt: string;
  }[];
  /** Money paid to the supplier (F-9). Derived, never stored on the order. */
  paidCents: Cents;
  payments: {
    id: string;
    amountCents: Cents;
    method: string;
    paidAt: string;
    notes: string | null;
  }[];
};

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderDetail | null> {
  if (!isDatabaseConfigured()) return null;

  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT
      o.id, o.number, o.status::text, o.supplier_id, s.name AS supplier_name,
      o.currency::text, o.fx_rate_micros::text,
      o.tax_cents::text, o.card_fee_cents::text, o.delivery_cents::text,
      o.shipping_cents::text, o.shipping_tax_cents::text,
      o.ordered_at::text, o.expected_at::text, o.received_at::text,
      o.reference, o.notes,
      (
        COALESCE((SELECT SUM(pp.amount_cents) FROM purchase_order_payments pp
                   WHERE pp.purchase_order_id = o.id), 0)
        + COALESCE((
            SELECT SUM(CASE WHEN l.direction = 'out' THEN l.amount_cents ELSE -l.amount_cents END)
              FROM ledger_entries l
             WHERE l.source_kind = 'purchase_order'
               AND l.source_id = o.id
               AND l.category = 'purchase'
          ), 0)
      )::text AS paid_cents
    FROM purchase_orders o
    LEFT JOIN suppliers s ON s.id = o.supplier_id
    WHERE o.id = ${id}
    LIMIT 1
  `);

  if (!row) return null;

  const [items, ledgerEntries, movements, payments] = await Promise.all([
    db.execute<Record<string, string | null>>(sql`
      SELECT
        i.id, i.variant_id, v.product_id, p.name AS product_name,
        v.name AS variant_name, v.sku,
        i.quantity, i.quantity_received,
        i.subtotal_cents::text, i.overhead_cents::text, i.landed_cost_cents::text
      FROM purchase_order_items i
      JOIN product_variants v ON v.id = i.variant_id
      JOIN products p ON p.id = v.product_id
      WHERE i.purchase_order_id = ${id}
      ORDER BY i.position
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT id, direction::text, description, amount_usd_cents::text, occurred_at::text
        FROM ledger_entries
       WHERE source_kind = 'purchase_order'
         AND (source_id = ${id}
              OR source_id IN (SELECT id FROM purchase_order_payments WHERE purchase_order_id = ${id}))
       ORDER BY occurred_at, seq
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT m.id, m.variant_id, v.sku, m.quantity, m.value_cents::text, m.occurred_at::text
        FROM inventory_movements m
        JOIN product_variants v ON v.id = m.variant_id
       WHERE m.source_kind = 'purchase_order' AND m.source_id = ${id}
       ORDER BY m.occurred_at, m.seq
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT id, amount_cents::text, method::text, paid_at::text, notes
        FROM purchase_order_payments
       WHERE purchase_order_id = ${id}
       ORDER BY paid_at, created_at
    `),
  ]);

  return {
    id: text(row.id),
    number: text(row.number),
    status: text(row.status) as PurchaseOrderDetail['status'],
    supplierId: maybe(row.supplier_id),
    supplierName: maybe(row.supplier_name),
    currency: text(row.currency, 'USD') as PurchaseOrderDetail['currency'],
    fxRateMicros: num(row.fx_rate_micros, 1_000_000),
    taxCents: num(row.tax_cents),
    cardFeeCents: num(row.card_fee_cents),
    deliveryCents: num(row.delivery_cents),
    shippingCents: num(row.shipping_cents),
    shippingTaxCents: num(row.shipping_tax_cents),
    orderedAt: maybe(row.ordered_at),
    expectedAt: maybe(row.expected_at),
    receivedAt: maybe(row.received_at),
    reference: maybe(row.reference),
    notes: maybe(row.notes),
    items: items.map((item) => ({
      id: text(item.id),
      variantId: text(item.variant_id),
      productId: text(item.product_id),
      productName: text(item.product_name),
      variantName: text(item.variant_name),
      sku: text(item.sku),
      quantity: num(item.quantity),
      quantityReceived: num(item.quantity_received),
      subtotalCents: num(item.subtotal_cents),
      overheadCents: num(item.overhead_cents),
      landedCostCents: num(item.landed_cost_cents),
    })),
    paidCents: num(row.paid_cents),
    ledgerEntries: ledgerEntries.map((entry) => ({
      id: text(entry.id),
      direction: text(entry.direction) as 'in' | 'out',
      description: text(entry.description),
      amountUsdCents: num(entry.amount_usd_cents),
      occurredAt: text(entry.occurred_at),
    })),
    movements: movements.map((movement) => ({
      id: text(movement.id),
      variantId: text(movement.variant_id),
      sku: text(movement.sku),
      quantity: num(movement.quantity),
      valueCents: num(movement.value_cents),
      occurredAt: text(movement.occurred_at),
    })),
    payments: payments.map((payment) => ({
      id: text(payment.id),
      amountCents: num(payment.amount_cents),
      method: text(payment.method),
      paidAt: text(payment.paid_at),
      notes: maybe(payment.notes),
    })),
  };
}
