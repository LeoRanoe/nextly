/**
 * Cache tags.
 *
 * Every cached read model declares the tags it depends on; every Server Action
 * calls `updateTag` for the tags it invalidates. Naming them in one place is
 * what stops the two halves drifting apart, which is how a dashboard ends up
 * quietly showing last week's stock level.
 *
 * `updateTag` rather than `revalidateTag`: it gives read-your-writes inside the
 * same request, so a member who receives a purchase order sees the new stock
 * immediately instead of after a background revalidation.
 */
export const TAGS = {
  products: 'products',
  inventory: 'inventory',
  purchaseOrders: 'purchase-orders',
  sales: 'sales',
  customers: 'customers',
  expenses: 'expenses',
  ledger: 'ledger',
  members: 'members',
  settings: 'settings',
  fxRates: 'fx-rates',
} as const;

export type Tag = (typeof TAGS)[keyof typeof TAGS];

/** Everything the Overview reads. A write to any of these moves a number on
 *  the dashboard, so they invalidate together. */
export const OVERVIEW_TAGS: Tag[] = [
  TAGS.inventory,
  TAGS.sales,
  TAGS.purchaseOrders,
  TAGS.ledger,
  TAGS.expenses,
  TAGS.products,
  TAGS.fxRates,
];
