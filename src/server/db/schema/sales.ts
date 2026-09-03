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
import { customers, productVariants } from './catalog';
import { currencyCode, paymentMethod, saleStatus } from './enums';
import { members } from './identity';

/**
 * A sale.
 *
 * Two snapshots make this table trustworthy years from now:
 *
 *   fxRateMicros  the rate in force when the sale happened. Updating the rate
 *                 today must not re-value last quarter. The spreadsheet
 *                 applies one global rate to all history, so its past totals
 *                 silently move whenever the rate is edited.
 *   cogsCents     the weighted-average cost consumed at that moment. Later
 *                 purchases at different prices never rewrite this margin.
 */
export const sales = pgTable(
  'sales',
  {
    id: uuid().primaryKey().defaultRandom(),
    number: text().notNull(),
    customerId: uuid().references(() => customers.id, { onDelete: 'set null' }),
    status: saleStatus().notNull().default('draft'),

    currency: currencyCode().notNull().default('USD'),
    fxRateMicros: bigint({ mode: 'number' }).notNull().default(1_000_000),

    /** Charged amount in the currency the customer actually paid in. Net of
     *  `discountCents` — the lines sum to gross, this is what is payable. */
    totalCents: bigint({ mode: 'number' }).notNull().default(0),
    /** The same amount normalised to USD at fxRateMicros. Books are in USD. */
    totalUsdCents: bigint({ mode: 'number' }).notNull().default(0),
    /** Document-level discount, in the currency of the sale. Kept separate
     *  from the line prices on purpose: a haggle must not erase what the
     *  product normally sells for. See F-2. */
    discountCents: bigint({ mode: 'number' }).notNull().default(0),
    discountReason: text(),
    cogsCents: bigint({ mode: 'number' }).notNull().default(0),
    grossProfitCents: bigint({ mode: 'number' }).notNull().default(0),

    paymentMethod: paymentMethod().notNull().default('cash'),
    soldAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    notes: text(),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sales_number_key').on(t.number),
    index('sales_customer_idx').on(t.customerId),
    index('sales_sold_at_idx').on(t.soldAt.desc()),
    index('sales_status_idx').on(t.status),
    index('sales_created_by_idx').on(t.createdById),
  ],
);

/**
 * Money received against a sale (F-4).
 *
 * Append-only, the same rule `ledger_entries` follows: a payment happened at a
 * moment and by a person, and correcting a mistake means recording another row
 * rather than rewriting one. Each row posts its own `sales_receipt` ledger
 * entry, whose source_id is this row's id — never the sale's id — so editing or
 * voiding the sale cannot take the receipts down with it. What has been paid is
 * derived from these rows; nothing on `sales` stores it.
 */
export const salePayments = pgTable(
  'sale_payments',
  {
    id: uuid().primaryKey().defaultRandom(),
    saleId: uuid()
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),

    /** In the currency of the sale; the rate snapshot rides along so the
     *  receipt it posts converts exactly as the sale would have. */
    amountCents: bigint({ mode: 'number' }).notNull(),
    currency: currencyCode().notNull().default('USD'),
    fxRateMicros: bigint({ mode: 'number' }).notNull().default(1_000_000),

    method: paymentMethod().notNull().default('cash'),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    notes: text(),

    /** Who banked it, for the audit trail. */
    memberId: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    /** Client-generated key makes a retried payment a no-op. */
    idempotencyKey: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sale_payments_sale_idx').on(t.saleId),
    index('sale_payments_received_idx').on(t.receivedAt.desc()),
    index('sale_payments_member_idx').on(t.memberId),
    index('sale_payments_created_by_idx').on(t.createdById),
    uniqueIndex('sale_payments_idempotency_key').on(t.idempotencyKey),
  ],
);

/**
 * A cash refund is explicit and append-only. Returning goods changes stock and
 * creates a credit due; this row is the separate decision that money actually
 * left the business. Its ledger entry points to this row, not the sale, so one
 * return/refund cannot be mistaken for another.
 */
export const saleRefunds = pgTable(
  'sale_refunds',
  {
    id: uuid().primaryKey().defaultRandom(),
    saleId: uuid()
      .notNull()
      .references(() => sales.id, { onDelete: 'restrict' }),
    amountCents: bigint({ mode: 'number' }).notNull(),
    currency: currencyCode().notNull().default('USD'),
    fxRateMicros: bigint({ mode: 'number' }).notNull().default(1_000_000),
    method: paymentMethod().notNull().default('cash'),
    refundedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    reason: text().notNull(),
    memberId: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    idempotencyKey: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sale_refunds_sale_idx').on(t.saleId),
    index('sale_refunds_refunded_idx').on(t.refundedAt.desc()),
    index('sale_refunds_member_idx').on(t.memberId),
    index('sale_refunds_created_by_idx').on(t.createdById),
    uniqueIndex('sale_refunds_idempotency_key').on(t.idempotencyKey),
  ],
);

export const saleItems = pgTable(
  'sale_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    saleId: uuid()
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    quantity: integer().notNull(),
    /** Price charged per unit, in the currency of the sale. */
    unitPriceCents: bigint({ mode: 'number' }).notNull().default(0),
    /** The same, normalised to USD at the rate recorded on the sale. */
    unitPriceUsdCents: bigint({ mode: 'number' }).notNull().default(0),
    lineTotalUsdCents: bigint({ mode: 'number' }).notNull().default(0),
    /** Weighted-average cost consumed by this line, in USD cents. */
    cogsCents: bigint({ mode: 'number' }).notNull().default(0),
    /** Units sold beyond what was in stock, if any. Surfaced as a warning. */
    shortfall: integer().notNull().default(0),
    /** Units of this line returned after the sale. Never exceeds quantity:
     *  a return reverses the sale's postings rather than rewriting them. */
    quantityReturned: integer().notNull().default(0),

    position: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sale_items_sale_idx').on(t.saleId, t.position),
    index('sale_items_variant_idx').on(t.variantId),
  ],
);

/**
 * Serial numbers captured on a sale line (F-6).
 *
 * Optional at the point of sale — most items never get one — but when present
 * they are the only bridge between a customer holding a device and the books
 * knowing where it went. Warranty expiry is deliberately *not* stored here:
 * it derives from the sale's `soldAt` plus the product's term, so changing the
 * term today cannot silently rewrite what was promised then.
 *
 * Cascade from `sale_items`, not from `sales`: voiding a sale keeps its lines
 * as history, and so keeps its serials. Editing a draft replaces the lines,
 * which replaces the serials with them.
 */
export const saleItemSerials = pgTable(
  'sale_item_serials',
  {
    id: uuid().primaryKey().defaultRandom(),
    saleItemId: uuid()
      .notNull()
      .references(() => saleItems.id, { onDelete: 'cascade' }),
    serial: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sale_item_serials_item_idx').on(t.saleItemId),
    // The command-palette lookup searches by serial; prefix ops keep ILIKE
    // '%…%' out of it, so this serves exact and starts-with queries only.
    index('sale_item_serials_serial_idx').on(t.serial),
  ],
);
