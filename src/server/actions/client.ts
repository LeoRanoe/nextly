import { createSafeActionClient } from 'next-safe-action';
import { z } from 'zod';
import type { Member } from '../auth';
import { getCurrentMember, requireOwner, requireWrite } from '../auth';
import { ActionError } from '../errors';

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
 * two exported clients below.
 */

export { ActionError };

const base = createSafeActionClient({
  defineMetadataSchema() {
    return z.object({
      /** Short verb phrase used in the activity log: "created sale V002". */
      action: z.string(),
      entity: z.string(),
    });
  },
  handleServerError(error, { metadata }) {
    // Anything we raised deliberately is safe to show — including
    // `requireWrite`/`requireOwner` refusals, which are `ActionError` too, so
    // a viewer clicking a write action sees why, not a generic apology.
    // Anything else is a bug or a database constraint, and its text could leak
    // schema details, so it stays on the server; `metadata` turns that log
    // line back into something you can triage instead of a bare stack trace.
    if (error instanceof ActionError) return error.message;

    console.error(`[action] ${metadata.action} ${metadata.entity}`, error);

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

/**
 * Unauthenticated. Deliberately the only client without a guard, and there is
 * exactly one action built on it (`createQuoteRequest`) — a signed-out
 * storefront visitor asking about a product. Anything added here later must be
 * justified in the same way: writes that create no money and touch no existing
 * record, validated entirely by their input schema. Do not reach for this to
 * "fix" an auth error on a mutation that should be on `writeAction`.
 */
export const publicAction = base;

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
