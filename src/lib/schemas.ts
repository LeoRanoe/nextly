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
  })
  .refine((cents) => cents >= 0, 'Cannot be negative');

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
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      ctx.addIssue({ code: 'custom', message: 'Not a valid date' });
      return z.NEVER;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() + 1 !== month ||
      parsed.getUTCDate() !== day
    ) {
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
  weightGrams: z.coerce.number().int().min(0).max(10_000_000).default(0),
  isStrategic: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  barcode: optionalText,
  attributes: z
    .record(z.string().trim().min(1).max(80), z.string().trim().min(1).max(160))
    .default({}),
});

const stringList = z.array(z.string().trim().min(1).max(240)).max(30).default([]);
export const compatibilitySchema = z.object({
  platforms: stringList,
  protocols: stringList,
  ecosystems: stringList,
});
export const buyerRequirementsSchema = z.object({
  hubRequired: z.boolean().optional(),
  hubName: optionalText,
  appRequired: z.boolean().optional(),
  appName: optionalText,
  accountRequired: z.boolean().optional(),
  wifiRequired: z.boolean().optional(),
  wifiBands: stringList,
  subscription: z.enum(['none', 'optional', 'required']).optional(),
  subscriptionNotes: optionalText,
  indoorOutdoor: z.enum(['indoor', 'outdoor', 'indoor-outdoor']).optional(),
  powerSource: optionalText,
  batteryType: optionalText,
  neutralWireRequired: z.boolean().optional(),
  installationNotes: optionalText,
  regionalNotes: optionalText,
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
  brandId: optionalUuid,
  sourceUrl: z
    .union([z.string().trim().url('Not a valid URL'), z.literal('')])
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  summary: optionalText,
  description: optionalText,
  specs: z.record(z.string().trim().min(1).max(100), z.string().trim().min(1).max(500)).default({}),
  modelNumber: optionalText,
  keyFeatures: stringList,
  bestFor: stringList,
  compatibility: compatibilitySchema.default({ platforms: [], protocols: [], ecosystems: [] }),
  buyerRequirements: buyerRequirementsSchema.optional(),
  boxContents: stringList,
  nextlyTake: optionalText,
  faqItems: z
    .array(z.object({ question: shortText, answer: z.string().trim().min(1).max(2000) }))
    .max(20)
    .default([]),
  featured: z.boolean().default(false),
  featuredPosition: z.coerce.number().int().min(0).nullable().optional(),
  newUntil: z
    .union([dateInput, z.literal('')])
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  showWhenOutOfStock: z.boolean().default(true),
  restockNotificationsEnabled: z.boolean().default(false),
  status: z.enum(['draft', 'active', 'archived']),
  /** F-6: months of cover from the day of sale. 0 means no warranty; the
   *  upper bound only stops a typo becoming a century. */
  warrantyMonths: z.coerce.number().int().min(0).max(600).default(0),
  catalogPublished: z.boolean(),
  notes: optionalText,
  variants: z.array(variantSchema).min(1, 'A product needs at least one variant'),
});

export const restockRequestSchema = z.object({
  productId: uuid,
  variantId: optionalUuid,
  name: optionalText,
  contact: z.string().trim().min(3, 'Enter a WhatsApp number or email').max(200),
  channel: z.enum(['whatsapp', 'email']),
});
export const restockRequestStatusSchema = z.object({
  id: uuid,
  status: z.enum(['waiting', 'contacted', 'converted', 'cancelled']),
});
export type RestockRequestStatus = z.infer<typeof restockRequestStatusSchema>['status'];

export const productRelationshipSchema = z.object({
  productId: uuid,
  relatedProductId: uuid,
  relationshipType: z.enum(['accessory', 'works_with', 'alternative', 'cheaper_alternative', 'premium_alternative', 'required_accessory']),
  position: z.coerce.number().int().min(0).max(10_000).default(0),
}).refine((value) => value.productId !== value.relatedProductId, { message: 'A product cannot relate to itself.', path: ['relatedProductId'] });

