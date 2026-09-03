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
import { productVariants } from './catalog';
import { documentKind, movementKind } from './enums';
import { members } from './identity';

/**
 * The inventory ledger. APPEND ONLY.
 *
 * Stock on hand is not a number anyone edits; it is the sum of this table.
 * That is what makes "why is the count wrong?" an answerable question instead
 * of an argument. Receipts carry a positive quantity, sales a negative one.
 *
 * `valueCents` moves alongside: a receipt adds the line's landed cost, a sale
 * removes the weighted-average share. Both columns are integers, so cents are
 * conserved exactly no matter how the unit cost divides.
 */
export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Monotonic insertion order, for the same reason as ledger_entries.seq. */
    seq: bigserial({ mode: 'number' }).notNull(),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    kind: movementKind().notNull(),

    /** Signed: positive adds to stock, negative removes. */
    quantity: integer().notNull(),
    /** Signed cost movement in USD cents, same sign convention as quantity. */
    valueCents: bigint({ mode: 'number' }).notNull().default(0),

    /** The document that caused this movement. */
    sourceKind: documentKind().notNull().default('manual'),
    sourceId: uuid(),

    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    note: text(),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inventory_movements_variant_idx').on(t.variantId, t.occurredAt.desc(), t.seq.desc()),
    uniqueIndex('inventory_movements_seq_key').on(t.seq),
    index('inventory_movements_source_idx').on(t.sourceKind, t.sourceId),
    index('inventory_movements_occurred_idx').on(t.occurredAt.desc()),
    index('inventory_movements_created_by_idx').on(t.createdById),
  ],
);
