import {
  bigint,
  bigserial,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  currencyCode,
  documentKind,
  ledgerCategory,
  ledgerDirection,
  paymentMethod,
} from './enums';
import { members } from './identity';

/**
 * Versioned exchange rates. Never updated in place: a new rate is a new row
 * with a later effectiveFrom, so any historical amount can be re-derived.
 */
export const fxRates = pgTable(
  'fx_rates',
  {
    id: uuid().primaryKey().defaultRandom(),
    base: text().notNull().default('USD'),
    quote: text().notNull().default('SRD'),
    /** Rate x 1_000_000. 38.5 SRD per USD is stored as 38_500_000. */
    rateMicros: bigint({ mode: 'number' }).notNull(),
    effectiveFrom: timestamp({ withTimezone: true }).notNull().defaultNow(),
    source: text().notNull().default('manual'),
    note: text(),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('fx_rates_pair_effective_key').on(t.base, t.quote, t.effectiveFrom),
    index('fx_rates_effective_idx').on(t.effectiveFrom.desc()),
  ],
);

export const expenseCategories = pgTable(
  'expense_categories',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),
    position: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('expense_categories_slug_key').on(t.slug)],
);

/** Running costs that are not the cost of goods: ads, tools, transport. */
export const expenses = pgTable(
  'expenses',
  {
    id: uuid().primaryKey().defaultRandom(),
    description: text().notNull(),
    categoryId: uuid().references(() => expenseCategories.id, { onDelete: 'set null' }),

    currency: currencyCode().notNull().default('USD'),
    fxRateMicros: bigint({ mode: 'number' }).notNull().default(1_000_000),
    amountCents: bigint({ mode: 'number' }).notNull().default(0),
    amountUsdCents: bigint({ mode: 'number' }).notNull().default(0),

    paymentMethod: paymentMethod().notNull().default('cash'),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Receipt photo or PDF in Vercel Blob. */
    receiptUrl: text(),
    receiptPathname: text(),
    notes: text(),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('expenses_occurred_idx').on(t.occurredAt.desc()),
    index('expenses_category_idx').on(t.categoryId),
  ],
);

/**
 * The cash ledger. APPEND ONLY.
 *
 * Every movement of money lands here exactly once. Entries caused by a
 * document (a purchase order being paid, a sale being collected) are posted by
 * the system from that document and carry sourceKind and sourceId, which is
 * what stops the ledger drifting away from the documents it describes. The
 * spreadsheet posts these by hand and has already drifted: PO-001 is booked at
 * 294.75 against a purchase order totalling 147.74.
 *
 * The running balance is not stored. It is a window function over this table,
 * so it cannot go stale.
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Monotonic insertion order. `created_at` is the TRANSACTION timestamp in
     *  Postgres, so several entries posted together share it exactly and
     *  cannot break their own tie. A running balance ordered on a tie is
     *  nondeterministic, so the ledger carries its own sequence. */
    seq: bigserial({ mode: 'number' }).notNull(),
    direction: ledgerDirection().notNull(),
    category: ledgerCategory().notNull().default('other'),
    description: text().notNull(),

    currency: currencyCode().notNull().default('USD'),
    fxRateMicros: bigint({ mode: 'number' }).notNull().default(1_000_000),
    /** Always positive. Direction carries the sign. */
    amountCents: bigint({ mode: 'number' }).notNull(),
    amountUsdCents: bigint({ mode: 'number' }).notNull(),

    /** Set on owner contributions and draws; drives the equity split. */
    memberId: uuid().references(() => members.id, { onDelete: 'set null' }),

    sourceKind: documentKind().notNull().default('manual'),
    sourceId: uuid(),

    paymentMethod: paymentMethod().notNull().default('cash'),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    notes: text(),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ledger_entries_occurred_idx').on(t.occurredAt.desc(), t.seq.desc()),
    uniqueIndex('ledger_entries_seq_key').on(t.seq),
    index('ledger_entries_category_idx').on(t.category),
    index('ledger_entries_member_idx').on(t.memberId),
    index('ledger_entries_source_idx').on(t.sourceKind, t.sourceId),
  ],
);
