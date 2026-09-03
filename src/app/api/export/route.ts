import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { type CsvColumn, toCsv } from '@/lib/csv';
import { isDatabaseConfigured } from '@/lib/env';
import { requireMember } from '@/server/auth';
import { db } from '@/server/db/client';

const MAX_ROWS = 100_000;

const EXPORTS = {
  products: {
    filename: 'products',
    headers: [
      'product_code',
      'product_name',
      'variant_sku',
      'variant_name',
      'category',
      'supplier',
      'supplier_kind',
      'source_url',
      'status',
      'catalog_published',
      'list_price_cents',
      'reference_cost_cents',
      'weight_grams',
      'strategic_stock',
      'variant_active',
    ],
  },
  inventory: {
    filename: 'inventory',
    headers: [
      'sku',
      'product',
      'variant',
      'category',
      'on_hand',
      'received',
      'sold',
      'inbound',
      'value_cents',
      'unit_cost_cents',
      'weight_grams',
      'last_movement_at',
    ],
  },
  sales: {
    filename: 'sales',
    headers: [
      'number',
      'sold_at',
      'status',
      'customer',
      'currency',
      'total_cents',
      'total_usd_cents',
      'cogs_cents',
      'gross_profit_cents',
      'payment_method',
      'paid_cents',
      'item_count',
      'unit_count',
      'shortfall_units',
    ],
  },
  'purchase-orders': {
    filename: 'purchase-orders',
    headers: [
      'number',
      'supplier',
      'supplier_kind',
      'status',
      'ordered_at',
      'expected_at',
      'received_at',
      'goods_cents',
      'overhead_cents',
      'total_cents',
      'landed_cents',
      'paid_cents',
      'item_count',
      'unit_count',
      'reference',
    ],
  },
  customers: {
    filename: 'customers',
    headers: [
      'code',
      'name',
      'phone',
      'email',
      'address',
      'city',
      'country',
      'order_count',
      'spent_cents',
      'gross_profit_cents',
      'last_order_at',
    ],
  },
  expenses: {
    filename: 'expenses',
    headers: [
      'occurred_at',
      'description',
      'category',
      'currency',
      'amount_cents',
      'amount_usd_cents',
      'payment_method',
      'notes',
      'ledger_posted',
    ],
  },
  ledger: {
    filename: 'ledger',
    headers: [
      'sequence',
      'occurred_at',
      'direction',
      'category',
      'description',
      'currency',
      'amount_cents',
      'amount_usd_cents',
      'payment_method',
      'source_kind',
      'source_id',
      'member',
    ],
  },
  quotes: {
    filename: 'quotes',
    headers: [
      'number',
      'version',
      'status',
      'customer',
      'customer_contact',
      'currency',
      'subtotal_cents',
      'discount_cents',
      'total_cents',
      'valid_until',
      'sent_at',
      'accepted_at',
      'converted_sale_id',
    ],
  },
  'quote-requests': {
    filename: 'quote-requests',
    headers: [
      'created_at',
      'name',
      'contact',
      'product',
      'quantity',
      'details',
      'status',
      'sale_id',
    ],
  },
  reorder: {
    filename: 'reorder-recommendations',
    headers: [
      'run_date',
      'sku',
      'product',
      'variant',
      'supplier',
      'supplier_kind',
      'units_sold_90d',
      'daily_demand',
      'on_hand',
      'inbound',
      'days_of_cover',
      'recommended_qty',
      'budget_qty',
      'deferred_qty',
      'landed_unit_cost_cents',
      'weight_grams',
      'score',
      'low_confidence',
      'strategic_stock',
      'supporting_for',
      'reasons',
    ],
  },
  bundles: {
    filename: 'bundles',
    headers: [
      'bundle_sku',
      'bundle_name',
      'active',
      'price_cents',
      'description',
      'component_sku',
      'component_product',
      'component_variant',
      'component_quantity',
      'component_weight_grams',
    ],
  },
  suppliers: {
    filename: 'suppliers',
    headers: [
      'name',
      'kind',
      'website',
      'lead_time_days',
      'product_count',
      'order_count',
      'spend_cents',
      'notes',
    ],
  },
  categories: {
    filename: 'categories',
    headers: ['name', 'slug', 'description', 'product_count', 'position'],
  },
} as const;

