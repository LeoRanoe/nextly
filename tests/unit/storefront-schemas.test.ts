import { describe, expect, it } from 'vitest';
import {
  bundleSchema,
  categorySchema,
  compatibilitySchema,
  productRelationshipSchema,
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
