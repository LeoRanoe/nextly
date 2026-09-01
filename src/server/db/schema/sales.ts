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

    /** Charged amount in the currency the customer actually paid in. */
    totalCents: bigint({ mode: 'number' }).notNull().default(0),
    /** The same amount normalised to USD at fxRateMicros. Books are in USD. */
    totalUsdCents: bigint({ mode: 'number' }).notNull().default(0),
    discountCents: bigint({ mode: 'number' }).notNull().default(0),
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
