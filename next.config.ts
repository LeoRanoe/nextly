import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Everything is dynamic unless explicitly marked `'use cache'`, and nothing
  // is: this dashboard's figures are live, every write invalidates them, and
  // caching them made `next build` reach for the database, which turned a
  // transient connection problem into a failed deploy. Kept on for the
  // Partial Prerendering it gives the public routes, and because dynamic by
  // default is the correct posture for a set of books.
  cacheComponents: true,

  // Automatic memoization. Costs build time, buys us render time on the
  // chart-heavy Overview route.
  reactCompiler: true,

  typedRoutes: true,

  experimental: {
    turbopackFileSystemCacheForDev: true,
  },

  images: {
    // Vercel Blob public store. `images.domains` is deprecated in Next 16.
    remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com' }],
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
