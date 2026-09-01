/**
 * Cost accounting.
 *
 * Two ideas carry the whole system:
 *
 * 1. LANDED COST. A purchase order's shipping, tax, delivery and card fees are
 *    real costs of the goods. They are allocated across the order's lines
 *    pro-rata by line value, so a unit's cost is what it actually cost to get
 *    it into stock — not the supplier's list price. The spreadsheet skips this
 *    and consequently understates Nextly's margin.
 *
 * 2. INTEGER VALUE IS THE INVARIANT. Stock is held as `{ qty, valueCents }`,
 *    both integers. Unit cost is *derived*, never stored, so it can be an
 *    unrepresentable number like $29.548 without any rounding drift. Selling
 *    n of q units removes `round(value * n / q)` cents and leaves the rest.
 *    Cents are conserved exactly, forever.
 *
 * See docs/02-data/cost-accounting.md for the worked PO-001 example.
 */

import type { Cents } from '@/lib/money';
import { mulDivRound, sum } from '@/lib/money';

/* ── Overhead allocation ─────────────────────────────────────────────────── */

export type AllocatableLine = { id: string; subtotalCents: Cents; quantity: number };
export type AllocatedLine = AllocatableLine & {
  overheadCents: Cents;
  landedCostCents: Cents;
};

/**
 * Split `overheadCents` across lines pro-rata by value using the largest
 * remainder method, so the parts sum to the whole EXACTLY. Naive per-line
 * rounding leaks cents, and a purchase order that does not foot is a purchase
 * order nobody trusts.
 *
 * When every line has zero value (a free/sample shipment) the overhead is
 * split by quantity instead, and failing that, evenly.
 */
export function allocateOverhead(
  lines: readonly AllocatableLine[],
  overheadCents: Cents,
): AllocatedLine[] {
  if (lines.length === 0) return [];

  const totalValue = sum(lines.map((line) => line.subtotalCents));
  const totalQuantity = lines.reduce((total, line) => total + line.quantity, 0);

  const weights = lines.map((line) => {
    if (totalValue > 0) return line.subtotalCents;
    if (totalQuantity > 0) return line.quantity;
    return 1;
  });
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);

  if (totalWeight === 0 || overheadCents === 0) {
    return lines.map((line) => ({
      ...line,
      overheadCents: 0,
      landedCostCents: line.subtotalCents,
    }));
  }

  // Floor every share, then hand the remaining cents to the largest fractional
  // remainders — ties broken by original order so the result is deterministic.
  const shares = lines.map((line, index) => {
    const weight = weights[index] ?? 0;
    const exactNumerator = BigInt(overheadCents) * BigInt(weight);
    const floor = Number(exactNumerator / BigInt(totalWeight));
    const remainder = Number(exactNumerator % BigInt(totalWeight));
    return { index, line, floor, remainder };
  });

  const distributed = shares.reduce((total, share) => total + share.floor, 0);
  let leftover = overheadCents - distributed;

  const byRemainder = [...shares].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  );
  const bonus = new Map<number, number>();
  for (const share of byRemainder) {
    if (leftover <= 0) break;
    bonus.set(share.index, 1);
    leftover -= 1;
  }

  return shares.map((share) => {
    const overhead = share.floor + (bonus.get(share.index) ?? 0);
    return {
      ...share.line,
      overheadCents: overhead,
      landedCostCents: share.line.subtotalCents + overhead,
    };
  });
}

/** Every cost on a purchase order that is not the goods themselves. */
export type PurchaseOverhead = {
  taxCents: Cents;
  cardFeeCents: Cents;
  deliveryCents: Cents;
  shippingCents: Cents;
  shippingTaxCents: Cents;
};

export function totalOverhead(overhead: PurchaseOverhead): Cents {
  return (
    overhead.taxCents +
    overhead.cardFeeCents +
    overhead.deliveryCents +
    overhead.shippingCents +
    overhead.shippingTaxCents
  );
}

export function purchaseOrderTotal(
  lines: readonly AllocatableLine[],
  overhead: PurchaseOverhead,
): Cents {
  return sum(lines.map((line) => line.subtotalCents)) + totalOverhead(overhead);
}

/* ── Weighted-average inventory valuation ────────────────────────────────── */

export type Valuation = {
  /** Units on hand. May go negative if a sale is recorded before its receipt. */
  quantity: number;
  /** Total cost of the units on hand, in USD cents. */
  valueCents: Cents;
};

export const EMPTY_VALUATION: Valuation = { quantity: 0, valueCents: 0 };

export function receiveStock(
  current: Valuation,
  quantity: number,
  landedCostCents: Cents,
): Valuation {
  if (quantity <= 0) throw new RangeError('receiveStock requires a positive quantity');
  return {
    quantity: current.quantity + quantity,
    valueCents: current.valueCents + landedCostCents,
  };
}

export type Consumption = { cogsCents: Cents; next: Valuation; shortfall: number };

/**
 * Remove `quantity` units at weighted-average cost.
 *
 * Selling the entire holding returns exactly `valueCents` and leaves a clean
 * zero — no orphaned fractions of a cent. Overselling is permitted but
 * reported through `shortfall` so the UI can flag it rather than silently
 * booking a sale against stock that was never received.
 */
export function consumeStock(current: Valuation, quantity: number): Consumption {
  if (quantity <= 0) throw new RangeError('consumeStock requires a positive quantity');

  const shortfall = Math.max(0, quantity - Math.max(0, current.quantity));

  if (current.quantity <= 0) {
    return {
      cogsCents: 0,
      next: { quantity: current.quantity - quantity, valueCents: current.valueCents },
      shortfall,
    };
  }

  const consumable = Math.min(quantity, current.quantity);
  const cogsCents =
    consumable === current.quantity
      ? current.valueCents
      : mulDivRound(current.valueCents, consumable, current.quantity);

  return {
    cogsCents,
    next: {
      quantity: current.quantity - quantity,
      valueCents: current.valueCents - cogsCents,
    },
    shortfall,
  };
}

/**
 * Derived unit cost, for display only. Returns extra precision because the
 * true figure is frequently not a whole cent — PO-001 lands at $29.548.
 */
export function unitCost(valuation: Valuation, decimals = 4): number | null {
  if (valuation.quantity <= 0) return null;
  const perUnit = valuation.valueCents / valuation.quantity / 100;
  const factor = 10 ** decimals;
  return Math.round(perUnit * factor) / factor;
}

/* ── Margin ──────────────────────────────────────────────────────────────── */

export type Margin = { revenueCents: Cents; cogsCents: Cents; grossCents: Cents; rate: number };

export function margin(revenueCents: Cents, cogsCents: Cents): Margin {
  const grossCents = revenueCents - cogsCents;
  return {
    revenueCents,
    cogsCents,
    grossCents,
    rate: revenueCents === 0 ? 0 : grossCents / revenueCents,
  };
}
