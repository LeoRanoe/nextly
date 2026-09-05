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
import { productStatus, quoteRequestStatus, supplierKind } from './enums';
import { members } from './identity';
import { sales } from './sales';

export const categories = pgTable(
  'categories',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),
    description: text(),
    storefrontDescription: text(),
    imageUrl: text(),
    position: integer().notNull().default(0),
    showInStorefrontNav: boolean().notNull().default(true),
    featured: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('categories_slug_key').on(t.slug)],
);

/** A manufacturer is not necessarily the supplier we buy from. */
export const brands = pgTable(
  'brands',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),
    logoUrl: text(),
    website: text(),
    description: text(),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('brands_slug_key').on(t.slug), index('brands_active_idx').on(t.active)],
);

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    kind: supplierKind().notNull().default('other'),
    website: text(),
    leadTimeDays: integer().notNull().default(28),
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
    brandId: uuid().references(() => brands.id, { onDelete: 'set null' }),
    categoryId: uuid().references(() => categories.id, { onDelete: 'set null' }),
    supplierId: uuid().references(() => suppliers.id, { onDelete: 'set null' }),
    sourceUrl: text(),
    summary: text(),
    description: text(),
    /** Free-form spec sheet rendered as a table on the catalog page. */
    specs: jsonb().$type<Record<string, string>>().notNull().default({}),
    modelNumber: text(),
    keyFeatures: jsonb().$type<string[]>().notNull().default([]),
    bestFor: jsonb().$type<string[]>().notNull().default([]),
    compatibility: jsonb()
      .$type<{ platforms: string[]; protocols: string[]; ecosystems: string[] }>()
      .notNull()
      .default({ platforms: [], protocols: [], ecosystems: [] }),
    buyerRequirements: jsonb()
      .$type<{
        hubRequired?: boolean;
        hubName?: string;
        appRequired?: boolean;
        appName?: string;
        accountRequired?: boolean;
        wifiRequired?: boolean;
        wifiBands?: string[];
        subscription?: 'none' | 'optional' | 'required';
        subscriptionNotes?: string;
        indoorOutdoor?: 'indoor' | 'outdoor' | 'indoor-outdoor';
        powerSource?: string;
        batteryType?: string;
        neutralWireRequired?: boolean;
        installationNotes?: string;
        regionalNotes?: string;
      }>()
      .notNull()
      .default({}),
    boxContents: jsonb().$type<string[]>().notNull().default([]),
    nextlyTake: text(),
    faqItems: jsonb().$type<{ question: string; answer: string }[]>().notNull().default([]),
    featured: boolean().notNull().default(false),
    featuredPosition: integer(),
    newUntil: timestamp({ withTimezone: true }),
    showWhenOutOfStock: boolean().notNull().default(true),
    restockNotificationsEnabled: boolean().notNull().default(false),
    status: productStatus().notNull().default('draft'),
    /** F-6: 0 means "no warranty". Expiry is derived from the sale's soldAt,
     *  never stored, so a later change to the term cannot rewrite history. */
    warrantyMonths: integer('warranty_months').notNull().default(0),

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
    index('products_supplier_idx').on(t.supplierId),
    index('products_brand_idx').on(t.brandId),
    index('products_featured_idx').on(t.featured, t.featuredPosition),
    index('products_status_idx').on(t.status),
    index('products_catalog_idx').on(t.catalogPublished),
  ],
);

export const productRelationships = pgTable(
  'product_relationships',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    relatedProductId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    relationshipType: text().notNull(),
    position: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_relationships_unique').on(
      t.productId,
      t.relatedProductId,
      t.relationshipType,
    ),
    index('product_relationships_product_idx').on(t.productId, t.position),
  ],
);

export const storefrontCollections = pgTable(
  'storefront_collections',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),
    description: text(),
    imageUrl: text(),
    active: boolean().notNull().default(true),
    homepageVisible: boolean().notNull().default(false),
    position: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('storefront_collections_slug_key').on(t.slug),
    index('storefront_collections_home_idx').on(t.homepageVisible, t.position),
  ],
);

export const storefrontCollectionProducts = pgTable(
  'storefront_collection_products',
  {
    collectionId: uuid()
      .notNull()
      .references(() => storefrontCollections.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    position: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex('storefront_collection_products_unique').on(t.collectionId, t.productId),
    index('storefront_collection_products_product_idx').on(t.productId),
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
    weightGrams: integer().notNull().default(0),
    /** Keep visible in the purchasing review even without recent sales. */
    isStrategic: boolean().notNull().default(false),
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

/**
 * A visitor asking what something would cost (F-5).
 *
 * The storefront has a WhatsApp button and nothing else; this is the other
 * half of demand capture — one that lands inside the books instead of a chat
 * history. Nothing here is trusted as it arrives: the form is public, so the
 * columns are generous free text and the only server-side promise is that the
 * product id, if present, refers to a real published product.
 *
 * The request names a *product*, never a variant. Visitors read colorways as
 * choices on one item, not as separate things; pinning a request to "Black"
 * would make it vanish from everything listed under "White". Which variant an
 * owner actually quoted is recorded on the sale the request becomes — and the
 * product reference is `ON DELETE RESTRICT`, because a request that led to a
 * quote is history, and history must not disappear when the catalog changes.
 *
 * `saleId` is set when an owner converts a request into a draft sale. It is
 * deliberately not a cascade path — a quote request is evidence of where a
 * sale came from and must outlive anything done to it afterwards.
 */
export const quoteRequests = pgTable(
  'quote_requests',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    contact: text().notNull(),
    productId: uuid().references(() => products.id, { onDelete: 'restrict' }),
    quantity: integer().notNull().default(1),
    details: text(),
    status: quoteRequestStatus().notNull().default('new'),
    /** The draft sale this became, if an owner converted it. */
    saleId: uuid().references(() => sales.id, { onDelete: 'set null' }),
    /** Set by whoever handled it, for the audit trail. */
    handledById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('quote_requests_status_idx').on(t.status, t.createdAt.desc()),
    index('quote_requests_product_idx').on(t.productId),
    index('quote_requests_sale_idx').on(t.saleId),
    index('quote_requests_handler_idx').on(t.handledById),
  ],
);

/** Demand history, not a mailing list. Product references are restrictive so
 * an archived catalog item cannot silently erase people waiting for it. */
export const restockRequests = pgTable(
  'restock_requests',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    variantId: uuid().references(() => productVariants.id, { onDelete: 'set null' }),
    name: text(),
    contact: text().notNull(),
    channel: text().notNull(),
    status: text().notNull().default('waiting'),
    convertedSaleId: uuid().references(() => sales.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    contactedAt: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('restock_requests_status_idx').on(t.status, t.createdAt.desc()),
    index('restock_requests_product_idx').on(t.productId),
    index('restock_requests_variant_idx').on(t.variantId),
    index('restock_requests_created_idx').on(t.createdAt.desc()),
  ],
);
