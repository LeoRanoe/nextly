import { describe, expect, it } from 'vitest';
import { calculateReorderRecommendations, optimumBundlePrice } from '@/lib/reorder';

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
});

describe('bundle pricing', () => {
  it('protects the target margin while preserving a customer saving when possible', () => {
    const price = optimumBundlePrice(7000, 12000, 0.3, 0.05);
    expect(price.minimumSafePriceCents).toBe(10000);
    expect(price.recommendedPriceCents).toBe(11400);
    expect(price.margin).toBeCloseTo(4400 / 11400);
  });
});
