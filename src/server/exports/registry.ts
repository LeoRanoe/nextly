import type { CsvColumn } from '@/lib/csv';
import { isDatabaseConfigured } from '@/lib/env';
import { formatDateShort } from '@/lib/format';
import {
  categoryQuerySchema,
  customerQuerySchema,
  expenseQuerySchema,
  ledgerQuerySchema,
  productQuerySchema,
  purchaseOrderQuerySchema,
  saleQuerySchema,
  stockQuerySchema,
  supplierQuerySchema,
} from '@/lib/list-params';
import { toDecimalString } from '@/lib/money';
import { requireMember } from '../auth';
import {
  listCustomers,
  listExpenses,
  listLedger,
  listProducts,
  listPurchaseOrders,
  listSales,
  listStock,
} from '../queries/lists';
import { MAX_PER_PAGE } from '../queries/paginate';
import { listQuoteRequests } from '../queries/quotes';
import { listCategories, listSuppliers } from '../queries/reference';

/**
 * CSV export (F-7).
 *
 * One registry of entities shared by the per-list Export buttons and the
 * Settings backup. The rules every entry follows:
 *
 * - Same filters as the page — a `page`/`perPage` override pulls every row
 *   matching the current query, so an export never disagrees with the table.
 * - Money exports as decimal strings (`29.54`), never cents: opening the
 *   file in a spreadsheet should need no conversion step.
 * - Dates export `YYYY-MM-DD`, which Excel reads as a date; the app's own
 *   display format ("15 Jan") would not survive a spreadsheet import.
 */

/** Decimal money, typed as a number-shaped string so spreadsheets read it. */
const money = (cents: number, currency?: string) =>
  toDecimalString(cents, currency === 'SRD' ? 'SRD' : 'USD');

