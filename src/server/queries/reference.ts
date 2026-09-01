import { sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents } from '@/lib/money';
import { db } from '../db/client';
import { TAGS } from './cache';
import { bool, maybe, num, text } from './row';

/** Reference data: the small, slow-moving lists everything else points at. */

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  productCount: number;
};

export async function listCategories(): Promise<CategoryRow[]> {
  'use cache';
  cacheTag(TAGS.products);
  cacheLife('max');

  // Before Supabase credentials exist this is a setup state, not an outage.
  // Only an ABSENT connection string degrades; a failing query still throws,
  // because an empty dashboard must never be able to mean 'the database is down'.
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string>>(sql`
    SELECT c.id, c.name, c.slug,
           (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id)::text AS product_count
      FROM categories c
     ORDER BY c.position, c.name
  `);

  return rows.map((row) => ({
    id: text(row.id),
    name: text(row.name),
    slug: text(row.slug),
    productCount: num(row.product_count),
  }));
}

export type SupplierRow = {
  id: string;
  name: string;
  kind: string;
  productCount: number;
  orderCount: number;
  spendCents: Cents;
};

export async function listSuppliers(): Promise<SupplierRow[]> {
  'use cache';
  cacheTag(TAGS.products, TAGS.purchaseOrders);
  cacheLife('max');

  // Before Supabase credentials exist this is a setup state, not an outage.
  // Only an ABSENT connection string degrades; a failing query still throws,
  // because an empty dashboard must never be able to mean 'the database is down'.
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string>>(sql`
    SELECT
      s.id, s.name, s.kind::text AS kind,
      (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id)::text AS product_count,
      (SELECT COUNT(*) FROM purchase_orders o WHERE o.supplier_id = s.id)::text AS order_count,
      COALESCE((
        SELECT SUM(i.landed_cost_cents)
          FROM purchase_order_items i
          JOIN purchase_orders o ON o.id = i.purchase_order_id
         WHERE o.supplier_id = s.id AND o.status = 'received'
      ), 0)::text AS spend_cents
    FROM suppliers s
    ORDER BY s.name
  `);

  return rows.map((row) => ({
    id: text(row.id),
    name: text(row.name),
    kind: text(row.kind, 'other'),
    productCount: num(row.product_count),
    orderCount: num(row.order_count),
    spendCents: num(row.spend_cents),
  }));
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
  'use cache';
  cacheTag(TAGS.members);
  cacheLife('max');

  // Before Supabase credentials exist this is a setup state, not an outage.
  // Only an ABSENT connection string degrades; a failing query still throws,
  // because an empty dashboard must never be able to mean 'the database is down'.
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
  'use cache';
  cacheTag(TAGS.fxRates);
  cacheLife('max');

  // Before Supabase credentials exist this is a setup state, not an outage.
  // Only an ABSENT connection string degrades; a failing query still throws,
  // because an empty dashboard must never be able to mean 'the database is down'.
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
};

export async function getSettings(): Promise<SettingsRow | null> {
  'use cache';
  cacheTag(TAGS.settings);
  cacheLife('max');

  // Before Supabase credentials exist this is a setup state, not an outage.
  // Only an ABSENT connection string degrades; a failing query still throws,
  // because an empty dashboard must never be able to mean 'the database is down'.
  if (!isDatabaseConfigured()) return null;

  const [row] = await db.execute<Record<string, string>>(sql`
    SELECT business_name, base_currency, display_currency, low_stock_threshold::text
      FROM settings LIMIT 1
  `);

  if (!row) return null;
  return {
    businessName: text(row.business_name, 'Nextly'),
    baseCurrency: text(row.base_currency, 'USD'),
    displayCurrency: text(row.display_currency, 'SRD'),
    lowStockThreshold: num(row.low_stock_threshold, 5),
  };
}

export type ProductDetail = {
  id: string;
  code: string;
  name: string;
  slug: string;
  categoryId: string | null;
  supplierId: string | null;
  sourceUrl: string | null;
  summary: string | null;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  catalogPublished: boolean;
  notes: string | null;
  variants: {
    id: string;
    name: string;
    sku: string;
    listPriceCents: Cents;
    referenceCostCents: Cents;
    isActive: boolean;
    onHand: number;
    valueCents: Cents;
  }[];
};

/** Everything the edit form needs, in one round trip. */
export async function getProduct(id: string): Promise<ProductDetail | null> {
  'use cache';
  cacheTag(TAGS.products, TAGS.inventory);
  cacheLife('max');

  // Before Supabase credentials exist this is a setup state, not an outage.
  // Only an ABSENT connection string degrades; a failing query still throws,
  // because an empty dashboard must never be able to mean 'the database is down'.
  if (!isDatabaseConfigured()) return null;

  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT id, code, name, slug, category_id, supplier_id, source_url,
           summary, description, status::text AS status,
           catalog_published::text AS catalog_published, notes
      FROM products WHERE id = ${id} LIMIT 1
  `);

  if (!row) return null;

  const variants = await db.execute<Record<string, string | null>>(sql`
    SELECT v.id, v.name, v.sku, v.list_price_cents::text, v.reference_cost_cents::text,
           v.is_active::text AS is_active,
           COALESCE(s.on_hand, 0)::text     AS on_hand,
           COALESCE(s.value_cents, 0)::text AS value_cents
      FROM product_variants v
      LEFT JOIN v_stock_levels s ON s.variant_id = v.id
     WHERE v.product_id = ${id}
     ORDER BY v.position
  `);

  return {
    id: text(row.id),
    code: text(row.code),
    name: text(row.name),
    slug: text(row.slug),
    categoryId: maybe(row.category_id),
    supplierId: maybe(row.supplier_id),
    sourceUrl: maybe(row.source_url),
    summary: maybe(row.summary),
    description: maybe(row.description),
    status: text(row.status) as ProductDetail['status'],
    catalogPublished: bool(row.catalog_published),
    notes: maybe(row.notes),
    variants: variants.map((variant) => ({
      id: text(variant.id),
      name: text(variant.name),
      sku: text(variant.sku),
      listPriceCents: num(variant.list_price_cents),
      referenceCostCents: num(variant.reference_cost_cents),
      isActive: bool(variant.is_active),
      onHand: num(variant.on_hand),
      valueCents: num(variant.value_cents),
    })),
  };
}
