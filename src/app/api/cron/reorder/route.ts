import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { reorderRecommendations, reorderRuns } from '@/server/db/schema/planning';
import { getReorderRecommendations } from '@/server/queries/reorder';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return NextResponse.json(
      { ok: false, error: 'Database is not configured' },
      { status: 503 },
    );
  try {
    const recommendations = await getReorderRecommendations();
    const runDate = new Date();
    const monday = new Date(runDate);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    monday.setUTCHours(0, 0, 0, 0);
    const [run] = await db
      .insert(reorderRuns)
      .values({ runDate: monday, status: 'completed' })
      .onConflictDoNothing({ target: reorderRuns.runDate })
      .returning({ id: reorderRuns.id });
    if (!run) return NextResponse.json({ ok: true, duplicate: true });
    if (recommendations.length)
      await db.insert(reorderRecommendations).values(
        recommendations.map((row) => ({
          runId: run.id,
          variantId: row.variantId,
          supplierId: row.supplierId,
          unitsSold90d: row.unitsSold90d,
          grossProfitCents90d: row.grossProfitCents90d,
          revenueCents90d: row.revenueCents90d,
          onHand: row.onHand,
          inbound: row.inbound,
          landedUnitCostCents: row.landedUnitCostCents,
          dailyDemand: String(row.dailyDemand),
          daysOfCover: row.daysOfCover === null ? null : String(row.daysOfCover),
          recommendedQty: row.recommendedQty,
          budgetQty: row.budgetQty,
          deferredQty: row.deferredQty,
          score: String(row.score),
          reasons: row.reasons,
          lowConfidence: !row.hasEnoughHistory,
        })),
      );
    return NextResponse.json({ ok: true, runId: run.id, count: recommendations.length });
  } catch (error) {
    console.error('[cron] reorder failed', error);
    await db
      .execute(
        sql`INSERT INTO reorder_runs (run_date, status, error) VALUES (${new Date()}, 'failed', ${error instanceof Error ? error.message : 'Unknown error'}) ON CONFLICT (run_date) DO NOTHING`,
      )
      .catch(() => undefined);
    return NextResponse.json(
      { ok: false, error: 'Recommendation run failed' },
      { status: 500 },
    );
  }
}
