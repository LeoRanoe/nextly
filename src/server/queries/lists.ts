import { type SQL, sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import type {
  CustomerQuery,
  ExpenseQuery,
  LedgerQuery,
  ProductQuery,
  PurchaseOrderQuery,
  SaleQuery,
  StockQuery,
} from '@/lib/list-params';
import type { Cents } from '@/lib/money';
import { db } from '../db/client';
import { clampPage, clampPerPage, type Page, toPage } from './paginate';
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

// onHand/stockValue recompute the same subquery the SELECT list builds,
// rather than referencing its output alias: that alias is cast ::text for
// the JS driver, and Postgres would then sort it lexicographically —
// "10" before "2" — not numerically.
const PRODUCT_SORT: Record<ProductQuery['sort'], SQL> = {
  name: sql`p.name`,
  onHand: sql`COALESCE((SELECT SUM(sl.on_hand) FROM v_stock_levels sl
                          WHERE sl.product_id = p.id), 0)`,
  stockValue: sql`COALESCE((SELECT SUM(sl.value_cents) FROM v_stock_levels sl
                              WHERE sl.product_id = p.id), 0)`,
};

export async function listProducts(
  query: ProductQuery = {} as ProductQuery,
): Promise<Page<ProductRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(sql`(p.name ILIKE ${term} OR p.code ILIKE ${term})`);
  }
  if (query.status) conditions.push(sql`p.status = ${query.status}::product_status`);
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const orderBy = PRODUCT_SORT[query.sort] ?? PRODUCT_SORT.name;
  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

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
                 WHERE v.product_id = p.id AND v.is_active), 0)::text AS list_price_cents,
      COUNT(*) OVER()::text AS total_count
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN suppliers  s ON s.id = p.supplier_id
    ${where}
    ORDER BY ${orderBy} ${direction}, p.name
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => ({
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
    })),
    total,
    page,
    perPage,
  );
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

const STOCK_SORT: Record<StockQuery['sort'], SQL> = {
  name: sql`s.product_name, s.variant_name`,
  onHand: sql`s.on_hand`,
  value: sql`s.value_cents`,
};

export async function listStock(
  query: StockQuery = {} as StockQuery,
): Promise<Page<StockLevelRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(
      sql`(s.sku ILIKE ${term} OR s.product_name ILIKE ${term} OR s.variant_name ILIKE ${term})`,
    );
  }
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const orderBy = STOCK_SORT[query.sort] ?? STOCK_SORT.name;
  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

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
      ), 0)::text AS inbound,
      COUNT(*) OVER()::text AS total_count
    FROM v_stock_levels s
    JOIN products pr ON pr.id = s.product_id
    LEFT JOIN categories c ON c.id = pr.category_id
    ${where}
    ORDER BY ${orderBy} ${direction}
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => {
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
    }),
    total,
    page,
    perPage,
  );
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

export async function listLedger(
  query: LedgerQuery = {} as LedgerQuery,
): Promise<Page<LedgerRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  // The running balance is a window function baked into v_cash_ledger's own
  // definition, computed over every entry before this query's WHERE ever
  // runs — so a filtered or paginated row still shows its true balance as
  // of that moment, never one relative to just the filtered set.
  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(sql`(l.description ILIKE ${term} OR m.full_name ILIKE ${term})`);
  }
  if (query.category) conditions.push(sql`l.category = ${query.category}::ledger_category`);
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      l.id, l.seq::text, l.occurred_at::text, l.direction::text, l.category::text,
      l.description, l.payment_method::text, l.net_usd_cents::text,
      l.balance_usd_cents::text, m.full_name AS member_name,
      COUNT(*) OVER()::text AS total_count
    FROM v_cash_ledger l
    LEFT JOIN members m ON m.id = l.member_id
    ${where}
    ORDER BY l.occurred_at ${direction}, l.seq ${direction}
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => ({
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
    })),
    total,
    page,
    perPage,
  );
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

/** `ORDER BY` from a whitelist, never interpolated user input — an unknown
 *  or missing key falls back to the default so a hand-edited URL degrades
 *  rather than errors. */
const SALE_SORT: Record<SaleQuery['sort'], SQL> = {
  date: sql`s.sold_at`,
  customer: sql`c.name NULLS LAST`,
  revenue: sql`s.total_usd_cents`,
  margin: sql`CASE WHEN s.total_usd_cents = 0 THEN 0
                    ELSE s.gross_profit_cents::numeric / s.total_usd_cents END`,
};

export async function listSales(query: SaleQuery = {} as SaleQuery): Promise<Page<SaleRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(sql`(s.number ILIKE ${term} OR c.name ILIKE ${term})`);
  }
  if (query.status) conditions.push(sql`s.status = ${query.status}::sale_status`);
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  // Sequential scan over an ILIKE, not a trigram index: at a few hundred
  // rows a scan is faster than the index would be and far easier to read.
  // Reconsider only if a single list nears the tens of thousands of rows.
  const orderBy = SALE_SORT[query.sort] ?? SALE_SORT.date;
  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      s.id, s.number, s.sold_at::text, s.status::text, s.currency::text,
      s.total_usd_cents::text, s.cogs_cents::text, s.gross_profit_cents::text,
      s.payment_method::text, c.name AS customer_name,
      (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id = s.id)::text AS item_count,
      COALESCE((SELECT SUM(i.quantity) FROM sale_items i WHERE i.sale_id = s.id), 0)::text
        AS unit_count,
      COUNT(*) OVER()::text AS total_count
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    ${where}
    ORDER BY ${orderBy} ${direction}, s.number DESC
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => ({
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
    })),
    total,
    page,
    perPage,
  );
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

