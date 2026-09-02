import { z } from 'zod';

/**
 * Parsing a list page's `searchParams` into typed, defaulted query state.
 *
 * Every field uses `.catch()` rather than `.parse()`: a hand-edited or
 * stale URL should degrade to the default view, never a 500. Next hands
 * `searchParams` in as `Record<string, string | string[] | undefined>` —
 * `single()` below collapses the rare repeated-key case to its first value
 * rather than erroring.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const page = z.coerce.number().int().min(1).catch(1);
const perPage = z.coerce.number().int().min(1).max(200).catch(50);
const search = z
  .string()
  .trim()
  .max(200)
  .catch('')
  .transform((value) => (value === '' ? undefined : value));
const dir = z.enum(['asc', 'desc']).catch('desc');

/** One shared shape, since every list needs at least these three. */
const base = { q: search, page, perPage };

export const saleQuerySchema = z.object({
  ...base,
  status: z.enum(['draft', 'confirmed', 'void']).optional().catch(undefined),
  sort: z.enum(['date', 'customer', 'revenue', 'margin']).catch('date'),
  dir,
});
export type SaleQuery = z.infer<typeof saleQuerySchema>;

export const purchaseOrderQuerySchema = z.object({
  ...base,
  status: z
    .enum(['draft', 'ordered', 'shipped', 'received', 'cancelled'])
    .optional()
    .catch(undefined),
  sort: z.enum(['ordered', 'supplier', 'total']).catch('ordered'),
  dir,
});
export type PurchaseOrderQuery = z.infer<typeof purchaseOrderQuerySchema>;

export const productQuerySchema = z.object({
  ...base,
  status: z.enum(['draft', 'active', 'archived']).optional().catch(undefined),
  catalog: z.enum(['published', 'draft']).optional().catch(undefined),
  sort: z.enum(['name', 'onHand', 'stockValue']).catch('name'),
  dir,
});
export type ProductQuery = z.infer<typeof productQuerySchema>;

export const stockQuerySchema = z.object({
  ...base,
  sort: z.enum(['name', 'onHand', 'value']).catch('name'),
  dir,
});
export type StockQuery = z.infer<typeof stockQuerySchema>;

export const customerQuerySchema = z.object({
  ...base,
  sort: z.enum(['name', 'orders', 'spent']).catch('spent'),
  dir,
});
export type CustomerQuery = z.infer<typeof customerQuerySchema>;

export const ledgerQuerySchema = z.object({
  ...base,
  category: z
    .enum([
      'owner_contribution',
      'owner_draw',
      'sales_receipt',
      'purchase',
      'shipping',
      'operating',
      'refund',
      'other',
    ])
    .optional()
    .catch(undefined),
  sort: z.enum(['date']).catch('date'),
  dir,
});
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

export const expenseQuerySchema = z.object({
  ...base,
  sort: z.enum(['date', 'amount']).catch('date'),
  dir,
});
export type ExpenseQuery = z.infer<typeof expenseQuerySchema>;

/** Quote requests (F-5) have no sortable columns yet — newest first always. */
export const quoteQuerySchema = z.object({
  ...base,
  status: z.enum(['new', 'contacted', 'converted', 'declined']).optional().catch(undefined),
});
export type QuoteQuery = z.infer<typeof quoteQuerySchema>;

export const categoryQuerySchema = z.object({
  ...base,
  sort: z.enum(['name', 'products']).catch('name'),
  dir: dir.catch('asc'),
});
export type CategoryQuery = z.infer<typeof categoryQuerySchema>;

export const supplierQuerySchema = z.object({
  ...base,
  sort: z.enum(['name', 'products', 'orders', 'spend']).catch('name'),
  dir: dir.catch('asc'),
});
export type SupplierQuery = z.infer<typeof supplierQuerySchema>;

/** Parse a schema against raw searchParams, single-valuing every key first. */
export function parseListParams<T>(
  schema: { parse: (data: unknown) => T },
  raw: RawSearchParams,
): T {
  const normalised: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) normalised[key] = single(value);
  return schema.parse(normalised);
}
