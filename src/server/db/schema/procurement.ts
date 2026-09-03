import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { productVariants, suppliers } from './catalog';
import { currencyCode, paymentMethod, purchaseOrderStatus } from './enums';
import { members } from './identity';

/**
 * A purchase order from Amazon, AliExpress or elsewhere.
 *
 * The five overhead columns are the whole point. Tax, card fees, delivery,
 * shipping and shipping tax are costs of getting goods into stock, so they are
 * allocated across the order's lines on receipt rather than disappearing into
 * general expenses. The spreadsheet records them and then never uses them,
 * which is why its reported margin is roughly 17 points too low.
 */
export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid().primaryKey().defaultRandom(),
    number: text().notNull(),
    supplierId: uuid().references(() => suppliers.id, { onDelete: 'set null' }),
    status: purchaseOrderStatus().notNull().default('draft'),

    currency: currencyCode().notNull().default('USD'),
    /** Rate in micro-units at the time of the order. 1 USD = rate/1e6 SRD. */
    fxRateMicros: bigint({ mode: 'number' }).notNull().default(1_000_000),

    taxCents: bigint({ mode: 'number' }).notNull().default(0),
    cardFeeCents: bigint({ mode: 'number' }).notNull().default(0),
    deliveryCents: bigint({ mode: 'number' }).notNull().default(0),
    shippingCents: bigint({ mode: 'number' }).notNull().default(0),
    shippingTaxCents: bigint({ mode: 'number' }).notNull().default(0),

    orderedAt: timestamp({ withTimezone: true }),
    expectedAt: timestamp({ withTimezone: true }),
    receivedAt: timestamp({ withTimezone: true }),

    reference: text(),
    notes: text(),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('purchase_orders_number_key').on(t.number),
    index('purchase_orders_status_idx').on(t.status),
    index('purchase_orders_ordered_at_idx').on(t.orderedAt.desc()),
    index('purchase_orders_supplier_idx').on(t.supplierId),
    index('purchase_orders_created_by_idx').on(t.createdById),
  ],
);

/**
 * One product variant within a purchase order.
 *
 * `overheadCents` and `landedCostCents` are written when the order is received
 * and are the authoritative cost basis. The allocation always foots exactly to
 * the order total: see allocateOverhead in src/lib/costing.ts.
 */
export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    purchaseOrderId: uuid()
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    quantity: integer().notNull(),
    quantityReceived: integer().notNull().default(0),
    /** What the goods themselves cost, before any overhead. */
    subtotalCents: bigint({ mode: 'number' }).notNull().default(0),
    /** This line's pro-rata share of the order's overhead. */
    overheadCents: bigint({ mode: 'number' }).notNull().default(0),
    /** subtotalCents + overheadCents. The real cost of this line. */
    landedCostCents: bigint({ mode: 'number' }).notNull().default(0),

    position: integer().notNull().default(0),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('purchase_order_items_po_idx').on(t.purchaseOrderId, t.position),
    index('purchase_order_items_variant_idx').on(t.variantId),
  ],
);

/**
 * Money paid to a supplier against a purchase order (F-9).
 *
 * The buy-side mirror of `sale_payments`, and for the same reason: a payment
 * happened at a moment and by a person, so correcting a mistake means recording
 * another row rather than rewriting one. Each row posts its own `purchase`
 * ledger entry whose source_id is this row's id — never the order's — so
 * cancelling an order cannot take payments for money that actually left down
 * with it. What has been paid is derived from these rows; nothing on
 * `purchase_orders` stores it.
 */
export const purchaseOrderPayments = pgTable(
  'purchase_order_payments',
  {
    id: uuid().primaryKey().defaultRandom(),
    purchaseOrderId: uuid()
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),

    /** In the currency of the order; the rate snapshot rides along so the
     *  payment posts converts exactly as the order would have. */
    amountCents: bigint({ mode: 'number' }).notNull(),
    currency: currencyCode().notNull().default('USD'),
    fxRateMicros: bigint({ mode: 'number' }).notNull().default(1_000_000),

    method: paymentMethod().notNull().default('card'),
    paidAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    notes: text(),

    /** Who banked it, for the audit trail. */
    memberId: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    /** Client-generated key makes a retried payment a no-op. */
    idempotencyKey: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('po_payments_order_idx').on(t.purchaseOrderId),
    index('po_payments_paid_idx').on(t.paidAt.desc()),
    index('po_payments_member_idx').on(t.memberId),
    index('po_payments_created_by_idx').on(t.createdById),
    uniqueIndex('po_payments_idempotency_key').on(t.idempotencyKey),
  ],
);

/**
 * A supplier refund is append-only and separate from cancellation. A payment
 * is money that left; this row records money that came back and points to its
 * own ledger entry, so the order can be safely reconciled without rewriting
 * either history.
 */
export const purchaseOrderRefunds = pgTable(
  'purchase_order_refunds',
  {
    id: uuid().primaryKey().defaultRandom(),
    purchaseOrderId: uuid()
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'restrict' }),
    amountCents: bigint({ mode: 'number' }).notNull(),
    currency: currencyCode().notNull().default('USD'),
    fxRateMicros: bigint({ mode: 'number' }).notNull().default(1_000_000),
    method: paymentMethod().notNull().default('bank_transfer'),
    refundedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    reason: text().notNull(),
    memberId: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    idempotencyKey: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('po_refunds_order_idx').on(t.purchaseOrderId),
    index('po_refunds_refunded_idx').on(t.refundedAt.desc()),
    index('po_refunds_member_idx').on(t.memberId),
    index('po_refunds_created_by_idx').on(t.createdById),
    uniqueIndex('po_refunds_idempotency_key').on(t.idempotencyKey),
  ],
);
