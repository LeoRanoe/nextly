import { z } from 'zod';
import { parseRate } from './fx';
import { parseMoney } from './money';

/**
 * Validation, shared by the forms and the Server Actions that receive them.
 *
 * Money arrives from a form as a string and leaves these schemas as integer
 * cents. Doing the conversion here rather than in each action means there is
 * exactly one place a decimal becomes an integer, and no action can forget.
 */

/** A user-typed amount, coerced to minor units. Rejects nonsense loudly. */
export const moneyInput = z
  .string()
  .trim()
  .transform((value, ctx) => {
    try {
      return parseMoney(value === '' ? '0' : value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter an amount like 29.55' });
      return z.NEVER;
    }
  });

/** Money that must be greater than zero. */
export const positiveMoney = moneyInput.refine((cents) => cents > 0, {
  message: 'Must be more than zero',
});

export const rateInput = z
  .string()
  .trim()
  .transform((value, ctx) => {
    try {
      return parseRate(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter a rate like 38.5' });
      return z.NEVER;
    }
  });

/** A date from an `<input type="date">`, read as UTC midnight so the same
 *  string means the same day regardless of who is looking at it. */
export const dateInput = z
  .string()
  .trim()
  .min(1, 'Pick a date')
  .transform((value, ctx) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'Not a valid date' });
      return z.NEVER;
    }
    return parsed;
  });

export const quantity = z.coerce
  .number()
  .int('Whole units only')
  .positive('Must be at least 1');

export const uuid = z.string().uuid('Not a valid reference');
export const optionalUuid = z
  .union([uuid, z.literal(''), z.null()])
  .transform((value) => (value === '' || value === null ? null : value));

const shortText = z.string().trim().min(1, 'Required').max(200);
const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((value) => (value === '' ? undefined : value));

export const currency = z.enum(['USD', 'SRD']);
export const paymentMethod = z.enum(['cash', 'bank_transfer', 'card', 'other']);

/* ── Catalog ─────────────────────────────────────────────────────────────── */

export const variantSchema = z.object({
  id: uuid.optional(),
  name: shortText,
  sku: z.string().trim().min(1, 'Required').max(64),
  listPriceCents: moneyInput,
  referenceCostCents: moneyInput,
  isActive: z.boolean().default(true),
});

export const productSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, 'Letters, numbers and hyphens only'),
  name: shortText,
  slug: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase words separated by hyphens'),
  categoryId: optionalUuid,
  supplierId: optionalUuid,
  sourceUrl: z
    .union([z.string().trim().url('Not a valid URL'), z.literal('')])
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  summary: optionalText,
  description: optionalText,
  status: z.enum(['draft', 'active', 'archived']),
  catalogPublished: z.boolean(),
  notes: optionalText,
  variants: z.array(variantSchema).min(1, 'A product needs at least one variant'),
});

export const categorySchema = z.object({
  name: shortText,
  slug: z
    .string()
    .trim()
    .min(1, 'Required')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase words separated by hyphens'),
});

export const supplierSchema = z.object({
  name: shortText,
  kind: z.enum(['amazon', 'aliexpress', 'other']),
  website: z
    .union([z.string().trim().url('Not a valid URL'), z.literal('')])
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  notes: optionalText,
});

export const customerSchema = z.object({
  name: shortText,
  phone: optionalText,
  email: z
    .union([z.string().trim().email('Not a valid email'), z.literal('')])
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  addressLine: optionalText,
  city: optionalText,
  notes: optionalText,
});

/* ── Procurement ─────────────────────────────────────────────────────────── */

export const purchaseOrderItemSchema = z.object({
  variantId: uuid,
  quantity,
  subtotalCents: moneyInput,
});

export const purchaseOrderSchema = z.object({
  supplierId: optionalUuid,
  orderedAt: dateInput,
  expectedAt: z
    .union([dateInput, z.literal('')])
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  reference: optionalText,
  notes: optionalText,
  taxCents: moneyInput,
  cardFeeCents: moneyInput,
  deliveryCents: moneyInput,
  shippingCents: moneyInput,
  shippingTaxCents: moneyInput,
  items: z.array(purchaseOrderItemSchema).min(1, 'Add at least one item'),
});

export const receivePurchaseOrderSchema = z.object({
  id: uuid,
  receivedAt: dateInput,
  /** Post the payment to the cash ledger at the same time. Usually yes; off
   *  when the payment was already recorded by hand. */
  postPayment: z.boolean().default(true),
  paymentMethod,
});

/* ── Sales ───────────────────────────────────────────────────────────────── */

export const saleItemSchema = z.object({
  variantId: uuid,
  quantity,
  unitPriceCents: moneyInput,
});

export const saleSchema = z.object({
  customerId: optionalUuid,
  soldAt: dateInput,
  currency,
  paymentMethod,
  notes: optionalText,
  /** Draft records the intent without moving stock, cash or margin. */
  confirm: z.boolean().default(true),
  items: z.array(saleItemSchema).min(1, 'Add at least one item'),
});

/* ── Finance ─────────────────────────────────────────────────────────────── */

export const expenseSchema = z.object({
  description: shortText,
  categoryId: optionalUuid,
  occurredAt: dateInput,
  currency,
  amountCents: positiveMoney,
  paymentMethod,
  notes: optionalText,
  /** Expenses are cash leaving the business, so they post to the ledger too. */
  postToLedger: z.boolean().default(true),
});

export const ledgerEntrySchema = z
  .object({
    direction: z.enum(['in', 'out']),
    category: z.enum([
      'owner_contribution',
      'owner_draw',
      'sales_receipt',
      'purchase',
      'shipping',
      'operating',
      'refund',
      'other',
    ]),
    description: shortText,
    occurredAt: dateInput,
    currency,
    amountCents: positiveMoney,
    paymentMethod,
    memberId: optionalUuid,
    notes: optionalText,
  })
  .refine(
    (value) => !['owner_contribution', 'owner_draw'].includes(value.category) || value.memberId,
    { message: 'Choose which owner this belongs to', path: ['memberId'] },
  );

export const fxRateSchema = z.object({
  rate: rateInput,
  effectiveFrom: dateInput,
  note: optionalText,
});

export const settingsSchema = z.object({
  businessName: shortText,
  displayCurrency: currency,
  lowStockThreshold: z.coerce.number().int().min(0).max(10_000),
});

export const memberSchema = z.object({
  fullName: shortText,
  email: z.string().trim().email('Not a valid email'),
  role: z.enum(['owner', 'staff', 'viewer']),
  isPrincipal: z.boolean().default(false),
});

/* ── Types ───────────────────────────────────────────────────────────────── */

export type ProductInput = z.input<typeof productSchema>;
export type SaleInput = z.input<typeof saleSchema>;
export type PurchaseOrderInput = z.input<typeof purchaseOrderSchema>;
export type ExpenseInput = z.input<typeof expenseSchema>;
export type LedgerEntryInput = z.input<typeof ledgerEntrySchema>;
export type CustomerInput = z.input<typeof customerSchema>;