export const storefrontCollectionSchema = z.object({ name: shortText, slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), description: optionalText, imageUrl: z.union([z.string().trim().url(), z.literal('')]).transform((value) => value || undefined).optional(), active: z.boolean().default(true), homepageVisible: z.boolean().default(false), position: z.coerce.number().int().min(0).max(10_000).default(0) });
export const storefrontCollectionProductSchema = z.object({ collectionId: uuid, productId: uuid, position: z.coerce.number().int().min(0).max(10_000).default(0) });

export const categorySchema = z.object({
  name: shortText,
  slug: z
    .string()
    .trim()
    .min(1, 'Required')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase words separated by hyphens'),
});

export const brandSchema = z.object({
  name: shortText,
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase words separated by hyphens'),
  website: z.union([z.string().trim().url('Not a valid URL'), z.literal('')]).transform((value) => value || undefined).optional(),
  description: optionalText,
  active: z.boolean().default(true),
});

export const supplierSchema = z.object({
  name: shortText,
  kind: z.enum(['amazon', 'aliexpress', 'other']),
  website: z
    .union([z.string().trim().url('Not a valid URL'), z.literal('')])
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  notes: optionalText,
  leadTimeDays: z.coerce.number().int().min(1).max(365).default(28),
});

export const bundleComponentSchema = z.object({
  variantId: uuid,
  quantity,
});

export const bundleSchema = z.object({
  sku: z.string().trim().min(1, 'Required').max(64),
  name: shortText,
  description: optionalText,
  priceCents: moneyInput,
  components: z.array(bundleComponentSchema).min(1, 'Add at least one component'),
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
  /** Record the payment as a purchase_order_payment (F-9). Usually yes; off
   *  when the payment was already recorded by hand. */
  postPayment: z.boolean().default(true),
  paymentMethod,
});

/** Money paid to a supplier against a purchase order (F-9). Mirrors
 *  salePaymentSchema: amounts are always entered by hand, so unlike receiving
 *  the whole order in one go there is no default to prefill. */
export const purchaseOrderPaymentSchema = z.object({
  orderId: uuid,
  amountCents: positiveMoney,
  /** Stable across a client retry so the same payment cannot post twice. */
  idempotencyKey: uuid.optional(),
  paidAt: z
    .union([dateInput, z.literal('')])
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  paymentMethod,
  notes: optionalText,
});

/** A supplier refund against money already paid on a purchase order. */
export const purchaseOrderRefundSchema = z.object({
  orderId: uuid,
  amountCents: positiveMoney,
  refundedAt: z
    .union([dateInput, z.literal('')])
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  paymentMethod,
  reason: z.string().trim().min(3, 'Say why the supplier refunded the money').max(500),
  idempotencyKey: uuid.optional(),
});

/* ── Sales ───────────────────────────────────────────────────────────────── */

/**
 * Serial numbers captured on a sale line (F-6).
 *
 * A serial is whatever the manufacturer printed — 8 to 30 characters would be
 * presumptuous, so only the obvious nonsense is rejected. The client sends an
 * array; blank entries are dropped here rather than rejected, because the
 * input is a newline-separated textarea and a trailing Enter is normal
 * typing, not a mistake worth an error toast. Duplicates within a line are
 * folded away for the same reason.
 */
const serialList = z
  .array(z.string().trim().min(1).max(64))
  .default([])
  .transform((serials) => [...new Set(serials)]);

export const saleItemSchema = z
  .object({
    variantId: uuid,
    bundleId: optionalUuid,
    quantity,
    unitPriceCents: positiveMoney,
    serials: serialList,
  })
  .refine((item) => item.serials.length <= item.quantity, {
    message: 'More serial numbers than units',
    path: ['serials'],
  });

/**
 * A document-level discount (F-2).
 *
 * Stored in the currency of the sale and kept separate from the line prices,
 * so a haggle does not erase what the product normally sells for. The reason
 * is optional free text — "rounded down", "bundle", "damaged box" are all
 * real and none deserve an enum someone has to maintain.
 */
