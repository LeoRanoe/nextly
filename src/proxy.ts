import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { isServerEnvironmentValid } from '@/lib/env';
import { logServerError, REQUEST_ID_HEADER, withRequestId } from '@/lib/observability';
import { isApiPath, isDatabaseFreePath, isPublicPath } from '@/lib/route-access';

/**
 * Session refresh at the network boundary.
 *
 * In Next.js 16 this file replaces middleware.ts and runs on the Node.js
 * runtime. It refreshes the Supabase auth cookie and protects the private app
 * shell. Server layouts and actions remain the real authorization boundary.
 */
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();

  const next = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(REQUEST_ID_HEADER, requestId);
    return withRequestId(
      NextResponse.next({ request: { headers: requestHeaders } }),
      requestId,
    );
  };

  // Route handlers own their response format and authentication contract. An
  // API caller must never receive a 307 to an HTML login page.
  if (isApiPath(pathname)) {
    return next();
  }

  // A database-dependent page cannot succeed without its runtime connection.
  // Database-free pages remain reachable so the setup and sign-in explanations
  // can be used to repair the environment.
  if (
    (!process.env.DATABASE_URL || !isServerEnvironmentValid()) &&
    !isDatabaseFreePath(pathname)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/setup';
    url.search = '';
    return withRequestId(NextResponse.redirect(url), requestId);
  }

  // Public pages and token documents do not need a Supabase session. Avoiding
  // the auth round-trip here keeps public documents available despite stale
  // browser cookies.
  if (isPublicPath(pathname) && pathname !== '/login') {
    return next();
  }

  let response = next();
  // getUser, not getSession: it revalidates the token with Supabase rather than
  // trusting a cookie the browser handed us.
  let user: User | null = null;
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            response = next();
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
      },
    );
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    logServerError('proxy.auth-check', requestId, error);
    const url = request.nextUrl.clone();
    url.pathname = '/auth/error';
    url.search = '';
    url.searchParams.set('reason', 'service-unavailable');
    return withRequestId(NextResponse.redirect(url), requestId);
  }

  if (!user && pathname !== '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return withRequestId(NextResponse.redirect(url), requestId);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return withRequestId(NextResponse.redirect(url), requestId);
  }

  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation output.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};
