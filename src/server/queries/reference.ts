import { type SQL, sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import type { CategoryQuery, SupplierQuery } from '@/lib/list-params';
import type { Cents, CurrencyCode } from '@/lib/money';
import { balanceCentsOf, type PaymentBadgeCode, paymentBadgeOf } from '@/lib/payment-status';
import { db } from '../db/client';
import { clampPage, clampPerPage, type Page, toPage } from './paginate';
import { bool, maybe, num, text } from './row';

function parseObject(value: string | null | undefined): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch { return {}; }
}
function parseStringArray(value: string | null | undefined): string[] {
  try { const parsed: unknown = JSON.parse(value ?? '[]'); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []; } catch { return []; }
}
function parseCompatibility(value: string | null | undefined) {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    const record = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    return { platforms: Array.isArray(record.platforms) ? record.platforms.filter((item): item is string => typeof item === 'string') : [], protocols: Array.isArray(record.protocols) ? record.protocols.filter((item): item is string => typeof item === 'string') : [], ecosystems: Array.isArray(record.ecosystems) ? record.ecosystems.filter((item): item is string => typeof item === 'string') : [] };
  } catch { return { platforms: [], protocols: [], ecosystems: [] }; }
}

/**
 * The `isDatabaseConfigured()` guard on each function below is a SETUP state,
 * not an outage. Only an ABSENT connection string returns empty; a failing
 * query still throws, because an empty dashboard must never be able to mean
 * "the database is down". See src/app/setup/page.tsx.
 */

/** Reference data: the small, slow-moving lists everything else points at. */

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  productCount: number;
};

const CATEGORY_SORT: Record<CategoryQuery['sort'], SQL> = {
  name: sql`c.position, c.name`,
  products: sql`(SELECT COUNT(*) FROM products p WHERE p.category_id = c.id)`,
};

