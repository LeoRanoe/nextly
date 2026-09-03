import type { Cents } from './money';

export type ReorderCandidate = {
  variantId: string;
  supplierId: string | null;
  name: string;
  unitsSold90d: number;
  grossProfitCents90d: Cents;
  revenueCents90d: Cents;
  onHand: number;
  inbound: number;
  landedUnitCostCents: Cents;
  supplierLeadTimeDays: number;
  hasEnoughHistory: boolean;
  strategicStock?: boolean;
  supportingScore?: number;
  supportingFor?: string | null;
  weightGrams?: number;
  supplierName?: string | null;
  supplierKind?: string | null;
};

export type ReorderRecommendation = ReorderCandidate & {
  dailyDemand: number;
  daysOfCover: number | null;
  recommendedQty: number;
  budgetQty: number;
  deferredQty: number;
  score: number;
  reasons: string[];
  supportingScore: number;
};

export type ReorderPolicy = {
  reviewHorizonDays: number;
  safetyStockDays: number;
  defaultSupplierLeadTimeDays?: number;
  weeklyBudgetCents: Cents | null;
};

/** Nextly's operating timezone. Paramaribo has no daylight-saving changes. */
export const REORDER_TIME_ZONE = 'America/Paramaribo';
const PARAMARIBO_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Monday 00:00 in the project's local timezone, represented as a UTC Date. */
export function startOfReorderWeek(date = new Date()): Date {
  const local = new Date(date.getTime() - PARAMARIBO_OFFSET_MS);
  const day = local.getUTCDay();
  local.setUTCDate(local.getUTCDate() - ((day + 6) % 7));
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + PARAMARIBO_OFFSET_MS);
}

export function reorderWeekLabel(date: Date): string {
  return new Date(date.getTime() - PARAMARIBO_OFFSET_MS).toISOString().slice(0, 10);
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Pure purchasing intelligence; deliberately shared by the UI and server. */
export function calculateReorderRecommendations(
  candidates: readonly ReorderCandidate[],
  policy: ReorderPolicy,
): ReorderRecommendation[] {
  const maxProfitPerDay = Math.max(
    1,
    ...candidates.map((candidate) => candidate.grossProfitCents90d / 90),
  );
  const maxVelocity = Math.max(
    1,
    ...candidates.map((candidate) => candidate.unitsSold90d / 90),
  );
  const rows = candidates
    .filter((candidate) => candidate.unitsSold90d > 0 || candidate.strategicStock === true)
    .map((candidate) => {
      const dailyDemand = candidate.unitsSold90d / 90;
      const targetStock =
        dailyDemand *
        (candidate.supplierLeadTimeDays + policy.reviewHorizonDays + policy.safetyStockDays);
      const inventoryPosition = candidate.onHand + candidate.inbound;
      const recommendedQty = Math.max(0, Math.ceil(targetStock - inventoryPosition));
      const daysOfCover = dailyDemand > 0 ? candidate.onHand / dailyDemand : null;
      const profitScore = clamp(candidate.grossProfitCents90d / 90 / maxProfitPerDay);
      const velocityScore = clamp(dailyDemand / maxVelocity);
      const margin =
        candidate.revenueCents90d > 0
          ? candidate.grossProfitCents90d / candidate.revenueCents90d
          : 0;
      const stockoutRisk =
        dailyDemand <= 0
          ? 0
          : clamp(
              (candidate.supplierLeadTimeDays - (daysOfCover ?? 0)) /
                Math.max(1, candidate.supplierLeadTimeDays),
            );
      const supportingScore = clamp(candidate.supportingScore ?? 0);
      const score =
        100 *
          (profitScore * 0.4 +
            velocityScore * 0.25 +
            clamp(margin) * 0.2 +
            stockoutRisk * 0.15) +
        supportingScore * 5;
      const reasons: string[] = [];
      if (profitScore >= 0.7) reasons.push('Top profit contributor');
      if (velocityScore >= 0.7) reasons.push('Fast sell-through');
      if (stockoutRisk >= 0.5) reasons.push('Stockout risk');
      if (candidate.supportingFor) reasons.push(`Often sold with ${candidate.supportingFor}`);
      if (candidate.strategicStock) reasons.push('Strategic stock — manual review');
      if (!candidate.hasEnoughHistory) reasons.push('Low confidence: limited sales history');
      return {
        ...candidate,
        dailyDemand,
        daysOfCover,
        recommendedQty,
        budgetQty: recommendedQty,
        deferredQty: 0,
        score,
        reasons,
        supportingScore,
      };
    });
  rows.sort((a, b) => b.score - a.score || b.recommendedQty - a.recommendedQty);
  let remaining = policy.weeklyBudgetCents ?? Number.MAX_SAFE_INTEGER;
  for (const row of rows) {
    const affordable =
      row.landedUnitCostCents > 0
        ? Math.floor(remaining / row.landedUnitCostCents)
        : row.recommendedQty;
    row.budgetQty = Math.min(row.recommendedQty, Math.max(0, affordable));
    row.deferredQty = row.recommendedQty - row.budgetQty;
    remaining -= row.budgetQty * row.landedUnitCostCents;
  }
  return rows;
}

export function optimumBundlePrice(
  landedCostCents: Cents,
  componentRetailCents: Cents,
  targetMargin: number,
  discount: number,
) {
  if (targetMargin < 0 || targetMargin >= 1)
    throw new RangeError('Target margin must be between 0 and 100%.');
  if (discount < 0 || discount >= 1)
    throw new RangeError('Bundle discount must be between 0 and 100%.');
  const minimumSafePriceCents = Math.ceil(landedCostCents / (1 - targetMargin));
  const discountedRetailCents = Math.floor(componentRetailCents * (1 - discount));
  const recommendedPriceCents = Math.max(minimumSafePriceCents, discountedRetailCents);
  return {
    minimumSafePriceCents,
    recommendedPriceCents,
    grossProfitCents: recommendedPriceCents - landedCostCents,
    margin:
      recommendedPriceCents > 0
        ? (recommendedPriceCents - landedCostCents) / recommendedPriceCents
        : 0,
    savingsCents: Math.max(0, componentRetailCents - recommendedPriceCents),
  };
}
