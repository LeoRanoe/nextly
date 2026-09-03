import { describe, expect, it } from 'vitest';
import {
  calculateReorderRecommendations,
  optimumBundlePrice,
  reorderWeekLabel,
  startOfReorderWeek,
} from '@/lib/reorder';

describe('reorder intelligence', () => {
  it('forecasts stock needs from the trailing 90 days and inbound stock', () => {
    const [row] = calculateReorderRecommendations(
      [
        {
          variantId: 'a',
          supplierId: 'amazon',
          name: 'Camera',
          unitsSold90d: 30,
          grossProfitCents90d: 30000,
          revenueCents90d: 90000,
          onHand: 4,
          inbound: 3,
          landedUnitCostCents: 1000,
          supplierLeadTimeDays: 28,
          hasEnoughHistory: true,
        },
      ],
      { reviewHorizonDays: 14, safetyStockDays: 7, weeklyBudgetCents: null },
    );
    expect(row?.dailyDemand).toBeCloseTo(1 / 3);
    expect(row?.recommendedQty).toBe(10);
    expect(row?.reasons).toContain('Top profit contributor');
  });

  it('allocates an advisory budget in score order without hiding deferred items', () => {
    const rows = calculateReorderRecommendations(
      [
        {
          variantId: 'a',
          supplierId: 'amazon',
          name: 'A',
          unitsSold90d: 30,
          grossProfitCents90d: 30000,
          revenueCents90d: 60000,
          onHand: 0,
          inbound: 0,
          landedUnitCostCents: 1000,
          supplierLeadTimeDays: 28,
          hasEnoughHistory: true,
        },
        {
          variantId: 'b',
          supplierId: 'aliexpress',
          name: 'B',
          unitsSold90d: 10,
          grossProfitCents90d: 10000,
          revenueCents90d: 30000,
          onHand: 0,
          inbound: 0,
          landedUnitCostCents: 1000,
          supplierLeadTimeDays: 28,
          hasEnoughHistory: true,
        },
      ],
      { reviewHorizonDays: 14, safetyStockDays: 7, weeklyBudgetCents: 5000 },
    );
    expect(
      rows.reduce((sum, row) => sum + row.budgetQty * row.landedUnitCostCents, 0),
    ).toBeLessThanOrEqual(5000);
    expect(rows.some((row) => row.deferredQty > 0)).toBe(true);
  });

  it('keeps strategic no-sales stock visible for manual review and filters other no-sales items', () => {
    const rows = calculateReorderRecommendations(
      [
        {
          variantId: 'strategic',
          supplierId: null,
          name: 'Strategic launch stock',
          unitsSold90d: 0,
          grossProfitCents90d: 0,
          revenueCents90d: 0,
          onHand: 0,
          inbound: 0,
          landedUnitCostCents: 1000,
          supplierLeadTimeDays: 28,
          hasEnoughHistory: false,
          strategicStock: true,
        },
        {
          variantId: 'unknown',
          supplierId: null,
          name: 'Unknown demand',
          unitsSold90d: 0,
          grossProfitCents90d: 0,
          revenueCents90d: 0,
          onHand: 0,
          inbound: 0,
          landedUnitCostCents: 1000,
          supplierLeadTimeDays: 28,
          hasEnoughHistory: false,
        },
      ],
      { reviewHorizonDays: 14, safetyStockDays: 7, weeklyBudgetCents: null },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.variantId).toBe('strategic');
    expect(!rows[0]?.hasEnoughHistory).toBe(true);
    expect(rows[0]?.reasons).toContain('Strategic stock — manual review');
    expect(rows[0]?.reasons).toContain('Low confidence: limited sales history');
  });

  it('adds supporting-product relevance without hiding the main buying signals', () => {
    const [row] = calculateReorderRecommendations(
      [
        {
          variantId: 'accessory',
          supplierId: 'amazon',
          name: 'Memory card',
          unitsSold90d: 10,
          grossProfitCents90d: 5000,
          revenueCents90d: 10000,
          onHand: 0,
          inbound: 0,
          landedUnitCostCents: 500,
          supplierLeadTimeDays: 28,
          hasEnoughHistory: true,
          supportingScore: 0.8,
          supportingFor: 'bundle Camera starter kit',
        },
      ],
      { reviewHorizonDays: 14, safetyStockDays: 7, weeklyBudgetCents: null },
    );
    expect(row?.supportingScore).toBeCloseTo(0.8);
    expect(row?.reasons).toContain('Often sold with bundle Camera starter kit');
    expect(row?.score).toBeGreaterThan(0);
  });

  it('anchors the weekly snapshot to Monday in the Paramaribo timezone', () => {
    const monday = startOfReorderWeek(new Date('2026-09-02T02:00:00.000Z'));
    expect(reorderWeekLabel(monday)).toBe('2026-08-31');
  });
});

describe('bundle pricing', () => {
  it('protects the target margin while preserving a customer saving when possible', () => {
    const price = optimumBundlePrice(7000, 12000, 0.3, 0.05);
    expect(price.minimumSafePriceCents).toBe(10000);
    expect(price.recommendedPriceCents).toBe(11400);
    expect(price.margin).toBeCloseTo(4400 / 11400);
  });
});
