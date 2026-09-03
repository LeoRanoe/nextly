import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requestIdFrom, withRequestId } from '@/lib/observability';

/** How long a dismissed setup checklist stays hidden (F-13). A year, so it
 *  will not nag anyone back into it; if the data is genuinely reset before
 *  then, Settings still shows everything. */
const DISMISS_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Dismisses the Overview's setup checklist for this browser.
 *
 * Deliberately not a server action: `cacheComponents` rejects uncached writes
 * in actions, while a plain route handler may mutate a cookie. The value is
 * only ever read back to hide a banner, so there is nothing to authorize —
 * hiding your own checklist is not a write to the books.
 */
export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const store = await cookies();
  store.set('setup-checklist-dismissed', '1', {
    path: '/',
    maxAge: DISMISS_MAX_AGE,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return withRequestId(NextResponse.json({ ok: true }), requestId);
}
