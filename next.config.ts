import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Opt-in caching: everything is dynamic unless explicitly marked `'use cache'`.
  // Pairs with Partial Prerendering so the shell ships statically and each
  // dashboard widget streams in on its own.
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
