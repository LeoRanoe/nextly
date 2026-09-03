import { eq } from 'drizzle-orm';
import type { ReorderRecommendation } from '@/lib/reorder';
import { reorderWeekLabel } from '@/lib/reorder';
import { reorderRecommendations, reorderRuns } from '../db/schema/planning';
import { logActivity, type Tx } from './posting';

type SnapshotMode = 'idempotent' | 'replace';

function snapshotValues(runId: string, recommendations: readonly ReorderRecommendation[]) {
  return recommendations.map((row) => ({
    runId,
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
    strategicStock: row.strategicStock ?? false,
    supportingFor: row.supportingFor ?? null,
    weightGrams: row.weightGrams ?? 0,
  }));
}

/**
 * Store one recommendation run atomically with all of its lines.
 *
 * Cron runs are idempotent: a completed run for the same local Monday is a
 * no-op, while a failed run is retried in place. Manual refreshes explicitly
 * replace the current week's snapshot so the review queue never accumulates
 * stale duplicates.
 */
export async function persistReorderSnapshot(
  tx: Tx,
  input: {
    runDate: Date;
    recommendations: readonly ReorderRecommendation[];
    mode: SnapshotMode;
    memberId?: string;
  },
): Promise<{ id: string; created: boolean; replaced: boolean }> {
  let created = false;
  let replaced = false;
  let run =
    input.mode === 'idempotent'
      ? (
          await tx
            .insert(reorderRuns)
            .values({ runDate: input.runDate, status: 'running', error: null })
            .onConflictDoNothing({ target: reorderRuns.runDate })
            .returning()
        )[0]
      : undefined;
  created = Boolean(run);

  if (!run) {
    const [existing] = await tx
      .select()
      .from(reorderRuns)
      .where(eq(reorderRuns.runDate, input.runDate))
      .for('update')
      .limit(1);

    if (existing?.status === 'completed' && input.mode === 'idempotent') {
      return { id: existing.id, created: false, replaced: false };
    }

    if (existing) {
      const [updated] = await tx
        .update(reorderRuns)
        .set({ status: 'running', error: null, createdAt: new Date() })
        .where(eq(reorderRuns.id, existing.id))
        .returning();
      run = updated;
      replaced = true;
    }
  }

  if (!run) {
    throw new Error('Could not create the recommendation run.');
  }

  await tx.delete(reorderRecommendations).where(eq(reorderRecommendations.runId, run.id));
  if (input.recommendations.length > 0) {
    await tx
      .insert(reorderRecommendations)
      .values(snapshotValues(run.id, input.recommendations));
  }
  await tx
    .update(reorderRuns)
    .set({ status: 'completed', error: null })
    .where(eq(reorderRuns.id, run.id));

  if (input.memberId) {
    await logActivity(tx, {
      memberId: input.memberId,
      action: 'refreshed reorder recommendations',
      entityType: 'reorder_run',
      entityId: run.id,
      entityLabel: reorderWeekLabel(input.runDate),
    });
  }

  return {
    id: run.id,
    created,
    replaced,
  };
}

/** Mark a run as failed without overwriting a successful snapshot. */
export async function recordReorderFailure(
  tx: Tx,
  runDate: Date,
  error: string,
): Promise<void> {
  const [existing] = await tx
    .select({ id: reorderRuns.id, status: reorderRuns.status })
    .from(reorderRuns)
    .where(eq(reorderRuns.runDate, runDate))
    .for('update')
    .limit(1);

  if (existing?.status === 'completed') return;
  if (existing) {
    await tx
      .update(reorderRuns)
      .set({ status: 'failed', error: error.slice(0, 2000) })
      .where(eq(reorderRuns.id, existing.id));
    return;
  }
  await tx.insert(reorderRuns).values({
    runDate,
    status: 'failed',
    error: error.slice(0, 2000),
  });
}
