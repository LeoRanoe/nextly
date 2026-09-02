'use server';

import { type SerialHit, searchSerials } from '../queries/warranty';
import { ActionError, getCurrentMember } from './client';

/**
 * Read-only lookup for the command palette's serial search (F-6).
 *
 * A plain Server Action rather than a safe-action: those clients exist so
 * mutations cannot run unauthorised (`writeAction`/`ownerAction` middleware),
 * and this is not a mutation. The guard replaces their middleware without its
 * redirect — an action must never redirect, and a palette whose session just
 * lapsed should fail quietly into the existing error path rather than yank
 * the user off the page they are on.
 */
export async function searchSerialsAction(term: string): Promise<SerialHit[]> {
  const member = await getCurrentMember();
  if (!member) throw new ActionError('Your session has ended. Sign in again.');
  // Prefix-matched, capped, void sales excluded — see queries/warranty.ts.
  return searchSerials(term.slice(0, 64));
}
