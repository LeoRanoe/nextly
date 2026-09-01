import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents } from '@/lib/money';
import { db } from '../db/client';
import { bool, maybe, num, text } from './row';

/**
 * The `isDatabaseConfigured()` guard on each function below is a SETUP state,
 * not an outage. Only an ABSENT connection string returns empty; a failing
 * query still throws, because an empty dashboard must never be able to mean
 * "the database is down". See src/app/setup/page.tsx.
 */

/**
 * List read models.
 *
 * One query per page, shaped exactly like the table it fills. Deliberately not
 * a generic repository: an aggregate report is easier to reason about and far
 * easier to make fast when it is written as the one query it actually is.
 */

export type ProductRow = {
  id: string;
  code: string;
  name: string;
  categoryName: string | null;
  supplierName: string | null;
  status: 'draft' | 'active' | 'archived';
  catalogPublished: boolean;
  variantCount: number;
  imageCount: number;
  onHand: number;
  stockValueCents: Cents;
  listPriceCents: Cents;
};

export async function listProducts(): Promise<ProductRow[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      p.id, p.code, p.name, p.status::text AS status,
      p.catalog_published::text AS catalog_published,
      c.name AS category_name,
      s.name AS supplier_name,
      (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id)::text AS variant_count,
      (SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id)::text AS image_count,
      COALESCE((SELECT SUM(sl.on_hand) FROM v_stock_levels sl
                 WHERE sl.product_id = p.id), 0)::text AS on_hand,
      COALESCE((SELECT SUM(sl.value_cents) FROM v_stock_levels sl
                 WHERE sl.product_id = p.id), 0)::text AS stock_value_cents,
      COALESCE((SELECT MIN(v.list_price_cents) FROM product_variants v
                 WHERE v.product_id = p.id AND v.is_active), 0)::text AS list_price_cents
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN suppliers  s ON s.id = p.supplier_id
    ORDER BY p.name
  `);

  return rows.map((row) => ({
    id: text(row.id),
    code: text(row.code),
    name: text(row.name),
    categoryName: maybe(row.category_name),
    supplierName: maybe(row.supplier_name),
    status: text(row.status) as ProductRow['status'],
    catalogPublished: bool(row.catalog_published),
    variantCount: num(row.variant_count),
    imageCount: num(row.image_count),
    onHand: num(row.on_hand),
    stockValueCents: num(row.stock_value_cents),
    listPriceCents: num(row.list_price_cents),
  }));
}

export type StockLevelRow = {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  categoryName: string | null;
  onHand: number;
  received: number;
  sold: number;
  inbound: number;
  valueCents: Cents;
  /** Derived, not stored: value / quantity carries sub-cent precision. */
  unitCostCents: number | null;
  lastMovementAt: string | null;
};

export async function listStock(): Promise<StockLevelRow[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      s.variant_id, s.sku, s.product_name, s.variant_name,
      s.on_hand::text, s.total_received::text, s.total_sold::text,
      s.value_cents::text, s.last_movement_at::text,
      c.name AS category_name,
      COALESCE((
        SELECT SUM(i.quantity - i.quantity_received)
          FROM purchase_order_items i
          JOIN purchase_orders p ON p.id = i.purchase_order_id
         WHERE i.variant_id = s.variant_id AND p.status IN ('ordered', 'shipped')
      ), 0)::text AS inbound
    FROM v_stock_levels s
    JOIN products pr ON pr.id = s.product_id
    LEFT JOIN categories c ON c.id = pr.category_id
    ORDER BY s.product_name, s.variant_name
  `);

  return rows.map((row) => {
    const onHand = num(row.on_hand);
    const valueCents = num(row.value_cents);
    return {
      variantId: text(row.variant_id),
      sku: text(row.sku),
      productName: text(row.product_name),
      variantName: text(row.variant_name),
      categoryName: maybe(row.category_name),
      onHand,
      received: num(row.total_received),
      sold: num(row.total_sold),
      inbound: num(row.inbound),
      valueCents,
      unitCostCents: onHand > 0 ? valueCents / onHand : null,
      lastMovementAt: maybe(row.last_movement_at),
    };
  });
}

export type LedgerRow = {
  id: string;
  seq: number;
  occurredAt: string;
  direction: 'in' | 'out';
  category: string;
  description: string;
  memberName: string | null;
  paymentMethod: string;
  netCents: Cents;
  balanceCents: Cents;
};

export async function listLedger(limit = 200): Promise<LedgerRow[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      l.id, l.seq::text, l.occurred_at::text, l.direction::text, l.category::text,
      l.description, l.payment_method::text, l.net_usd_cents::text,
      l.balance_usd_cents::text, m.full_name AS member_name
    FROM v_cash_ledger l
    LEFT JOIN members m ON m.id = l.member_id
    ORDER BY l.occurred_at DESC, l.seq DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: text(row.id),
    seq: num(row.seq),
    occurredAt: text(row.occurred_at),
    direction: text(row.direction) as 'in' | 'out',
    category: text(row.category),
    description: text(row.description),
    memberName: maybe(row.member_name),
    paymentMethod: text(row.payment_method),
    netCents: num(row.net_usd_cents),
    balanceCents: num(row.balance_usd_cents),
  }));
}

export type SaleRow = {
  id: string;
  number: string;
  soldAt: string;
  customerName: string | null;
  status: 'draft' | 'confirmed' | 'void';
  currency: string;
  itemCount: number;
  unitCount: number;
  totalUsdCents: Cents;
  cogsCents: Cents;
  grossCents: Cents;
  paymentMethod: string;
};

