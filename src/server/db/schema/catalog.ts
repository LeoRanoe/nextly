import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { productStatus, supplierKind } from './enums';

export const categories = pgTable(
  'categories',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),
    description: text(),
    position: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('categories_slug_key').on(t.slug)],
);

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    kind: supplierKind().notNull().default('other'),
    website: text(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('suppliers_name_key').on(t.name)],
);

/**
 * A product is the thing a customer recognises: "Wyze Cam Pan V3".
 *
 * The spreadsheet models P001 (Black) and P002 (White) as two separate
 * products. They are one product in two colourways, and the distinction
 * matters the moment the public catalog needs a single product page with a
 * colour picker. Stock, cost and price all live on the variant.
 *
 * Catalog fields are present from day one so the storefront reads these same
 * rows behind `catalogPublished` instead of needing a second migration.
 */
export const products = pgTable(
  'products',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Human handle, e.g. NX-WYZE-PANV3. Distinct from a variant SKU. */
    code: text().notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    categoryId: uuid().references(() => categories.id, { onDelete: 'set null' }),
    supplierId: uuid().references(() => suppliers.id, { onDelete: 'set null' }),
    sourceUrl: text(),
    summary: text(),
    description: text(),
    /** Free-form spec sheet rendered as a table on the catalog page. */
    specs: jsonb().$type<Record<string, string>>().notNull().default({}),
    status: productStatus().notNull().default('draft'),

    catalogPublished: boolean().notNull().default(false),
    catalogPublishedAt: timestamp({ withTimezone: true }),
    seoTitle: text(),
    seoDescription: text(),

    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('products_code_key').on(t.code),
    uniqueIndex('products_slug_key').on(t.slug),
    index('products_category_idx').on(t.categoryId),
    index('products_status_idx').on(t.status),
    index('products_catalog_idx').on(t.catalogPublished),
  ],
);

/**
 * The unit that is actually bought, stocked and sold. Every product has at
 * least one variant, flagged `isDefault`, even when it has no real options.
 *
 * `listPriceCents` is the asking price in USD. It is a price list, not a
 * historical record: what a sale actually charged is snapshotted onto the
 * sale line, so re-pricing a product never rewrites past invoices.
 */
export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text().notNull(),
    /** Display name of the option: "Black", "White", "2-pack". */
    name: text().notNull(),
    /** Structured options for catalog facets: { colour: "Black" }. */
    attributes: jsonb().$type<Record<string, string>>().notNull().default({}),
    barcode: text(),
    listPriceCents: bigint({ mode: 'number' }).notNull().default(0),
    /** Supplier list price, for reference only. Never used to value stock. */
    referenceCostCents: bigint({ mode: 'number' }).notNull().default(0),
    isDefault: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    position: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_variants_sku_key').on(t.sku),
    index('product_variants_product_idx').on(t.productId),
  ],
);

/**
 * Images live in Vercel Blob. We store the optimised derivatives, their
 * intrinsic dimensions (so next/image never causes layout shift) and a blur
 * placeholder. `blobPathname` is kept so the blob can be deleted when the row
 * goes, otherwise the store silently accumulates orphans forever.
 */
export const productImages = pgTable(
  'product_images',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Optional: pin an image to one colourway. */
    variantId: uuid().references(() => productVariants.id, { onDelete: 'set null' }),
    url: text().notNull(),
    blobPathname: text().notNull(),
    thumbUrl: text(),
    thumbPathname: text(),
    width: integer().notNull(),
    height: integer().notNull(),
    blurDataUrl: text(),
    alt: text(),
    position: integer().notNull().default(0),
    isPrimary: boolean().notNull().default(false),
    byteSize: bigint({ mode: 'number' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('product_images_product_idx').on(t.productId, t.position),
    index('product_images_variant_idx').on(t.variantId),
  ],
);

export const customers = pgTable(
  'customers',
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull(),
    name: text().notNull(),
    phone: text(),
    email: text(),
    addressLine: text(),
    city: text(),
    country: text().notNull().default('Suriname'),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('customers_code_key').on(t.code), index('customers_name_idx').on(t.name)],
);
