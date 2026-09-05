import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents } from '@/lib/money';
import { db } from '../db/client';
import { bool, maybe, num, text } from './row';

/**
 * The public storefront's read models.
 *
 * The storefront reads the same product rows the dashboard does, behind the
 * `catalog_published` filter — one source of truth for price and
 * availability, per the roadmap. Two rules follow from the fact that these
 * pages are PUBLIC:
 *
 * 1. Every query here filters on `catalog_published AND status = 'active'`
 *    itself. The filter is not a parameter a caller could forget; a draft or
 *    an unpublished product has no path to these pages.
 * 2. No cost figure is ever selected. Landed cost, reference cost and stock
 *    VALUE are the business's private arithmetic; the storefront selects
 *    price and unit counts only.
 */

export type CatalogImage = {
  url: string;
  width: number;
  height: number;
  alt: string | null;
  blurDataUrl: string | null;
};

export type CatalogListItem = {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  brandName: string | null;
  compatibility: { platforms: string[]; protocols: string[]; ecosystems: string[] };
  newUntil: string | null;
  /** Units on hand across the product's active variants. */
  onHand: number;
  incoming: number;
  expectedAt: string | null;
  minPriceCents: Cents;
  maxPriceCents: Cents;
  image: CatalogImage | null;
  /** Publish-adjacent signal: the product row's creation instant, used to
   *  flag recent arrivals ("NEW") in the grid. */
  createdAt: string;
};

export type CatalogSort = 'newest' | 'name' | 'price-asc' | 'price-desc';

// Ordered by the `price` LATERAL's own numeric columns, qualified — never by
// the outer SELECT list's same-named aliases, which are cast to `::text` for
// transport and would sort "100" before "20" if ORDER BY resolved to them
// instead. Qualifying with `price.` is what keeps it resolving to the
// LATERAL's native bigint rather than the outer alias.
const CATALOG_SORT_CLAUSES: Record<CatalogSort, ReturnType<typeof sql>> = {
  newest: sql`p.created_at DESC, p.name ASC`,
  name: sql`p.name ASC`,
  'price-asc': sql`price.min_price ASC NULLS LAST, p.name ASC`,
  'price-desc': sql`price.max_price DESC NULLS LAST, p.name ASC`,
};

