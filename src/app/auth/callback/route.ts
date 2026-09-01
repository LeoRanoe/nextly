import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Exchanges the one-time code from the sign-in email for a session cookie.
 *
 * `next` is validated as a same-origin absolute path before use. Redirecting
 * to an attacker-supplied value here would turn the sign-in flow into an open
 * redirect, which is a real phishing primitive: a link that genuinely lands on
 * the Nextly domain and then bounces elsewhere.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const requested = searchParams.get('next');
  const next = requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/';

  if (!code) {
    return NextResponse.redirect(new URL('/auth/error?reason=missing-code', origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/auth/error?reason=exchange-failed', origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
