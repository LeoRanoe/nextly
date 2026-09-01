import { createSafeActionClient } from 'next-safe-action';
import { z } from 'zod';
import type { Member } from '../auth';
import { getCurrentMember, requireMember, requireOwner, requireWrite } from '../auth';

/**
 * Server Action clients.
 *
 * Drizzle bypasses Row Level Security (see ADR-0007), so **every mutation must
 * authorise itself**. These clients make that structural rather than something
 * a reviewer has to spot: an action built on `writeAction` cannot run without a
 * member who is allowed to write, because the middleware runs before the
 * handler and throws otherwise.
 *
 * Never call `db` from a bare `createSafeActionClient()`. Start from one of the
 * three exported clients below.
 */

export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionError';
  }
}

const base = createSafeActionClient({
  defineMetadataSchema() {
    return z.object({
      /** Short verb phrase used in the activity log: "created sale V002". */
      action: z.string(),
      entity: z.string(),
    });
  },
  handleServerError(error) {
    // Anything we raised deliberately is safe to show. Anything else is a bug
    // or a database constraint, and its text could leak schema details, so it
    // stays on the server.
    if (error instanceof ActionError) return error.message;

    console.error('[action]', error);

    if (error.message.includes('duplicate key')) {
      return 'That already exists. Check for an existing record with the same code or number.';
    }
    if (error.message.includes('violates foreign key')) {
      return 'Something this refers to no longer exists. Reload and try again.';
    }
    return 'Something went wrong. The error has been logged.';
  },
});

export type ActionContext = { member: Member };

/** Signed in and invited. Reads that still need to know who is asking. */
export const memberAction = base.use(async ({ next }) => {
  const member = await requireMember();
  return next({ ctx: { member } satisfies ActionContext });
});

/** The default for mutations. Owners and staff; viewers are refused. */
export const writeAction = base.use(async ({ next }) => {
  const member = await requireWrite();
  return next({ ctx: { member } satisfies ActionContext });
});

/** Team management, settings, deletions. */
export const ownerAction = base.use(async ({ next }) => {
  const member = await requireOwner();
  return next({ ctx: { member } satisfies ActionContext });
});

export { getCurrentMember };