export async function listCatalogProducts(
  params: { q?: string; category?: string; collection?: string; sort?: CatalogSort; limit?: number } = {},
): Promise<CatalogListItem[]> {
  if (!isDatabaseConfigured()) return [];

  // Normalised to `null`, never `undefined`: postgres.js rejects an
  // `undefined` bind parameter outright, and `null` is what "no filter"
  // means to the `IS NULL OR ...` clauses below anyway. A `NULL` limit reads
  // as "no limit" to Postgres, so the hero's "newest one" read and the
  // grid's "every match" read share this one query with no branching SQL.
  const category = params.category?.trim() || null;
  const collection = params.collection?.trim() || null;
  const likeQuery = params.q?.trim() ? `%${params.q.trim()}%` : null;
  const order = CATALOG_SORT_CLAUSES[params.sort ?? 'newest'];
  const limit = params.limit ?? null;

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      p.id, p.name, p.slug, p.summary, p.created_at::text AS created_at, p.new_until::text AS new_until,
      c.name AS category_name, c.slug AS category_slug,
      b.name AS brand_name, p.compatibility::text AS compatibility,
      COALESCE((
        SELECT SUM(s.on_hand)
          FROM product_variants v
          JOIN v_stock_levels s ON s.variant_id = v.id
         WHERE v.product_id = p.id AND v.is_active
      ), 0)::text AS on_hand,
      COALESCE((SELECT SUM(poi.quantity - poi.quantity_received) FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.purchase_order_id JOIN product_variants iv ON iv.id = poi.variant_id WHERE iv.product_id = p.id AND po.status IN ('ordered', 'shipped')), 0)::text AS incoming,
      (SELECT MIN(po.expected_at)::text FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.purchase_order_id JOIN product_variants iv ON iv.id = poi.variant_id WHERE iv.product_id = p.id AND po.status IN ('ordered', 'shipped') AND po.expected_at IS NOT NULL) AS expected_at,
      COALESCE(price.min_price, 0)::text AS min_price,
      COALESCE(price.max_price, 0)::text AS max_price,
      img.url AS image_url, img.width::text AS image_width,
      img.height::text AS image_height, img.alt AS image_alt,
      img.blur_data_url AS image_blur
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN LATERAL (
      SELECT i.url, i.width, i.height, i.alt, i.blur_data_url
        FROM product_images i
       WHERE i.product_id = p.id
       ORDER BY i.is_primary DESC, i.position
       LIMIT 1
    ) img ON true
    -- Zero-priced variants are draft/unpriced siblings of a real one; a
    -- published product is guaranteed at least one variant with a real price
    -- (assertCatalogPublishable, server/actions/products.ts), so excluding
    -- non-positive prices here never leaves a product with no price at all —
    -- it just stops a $0 draft variant from winning the "from" figure.
    LEFT JOIN LATERAL (
      SELECT MIN(v.list_price_cents) AS min_price, MAX(v.list_price_cents) AS max_price
        FROM product_variants v
       WHERE v.product_id = p.id AND v.is_active AND v.list_price_cents > 0
    ) price ON true
    WHERE p.catalog_published AND p.status = 'active'
      AND (p.show_when_out_of_stock OR EXISTS (SELECT 1 FROM product_variants sv JOIN v_stock_levels ss ON ss.variant_id = sv.id WHERE sv.product_id = p.id AND sv.is_active AND ss.on_hand > 0))
      AND (${category}::text IS NULL OR c.slug = ${category})
      AND (${collection}::text IS NULL OR EXISTS (SELECT 1 FROM storefront_collection_products fcp JOIN storefront_collections fc ON fc.id = fcp.collection_id WHERE fcp.product_id = p.id AND fc.active AND fc.slug = ${collection}))
      AND (${likeQuery}::text IS NULL OR p.name ILIKE ${likeQuery} OR p.summary ILIKE ${likeQuery})
    ORDER BY ${order}
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: text(row.id),
    name: text(row.name),
    slug: text(row.slug),
    summary: maybe(row.summary),
    categoryName: maybe(row.category_name),
    categorySlug: maybe(row.category_slug),
    brandName: maybe(row.brand_name),
    compatibility: parseCompatibility(row.compatibility ?? null),
    newUntil: maybe(row.new_until),
    onHand: num(row.on_hand),
    incoming: num(row.incoming),
    expectedAt: maybe(row.expected_at),
    minPriceCents: num(row.min_price),
    maxPriceCents: num(row.max_price),
    image: row.image_url
      ? {
          url: text(row.image_url),
          width: num(row.image_width),
          height: num(row.image_height),
          alt: maybe(row.image_alt),
          blurDataUrl: maybe(row.image_blur),
        }
      : null,
    createdAt: text(row.created_at),
  }));
}

export type CatalogCategory = { slug: string; name: string; count: number };

/** Only categories with at least one published, active product — a filter
 *  chip that leads to a wall of nothing is worse than one fewer chip. */
export async function listCatalogCategories(): Promise<CatalogCategory[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string>>(sql`
    SELECT c.slug, c.name, COUNT(*)::text AS count
      FROM products p
      JOIN categories c ON c.id = p.category_id
     WHERE p.catalog_published AND p.status = 'active'
     GROUP BY c.slug, c.name, c.position
     ORDER BY c.position, c.name
  `);

  return rows.map((row) => ({
    slug: text(row.slug),
    name: text(row.name),
    count: num(row.count),
  }));
}

export type StorefrontCollection = { name: string; slug: string; description: string | null; imageUrl: string | null; productCount: number };
/** Intent-led collections are separate from categories and only appear once
 * they contain something a visitor can actually buy. */