export async function listCategories(
  query: CategoryQuery = {} as CategoryQuery,
): Promise<Page<CategoryRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(sql`(c.name ILIKE ${term} OR c.slug ILIKE ${term})`);
  }
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const orderBy = CATEGORY_SORT[query.sort] ?? CATEGORY_SORT.name;
  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

  const rows = await db.execute<Record<string, string>>(sql`
    SELECT c.id, c.name, c.slug,
           (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id)::text AS product_count,
           COUNT(*) OVER()::text AS total_count
      FROM categories c
      ${where}
     ORDER BY ${orderBy} ${direction}
     LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => ({
      id: text(row.id),
      name: text(row.name),
      slug: text(row.slug),
      productCount: num(row.product_count),
    })),
    total,
    page,
    perPage,
  );
}

export type SupplierRow = {
  id: string;
  name: string;
  kind: 'amazon' | 'aliexpress' | 'other';
  website: string;
  notes: string;
  leadTimeDays: number;
  productCount: number;
  orderCount: number;
  spendCents: Cents;
};

// products/orders/spend recompute the same subqueries the SELECT list
// builds, rather than referencing an output alias cast ::text for the JS
// driver, which Postgres would then sort lexicographically.
const SUPPLIER_SORT: Record<SupplierQuery['sort'], SQL> = {
  name: sql`s.name`,
  products: sql`(SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id)`,
  orders: sql`(SELECT COUNT(*) FROM purchase_orders o WHERE o.supplier_id = s.id)`,
  spend: sql`COALESCE((
    SELECT SUM(i.landed_cost_cents)
      FROM purchase_order_items i
      JOIN purchase_orders o ON o.id = i.purchase_order_id
     WHERE o.supplier_id = s.id AND o.status = 'received'
  ), 0)`,
};

export async function listSuppliers(
  query: SupplierQuery = {} as SupplierQuery,
): Promise<Page<SupplierRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(sql`s.name ILIKE ${term}`);
  }
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const orderBy = SUPPLIER_SORT[query.sort] ?? SUPPLIER_SORT.name;
  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      s.id, s.name, s.kind::text AS kind, s.website, s.notes, s.lead_time_days::text AS lead_time_days,
      (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id)::text AS product_count,
      (SELECT COUNT(*) FROM purchase_orders o WHERE o.supplier_id = s.id)::text AS order_count,
      COALESCE((
        SELECT SUM(i.landed_cost_cents)
          FROM purchase_order_items i
          JOIN purchase_orders o ON o.id = i.purchase_order_id
         WHERE o.supplier_id = s.id AND o.status = 'received'
      ), 0)::text AS spend_cents,
      COUNT(*) OVER()::text AS total_count
    FROM suppliers s
    ${where}
    ORDER BY ${orderBy} ${direction}, s.name
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => ({
      id: text(row.id),
      name: text(row.name),
      kind: text(row.kind, 'other') as SupplierRow['kind'],
      website: text(row.website),
      notes: text(row.notes),
      leadTimeDays: num(row.lead_time_days, 28),
      productCount: num(row.product_count),
      orderCount: num(row.order_count),
      spendCents: num(row.spend_cents),
    })),
    total,
    page,
    perPage,
  );
}

export type SupplierDetail = SupplierRow & {
  products: { id: string; name: string; code: string }[];
  purchaseOrders: {
    id: string;
    number: string;
    status: string;
    orderedAt: string | null;
    totalCents: Cents;
  }[];
};

export async function getSupplier(id: string): Promise<SupplierDetail | null> {
  if (!isDatabaseConfigured()) return null;

  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT
      s.id, s.name, s.kind::text AS kind, s.website, s.notes,
      s.lead_time_days::text AS lead_time_days,
      (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id)::text AS product_count,
      (SELECT COUNT(*) FROM purchase_orders o WHERE o.supplier_id = s.id)::text AS order_count,
      COALESCE((
        SELECT SUM(i.landed_cost_cents)
          FROM purchase_order_items i
          JOIN purchase_orders o ON o.id = i.purchase_order_id
         WHERE o.supplier_id = s.id AND o.status = 'received'
      ), 0)::text AS spend_cents
    FROM suppliers s
    WHERE s.id = ${id}
    LIMIT 1
  `);

  if (!row) return null;

  const [products, purchaseOrders] = await Promise.all([
    db.execute<Record<string, string | null>>(sql`
      SELECT id, name, code FROM products WHERE supplier_id = ${id} ORDER BY name
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT
        o.id, o.number, o.status::text,
        o.ordered_at::text,
        COALESCE((SELECT SUM(i.landed_cost_cents) FROM purchase_order_items i
                   WHERE i.purchase_order_id = o.id), 0)::text AS total_cents
      FROM purchase_orders o
      WHERE o.supplier_id = ${id}
      ORDER BY o.ordered_at DESC NULLS LAST
    `),
  ]);

  return {
    id: text(row.id),
    name: text(row.name),
    kind: text(row.kind, 'other') as SupplierRow['kind'],
    website: text(row.website),
    notes: text(row.notes),
    leadTimeDays: num(row.lead_time_days, 28),
    productCount: num(row.product_count),
    orderCount: num(row.order_count),
    spendCents: num(row.spend_cents),
    products: products.map((product) => ({
      id: text(product.id),
      name: text(product.name),
      code: text(product.code),
    })),
    purchaseOrders: purchaseOrders.map((order) => ({
      id: text(order.id),
      number: text(order.number),
      status: text(order.status),
      orderedAt: maybe(order.ordered_at),
      totalCents: num(order.total_cents),
    })),
  };
}

export type MemberRow = {
  id: string;
  fullName: string;
  email: string;
  role: 'owner' | 'staff' | 'viewer';
  isPrincipal: boolean;
  /** False until that person has signed in for the first time. */
  hasSignedIn: boolean;
};

