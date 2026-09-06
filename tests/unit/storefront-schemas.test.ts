import { describe, expect, it } from 'vitest';
import {
  bundleSchema,
  categorySchema,
  compatibilitySchema,
  productRelationshipSchema,
  productSchema,
  restockRequestSchema,
} from '@/lib/schemas';

describe('storefront schemas', () => {
  it('keeps compatibility groups distinct and extensible', () => {
    const value = compatibilitySchema.parse({
      platforms: ['Amazon Alexa'],
      protocols: ['Matter'],
      ecosystems: ['Home Assistant'],
    });
    expect(value).toEqual({
      platforms: ['Amazon Alexa'],
      protocols: ['Matter'],
      ecosystems: ['Home Assistant'],
    });
  });
  it('accepts complete before-you-buy requirements without flattening their meaning', () => {
    const value = compatibilitySchema.parse({ platforms: [], protocols: [], ecosystems: [] });
    expect(value.protocols).toEqual([]);
    const product = productSchema.parse({
      code: 'CAM-TEST',
      name: 'Camera',
      slug: 'camera',
      categoryId: null,
      supplierId: null,
      brandId: null,
      sourceUrl: '',
      summary: '',
      description: '',
      specs: {},
      modelNumber: '',
      keyFeatures: [],
      bestFor: [],
      compatibility: value,
      buyerRequirements: {
        accountRequired: true,
        subscription: 'optional',
        subscriptionNotes: 'Cloud history is optional',
        batteryType: 'Rechargeable',
        neutralWireRequired: true,
        regionalNotes: 'Use the local power adapter.',
      },
      boxContents: [],
      nextlyTake: '',
      faqItems: [],
      featured: false,
      showWhenOutOfStock: true,
      restockNotificationsEnabled: false,
      status: 'draft',
      warrantyMonths: 0,
      catalogPublished: false,
      notes: '',
      variants: [
        {
          name: 'Standard',
          sku: 'CAM-TEST-STD',
          listPriceCents: '100',
          referenceCostCents: '0',
          isActive: true,
          isDefault: true,
        },
      ],
    });
    expect(product.buyerRequirements?.subscription).toBe('optional');
    expect(product.buyerRequirements?.neutralWireRequired).toBe(true);
  });
  it('rejects malformed restock interest before it reaches the database', () => {
    expect(() =>
      restockRequestSchema.parse({
        productId: 'not-a-uuid',
        variantId: null,
        contact: '',
        channel: 'email',
      }),
    ).toThrow();
  });
  it('rejects a product relationship pointing back to itself', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(() =>
      productRelationshipSchema.parse({
        productId: id,
        relatedProductId: id,
        relationshipType: 'works_with',
      }),
    ).toThrow();
  });
  it('accepts optional storefront category controls without requiring public copy', () => {
    const value = categorySchema.parse({
      name: 'Cameras',
      slug: 'cameras',
      storefrontDescription: '',
      imageUrl: '',
      position: '4',
      showInStorefrontNav: false,
      featured: true,
    });
    expect(value).toMatchObject({ position: 4, showInStorefrontNav: false, featured: true });
    expect(value.storefrontDescription).toBeUndefined();
  });
  it('requires a slug before publishing a bundle publicly', () => {
    const base = {
      sku: 'BND-CAM',
      name: 'Camera bundle',
      priceCents: '100',
      components: [{ variantId: '00000000-0000-4000-8000-000000000001', quantity: '1' }],
    };
    expect(bundleSchema.safeParse({ ...base, catalogPublished: true }).success).toBe(false);
    expect(
      bundleSchema.safeParse({ ...base, slug: 'camera-bundle', catalogPublished: true })
        .success,
    ).toBe(true);
  });
});
