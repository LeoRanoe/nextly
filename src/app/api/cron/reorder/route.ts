import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { startOfReorderWeek } from '@/lib/reorder';
import { db } from '@/server/db/client';
import { getReorderRecommendations } from '@/server/queries/reorder';
import { persistReorderSnapshot, recordReorderFailure } from '@/server/services/reorder';

function matchesSecret(request: Request, expected: string): boolean {
  const authorization = request.headers.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Vercel calls this endpoint every Monday. It only writes a recommendation
 * snapshot; ordering remains an explicit human action in the review queue.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
  }
  if (!matchesSecret(request, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, error: 'Database is not configured' },
      { status: 503 },
    );
  }

  const runDate = startOfReorderWeek();
  try {
    const recommendations = await getReorderRecommendations();
    const result = await db.transaction((tx) =>
      persistReorderSnapshot(tx, {
        runDate,
        recommendations,
        mode: 'idempotent',
      }),
    );
    return NextResponse.json({
      ok: true,
      runId: result.id,
      duplicate: !result.created && !result.replaced,
      count: recommendations.length,
    });
  } catch (error) {
    console.error('[cron] reorder failed', error);
    try {
      await db.transaction((tx) =>
        recordReorderFailure(
          tx,
          runDate,
          error instanceof Error ? error.message : 'Unknown error',
        ),
      );
    } catch (failureError) {
      console.error('[cron] could not record reorder failure', failureError);
    }
    return NextResponse.json(
      { ok: false, error: 'Recommendation run failed' },
      { status: 500 },
    );
  }
}