export async function listMembers(): Promise<MemberRow[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT id, full_name, email, role::text AS role,
           is_principal::text AS is_principal,
           (auth_user_id IS NOT NULL)::text AS has_signed_in
      FROM members
     ORDER BY is_principal DESC, full_name
  `);

  return rows.map((row) => ({
    id: text(row.id),
    fullName: text(row.full_name),
    email: text(row.email),
    role: text(row.role) as MemberRow['role'],
    isPrincipal: bool(row.is_principal),
    hasSignedIn: bool(row.has_signed_in),
  }));
}

export type RateRow = {
  id: string;
  rateMicros: number;
  effectiveFrom: string;
  source: string;
  note: string | null;
};

export async function listRates(limit = 24): Promise<RateRow[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT id, rate_micros::text, effective_from::text, source, note
      FROM fx_rates
     WHERE base = 'USD' AND quote = 'SRD'
     ORDER BY effective_from DESC
     LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: text(row.id),
    rateMicros: num(row.rate_micros),
    effectiveFrom: text(row.effective_from),
    source: text(row.source),
    note: maybe(row.note),
  }));
}

export type SettingsRow = {
  businessName: string;
  baseCurrency: string;
  displayCurrency: string;
  lowStockThreshold: number;
  quoteValidityDays: number;
  defaultPaymentDays: number;
  weeklyPurchaseBudgetCents: number | null;
  reviewHorizonDays: number;
  safetyStockDays: number;
  defaultSupplierLeadTimeDays: number;
  targetBundleMarginBp: number;
  defaultBundleDiscountBp: number;
  legalName: string | null;
  addressLine: string | null;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  taxId: string | null;
  logoUrl: string | null;
  invoiceFooter: string | null;
  instagram: string | null;
  openingHours: string | null;
  pickupEnabled: boolean; pickupLabel: string | null; pickupDetails: string | null; sameDayPickupEnabled: boolean; pickupCutoffTime: string | null;
  deliveryEnabled: boolean; deliveryDetails: string | null; deliveryAreas: string | null; deliveryFeeDisplay: string | null; deliveryEstimateDisplay: string | null;
  paymentMethods: { name: string; details?: string }[];
  announcement: string | null; heroTitle: string | null; heroBody: string | null; supportTitle: string | null; supportBody: string | null; defaultNewArrivalDays: number;
};

export async function getSettings(): Promise<SettingsRow | null> {
  if (!isDatabaseConfigured()) return null;

  const [row] = await db.execute<Record<string, string>>(sql`
    SELECT business_name, base_currency, display_currency, low_stock_threshold::text,
           quote_validity_days::text, default_payment_days::text,
           weekly_purchase_budget_cents::text, review_horizon_days::text, safety_stock_days::text,
           target_bundle_margin_bp::text, default_bundle_discount_bp::text,
           default_supplier_lead_time_days::text,
           legal_name, address_line, city, phone, whatsapp, email, tax_id, logo_url, invoice_footer,
           instagram, opening_hours, pickup_enabled::text, pickup_label, pickup_details, same_day_pickup_enabled::text, pickup_cutoff_time,
           delivery_enabled::text, delivery_details, delivery_areas, delivery_fee_display, delivery_estimate_display,
           payment_methods::text, announcement, hero_title, hero_body, support_title, support_body, default_new_arrival_days::text
      FROM settings LIMIT 1
  `);

  if (!row) return null;
  return {
    businessName: text(row.business_name, 'Nextly'),
    baseCurrency: text(row.base_currency, 'USD'),
    displayCurrency: text(row.display_currency, 'SRD'),
    lowStockThreshold: num(row.low_stock_threshold, 5),
    quoteValidityDays: num(row.quote_validity_days, 14),
    defaultPaymentDays: num(row.default_payment_days, 14),
    weeklyPurchaseBudgetCents:
      row.weekly_purchase_budget_cents == null ? null : num(row.weekly_purchase_budget_cents),
    reviewHorizonDays: num(row.review_horizon_days, 14),
    safetyStockDays: num(row.safety_stock_days, 7),
    targetBundleMarginBp: num(row.target_bundle_margin_bp, 3000),
    defaultBundleDiscountBp: num(row.default_bundle_discount_bp, 500),
    defaultSupplierLeadTimeDays: num(row.default_supplier_lead_time_days, 28),
    legalName: row.legal_name ?? null,
    addressLine: row.address_line ?? null,
    city: row.city ?? null,
    phone: row.phone ?? null,
    whatsapp: row.whatsapp ?? null,
    email: row.email ?? null,
    taxId: row.tax_id ?? null,
    logoUrl: row.logo_url ?? null,
    invoiceFooter: row.invoice_footer ?? null,
    instagram: row.instagram ?? null,
    openingHours: row.opening_hours ?? null,
    pickupEnabled: bool(row.pickup_enabled), pickupLabel: row.pickup_label ?? null, pickupDetails: row.pickup_details ?? null, sameDayPickupEnabled: bool(row.same_day_pickup_enabled), pickupCutoffTime: row.pickup_cutoff_time ?? null,
    deliveryEnabled: bool(row.delivery_enabled), deliveryDetails: row.delivery_details ?? null, deliveryAreas: row.delivery_areas ?? null, deliveryFeeDisplay: row.delivery_fee_display ?? null, deliveryEstimateDisplay: row.delivery_estimate_display ?? null,
    paymentMethods: parsePaymentMethods(row.payment_methods),
    announcement: row.announcement ?? null, heroTitle: row.hero_title ?? null, heroBody: row.hero_body ?? null, supportTitle: row.support_title ?? null, supportBody: row.support_body ?? null, defaultNewArrivalDays: num(row.default_new_arrival_days, 30),
  };
}

function parsePaymentMethods(value: string | null | undefined): { name: string; details?: string }[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object' || typeof (item as { name?: unknown }).name !== 'string') return [];
      const details = (item as { details?: unknown }).details;
      return typeof details === 'string' ? [{ name: (item as { name: string }).name, details }] : [{ name: (item as { name: string }).name }];
    });
  } catch { return []; }
}

export type ProductDetail = {
  id: string;
  code: string;
  name: string;
  slug: string;
  categoryId: string | null;
  supplierId: string | null;
  brandId: string | null;
  sourceUrl: string | null;
  summary: string | null;
  description: string | null;
  modelNumber: string | null;
  keyFeatures: string[];
  bestFor: string[];
  compatibility: { platforms: string[]; protocols: string[]; ecosystems: string[] };
  boxContents: string[];
  nextlyTake: string | null;
  buyerRequirements: { hubRequired?: boolean; hubName?: string; appRequired?: boolean; appName?: string; wifiRequired?: boolean; wifiBands: string[]; indoorOutdoor?: 'indoor' | 'outdoor' | 'indoor-outdoor'; powerSource?: string; installationNotes?: string };
  faqItems: { question: string; answer: string }[];
  featured: boolean;
  featuredPosition: number | null;
  newUntil: string | null;
  showWhenOutOfStock: boolean;
  restockNotificationsEnabled: boolean;
  status: 'draft' | 'active' | 'archived';
  /** F-6: months of cover from the day of sale; 0 means none. */
  warrantyMonths: number;
  catalogPublished: boolean;
  notes: string | null;
  variants: {
    id: string;
    name: string;
    sku: string;
    listPriceCents: Cents;
    referenceCostCents: Cents;
    weightGrams: number;
    isStrategic: boolean;
    isActive: boolean;
    barcode: string | null;
    attributes: Record<string, string>;
    onHand: number;
    valueCents: Cents;
  }[];
  images: {
    id: string;
    url: string;
    thumbUrl: string | null;
    width: number;
    height: number;
    alt: string | null;
    isPrimary: boolean;
    position: number;
  }[];
};

/** Everything the edit form needs, in one round trip. */
export async function getProduct(id: string): Promise<ProductDetail | null> {
  if (!isDatabaseConfigured()) return null;

  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT id, code, name, slug, category_id, supplier_id, brand_id, source_url,
           summary, description, model_number, key_features::text, best_for::text,
           compatibility::text, buyer_requirements::text, box_contents::text, nextly_take, faq_items::text, featured::text,
           featured_position::text, new_until::text, show_when_out_of_stock::text, restock_notifications_enabled::text, status::text AS status,
           warranty_months::text AS warranty_months,
           catalog_published::text AS catalog_published, notes
      FROM products WHERE id = ${id} LIMIT 1
  `);

  if (!row) return null;

  const [variants, images] = await Promise.all([
    db.execute<Record<string, string | null>>(sql`
      SELECT v.id, v.name, v.sku, v.barcode, v.attributes::text, v.list_price_cents::text, v.reference_cost_cents::text,
              v.weight_grams::text AS weight_grams,
              v.is_strategic::text AS is_strategic,
             v.is_active::text AS is_active,
             COALESCE(s.on_hand, 0)::text     AS on_hand,
             COALESCE(s.value_cents, 0)::text AS value_cents
        FROM product_variants v
        LEFT JOIN v_stock_levels s ON s.variant_id = v.id
       WHERE v.product_id = ${id}
       ORDER BY v.position
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT id, url, thumb_url, width::text, height::text, alt,
             is_primary::text AS is_primary, position::text
        FROM product_images
       WHERE product_id = ${id}
       ORDER BY position
    `),
  ]);

  return {
    id: text(row.id),
    code: text(row.code),
    name: text(row.name),
    slug: text(row.slug),
    categoryId: maybe(row.category_id),
    supplierId: maybe(row.supplier_id),
    brandId: maybe(row.brand_id),
    sourceUrl: maybe(row.source_url),
    summary: maybe(row.summary),
    description: maybe(row.description),
    modelNumber: maybe(row.model_number),
    keyFeatures: parseStringArray(row.key_features),
    bestFor: parseStringArray(row.best_for),
    compatibility: parseCompatibility(row.compatibility),
    buyerRequirements: parseBuyerRequirements(row.buyer_requirements),
    boxContents: parseStringArray(row.box_contents),
    nextlyTake: maybe(row.nextly_take),
    faqItems: parseFaqItems(row.faq_items),
    featured: bool(row.featured),
    featuredPosition: row.featured_position == null ? null : num(row.featured_position),
    newUntil: maybe(row.new_until),
    showWhenOutOfStock: bool(row.show_when_out_of_stock),
    restockNotificationsEnabled: bool(row.restock_notifications_enabled),
    status: text(row.status) as ProductDetail['status'],
    warrantyMonths: num(row.warranty_months),
    catalogPublished: bool(row.catalog_published),
    notes: maybe(row.notes),
    variants: variants.map((variant) => ({
      id: text(variant.id),
      name: text(variant.name),
      sku: text(variant.sku),
      listPriceCents: num(variant.list_price_cents),
      referenceCostCents: num(variant.reference_cost_cents),
      weightGrams: num(variant.weight_grams),
      isStrategic: bool(variant.is_strategic),
      isActive: bool(variant.is_active),
      barcode: maybe(variant.barcode),
      attributes: parseObject(variant.attributes),
      onHand: num(variant.on_hand),
      valueCents: num(variant.value_cents),
    })),
    images: images.map((image) => ({
      id: text(image.id),
      url: text(image.url),
      thumbUrl: maybe(image.thumb_url),
      width: num(image.width),
      height: num(image.height),
      alt: maybe(image.alt),
      isPrimary: bool(image.is_primary),
      position: num(image.position),
    })),
  };
}

