import { describe, expect, it } from 'vitest';
import { catalogReadiness } from '@/lib/catalog-readiness';

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