// `total` recomputes the same sum the SELECT list builds, rather than
// referencing its alias: those aliases are cast ::text for the JS driver, and
// Postgres has no `+` operator for text.
const PURCHASE_ORDER_SORT: Record<PurchaseOrderQuery['sort'], SQL> = {
  ordered: sql`COALESCE(p.ordered_at, p.created_at)`,
  supplier: sql`s.name NULLS LAST`,
  total: sql`(p.tax_cents + p.card_fee_cents + p.delivery_cents
              + p.shipping_cents + p.shipping_tax_cents)
             + COALESCE((SELECT SUM(i.subtotal_cents) FROM purchase_order_items i
                          WHERE i.purchase_order_id = p.id), 0)`,
};

export async function listPurchaseOrders(
  query: PurchaseOrderQuery = {} as PurchaseOrderQuery,
): Promise<Page<PurchaseOrderRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(sql`(p.number ILIKE ${term} OR s.name ILIKE ${term})`);
  }
  if (query.status) conditions.push(sql`p.status = ${query.status}::purchase_order_status`);
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const orderBy = PURCHASE_ORDER_SORT[query.sort] ?? PURCHASE_ORDER_SORT.ordered;
  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

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
                       WHERE i.purchase_order_id = p.id), 0) = 0)::text AS unallocated,
      COUNT(*) OVER()::text AS total_count
    FROM purchase_orders p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    ${where}
    ORDER BY ${orderBy} ${direction}, p.number DESC
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => {
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
    }),
    total,
    page,
    perPage,
  );
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

const CUSTOMER_SORT: Record<CustomerQuery['sort'], SQL> = {
  name: sql`c.name`,
  orders: sql`t.order_count`,
  spent: sql`t.spent_usd_cents`,
};

export async function listCustomers(
  query: CustomerQuery = {} as CustomerQuery,
): Promise<Page<CustomerRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(
      sql`(c.name ILIKE ${term} OR c.code ILIKE ${term} OR c.phone ILIKE ${term} OR c.email ILIKE ${term})`,
    );
  }
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const orderBy = CUSTOMER_SORT[query.sort] ?? CUSTOMER_SORT.spent;
  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      c.id, c.code, c.name, c.phone, c.email, c.address_line, c.city, c.notes,
      t.order_count::text, t.spent_usd_cents::text,
      t.gross_profit_cents::text, t.last_order_at::text,
      COUNT(*) OVER()::text AS total_count
    FROM customers c
    JOIN v_customer_totals t ON t.customer_id = c.id
    ${where}
    ORDER BY ${orderBy} ${direction}, c.name
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => ({
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
    })),
    total,
    page,
    perPage,
  );
}

export type ExpenseRow = {
  id: string;
  occurredAt: string;
  /** `YYYY-MM-DD`, for seeding an `<input type="date">` when editing. */
  occurredDate: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  currency: string;
  amountCents: Cents;
  amountUsdCents: Cents;
  paymentMethod: string;
  /** Whether this expense currently has a matching ledger posting — what the
   *  edit form's "post to the cash ledger" checkbox should start checked as. */
  hasLedgerEntry: boolean;
};

const EXPENSE_SORT: Record<ExpenseQuery['sort'], SQL> = {
  date: sql`e.occurred_at`,
  amount: sql`e.amount_usd_cents`,
};

export async function listExpenses(
  query: ExpenseQuery = {} as ExpenseQuery,
): Promise<Page<ExpenseRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(sql`(e.description ILIKE ${term} OR c.name ILIKE ${term})`);
  }
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const orderBy = EXPENSE_SORT[query.sort] ?? EXPENSE_SORT.date;
  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      e.id, e.occurred_at::text, to_char(e.occurred_at, 'YYYY-MM-DD') AS occurred_date,
      e.description, e.category_id, e.currency::text, e.notes,
      e.amount_cents::text, e.amount_usd_cents::text, e.payment_method::text,
      c.name AS category_name,
      EXISTS(
        SELECT 1 FROM ledger_entries l
         WHERE l.source_kind = 'expense' AND l.source_id = e.id
      )::text AS has_ledger_entry,
      COUNT(*) OVER()::text AS total_count
    FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id
    ${where}
    ORDER BY ${orderBy} ${direction}
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => ({
      id: text(row.id),
      occurredAt: text(row.occurred_at),
      occurredDate: text(row.occurred_date),
      description: text(row.description),
      categoryId: maybe(row.category_id),
      categoryName: maybe(row.category_name),
      notes: maybe(row.notes),
      currency: text(row.currency),
      amountCents: num(row.amount_cents),
      amountUsdCents: num(row.amount_usd_cents),
      paymentMethod: text(row.payment_method),
      hasLedgerEntry: bool(row.has_ledger_entry),
    })),
    total,
    page,
    perPage,
  );
}
