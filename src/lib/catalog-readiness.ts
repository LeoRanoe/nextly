export type CatalogReadinessInput = {
  name?: string | null;
  slug?: string | null;
  summary?: string | null;
  brandId?: string | null;
  images: { alt?: string | null }[];
  variants: { isActive: boolean; listPriceCents: number }[];
  compatibility?: { platforms: string[]; protocols: string[]; ecosystems: string[] } | null;
  keyFeatures?: string[];
  buyerRequirements?: Record<string, unknown>;
  boxContents?: string[];
  nextlyTake?: string | null;
  seoDescription?: string | null;
};
export type CatalogReadiness = { percent: number; blockers: string[]; warnings: string[] };

/** Computed at read time so a catalog score cannot become stale after an edit. */
export function catalogReadiness(product: CatalogReadinessInput): CatalogReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!product.name?.trim()) blockers.push('Name');
  if (!product.slug?.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)) blockers.push('Valid slug');
  if (!product.variants.some((variant) => variant.isActive)) blockers.push('Active variant');
  if (!product.variants.some((variant) => variant.isActive && variant.listPriceCents > 0))
    blockers.push('Sellable variant with a price');
  if (!product.images.length) blockers.push('Product image');
  if (!product.summary?.trim()) warnings.push('Summary');
  if (!product.brandId) warnings.push('Brand');
  if (
    !(
      product.compatibility?.platforms.length ||
      product.compatibility?.protocols.length ||
      product.compatibility?.ecosystems.length
    )
  )
    warnings.push('Compatibility');
  if (!product.keyFeatures?.length) warnings.push('Key features');
  if (!Object.keys(product.buyerRequirements ?? {}).length) warnings.push('Before you buy');
  if (!product.boxContents?.length) warnings.push('What’s in the box');
  if (!product.nextlyTake?.trim()) warnings.push('Nextly’s take');
  if (product.images.some((image) => !image.alt?.trim())) warnings.push('Alt text on image');
  if (!product.seoDescription?.trim()) warnings.push('SEO description');
  const completed = 15 - blockers.length - warnings.length;
  return { percent: Math.max(0, Math.round((completed / 15) * 100)), blockers, warnings };
}