const usd = (cents: number) => toDecimalString(cents, 'USD');

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** From the same formatter the tables use (UTC-pinned), reshaped for Excel. */
function isoDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const match = /^(\d{1,2}) ([A-Za-z]{3})$/.exec(formatDateShort(value));
  if (!match) return '';
  const month = MONTHS.indexOf(match[2] ?? '') + 1;
  if (month === 0) return '';
  const year = new Date(value).getUTCFullYear();
  return `${year}-${String(month).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
}

export const EXPORT_ENTITIES = [
  'sales',
  'purchase-orders',
  'products',
  'stock',
  'customers',
  'ledger',
  'expenses',
  'quotes',
  'categories',
  'suppliers',
] as const;

export type ExportEntity = (typeof EXPORT_ENTITIES)[number];

export function isExportEntity(value: unknown): value is ExportEntity {
  return typeof value === 'string' && (EXPORT_ENTITIES as readonly string[]).includes(value);
}

export const ENTITY_LABELS: Record<ExportEntity, string> = {
  sales: 'Sales',
  'purchase-orders': 'Purchase orders',
  products: 'Products',
  stock: 'Stock levels',
  customers: 'Customers',
  ledger: 'Cash ledger',
  expenses: 'Expenses',
  quotes: 'Quote requests',
  categories: 'Categories',
  suppliers: 'Suppliers',
};

type SaleRow = Awaited<ReturnType<typeof listSales>>['rows'][number];
type PurchaseOrderRow = Awaited<ReturnType<typeof listPurchaseOrders>>['rows'][number];
type ProductRow = Awaited<ReturnType<typeof listProducts>>['rows'][number];
type StockRow = Awaited<ReturnType<typeof listStock>>['rows'][number];
type CustomerRow = Awaited<ReturnType<typeof listCustomers>>['rows'][number];
type LedgerRow = Awaited<ReturnType<typeof listLedger>>['rows'][number];
type ExpenseRow = Awaited<ReturnType<typeof listExpenses>>['rows'][number];
type QuoteRow = Awaited<ReturnType<typeof listQuoteRequests>>['rows'][number];
type CategoryRow = Awaited<ReturnType<typeof listCategories>>['rows'][number];
type SupplierRow = Awaited<ReturnType<typeof listSuppliers>>['rows'][number];

const SALE_COLUMNS: CsvColumn<SaleRow>[] = [
  { label: 'Number', value: (r) => r.number },
  { label: 'Date', value: (r) => isoDate(r.soldAt) },
  { label: 'Customer', value: (r) => r.customerName ?? '' },
  { label: 'Status', value: (r) => r.status },
  { label: 'Payment', value: (r) => r.paymentStatus ?? '' },
  { label: 'Method', value: (r) => r.paymentMethod },
  { label: 'Items', value: (r) => r.itemCount },
  { label: 'Units', value: (r) => r.unitCount },
  { label: 'Total', value: (r) => money(r.totalCents, r.currency) },
  { label: 'Paid', value: (r) => money(r.paidCents, r.currency) },
  { label: 'Revenue USD', value: (r) => usd(r.totalUsdCents) },
  { label: 'Cost USD', value: (r) => usd(r.cogsCents) },
  { label: 'Gross USD', value: (r) => usd(r.grossCents) },
];

const PURCHASE_ORDER_COLUMNS: CsvColumn<PurchaseOrderRow>[] = [
  { label: 'Number', value: (r) => r.number },
  { label: 'Supplier', value: (r) => r.supplierName ?? '' },
  { label: 'Status', value: (r) => r.status },
  { label: 'Ordered', value: (r) => isoDate(r.orderedAt) },
  { label: 'Expected', value: (r) => isoDate(r.expectedAt) },
  { label: 'Received', value: (r) => isoDate(r.receivedAt) },
  { label: 'Items', value: (r) => r.itemCount },
  { label: 'Units', value: (r) => r.unitCount },
  { label: 'Goods', value: (r) => usd(r.goodsCents) },
  { label: 'Overhead', value: (r) => usd(r.overheadCents) },
  { label: 'Total', value: (r) => usd(r.totalCents) },
  { label: 'Landed', value: (r) => usd(r.landedCents) },
  { label: 'Paid', value: (r) => usd(r.paidCents) },
  {
    label: 'Owed',
    value: (r) => usd(Math.max(r.landedCents - r.paidCents, 0)),
  },
];

const PRODUCT_COLUMNS: CsvColumn<ProductRow>[] = [
  { label: 'Code', value: (r) => r.code },
  { label: 'Name', value: (r) => r.name },
  { label: 'Category', value: (r) => r.categoryName ?? '' },
  { label: 'Supplier', value: (r) => r.supplierName ?? '' },
  { label: 'Status', value: (r) => r.status },
  { label: 'Catalog', value: (r) => (r.catalogPublished ? 'published' : 'draft') },
  { label: 'Variants', value: (r) => r.variantCount },
  { label: 'On hand', value: (r) => r.onHand },
  { label: 'Stock value', value: (r) => usd(r.stockValueCents) },
  { label: 'List price', value: (r) => usd(r.listPriceCents) },
];

const STOCK_COLUMNS: CsvColumn<StockRow>[] = [
  { label: 'SKU', value: (r) => r.sku },
  { label: 'Product', value: (r) => r.productName },
  { label: 'Variant', value: (r) => r.variantName },
  { label: 'Category', value: (r) => r.categoryName ?? '' },
  { label: 'On hand', value: (r) => r.onHand },
  { label: 'Sold', value: (r) => r.sold },
  { label: 'Inbound', value: (r) => r.inbound },
  { label: 'Value', value: (r) => usd(r.valueCents) },
  { label: 'Unit cost', value: (r) => (r.unitCostCents === null ? '' : usd(r.unitCostCents)) },
  { label: 'Last movement', value: (r) => isoDate(r.lastMovementAt) },
];

const CUSTOMER_COLUMNS: CsvColumn<CustomerRow>[] = [
  { label: 'Code', value: (r) => r.code },
  { label: 'Name', value: (r) => r.name },
  { label: 'Phone', value: (r) => r.phone ?? '' },
  { label: 'Email', value: (r) => r.email ?? '' },
  { label: 'City', value: (r) => r.city ?? '' },
  { label: 'Orders', value: (r) => r.orderCount },
  { label: 'Spent USD', value: (r) => usd(r.spentCents) },
  { label: 'Gross USD', value: (r) => usd(r.grossCents) },
  { label: 'Last order', value: (r) => isoDate(r.lastOrderAt) },
];

const LEDGER_COLUMNS: CsvColumn<LedgerRow>[] = [
  { label: 'Seq', value: (r) => r.seq },
  { label: 'Date', value: (r) => isoDate(r.occurredAt) },
  { label: 'Direction', value: (r) => r.direction },
  { label: 'Category', value: (r) => r.category },
  { label: 'Description', value: (r) => r.description },
  { label: 'Method', value: (r) => r.paymentMethod },
  { label: 'Recorded by', value: (r) => r.memberName ?? '' },
  { label: 'Amount', value: (r) => usd(r.netCents) },
  { label: 'Balance after', value: (r) => usd(r.balanceCents) },
];

const EXPENSE_COLUMNS: CsvColumn<ExpenseRow>[] = [
  { label: 'Date', value: (r) => r.occurredDate },
  { label: 'Description', value: (r) => r.description },
  { label: 'Category', value: (r) => r.categoryName ?? '' },
  { label: 'Currency', value: (r) => r.currency },
  { label: 'Amount', value: (r) => money(r.amountCents, r.currency) },
  { label: 'Amount USD', value: (r) => usd(r.amountUsdCents) },
  { label: 'Method', value: (r) => r.paymentMethod },
  { label: 'Notes', value: (r) => r.notes ?? '' },
];

const QUOTE_COLUMNS: CsvColumn<QuoteRow>[] = [
  { label: 'Requested', value: (r) => isoDate(r.createdAt) },
  { label: 'Name', value: (r) => r.name },
  { label: 'Contact', value: (r) => r.contact },
  { label: 'Product', value: (r) => r.productName ?? '' },
  { label: 'Quantity', value: (r) => r.quantity },
  { label: 'Details', value: (r) => r.details ?? '' },
  { label: 'Status', value: (r) => r.status },
  { label: 'Handled by', value: (r) => r.handledByName ?? '' },
];

const CATEGORY_COLUMNS: CsvColumn<CategoryRow>[] = [
  { label: 'Name', value: (r) => r.name },
  { label: 'Slug', value: (r) => r.slug },
  { label: 'Products', value: (r) => r.productCount },
];

const SUPPLIER_COLUMNS: CsvColumn<SupplierRow>[] = [
  { label: 'Name', value: (r) => r.name },
  { label: 'Kind', value: (r) => r.kind },
  { label: 'Website', value: (r) => r.website },
  { label: 'Products', value: (r) => r.productCount },
  { label: 'Orders', value: (r) => r.orderCount },
  { label: 'Spend', value: (r) => usd(r.spendCents) },
  { label: 'Notes', value: (r) => r.notes },
];

/** Query params arrive as strings from the URL; each entity parses them
 *  through its own list schema before the query runs, exactly like the page
 *  does — so a filter the page accepts, the export honours, and one it
 *  rejects degrades the same way in both places. */
type RawParams = Record<string, string | undefined>;

async function buildEntityCsv(entity: ExportEntity, raw: RawParams): Promise<string> {
  const { toCsv } = await import('@/lib/csv');
  // The export replaces pagination and walks every page. List queries cap a
  // page at MAX_PER_PAGE for interactive use; exporting only page one would
  // silently truncate a growing business.
  const collectRows = async <T>(
    fetchPage: (page: number) => Promise<{ rows: T[]; pageCount: number }>,
  ): Promise<T[]> => {
    const rows: T[] = [];
    let page = 1;
    while (true) {
      const result = await fetchPage(page);
      rows.push(...result.rows);
      if (page >= result.pageCount || result.rows.length === 0) return rows;
      page += 1;
    }
  };

  switch (entity) {
    case 'sales': {
      const rows = await collectRows((page) =>
        listSales(saleQuerySchema.parse({ ...raw, page, perPage: MAX_PER_PAGE })),
      );
      return toCsv(rows, SALE_COLUMNS);
    }
    case 'purchase-orders': {
      const rows = await collectRows((page) =>
        listPurchaseOrders(
          purchaseOrderQuerySchema.parse({ ...raw, page, perPage: MAX_PER_PAGE }),
        ),
      );
      return toCsv(rows, PURCHASE_ORDER_COLUMNS);
    }
    case 'products': {
      const rows = await collectRows((page) =>
        listProducts(productQuerySchema.parse({ ...raw, page, perPage: MAX_PER_PAGE })),
      );
      return toCsv(rows, PRODUCT_COLUMNS);
    }
    case 'stock': {
      const rows = await collectRows((page) =>
        listStock(stockQuerySchema.parse({ ...raw, page, perPage: MAX_PER_PAGE })),
      );
      return toCsv(rows, STOCK_COLUMNS);
    }
    case 'customers': {
      const rows = await collectRows((page) =>
        listCustomers(customerQuerySchema.parse({ ...raw, page, perPage: MAX_PER_PAGE })),
      );
      return toCsv(rows, CUSTOMER_COLUMNS);
    }
    case 'ledger': {
      const rows = await collectRows((page) =>
        listLedger(ledgerQuerySchema.parse({ ...raw, page, perPage: MAX_PER_PAGE })),
      );
      return toCsv(rows, LEDGER_COLUMNS);
    }
    case 'expenses': {
      const rows = await collectRows((page) =>
        listExpenses(expenseQuerySchema.parse({ ...raw, page, perPage: MAX_PER_PAGE })),
      );
      return toCsv(rows, EXPENSE_COLUMNS);
    }
    case 'quotes': {
      // The quotes list has no zod schema (its query is four loose fields and
      // the status filter is whitelisted inside the query itself), so walk
      // its pages directly here.
      const rows = await collectRows((page) =>
        listQuoteRequests({
          q: raw.q,
          status: raw.status,
          page,
          perPage: MAX_PER_PAGE,
        }),
      );
      return toCsv(rows, QUOTE_COLUMNS);
    }
    case 'categories': {
      const rows = await collectRows((page) =>
        listCategories(categoryQuerySchema.parse({ ...raw, page, perPage: MAX_PER_PAGE })),
      );
      return toCsv(rows, CATEGORY_COLUMNS);
    }
    case 'suppliers': {
      const rows = await collectRows((page) =>
        listSuppliers(supplierQuerySchema.parse({ ...raw, page, perPage: MAX_PER_PAGE })),
      );
      return toCsv(rows, SUPPLIER_COLUMNS);
    }
  }
}

/**
 * Build the CSV for one entity under the current filters.
 *
 * Gated on membership: these are the books. Called from the export route,
 * where `requireMember` redirects signed-out visitors instead of serving a
 * download — the gate lives at the boundary, not scattered per caller.
 */
export async function buildExport(entity: ExportEntity, raw: RawParams): Promise<string> {
  await requireMember();
  if (!isDatabaseConfigured()) {
    throw new Error('The database is not configured yet.');
  }
  return buildEntityCsv(entity, raw);
}

/** Every entity at once, concatenated with section headers — the quick
 *  "get me out of here" backup from Settings. Not a substitute for pg_dump. */
export async function buildFullBackup(): Promise<string> {
  await requireMember();
  if (!isDatabaseConfigured()) {
    throw new Error('The database is not configured yet.');
  }
  const sections: string[] = [];
  for (const entity of EXPORT_ENTITIES) {
    const csv = await buildEntityCsv(entity, {});
    // toCsv ends with a trailing CRLF, so the data lines are everything
    // between the header and that terminator: rows = lines - 2.
    const lines = csv.trimEnd().split('\r\n').length - 1; // minus the header
    sections.push(`# ${ENTITY_LABELS[entity]} (${Math.max(lines, 0)} rows)`);
    sections.push(csv.trimEnd());
    sections.push('');
  }
  return `\uFEFF${sections.join('\r\n')}\r\n`;
}
