/**
 * Errors that are safe to show verbatim.
 *
 * Lives outside `actions/client.ts` so `auth.ts` can throw one without
 * importing the action client — `client.ts` already imports from `auth.ts`,
 * and the reverse import would cycle. `actions/client.ts` re-exports this, so
 * every action file's `import { ActionError } from './client'` is unchanged.
 */
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionError';
  }
}

/** A safe, status-bearing error for route handlers that must return JSON. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 401 | 403 | 404 | 503,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
