import { expect, test } from 'vitest';
import type { CatalogListItem, CatalogProduct } from '@/server/queries/catalog';

/**
 * A compile-time guard for the public query contract. If an internal pricing,
 * supplier, ownership, or valuation field is ever added to one of these DTOs,
 * assigning `true` below stops typecheck before it reaches a storefront route.
 */
type PrivateCatalogField =
  | 'referenceCostCents'
  | 'referenceCost'
  | 'landedCostCents'
  | 'landedCost'
  | 'supplierCostCents'
  | 'supplierCost'
  | 'stockValueCents'
  | 'stockValue'
  | 'grossMarginCents'
  | 'grossMargin'
  | 'supplierId'
  | 'supplierName'
  | 'ownerId'
  | 'ownerName';

type HasNoPrivateFields<T> = Extract<keyof T, PrivateCatalogField> extends never ? true : false;

const listItemIsPublic: HasNoPrivateFields<CatalogListItem> = true;
const productIsPublic: HasNoPrivateFields<CatalogProduct> = true;

test('public catalog DTOs cannot expose private accounting or owner fields', () => {
  expect(listItemIsPublic).toBe(true);
  expect(productIsPublic).toBe(true);
});