export async function listSales(limit = 200): Promise<SaleRow[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      s.id, s.number, s.sold_at::text, s.status::text, s.currency::text,
      s.total_usd_cents::text, s.cogs_cents::text, s.gross_profit_cents::text,
      s.payment_method::text, c.name AS customer_name,
      (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id = s.id)::text AS item_count,
      COALESCE((SELECT SUM(i.quantity) FROM sale_items i WHERE i.sale_id = s.id), 0)::text
        AS unit_count
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    ORDER BY s.sold_at DESC, s.number DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: text(row.id),
    number: text(row.number),
    soldAt: text(row.sold_at),
    customerName: maybe(row.customer_name),
    status: text(row.status) as SaleRow['status'],
    currency: text(row.currency),
    itemCount: num(row.item_count),
    unitCount: num(row.unit_count),
    totalUsdCents: num(row.total_usd_cents),
    cogsCents: num(row.cogs_cents),
    grossCents: num(row.gross_profit_cents),
    paymentMethod: text(row.payment_method),
  }));
}

export type PurchaseOrderRow = {
  id: string;
  number: string;
  supplierName: string | null;
  status: 'draft' | 'ordered' | 'shipped' | 'received' | 'cancelled';
  orderedAt: string | null;
  expectedAt: string | null;
  receivedAt: string | null;
  itemCount: number;
  unitCount: number;
  goodsCents: Cents;
  overheadCents: Cents;
  totalCents: Cents;
  /** True when a received order still has un-costed freight and fees. */
  unallocated: boolean;
};

export async function listPurchaseOrders(limit = 200): Promise<PurchaseOrderRow[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      p.id, p.number, p.status::text, p.ordered_at::text, p.expected_at::text,
      p.received_at::text, s.name AS supplier_name,
      (p.tax_cents + p.card_fee_cents + p.delivery_cents
       + p.shipping_cents + p.shipping_tax_cents)::text AS overhead_cents,
      COALESCE((SELECT SUM(i.subtotal_cents) FROM purchase_order_items i
                 WHERE i.purchase_order_id = p.id), 0)::text AS goods_cents,
      (SELECT COUNT(*) FROM purchase_order_items i
        WHERE i.purchase_order_id = p.id)::text AS item_count,
      COALESCE((SELECT SUM(i.quantity) FROM purchase_order_items i
                 WHERE i.purchase_order_id = p.id), 0)::text AS unit_count,
      (p.status = 'received'
        AND (p.tax_cents + p.card_fee_cents + p.delivery_cents
             + p.shipping_cents + p.shipping_tax_cents) > 0
        AND COALESCE((SELECT SUM(i.overhead_cents) FROM purchase_order_items i
                       WHERE i.purchase_order_id = p.id), 0) = 0)::text AS unallocated
    FROM purchase_orders p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    ORDER BY COALESCE(p.ordered_at, p.created_at) DESC, p.number DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => {
    const goodsCents = num(row.goods_cents);
    const overheadCents = num(row.overhead_cents);
    return {
      id: text(row.id),
      number: text(row.number),
      supplierName: maybe(row.supplier_name),
      status: text(row.status) as PurchaseOrderRow['status'],
      orderedAt: maybe(row.ordered_at),
      expectedAt: maybe(row.expected_at),
      receivedAt: maybe(row.received_at),
      itemCount: num(row.item_count),
      unitCount: num(row.unit_count),
      goodsCents,
      overheadCents,
      totalCents: goodsCents + overheadCents,
      unallocated: bool(row.unallocated),
    };
  });
}

export type CustomerRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  notes: string | null;
  orderCount: number;
  spentCents: Cents;
  grossCents: Cents;
  lastOrderAt: string | null;
};

export async function listCustomers(): Promise<CustomerRow[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      c.id, c.code, c.name, c.phone, c.email, c.address_line, c.city, c.notes,
      t.order_count::text, t.spent_usd_cents::text,
      t.gross_profit_cents::text, t.last_order_at::text
    FROM customers c
    JOIN v_customer_totals t ON t.customer_id = c.id
    ORDER BY t.spent_usd_cents DESC, c.name
  `);

  return rows.map((row) => ({
    id: text(row.id),
    code: text(row.code),
    name: text(row.name),
    phone: maybe(row.phone),
    email: maybe(row.email),
    addressLine: maybe(row.address_line),
    city: maybe(row.city),
    notes: maybe(row.notes),
    orderCount: num(row.order_count),
    spentCents: num(row.spent_usd_cents),
    grossCents: num(row.gross_profit_cents),
    lastOrderAt: maybe(row.last_order_at),
  }));
}

export type ExpenseRow = {
  id: string;
  occurredAt: string;
  description: string;
  categoryName: string | null;
  currency: string;
  amountCents: Cents;
  amountUsdCents: Cents;
  paymentMethod: string;
};

export async function listExpenses(limit = 200): Promise<ExpenseRow[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      e.id, e.occurred_at::text, e.description, e.currency::text,
      e.amount_cents::text, e.amount_usd_cents::text, e.payment_method::text,
      c.name AS category_name
    FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id
    ORDER BY e.occurred_at DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: text(row.id),
    occurredAt: text(row.occurred_at),
    description: text(row.description),
    categoryName: maybe(row.category_name),
    currency: text(row.currency),
    amountCents: num(row.amount_cents),
    amountUsdCents: num(row.amount_usd_cents),
    paymentMethod: text(row.payment_method),
  }));
}