export type ProductRelationshipRow = { id: string; relatedProductId: string; relatedProductName: string; relationshipType: 'accessory' | 'works_with' | 'alternative' | 'cheaper_alternative' | 'premium_alternative' | 'required_accessory' };
export async function listProductRelationships(productId: string): Promise<ProductRelationshipRow[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`SELECT pr.id, pr.related_product_id, rp.name AS related_product_name, pr.relationship_type::text FROM product_relationships pr JOIN products rp ON rp.id = pr.related_product_id WHERE pr.product_id = ${productId} ORDER BY pr.position, rp.name`);
  return rows.map((row) => ({ id: text(row.id), relatedProductId: text(row.related_product_id), relatedProductName: text(row.related_product_name), relationshipType: text(row.relationship_type) as ProductRelationshipRow['relationshipType'] }));
}
export async function listProductRelationshipOptions(productId: string): Promise<{ id: string; name: string }[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`SELECT id, name FROM products WHERE id <> ${productId} AND status <> 'archived' ORDER BY name LIMIT 500`);
  return rows.map((row) => ({ id: text(row.id), name: text(row.name) }));
}

function parseBuyerRequirements(value: string | null | undefined): ProductDetail['buyerRequirements'] {
  const raw = parseObject(value);
  const stringList = Array.isArray(raw.wifiBands) ? raw.wifiBands.filter((item): item is string => typeof item === 'string') : [];
  const indoorOutdoor = raw.indoorOutdoor;
  return {
    hubRequired: typeof raw.hubRequired === 'boolean' ? raw.hubRequired : undefined,
    hubName: typeof raw.hubName === 'string' ? raw.hubName : undefined,
    appRequired: typeof raw.appRequired === 'boolean' ? raw.appRequired : undefined,
    appName: typeof raw.appName === 'string' ? raw.appName : undefined,
    wifiRequired: typeof raw.wifiRequired === 'boolean' ? raw.wifiRequired : undefined,
    wifiBands: stringList,
    indoorOutdoor: indoorOutdoor === 'indoor' || indoorOutdoor === 'outdoor' || indoorOutdoor === 'indoor-outdoor' ? indoorOutdoor : undefined,
    powerSource: typeof raw.powerSource === 'string' ? raw.powerSource : undefined,
    installationNotes: typeof raw.installationNotes === 'string' ? raw.installationNotes : undefined,
  };
}

