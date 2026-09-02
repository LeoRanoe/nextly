import { pgEnum } from 'drizzle-orm/pg-core';

export const memberRole = pgEnum('member_role', ['owner', 'staff', 'viewer']);

export const currencyCode = pgEnum('currency_code', ['USD', 'SRD']);

export const paymentMethod = pgEnum('payment_method', [
  'cash',
  'bank_transfer',
  'card',
  'other',
]);

export const supplierKind = pgEnum('supplier_kind', ['amazon', 'aliexpress', 'other']);

export const productStatus = pgEnum('product_status', ['draft', 'active', 'archived']);

export const purchaseOrderStatus = pgEnum('purchase_order_status', [
  'draft',
  'ordered',
  'shipped',
  'received',
  'cancelled',
]);

/** Every reason stock moves. The set is closed on purpose: an unexplained
 *  change in inventory should be impossible to record. */
export const movementKind = pgEnum('movement_kind', [
  'receipt',
  'sale',
  'return',
  'adjustment',
  'write_off',
]);

export const saleStatus = pgEnum('sale_status', ['draft', 'confirmed', 'void']);

/** Where a storefront quote request (F-5) stands. `converted` means an owner
 *  turned it into a draft sale — the request stays as the record of where the
 *  sale came from. There is no `quoted` state on purpose: until prices leave
 *  this app (invoice, WhatsApp reply), the only real events are answering,
 *  turning down, and selling. */
export const quoteRequestStatus = pgEnum('quote_request_status', [
  'new',
  'contacted',
  'converted',
  'declined',
]);

export const ledgerDirection = pgEnum('ledger_direction', ['in', 'out']);

export const ledgerCategory = pgEnum('ledger_category', [
  'owner_contribution',
  'owner_draw',
  'sales_receipt',
  'purchase',
  'shipping',
  'operating',
  'refund',
  'other',
]);

/** What a ledger entry or stock movement points back at, so every posting can
 *  be traced to the document that caused it. */
export const documentKind = pgEnum('document_kind', [
  'purchase_order',
  'sale',
  'expense',
  'manual',
]);
