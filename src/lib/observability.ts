/** Header used to correlate a browser request with server-side logs. */
export const REQUEST_ID_HEADER = 'x-nextly-request-id';

export function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
}

export function withRequestId<T extends Response>(response: T, requestId: string): T {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

/** Log only safe error metadata; never serialize request headers or secrets. */
export function logServerError(scope: string, requestId: string, error: unknown): void {
  const detail =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { message: String(error) };
  console.error(JSON.stringify({ scope, requestId, ...detail }));
}