export const saleSchema = z
  .object({
    customerId: optionalUuid,
    soldAt: dateInput.refine((date) => date <= new Date(), {
      message: 'A sale cannot be dated in the future',
    }),
    currency,
    paymentMethod,
    notes: optionalText,
    discountCents: moneyInput.default(0),
    discountReason: optionalText,
    /** Draft records the intent without moving stock, cash or margin. */
    confirm: z.boolean().default(true),
    /** On a confirmed sale, whether the money arrived with it (the default —
     *  today's behaviour) or is expected later. "Later" posts no receipt: the
     *  balance sits as receivable until each payment banks its own. See F-4. */
    paidInFull: z.boolean().default(true),
    /** With `paidInFull: false`, part of the total may still have been paid on
     *  the spot (a deposit). It is recorded as a payment rather than skipped —
     *  the money is in hand and the ledger must say so. Clamped to the total
     *  by the action; never trusted to be well-formed here because the total
     *  is computed from the items, not typed. */
    paidNowCents: moneyInput.default(0),
    items: z.array(saleItemSchema).min(1, 'Add at least one item'),
  })
  .refine((sale) => sale.discountCents >= 0, {
    message: 'A discount cannot be negative — raise the unit price instead',
    path: ['discountCents'],
  })
  .refine(
    (sale) =>
      sale.discountCents <=
      sale.items.reduce((total, item) => total + item.unitPriceCents * item.quantity, 0),
    {
      message: 'The discount cannot exceed the total of the items',
      path: ['discountCents'],
    },
  )
  .refine((sale) => sale.paidNowCents === 0 || !sale.paidInFull, {
    message: 'A deposit only makes sense when the rest is paid later',
    path: ['paidNowCents'],
  });

/** Money received against a confirmed sale (F-4). */
export const salePaymentSchema = z.object({
  saleId: uuid,
  amountCents: positiveMoney,
  /** Stable across a client retry so the same payment cannot post twice. */
  idempotencyKey: uuid.optional(),
  /** Optional: payments are banked on the day they arrive. An empty date input
   *  means "now", so it is folded to undefined here rather than reaching the
   *  database as a string. */
  receivedAt: z
    .union([dateInput, z.literal('')])
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  paymentMethod,
  notes: optionalText,
});

/** A cash refund against money already received on a confirmed sale. */
export const saleRefundSchema = z.object({
  saleId: uuid,
  amountCents: positiveMoney,
  paymentMethod,
  refundedAt: z
    .union([dateInput, z.literal('')])
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  reason: z.string().trim().min(3, 'Say why the money was refunded').max(500),
  idempotencyKey: uuid.optional(),
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
  quoteValidityDays: z.coerce.number().int().min(1).max(365),
  defaultPaymentDays: z.coerce.number().int().min(0).max(365),
  weeklyPurchaseBudgetCents: z
    .union([moneyInput, z.literal('')])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
  reviewHorizonDays: z.coerce.number().int().min(1).max(90),
  safetyStockDays: z.coerce.number().int().min(0).max(365),
  defaultSupplierLeadTimeDays: z.coerce.number().int().min(1).max(365),
  targetBundleMarginBp: z.coerce.number().int().min(0).max(9900),
  defaultBundleDiscountBp: z.coerce.number().int().min(0).max(9900),
  // Business identity (F-3). Optional free text — an invoice prints whatever
  // is filled in. `whatsapp` is stored as typed; the click-to-chat link strips
  // non-digits at render time so a spaced or dashed number still works.
  legalName: optionalText,
  addressLine: optionalText,
  city: optionalText,
  phone: optionalText,
  whatsapp: optionalText,
  email: optionalText,
  taxId: optionalText,
  logoUrl: optionalText,
  invoiceFooter: optionalText,
  // Storefront footer (P0-10). Free text so the business can phrase hours and
  // handle however it likes; the footer only renders what is filled in.
  instagram: optionalText,
  openingHours: optionalText,
  pickupEnabled: z.boolean().default(false), pickupLabel: optionalText, pickupDetails: optionalText,
  sameDayPickupEnabled: z.boolean().default(false), pickupCutoffTime: optionalText,
  deliveryEnabled: z.boolean().default(false), deliveryDetails: optionalText, deliveryAreas: optionalText,
  deliveryFeeDisplay: optionalText, deliveryEstimateDisplay: optionalText,
  paymentMethods: z.array(z.object({ name: shortText, details: optionalText })).max(10).default([]),
  announcement: optionalText, heroTitle: optionalText, heroBody: optionalText, supportTitle: optionalText, supportBody: optionalText,
  defaultNewArrivalDays: z.coerce.number().int().min(1).max(365).default(30),
});