type ExportEntity = keyof typeof EXPORTS;

function isExportEntity(value: string | null): value is ExportEntity {
  return value !== null && value in EXPORTS;
}

function asRows(
  rows: readonly Record<string, unknown>[],
  keys: readonly string[],
): unknown[][] {
  return rows.map((row) => keys.map((key) => row[key] ?? ''));
}

async function exportRows(entity: ExportEntity, term: string | null): Promise<unknown[][]> {
  const like = term ? `%${term}%` : null;

  switch (entity) {
    case 'products': {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT p.code AS product_code, p.name AS product_name, v.sku AS variant_sku,
               v.name AS variant_name, c.name AS category, s.name AS supplier,
               s.kind::text AS supplier_kind, p.source_url, p.status::text AS status,
               p.catalog_published, v.list_price_cents, v.reference_cost_cents,
               v.weight_grams, v.is_strategic AS strategic_stock, v.is_active AS variant_active
          FROM products p
          JOIN product_variants v ON v.product_id = p.id
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE (${like}::text IS NULL OR p.name ILIKE ${like} OR p.code ILIKE ${like} OR v.sku ILIKE ${like})
         ORDER BY p.name, v.position, v.sku
         LIMIT ${MAX_ROWS}
      `);
      return asRows(rows, [
        'product_code',
        'product_name',
        'variant_sku',
        'variant_name',
        'category',
        'supplier',
        'supplier_kind',
        'source_url',
        'status',
        'catalog_published',
        'list_price_cents',
        'reference_cost_cents',
        'weight_grams',
        'strategic_stock',
        'variant_active',
      ]);
    }
    case 'inventory': {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT s.sku, s.product_name AS product, s.variant_name AS variant,
               c.name AS category, s.on_hand, s.total_received AS received,
               s.total_sold AS sold,
               COALESCE((SELECT SUM(i.quantity - i.quantity_received)
                           FROM purchase_order_items i
                           JOIN purchase_orders p ON p.id = i.purchase_order_id
                          WHERE i.variant_id = s.variant_id AND p.status IN ('ordered', 'shipped')), 0) AS inbound,
               s.value_cents,
               CASE WHEN s.on_hand > 0 THEN s.value_cents::numeric / s.on_hand ELSE NULL END AS unit_cost_cents,
               v.weight_grams, s.last_movement_at
          FROM v_stock_levels s
          JOIN product_variants v ON v.id = s.variant_id
          JOIN products p ON p.id = s.product_id
          LEFT JOIN categories c ON c.id = p.category_id
         WHERE (${like}::text IS NULL OR s.sku ILIKE ${like} OR s.product_name ILIKE ${like} OR s.variant_name ILIKE ${like})
         ORDER BY s.product_name, s.variant_name
         LIMIT ${MAX_ROWS}
      `);
      return asRows(rows, [
        'sku',
        'product',
        'variant',
        'category',
        'on_hand',
        'received',
        'sold',
        'inbound',
        'value_cents',
        'unit_cost_cents',
        'weight_grams',
        'last_movement_at',
      ]);
    }
    case 'sales': {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT s.number, s.sold_at, s.status::text AS status, c.name AS customer,
               s.currency::text AS currency, s.total_cents, s.total_usd_cents,
               s.cogs_cents, s.gross_profit_cents, s.payment_method::text AS payment_method,
               COALESCE((SELECT SUM(p.amount_cents) FROM sale_payments p WHERE p.sale_id = s.id), 0)
               + COALESCE((SELECT SUM(CASE WHEN l.direction = 'in' THEN l.amount_cents ELSE -l.amount_cents END)
                             FROM ledger_entries l WHERE l.source_kind = 'sale' AND l.source_id = s.id AND l.category = 'sales_receipt'), 0) AS paid_cents,
               (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id = s.id) AS item_count,
               COALESCE((SELECT SUM(i.quantity) FROM sale_items i WHERE i.sale_id = s.id), 0) AS unit_count,
               COALESCE((SELECT SUM(i.shortfall) FROM sale_items i WHERE i.sale_id = s.id), 0) AS shortfall_units
          FROM sales s
          LEFT JOIN customers c ON c.id = s.customer_id
         WHERE (${like}::text IS NULL OR s.number ILIKE ${like} OR c.name ILIKE ${like})
         ORDER BY s.sold_at DESC, s.number DESC
         LIMIT ${MAX_ROWS}
      `);
      return asRows(rows, [
        'number',
        'sold_at',
        'status',
        'customer',
        'currency',
        'total_cents',
        'total_usd_cents',
        'cogs_cents',
        'gross_profit_cents',
        'payment_method',
        'paid_cents',
        'item_count',
        'unit_count',
        'shortfall_units',
      ]);
    }
    case 'purchase-orders': {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT p.number, s.name AS supplier, s.kind::text AS supplier_kind, p.status::text AS status,
               p.ordered_at, p.expected_at, p.received_at,
               COALESCE((SELECT SUM(i.subtotal_cents) FROM purchase_order_items i WHERE i.purchase_order_id = p.id), 0) AS goods_cents,
               p.tax_cents + p.card_fee_cents + p.delivery_cents + p.shipping_cents + p.shipping_tax_cents AS overhead_cents,
               COALESCE((SELECT SUM(i.subtotal_cents) FROM purchase_order_items i WHERE i.purchase_order_id = p.id), 0)
                 + p.tax_cents + p.card_fee_cents + p.delivery_cents + p.shipping_cents + p.shipping_tax_cents AS total_cents,
               COALESCE((SELECT SUM(i.landed_cost_cents) FROM purchase_order_items i WHERE i.purchase_order_id = p.id), 0) AS landed_cents,
               COALESCE((SELECT SUM(pp.amount_cents) FROM purchase_order_payments pp WHERE pp.purchase_order_id = p.id), 0) AS paid_cents,
               (SELECT COUNT(*) FROM purchase_order_items i WHERE i.purchase_order_id = p.id) AS item_count,
               COALESCE((SELECT SUM(i.quantity) FROM purchase_order_items i WHERE i.purchase_order_id = p.id), 0) AS unit_count,
               p.reference
          FROM purchase_orders p
          LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE (${like}::text IS NULL OR p.number ILIKE ${like} OR s.name ILIKE ${like})
         ORDER BY COALESCE(p.ordered_at, p.created_at) DESC, p.number DESC
         LIMIT ${MAX_ROWS}
      `);
      return asRows(rows, [
        'number',
        'supplier',
        'supplier_kind',
        'status',
        'ordered_at',
        'expected_at',
        'received_at',
        'goods_cents',
        'overhead_cents',
        'total_cents',
        'landed_cents',
        'paid_cents',
        'item_count',
        'unit_count',
        'reference',
      ]);
    }
    case 'customers': {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT c.code, c.name, c.phone, c.email,
               c.address_line AS address, c.city, c.country,
               COALESCE(t.order_count, 0) AS order_count, COALESCE(t.spent_usd_cents, 0) AS spent_cents,
               COALESCE(t.gross_profit_cents, 0) AS gross_profit_cents, t.last_order_at
          FROM customers c
          LEFT JOIN v_customer_totals t ON t.customer_id = c.id
         WHERE (${like}::text IS NULL OR c.code ILIKE ${like} OR c.name ILIKE ${like} OR c.email ILIKE ${like} OR c.phone ILIKE ${like})
         ORDER BY c.name
         LIMIT ${MAX_ROWS}
      `);
      return asRows(rows, [
        'code',
        'name',
        'phone',
        'email',
        'address',
        'city',
        'country',
        'order_count',
        'spent_cents',
        'gross_profit_cents',
        'last_order_at',
      ]);
    }
    case 'expenses': {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT e.occurred_at, e.description, c.name AS category, e.currency::text AS currency,
               e.amount_cents, e.amount_usd_cents, e.payment_method::text AS payment_method,
               e.notes, EXISTS(SELECT 1 FROM ledger_entries l WHERE l.source_kind = 'expense' AND l.source_id = e.id) AS ledger_posted
          FROM expenses e
          LEFT JOIN expense_categories c ON c.id = e.category_id
         WHERE (${like}::text IS NULL OR e.description ILIKE ${like} OR c.name ILIKE ${like})
         ORDER BY e.occurred_at DESC
         LIMIT ${MAX_ROWS}
      `);
      return asRows(rows, [
        'occurred_at',
        'description',
        'category',
        'currency',
        'amount_cents',
        'amount_usd_cents',
        'payment_method',
        'notes',
        'ledger_posted',
      ]);
    }
    case 'ledger': {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT l.seq AS sequence, l.occurred_at, l.direction::text AS direction, l.category::text AS category,
               l.description, l.currency::text AS currency, l.amount_cents, l.amount_usd_cents,
               l.payment_method::text AS payment_method, l.source_kind::text AS source_kind,
               l.source_id, m.full_name AS member
          FROM ledger_entries l
          LEFT JOIN members m ON m.id = l.member_id
         WHERE (${like}::text IS NULL OR l.description ILIKE ${like} OR m.full_name ILIKE ${like})
         ORDER BY l.occurred_at DESC, l.seq DESC
         LIMIT ${MAX_ROWS}
      `);
      return asRows(rows, [
        'sequence',
        'occurred_at',
        'direction',
        'category',
        'description',
        'currency',
        'amount_cents',
        'amount_usd_cents',
        'payment_method',
        'source_kind',
        'source_id',
        'member',
      ]);
    }
    case 'quotes': {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT q.number, q.version, q.status::text AS status, COALESCE(q.customer_name, c.name) AS customer,
               q.customer_contact, q.currency::text AS currency, q.subtotal_cents, q.discount_cents, q.total_cents,
               q.valid_until, q.sent_at, q.accepted_at, q.converted_sale_id
          FROM quotes q
          LEFT JOIN customers c ON c.id = q.customer_id
         WHERE (${like}::text IS NULL OR q.number ILIKE ${like} OR q.customer_name ILIKE ${like} OR c.name ILIKE ${like})
         ORDER BY q.created_at DESC, q.number DESC, q.version DESC
         LIMIT ${MAX_ROWS}
      `);
      return asRows(rows, [
        'number',
        'version',
        'status',
        'customer',
        'customer_contact',
        'currency',
        'subtotal_cents',
        'discount_cents',
        'total_cents',
        'valid_until',
        'sent_at',
        'accepted_at',
        'converted_sale_id',
      ]);
    }
    case 'quote-requests': {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT r.created_at, r.name, r.contact, p.name AS product, r.quantity, r.details,
               r.status::text AS status, r.sale_id
          FROM quote_requests r
          LEFT JOIN products p ON p.id = r.product_id
         WHERE (${like}::text IS NULL OR r.name ILIKE ${like} OR r.contact ILIKE ${like} OR p.name ILIKE ${like})
         ORDER BY r.created_at DESC
         LIMIT ${MAX_ROWS}
      `);
      return asRows(rows, [
        'created_at',
        'name',
        'contact',
        'product',
        'quantity',
        'details',
        'status',
        'sale_id',
      ]);
    }
    case 'reorder': {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT rr.run_date, v.sku, p.name AS product, v.name AS variant, s.name AS supplier,
               s.kind::text AS supplier_kind, r.units_sold_90d, r.daily_demand, r.on_hand, r.inbound,
               r.days_of_cover, r.recommended_qty, r.budget_qty, r.deferred_qty, r.landed_unit_cost_cents,
               r.weight_grams, r.score, r.low_confidence, r.strategic_stock, r.supporting_for,
               array_to_string(r.reasons, ' | ') AS reasons
          FROM reorder_recommendations r
          JOIN reorder_runs rr ON rr.id = r.run_id
          JOIN product_variants v ON v.id = r.variant_id
          JOIN products p ON p.id = v.product_id
          LEFT JOIN suppliers s ON s.id = r.supplier_id
         WHERE rr.id = (SELECT id FROM reorder_runs ORDER BY run_date DESC LIMIT 1)
           AND (${like}::text IS NULL OR p.name ILIKE ${like} OR v.name ILIKE ${like} OR v.sku ILIKE ${like} OR s.name ILIKE ${like})
         ORDER BY r.score DESC, p.name, v.name
         LIMIT ${MAX_ROWS}
      `);
      return asRows(rows, [
        'run_date',
        'sku',
        'product',
        'variant',
        'supplier',
        'supplier_kind',
        'units_sold_90d',
        'daily_demand',
        'on_hand',
        'inbound',
        'days_of_cover',
        'recommended_qty',
        'budget_qty',
        'deferred_qty',
        'landed_unit_cost_cents',
        'weight_grams',
        'score',
        'low_confidence',
        'strategic_stock',
        'supporting_for',
        'reasons',
      ]);
    }
    case 'bundles': {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT b.sku AS bundle_sku, b.name AS bundle_name, b.is_active AS active, b.price_cents,
               b.description, bc.sku AS component_sku, bc.product_name AS component_product,
               bc.variant_name AS component_variant, bc.quantity AS component_quantity, bc.weight_grams AS component_weight_grams
          FROM bundles b
          LEFT JOIN bundle_components bc ON bc.bundle_id = b.id
         WHERE (${like}::text IS NULL OR b.sku ILIKE ${like} OR b.name ILIKE ${like} OR bc.sku ILIKE ${like} OR bc.product_name ILIKE ${like})
         ORDER BY b.name, bc.position
         LIMIT ${MAX_ROWS}
      `);
      return asRows(rows, [
        'bundle_sku',
        'bundle_name',
        'active',
        'price_cents',
        'description',
        'component_sku',
        'component_product',
        'component_variant',
        'component_quantity',
        'component_weight_grams',
      ]);
    }
    case 'suppliers': {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT s.name, s.kind::text AS kind, s.website, s.lead_time_days,
               (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id) AS product_count,
               (SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id) AS order_count,
               (SELECT COALESCE(SUM(i.subtotal_cents), 0)
                  FROM purchase_order_items i
                  JOIN purchase_orders po ON po.id = i.purchase_order_id
                 WHERE po.supplier_id = s.id) AS spend_cents,
               s.notes
          FROM suppliers s
         WHERE (${like}::text IS NULL OR s.name ILIKE ${like} OR s.website ILIKE ${like})
         ORDER BY s.name
         LIMIT ${MAX_ROWS}
      `);
      return asRows(rows, [
        'name',
        'kind',
        'website',
        'lead_time_days',
        'product_count',
        'order_count',
        'spend_cents',
        'notes',
      ]);
    }
    case 'categories': {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT c.name, c.slug, c.description,
               (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count,
               c.position
          FROM categories c
         WHERE (${like}::text IS NULL OR c.name ILIKE ${like} OR c.slug ILIKE ${like})
         ORDER BY c.position, c.name
         LIMIT ${MAX_ROWS}
      `);
      return asRows(rows, ['name', 'slug', 'description', 'product_count', 'position']);
    }
  }
}

/**
 * CSV downloads (F-7).
 *
 * A plain GET rather than a server action returning a string: the browser's
 * native download handling (progress, filename, no RSC payload carrying a
 * megabyte of text through the React tree) only exists for real URLs. The
 * links are server-rendered anchors in each list's toolbar, so the current
 * search terms ride along in the query string and no client JS is involved.
 *
 * Auth lives in `requireMember`, which redirects (/login or /no-access) — legal
 * here because this is a route handler, not an action.
 *
 * Exports are read-only, member-only snapshots. They intentionally exclude
 * secrets, public token hashes and private cost details that are not needed
 * for an operational spreadsheet.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  }

  await requireMember();

  const url = new URL(request.url);
  const value = url.searchParams.get('entity');
  if (!isExportEntity(value)) {
    return NextResponse.json(
      { error: `Choose one of: ${Object.keys(EXPORTS).join(', ')}.` },
      { status: 400 },
    );
  }

  const term = url.searchParams.get('q')?.trim().slice(0, 200) || null;

  try {
    const rows = await exportRows(value, term);
    const definition = EXPORTS[value];
    const columns: CsvColumn<unknown[]>[] = definition.headers.map((label, index) => ({
      label,
      value: (row) => {
        const value = row[index];
        if (value === null || value === undefined) return undefined;
        return value instanceof Date ? value.toISOString() : String(value);
      },
    }));
    const body = toCsv(rows, columns);
    const filename = `nextly-${definition.filename}-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Export-Row-Count': String(rows.length),
      },
    });
  } catch (error) {
    console.error(`[export] ${value}`, error);
    return NextResponse.json({ error: 'The export could not be generated.' }, { status: 500 });
  }
}
