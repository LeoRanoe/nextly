import { describe, expect, it } from 'vitest';
import { catalogReadiness } from '@/lib/catalog-readiness';
import { productSchema } from '@/lib/schemas';

describe('catalogReadiness', () => {
  it('blocks publication-critical omissions and warns about enrichment', () => {
    const result = catalogReadiness({ name: 'Camera', slug: 'camera', images: [{ alt: null }], variants: [{ isActive: true, listPriceCents: 1000 }] });
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toContain('Alt text on image');
    expect(result.warnings).toContain('Compatibility');
  });
  it('does not treat inactive or zero-priced variants as sellable', () => {
    const result = catalogReadiness({ name: '', slug: 'Wrong slug', images: [], variants: [{ isActive: false, listPriceCents: 500 }, { isActive: true, listPriceCents: 0 }] });
    expect(result.blockers).toEqual(expect.arrayContaining(['Name', 'Valid slug', 'Product image', 'Sellable variant with a price']));
  });
});

describe('default variant validation', () => {
  const product = { code: 'NX-TEST', name: 'Test', slug: 'test', categoryId: null, supplierId: null, brandId: null, sourceUrl: '', summary: '', description: '', specs: {}, modelNumber: '', keyFeatures: [], bestFor: [], compatibility: { platforms: [], protocols: [], ecosystems: [] }, buyerRequirements: {}, boxContents: [], nextlyTake: '', faqItems: [], featured: false, showWhenOutOfStock: true, restockNotificationsEnabled: false, status: 'draft' as const, warrantyMonths: 0, catalogPublished: false, notes: '', variants: [{ name: 'One', sku: 'ONE', listPriceCents: 100, referenceCostCents: 0, isActive: true, isDefault: true }, { name: 'Two', sku: 'TWO', listPriceCents: 100, referenceCostCents: 0, isActive: true, isDefault: true }] };
  it('rejects multiple default variants', () => expect(productSchema.safeParse(product).success).toBe(false));
});
