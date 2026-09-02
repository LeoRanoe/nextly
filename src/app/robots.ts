import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

/**
 * Only the storefront is meant to be found. The root layout already sends
 * `noindex` on every route `(store)` doesn't override; this just tells
 * crawlers not to bother requesting the rest at all.
 */
const PRIVATE_PATHS = [
  '/dashboard',
  '/products',
  '/customers',
  '/sales',
  '/purchase-orders',
  '/inventory',
  '/ledger',
  '/expenses',
  '/owners',
  '/reports',
  '/settings',
  '/categories',
  '/suppliers',
  '/login',
  '/setup',
  '/design-system',
  '/api',
];

export default function robots(): MetadataRoute.Robots {
  const { NEXT_PUBLIC_APP_URL } = publicEnv();

  return {
    rules: [{ userAgent: '*', allow: ['/', '/p/'], disallow: PRIVATE_PATHS }],
    sitemap: `${NEXT_PUBLIC_APP_URL}/sitemap.xml`,
  };
}
