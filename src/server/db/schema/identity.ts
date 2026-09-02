import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { memberRole } from './enums';

/**
 * A person with access to Nextly.
 *
 * `id` is our own key, and `authUserId` links to Supabase `auth.users` once
 * that person actually signs in. Keeping them separate is what lets an owner
 * exist in the books before they have ever logged in: Leonardo and Youri have
 * capital in the ledger from day one, and their ledger entries must not have
 * to wait on an auth record. First sign-in claims the row by email.
 *
 * Every RLS policy keys off `authUserId`, not `id`.
 */
export const members = pgTable(
  'members',
  {
    id: uuid().primaryKey().defaultRandom(),
    authUserId: uuid(),
    email: text().notNull(),
    fullName: text().notNull(),
    role: memberRole().notNull().default('staff'),
    /** True for Leonardo and Youri: they appear in the equity split. */
    isPrincipal: boolean().notNull().default(false),
    avatarUrl: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('members_email_key').on(t.email),
    uniqueIndex('members_auth_user_key').on(t.authUserId),
  ],
);

/**
 * Single-row application settings. Enforced as a singleton by a unique index
 * on a constant column rather than trusting the application to behave.
 */
export const settings = pgTable(
  'settings',
  {
    id: uuid().primaryKey().defaultRandom(),
    singleton: text().notNull().default('settings'),
    businessName: text().notNull().default('Nextly'),
    baseCurrency: text().notNull().default('USD'),
    displayCurrency: text().notNull().default('SRD'),
    lowStockThreshold: bigint({ mode: 'number' }).notNull().default(5),

    /* ── Business identity (F-3) ───────────────────────────────────────────
       What an invoice has to say about who issued it. All optional: a
       document renders whatever is filled in and omits the rest, so the shop
       can start printing receipts before every field exists. `whatsapp` is
       separate from `phone` because the click-to-chat number is not always
       the number you would print as a contact — and neither is hard-coded
       into a template that goes stale on the day the shop moves street. */
    legalName: text(),
    addressLine: text(),
    city: text(),
    phone: text(),
    whatsapp: text(),
    email: text(),
    taxId: text(),
    logoUrl: text(),
    invoiceFooter: text(),

    /* ── Storefront footer (P0-10) ─────────────────────────────────────────
       The public site's footer needs a real identity — where the shop is,
       when it opens, how to reach it. Free text so the phrasing belongs to
       the business, not to a template. */
    instagram: text(),
    openingHours: text(),

    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('settings_singleton_key').on(t.singleton)],
);

/**
 * Gapless document numbering (PO-001, V001).
 *
 * A Postgres SEQUENCE is deliberately not used: sequences are non-transactional
 * and leave holes when a transaction rolls back. A purchase order series with
 * gaps in it is the first thing an accountant asks about. This table is bumped
 * inside the same transaction as the document it numbers.
 */
export const documentSequences = pgTable('document_sequences', {
  prefix: text().primaryKey(),
  lastValue: bigint({ mode: 'number' }).notNull().default(0),
  padding: bigint({ mode: 'number' }).notNull().default(3),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Append-only audit trail. Every mutating action writes one row. */
export const activityLogs = pgTable(
  'activity_logs',
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: uuid().references(() => members.id, { onDelete: 'set null' }),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: uuid(),
    entityLabel: text(),
    diff: jsonb().$type<Record<string, { from: unknown; to: unknown }>>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('activity_logs_created_at_idx').on(t.createdAt.desc()),
    index('activity_logs_entity_idx').on(t.entityType, t.entityId),
  ],
);