export const memberSchema = z.object({
  fullName: shortText,
  email: z.string().trim().email('Not a valid email'),
  role: z.enum(['owner', 'staff', 'viewer']),
  isPrincipal: z.boolean().default(false),
});

/* ── Quote requests (F-5) ────────────────────────────────────────────────── */

export const quoteCreateSchema = z.object({
  requestId: uuid,
  variantId: uuid,
  unitPriceCents: positiveMoney,
  discountCents: moneyInput.default(0),
  notes: optionalText,
});

/** Submitted by a signed-out visitor from a product page. Deliberately
 *  strict-but-simple: name and a way to reach them required, free text capped
 *  so a bot cannot store an essay, quantity sane. Nothing here touches money —
 *  a request is a question, not an order. */
export const quoteRequestSchema = z.object({
  name: z.string().trim().min(1, 'Tell us who is asking').max(120),
  /** Phone or email, as typed. Not validated either way: the storefront asks
   *  for one field and a visitor answering with a WhatsApp number must not be
   *  rejected for it. */
  contact: z.string().trim().min(1, 'Give us a phone number or email').max(200),
  productId: optionalUuid,
  quantity: z.coerce.number().int().min(1).max(9_999).default(1),
  details: z
    .string()
    .trim()
    .max(2_000)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
});

const quoteRequestStatuses = ['new', 'contacted', 'converted', 'declined', 'archived'] as const;

export type QuoteRequestStatus = (typeof quoteRequestStatuses)[number];

/** An owner/staff moving a request along its pipeline. `converted` is set only
 *  by the convert action itself — the list offers the other three. */
export const quoteRequestStatusSchema = z.object({
  id: uuid,
  status: z.enum(['new', 'contacted', 'declined', 'archived']),
});

/** Fields an owner or staff member may correct after a visitor submits a
 * request. Conversion remains a separate action because it creates a sale. */
export const quoteRequestUpdateSchema = quoteRequestSchema.extend({ id: uuid });

/** Turning a request into a draft sale (F-5). The visitor asked about a
 *  product; an owner decides which colourway was actually quoted and at what
 *  price, and those two choices are the only things this form needs — the
 *  quantity carries over from the request because that is what was asked for. */
export const convertQuoteRequestSchema = z.object({
  id: uuid,
  variantId: uuid,
  unitPriceCents: positiveMoney,
});

export type QuoteRequestInput = z.input<typeof quoteRequestSchema>;
export type ConvertQuoteRequestInput = z.input<typeof convertQuoteRequestSchema>;

/* ── Types ───────────────────────────────────────────────────────────────── */

export type ProductInput = z.input<typeof productSchema>;
export type SaleInput = z.input<typeof saleSchema>;
export type SalePaymentInput = z.input<typeof salePaymentSchema>;
export type PurchaseOrderInput = z.input<typeof purchaseOrderSchema>;
export type PurchaseOrderPaymentInput = z.input<typeof purchaseOrderPaymentSchema>;
export type ExpenseInput = z.input<typeof expenseSchema>;
export type LedgerEntryInput = z.input<typeof ledgerEntrySchema>;
export type CustomerInput = z.input<typeof customerSchema>;
