import type { User } from '@supabase/supabase-js';
import { eq, isNull, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { isDatabaseConfigured } from '@/lib/env';
import { logServerError } from '@/lib/observability';
import { createClient } from '@/lib/supabase/server';
import { db } from './db/client';
import { members } from './db/schema';
import { ActionError, ApiError } from './errors';

export type Member = typeof members.$inferSelect;

/**
 * Authorisation model.
 *
 * Drizzle connects as the `postgres` role, which BYPASSES Row Level Security.
 * That is deliberate, and it means server code must authorise explicitly,
 * which is what `requireMember` and `requireWrite` are for. RLS is not
 * redundant: it is the boundary for the PostgREST surface Supabase exposes
 * publicly, where an anon key alone must never reach the books.
 *
 * Rule: every Server Action starts with requireMember() or requireWrite().
 * See docs/01-architecture/security.md.
 */

/** Per-request memoised, so a page with twelve widgets makes one auth call. */
export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  // getUser, not getSession: it revalidates with Supabase rather than
  // trusting a cookie the browser handed us.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCurrentMember = cache(async (): Promise<Member | null> => {
  // No database means no members table, so there is nobody to authorise and
  // nothing to protect. `requireMember` turns this into the setup screen.
  if (!isDatabaseConfigured()) return null;

  const user = await getAuthUser();
  if (!user?.email) return null;

  const [existing] = await db
    .select()
    .from(members)
    .where(eq(members.authUserId, user.id))
    .limit(1);

  if (existing) return existing;

  // First sign-in claims the invitation: a member row created before this
  // person ever had an auth account, matched on email. Leonardo and Youri hold
  // capital in the ledger from before the app existed, so their member rows
  // cannot wait on an auth record.
  const [claimed] = await db
    .update(members)
    .set({ authUserId: user.id, updatedAt: new Date() })
    .where(
      sql`lower(${members.email}) = lower(${user.email}) and ${isNull(members.authUserId)}`,
    )
    .returning();

  return claimed ?? null;
});

/**
 * Signed in AND invited.
 *
 * The two failures are different and get different destinations. Someone who
 * is not signed in needs the sign-in form. Someone who is signed in but was
 * never invited must not be bounced back to a form they already completed;
 * they get told what actually happened.
 */
export async function requireMember(requestId = 'server-action'): Promise<Member> {
  if (!isDatabaseConfigured()) redirect('/setup');

  let member: Member | null = null;
  let serviceUnavailable = false;
  try {
    member = await getCurrentMember();
  } catch (error) {
    logServerError('auth.member-check', requestId, error);
    serviceUnavailable = true;
  }

  if (serviceUnavailable) redirect('/auth/error?reason=service-unavailable');
  if (member) return member;

  // Two separate calls, not a ternary: typedRoutes resolves each literal
  // against the route map, and a union of literals defeats it.
  let user: User | null = null;
  try {
    user = await getAuthUser();
  } catch (error) {
    logServerError('auth.user-check', requestId, error);
    serviceUnavailable = true;
  }
  if (serviceUnavailable) redirect('/auth/error?reason=service-unavailable');
  if (user) redirect('/no-access');
  redirect('/login');
}

/**
 * Additionally permitted to change data. Viewers are read-only.
 *
 * Throws `ActionError`, not a plain `Error`: `handleServerError`
 * (`actions/client.ts`) only passes `ActionError` messages through to the
 * client, so a viewer who reaches this needs to actually see why they were
 * refused rather than a generic "something went wrong".
 */
export async function requireWrite(): Promise<Member> {
  const member = await requireMember();
  if (member.role === 'viewer') {
    throw new ActionError('Your account has read-only access.');
  }
  return member;
}

export async function requireOwner(): Promise<Member> {
  const member = await requireMember();
  if (member.role !== 'owner') {
    throw new ActionError('Only owners can perform this action.');
  }
  return member;
}

/** Page guards redirect; API guards return status-bearing JSON errors instead. */
export async function requireApiMember(): Promise<Member> {
  if (!isDatabaseConfigured()) {
    throw new ApiError('Database is not configured.', 503);
  }

  const member = await getCurrentMember();
  if (member) return member;

  throw new ApiError('Unauthorized.', 401);
}

export async function requireApiWrite(): Promise<Member> {
  const member = await requireApiMember();
  if (member.role === 'viewer') throw new ApiError('Forbidden.', 403);
  return member;
}
