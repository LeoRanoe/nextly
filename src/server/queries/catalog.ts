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
  /** Units on hand across the product's active variants. */
  onHand: number;
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
  params: { q?: string; category?: string; sort?: CatalogSort } = {},
): Promise<CatalogListItem[]> {
  if (!isDatabaseConfigured()) return [];

  // Normalised to `null`, never `undefined`: postgres.js rejects an
  // `undefined` bind parameter outright, and `null` is what "no filter"
  // means to the `IS NULL OR ...` clauses below anyway.
  const category = params.category?.trim() || null;
  const likeQuery = params.q?.trim() ? `%${params.q.trim()}%` : null;
  const order = CATALOG_SORT_CLAUSES[params.sort ?? 'newest'];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      p.id, p.name, p.slug, p.summary, p.created_at::text AS created_at,
      c.name AS category_name, c.slug AS category_slug,
      COALESCE((
        SELECT SUM(s.on_hand)
          FROM product_variants v
          JOIN v_stock_levels s ON s.variant_id = v.id
         WHERE v.product_id = p.id AND v.is_active
      ), 0)::text AS on_hand,
      COALESCE(price.min_price, 0)::text AS min_price,
      COALESCE(price.max_price, 0)::text AS max_price,
      img.url AS image_url, img.width::text AS image_width,
      img.height::text AS image_height, img.alt AS image_alt,
      img.blur_data_url AS image_blur
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN LATERAL (
      SELECT i.url, i.width, i.height, i.alt, i.blur_data_url
        FROM product_images i
       WHERE i.product_id = p.id
       ORDER BY i.is_primary DESC, i.position
       LIMIT 1
    ) img ON true
    LEFT JOIN LATERAL (
      SELECT MIN(v.list_price_cents) AS min_price, MAX(v.list_price_cents) AS max_price
        FROM product_variants v
       WHERE v.product_id = p.id AND v.is_active
    ) price ON true
    WHERE p.catalog_published AND p.status = 'active'
      AND (${category}::text IS NULL OR c.slug = ${category})
      AND (${likeQuery}::text IS NULL OR p.name ILIKE ${likeQuery} OR p.summary ILIKE ${likeQuery})
    ORDER BY ${order}
  `);

  return rows.map((row) => ({
    id: text(row.id),
    name: text(row.name),
    slug: text(row.slug),
    summary: maybe(row.summary),
    categoryName: maybe(row.category_name),
    categorySlug: maybe(row.category_slug),
    onHand: num(row.on_hand),
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
      p.seo_title, p.seo_description, c.name AS category_name, c.slug AS category_slug
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
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
