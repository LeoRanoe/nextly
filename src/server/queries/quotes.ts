import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import type { QuoteRequestStatus } from '@/lib/schemas';
import { db } from '../db/client';
import { clampPage, clampPerPage, type Page, toPage } from './paginate';
import { maybe, num, text } from './row';

/**
 * Quote requests (F-5) — both halves.
 *
 * The public half feeds the storefront's request form: like every other query
 * behind `(store)`, it filters to published and active itself and selects no
 * cost figure. The private half is the admin list: paginated like every other
 * ledger list, newest first, with a status filter so "what still needs an
 * answer" is one click rather than a scan.
 */

const STATUSES = ['new', 'contacted', 'converted', 'declined'] as const;

export function isQuoteRequestStatus(value: unknown): value is QuoteRequestStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

/** The status filter's parameter arrives from an untrusted URL; anything else
 *  is treated as "no filter" rather than reaching the enum cast in SQL. */
function statusParam(value: string | undefined): QuoteRequestStatus | undefined {
  return isQuoteRequestStatus(value) ? value : undefined;
}

export type QuoteProductOption = { id: string; name: string };

/** Published products for the storefront form's optional item picker. */
export async function listQuoteProductOptions(): Promise<QuoteProductOption[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT p.id::text AS id, p.name
      FROM products p
     WHERE p.catalog_published AND p.status = 'active'
     ORDER BY p.name
  `);

  return rows.map((row) => ({ id: text(row.id), name: text(row.name) }));
}

export type QuoteVariantOption = {
  id: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  listPriceCents: number;
};

/** Variants an owner can attach a converted quote to. Unlike the public
 *  picker this includes non-published products — a request may be answered
 *  with something not on the storefront — but excludes archived products and
 *  inactive variants, which cannot be sold. */
export async function listQuoteVariantOptions(): Promise<QuoteVariantOption[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT v.id::text AS id,
           p.id::text AS product_id,
           p.name AS product_name,
           v.name AS variant_name,
           v.sku,
           v.list_price_cents::text
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
     WHERE p.status <> 'archived' AND v.is_active
     ORDER BY p.name, v.position
  `);

  return rows.map((row) => ({
    id: text(row.id),
    productId: text(row.product_id),
    productName: text(row.product_name),
    variantName: text(row.variant_name),
    sku: text(row.sku),
    listPriceCents: num(row.list_price_cents),
  }));
}

export type QuoteRequestRow = {
  id: string;
  name: string;
  contact: string;
  quantity: number;
  details: string | null;
  status: QuoteRequestStatus;
  productName: string | null;
  productSlug: string | null;
  /** Set once converted — the draft sale this became. */
  saleId: string | null;
  handledByName: string | null;
  /** ISO string, the driver's rendering of the timestamptz. */
  createdAt: string;
};

export type QuoteRequestsQuery = {
  q?: string;
  status?: string;
  page?: number;
  perPage?: number;
};

export async function listQuoteRequests(
  query: QuoteRequestsQuery = {},
): Promise<Page<QuoteRequestRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);
  const status = statusParam(query.status);

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (query.q) {
    params.push(`%${query.q}%`);
    const term = params.length;
    conditions.push(
      `(r.name ILIKE $${term} OR r.contact ILIKE $${term} OR r.details ILIKE $${term})`,
    );
  }
  if (status) {
    params.push(status);
    conditions.push(`r.status = $${params.length}::quote_request_status`);
  }

  const where = conditions.length > 0 ? sql.raw(`WHERE ${conditions.join(' AND ')}`) : sql``;

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT r.id::text AS id,
           r.name,
           r.contact,
           r.quantity::text,
           r.details,
           r.status::text AS status,
           r.created_at::text,
           p.name AS product_name,
           p.slug AS product_slug,
           r.sale_id::text AS sale_id,
           m.full_name AS handled_by_name,
           COUNT(*) OVER()::text AS total_count
      FROM quote_requests r
      LEFT JOIN products p ON p.id = r.product_id
      LEFT JOIN members m ON m.id = r.handled_by_id
      ${where}
     ORDER BY r.created_at DESC
     LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => ({
      id: text(row.id),
      name: text(row.name),
      contact: text(row.contact),
      quantity: num(row.quantity, 1),
      details: maybe(row.details),
      status: isQuoteRequestStatus(row.status) ? row.status : 'new',
      productName: maybe(row.product_name),
      productSlug: maybe(row.product_slug),
      saleId: maybe(row.sale_id),
      handledByName: maybe(row.handled_by_name),
      createdAt: text(row.created_at),
    })),
    total,
    page,
    perPage,
  );
}
