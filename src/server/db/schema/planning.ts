import {
  bigint,
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { productVariants, suppliers } from './catalog';
import { members } from './identity';

export const reorderRuns = pgTable(
  'reorder_runs',
  {
    id: uuid().primaryKey().defaultRandom(),
    runDate: timestamp({ withTimezone: true }).notNull(),
    status: text().notNull().default('completed'),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reorder_runs_date_key').on(t.runDate),
    index('reorder_runs_created_idx').on(t.createdAt.desc()),
  ],
);

export const reorderRecommendations = pgTable(
  'reorder_recommendations',
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: uuid()
      .notNull()
      .references(() => reorderRuns.id, { onDelete: 'cascade' }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    supplierId: uuid().references(() => suppliers.id, { onDelete: 'set null' }),
    unitsSold90d: integer().notNull().default(0),
    grossProfitCents90d: bigint({ mode: 'number' }).notNull().default(0),
    revenueCents90d: bigint({ mode: 'number' }).notNull().default(0),
    onHand: integer().notNull().default(0),
    inbound: integer().notNull().default(0),
    landedUnitCostCents: bigint({ mode: 'number' }).notNull().default(0),
    dailyDemand: numeric().notNull().default('0'),
    daysOfCover: numeric(),
    recommendedQty: integer().notNull().default(0),
    budgetQty: integer().notNull().default(0),
    deferredQty: integer().notNull().default(0),
    score: numeric().notNull().default('0'),
    reasons: text().array().notNull().default([]),
    lowConfidence: boolean().notNull().default(false),
    strategicStock: boolean().notNull().default(false),
    supportingFor: text(),
    weightGrams: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reorder_recommendations_run_idx').on(t.runId),
    index('reorder_recommendations_variant_idx').on(t.variantId),
  ],
);

export const bundles = pgTable(
  'bundles',
  {
    id: uuid().primaryKey().defaultRandom(),
    sku: text().notNull(),
    name: text().notNull(),
    description: text(),
    slug: text(),
    summary: text(),
    storefrontImageUrl: text(),
    bestFor: text().array().notNull().default([]),
    compatibilityNotes: text(),
    nextlyTake: text(),
    seoTitle: text(),
    seoDescription: text(),
    catalogPublished: boolean().notNull().default(false),
    featured: boolean().notNull().default(false),
    position: integer().notNull().default(0),
    priceCents: bigint({ mode: 'number' }).notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bundles_sku_key').on(t.sku),
    uniqueIndex('bundles_slug_key').on(t.slug),
    index('bundles_active_idx').on(t.isActive),
    index('bundles_storefront_idx').on(t.catalogPublished, t.featured, t.position),
  ],
);

export const bundleComponents = pgTable(
  'bundle_components',
  {
    id: uuid().primaryKey().defaultRandom(),
    bundleId: uuid()
      .notNull()
      .references(() => bundles.id, { onDelete: 'cascade' }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    quantity: integer().notNull().default(1),
    productName: text().notNull(),
    variantName: text().notNull(),
    sku: text().notNull(),
    weightGrams: integer().notNull().default(0),
    position: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex('bundle_components_unique').on(t.bundleId, t.variantId),
    index('bundle_components_bundle_idx').on(t.bundleId, t.position),
  ],
);
