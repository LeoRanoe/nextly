import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { isMigrationEnvironmentValid, publicEnv, serverEnv } from '@/lib/env';
import { logServerError, requestIdFrom, withRequestId } from '@/lib/observability';
import { db } from '@/server/db/client';

/**
 * Liveness/readiness endpoint for local and deployed verification.
 *
 * The response intentionally exposes only health state. Detailed environment
 * validation and database errors stay in server logs.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = requestIdFrom(request);

  if (!process.env.DATABASE_URL) {
    return withRequestId(
      NextResponse.json(
        {
          ok: false,
          status: 'not_configured',
          checks: { environment: false, database: false },
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      ),
      requestId,
    );
  }

  try {
    serverEnv();
    publicEnv();
  } catch (error) {
    logServerError('api.health', requestId, error);

    return withRequestId(
      NextResponse.json(
        { ok: false, status: 'misconfigured', checks: { environment: false, database: false } },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      ),
      requestId,
    );
  }

  const migrations = isMigrationEnvironmentValid();

  try {
    await db.execute(sql`select 1`);

    return withRequestId(
      NextResponse.json(
        {
          ok: true,
          status: migrations ? 'ready' : 'degraded',
          checks: { environment: true, database: true, migrations },
        },
        { headers: { 'Cache-Control': 'no-store' } },
      ),
      requestId,
    );
  } catch (error) {
    logServerError('api.health.database', requestId, error);

    return withRequestId(
      NextResponse.json(
        {
          ok: false,
          status: 'unavailable',
          checks: { environment: true, database: false, migrations },
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      ),
      requestId,
    );
  }
}
