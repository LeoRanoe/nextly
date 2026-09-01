import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Session refresh at the network boundary.
 *
 * In Next.js 16 this file replaces middleware.ts and runs on the Node.js
 * runtime. It does two things and nothing else: refresh the Supabase auth
 * cookie so a long session does not expire mid-use, and bounce signed-out
 * visitors to /login.
 *
 * Authorisation is NOT decided here. Route protection at the edge is a
 * convenience; the real boundary is Row Level Security in Postgres.
 */

const PUBLIC_PATHS = [
  '/login',
  '/auth/callback',
  '/auth/error',
  // Living design documentation. The page itself 404s in production.
  '/design-system',
  // Reachable before any credentials exist; it redirects away once they do.
  '/setup',
];

export default async function proxy(request: NextRequest) {
  // Nothing can work without a database, and a sign-in form that could never
  // succeed is worse than an explanation.
  if (!process.env.DATABASE_URL && !request.nextUrl.pathname.startsWith('/setup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/setup';
    url.search = '';
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser, not getSession: it revalidates the token with Supabase rather
  // than trusting a cookie the browser handed us.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation output.
    '/((?!_next/static|_next/image|favicon.ico|.*.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};
