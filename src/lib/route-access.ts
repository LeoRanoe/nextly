/**
 * Request classification shared by the Next.js proxy and route-contract tests.
 *
 * Matching is segment-aware: `/login` is public, while `/login-help` is not.
 * Keeping this logic pure also makes it possible to verify access policy without
 * constructing a NextRequest or booting the application.
 */

const PUBLIC_EXACT_PATHS = new Set([
  '/',
  '/login',
  '/no-access',
  '/setup',
  '/design-system',
  '/robots.txt',
  '/sitemap.xml',
]);

const PUBLIC_PREFIX_PATHS = ['/auth', '/p', '/d/invoice', '/d/quote'];

const DATABASE_FREE_EXACT_PATHS = new Set([
  '/login',
  '/no-access',
  '/setup',
  '/design-system',
  '/robots.txt',
  '/sitemap.xml',
]);

const DATABASE_FREE_PREFIX_PATHS = ['/auth'];

function matchesPath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function matchesAny(pathname: string, exactPaths: Set<string>, prefixPaths: readonly string[]) {
  return exactPaths.has(pathname) || prefixPaths.some((path) => matchesPath(pathname, path));
}

/** API requests must keep their JSON response contract and bypass page auth. */
export function isApiPath(pathname: string): boolean {
  return matchesPath(pathname, '/api');
}

/** Routes that do not require a signed-in member. */
export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT_PATHS.has(pathname) ||
    PUBLIC_PREFIX_PATHS.some((path) => matchesPath(pathname, path))
  );
}

/** Routes that can render without a database connection. */
export function isDatabaseFreePath(pathname: string): boolean {
  return matchesAny(pathname, DATABASE_FREE_EXACT_PATHS, DATABASE_FREE_PREFIX_PATHS);
}
