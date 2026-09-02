import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { publicEnv } from '@/lib/env';
import { listCatalogProducts } from '@/server/queries/catalog';

/**
 * `export const dynamic = 'force-dynamic'` is rejected outright under
 * `cacheComponents` (see next.config.ts) — but unlike a page, this file has
 * no Suspense boundary for the framework to defer behind, so without
 * something forcing the issue it would run at `next build` and reach the
 * database. `connection()` is that something: the same dynamic-data-access
 * marker used on the list pages (`lib/list-params.ts`'s callers).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const { NEXT_PUBLIC_APP_URL } = publicEnv();
  const products = await listCatalogProducts();

  return [
    { url: NEXT_PUBLIC_APP_URL, changeFrequency: 'daily', priority: 1 },
    ...products.map((product) => ({
      url: `${NEXT_PUBLIC_APP_URL}/p/${product.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