export async function listHomepageCollections(): Promise<StorefrontCollection[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT sc.name, sc.slug, sc.description, sc.image_url,
           COUNT(p.id)::text AS product_count
      FROM storefront_collections sc
      JOIN storefront_collection_products cp ON cp.collection_id = sc.id
      JOIN products p ON p.id = cp.product_id AND p.catalog_published AND p.status = 'active'
     WHERE sc.active AND sc.homepage_visible
     GROUP BY sc.id
     ORDER BY sc.position, sc.name
  `);
  return rows.map((row) => ({ name: text(row.name), slug: text(row.slug), description: maybe(row.description), imageUrl: maybe(row.image_url), productCount: num(row.product_count) }));
}

export type CatalogProduct = {
  id: string;
  code: string;
  name: string;
  slug: string;
  summary: string | null;
  description: string | null;
  specs: Record<string, string>;
  seoTitle: string | null;
  seoDescription: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  brandName: string | null;
  modelNumber: string | null;
  keyFeatures: string[];
  bestFor: string[];
  compatibility: { platforms: string[]; protocols: string[]; ecosystems: string[] };
  buyerRequirements: Record<string, unknown>;
  boxContents: string[];
  nextlyTake: string | null;
  faqItems: { question: string; answer: string }[];
  restockNotificationsEnabled: boolean;
  variants: {
    id: string;
    name: string;
    listPriceCents: Cents;
    onHand: number;
  }[];
  images: (CatalogImage & { isPrimary: boolean })[];
};

export async function getCatalogProduct(slug: string): Promise<CatalogProduct | null> {
  if (!isDatabaseConfigured()) return null;

  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT
      p.id, p.code, p.name, p.slug, p.summary, p.description, p.specs::text,
      p.seo_title, p.seo_description, c.name AS category_name, c.slug AS category_slug,
      b.name AS brand_name, p.model_number, p.key_features::text, p.best_for::text,
      p.compatibility::text, p.buyer_requirements::text, p.box_contents::text, p.nextly_take,
      p.faq_items::text, p.restock_notifications_enabled::text
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id
    WHERE p.slug = ${slug} AND p.catalog_published AND p.status = 'active'
    LIMIT 1
  `);

  if (!row) return null;

  const [variants, images] = await Promise.all([
    db.execute<Record<string, string | null>>(sql`
      SELECT v.id, v.name, v.list_price_cents::text,
             COALESCE(s.on_hand, 0)::text AS on_hand
        FROM product_variants v
        LEFT JOIN v_stock_levels s ON s.variant_id = v.id
       WHERE v.product_id = ${row.id} AND v.is_active
       ORDER BY v.position
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT url, width::text, height::text, alt, blur_data_url,
             is_primary::text AS is_primary
        FROM product_images
       WHERE product_id = ${row.id}
       ORDER BY is_primary DESC, position
    `),
  ]);

  let specs: Record<string, string> = {};
  try {
    specs = JSON.parse(text(row.specs, '{}'));
  } catch {
    specs = {};
  }

  return {
    id: text(row.id),
    code: text(row.code),
    name: text(row.name),
    slug: text(row.slug),
    summary: maybe(row.summary),
    description: maybe(row.description),
    specs,
    seoTitle: maybe(row.seo_title),
    seoDescription: maybe(row.seo_description),
    categoryName: maybe(row.category_name),
    categorySlug: maybe(row.category_slug),
    brandName: maybe(row.brand_name),
    modelNumber: maybe(row.model_number),
    keyFeatures: parseStringArray(row.key_features ?? null),
    bestFor: parseStringArray(row.best_for ?? null),
    compatibility: parseCompatibility(row.compatibility ?? null),
    buyerRequirements: parseObject(row.buyer_requirements ?? null),
    boxContents: parseStringArray(row.box_contents ?? null),
    nextlyTake: maybe(row.nextly_take),
    faqItems: parseFaqItems(row.faq_items ?? null),
    restockNotificationsEnabled: bool(row.restock_notifications_enabled),
    variants: variants.map((variant) => ({
      id: text(variant.id),
      name: text(variant.name),
      listPriceCents: num(variant.list_price_cents),
      onHand: num(variant.on_hand),
    })),
    images: images.map((image) => ({
      url: text(image.url),
      width: num(image.width),
      height: num(image.height),
      alt: maybe(image.alt),
      blurDataUrl: maybe(image.blur_data_url),
      isPrimary: bool(image.is_primary),
    })),
  };
}

function parseObject(value: string | null): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
function parseStringArray(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
function parseCompatibility(value: string | null) {
  const record = parseObject(value);
  return {
    platforms: Array.isArray(record.platforms)
      ? record.platforms.filter((item): item is string => typeof item === 'string')
      : [],
    protocols: Array.isArray(record.protocols)
      ? record.protocols.filter((item): item is string => typeof item === 'string')
      : [],
    ecosystems: Array.isArray(record.ecosystems)
      ? record.ecosystems.filter((item): item is string => typeof item === 'string')
      : [],
  };
}
function parseFaqItems(value: string | null): { question: string; answer: string }[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is { question: string; answer: string } =>
          Boolean(
            item &&
              typeof item === 'object' &&
              typeof (item as { question?: unknown }).question === 'string' &&
              typeof (item as { answer?: unknown }).answer === 'string',
          ),
        )
      : [];
  } catch {
    return [];
  }
}