function parseFaqItems(value: string | null | undefined): { question: string; answer: string }[] {
  try { const parsed: unknown = JSON.parse(value ?? '[]'); return Array.isArray(parsed) ? parsed.flatMap((item) => item && typeof item === 'object' && typeof (item as { question?: unknown }).question === 'string' && typeof (item as { answer?: unknown }).answer === 'string' ? [{ question: (item as { question: string }).question, answer: (item as { answer: string }).answer }] : []) : []; } catch { return []; }
}

export type CustomerDetail = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  notes: string | null;
  orderCount: number;
  spentCents: Cents;
  grossCents: Cents;
  lastOrderAt: string | null;
  /** Confirmed sales not yet collected, normalised to USD cents (F-4). */
  outstandingUsdCents: Cents;
  sales: {
    id: string;
    number: string;
    status: string;
    soldAt: string;
    totalUsdCents: Cents;
    grossProfitCents: Cents;
    /** What is still owed on this sale, in the currency it was quoted in. */
    balanceCents: Cents;
    currency: CurrencyCode;
    /** In the currency of the sale, like `totalCents` there. Null on drafts
     *  and voids — nothing is owed on a sale that has not settled. */
    paymentStatus: PaymentBadgeCode | null;
  }[];
};

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  if (!isDatabaseConfigured()) return null;

  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT
      c.id, c.code, c.name, c.phone, c.email, c.address_line, c.city, c.notes,
      t.order_count::text, t.spent_usd_cents::text,
      t.gross_profit_cents::text, t.last_order_at::text,
      COALESCE((
        SELECT SUM(GREATEST(
          s.total_usd_cents
          - COALESCE((
              SELECT SUM(le.amount_usd_cents)
                FROM sale_payments sp
                JOIN ledger_entries le ON le.source_kind = 'sale' AND le.source_id = sp.id
               WHERE sp.sale_id = s.id
            ), 0)
          - COALESCE((
              SELECT SUM(CASE WHEN le.direction = 'in' THEN le.amount_usd_cents
                              ELSE -le.amount_usd_cents END)
                FROM ledger_entries le
               WHERE le.source_kind = 'sale'
                 AND le.source_id = s.id
                 AND le.category = 'sales_receipt'
            ), 0),
          0))
          FROM sales s
         WHERE s.customer_id = c.id AND s.status = 'confirmed'
      ), 0)::text AS outstanding_usd_cents
    FROM customers c
    JOIN v_customer_totals t ON t.customer_id = c.id
    WHERE c.id = ${id}
    LIMIT 1
  `);

  if (!row) return null;

  const sales = await db.execute<Record<string, string | null>>(sql`
    SELECT id, number, status::text, sold_at::text, currency::text,
           total_cents::text, total_usd_cents::text, gross_profit_cents::text,
           (
             COALESCE((SELECT SUM(amount_cents) FROM sale_payments p
                        WHERE p.sale_id = sales.id), 0)
             + COALESCE((
                 SELECT SUM(CASE WHEN l.direction = 'in' THEN l.amount_cents
                                 ELSE -l.amount_cents END)
                   FROM ledger_entries l
                  WHERE l.source_kind = 'sale'
                    AND l.source_id = sales.id
                    AND l.category = 'sales_receipt'
               ), 0)
           )::text AS paid_cents
      FROM sales
     WHERE customer_id = ${id}
     ORDER BY sold_at DESC
  `);

  return {
    id: text(row.id),
    code: text(row.code),
    name: text(row.name),
    phone: maybe(row.phone),
    email: maybe(row.email),
    addressLine: maybe(row.address_line),
    city: maybe(row.city),
    notes: maybe(row.notes),
    orderCount: num(row.order_count),
    spentCents: num(row.spent_usd_cents),
    grossCents: num(row.gross_profit_cents),
    lastOrderAt: maybe(row.last_order_at),
    outstandingUsdCents: num(row.outstanding_usd_cents),
    sales: sales.map((sale) => {
      const status = text(sale.status);
      const totalCents = num(sale.total_cents);
      const paidCents = num(sale.paid_cents);
      return {
        id: text(sale.id),
        number: text(sale.number),
        status,
        soldAt: text(sale.sold_at),
        totalUsdCents: num(sale.total_usd_cents),
        grossProfitCents: num(sale.gross_profit_cents),
        balanceCents: balanceCentsOf(totalCents, paidCents),
        currency: text(sale.currency) === 'SRD' ? 'SRD' : 'USD',
        paymentStatus:
          status === 'confirmed'
            ? paymentBadgeOf(totalCents, paidCents, new Date(text(sale.sold_at)))
            : null,
      };
    }),
  };
}
