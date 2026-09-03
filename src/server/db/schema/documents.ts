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
import { customers, products, productVariants, quoteRequests } from './catalog';
import { currencyCode, quoteStatus } from './enums';
import { members } from './identity';
import { sales } from './sales';

/** Customer-facing quote snapshots. Sent versions are never edited in place. */
export const quotes = pgTable(
  'quotes',
  {
    id: uuid().primaryKey().defaultRandom(),
    number: text().notNull(),
    version: integer().notNull().default(1),
    status: quoteStatus().notNull().default('draft'),
    customerId: uuid().references(() => customers.id, { onDelete: 'set null' }),
    customerName: text(),
    customerContact: text(),
    requestId: uuid().references(() => quoteRequests.id, { onDelete: 'set null' }),
    supersedesId: uuid(),
    currency: currencyCode().notNull().default('USD'),
    fxRateMicros: bigint({ mode: 'number' }).notNull().default(1_000_000),
    subtotalCents: bigint({ mode: 'number' }).notNull().default(0),
    discountCents: bigint({ mode: 'number' }).notNull().default(0),
    totalCents: bigint({ mode: 'number' }).notNull().default(0),
    validUntil: timestamp({ withTimezone: true }).notNull(),
    publicTokenHash: text(),
    sentAt: timestamp({ withTimezone: true }),
    viewedAt: timestamp({ withTimezone: true }),
    acceptedAt: timestamp({ withTimezone: true }),
    declinedAt: timestamp({ withTimezone: true }),
    convertedSaleId: uuid().references(() => sales.id, { onDelete: 'set null' }),
    notes: text(),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('quotes_number_version_key').on(t.number, t.version),
    uniqueIndex('quotes_public_token_key').on(t.publicTokenHash),
    index('quotes_status_idx').on(t.status, t.createdAt.desc()),
    index('quotes_customer_idx').on(t.customerId),
    index('quotes_request_idx').on(t.requestId),
  ],
);

export const quoteItems = pgTable(
  'quote_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    quoteId: uuid()
      .notNull()
      .references(() => quotes.id, { onDelete: 'cascade' }),
    productId: uuid().references(() => products.id, { onDelete: 'set null' }),
    variantId: uuid().references(() => productVariants.id, { onDelete: 'set null' }),
    productName: text().notNull(),
    variantName: text(),
    sku: text(),
    quantity: integer().notNull(),
    unitPriceCents: bigint({ mode: 'number' }).notNull(),
    lineTotalCents: bigint({ mode: 'number' }).notNull(),
    position: integer().notNull().default(0),
  },
  (t) => [index('quote_items_quote_idx').on(t.quoteId, t.position)],
);
