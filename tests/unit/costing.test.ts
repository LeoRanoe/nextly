import { describe, expect, it } from 'vitest';
import {
  allocateOverhead,
  consumeStock,
  EMPTY_VALUATION,
  margin,
  purchaseOrderTotal,
  receiveStock,
  totalOverhead,
  unitCost,
} from '@/lib/costing';
import { parseMoney, sum } from '@/lib/money';

/* The real numbers from Nextly Master Sheet.xlsx. If these ever change, the
   books changed, which is exactly when someone should be looking. */
const PO_001 = {
  lines: [{ id: 'wyze-black', subtotalCents: parseMoney('116.97'), quantity: 5 }],
  overhead: {
    taxCents: parseMoney('0'),
    cardFeeCents: parseMoney('1.05'),
    deliveryCents: parseMoney('0'),
    shippingCents: parseMoney('27.02'),
    shippingTaxCents: parseMoney('2.70'),
  },
};

describe('PO-001 landed cost', () => {
  it('totals the overhead the sheet ignores', () => {
    expect(totalOverhead(PO_001.overhead)).toBe(parseMoney('30.77'));
  });

  it('foots to the purchase order total on the sheet', () => {
    expect(purchaseOrderTotal(PO_001.lines, PO_001.overhead)).toBe(parseMoney('147.74'));
  });

  it('lands the single line at 29.548 per unit', () => {
    const [line] = allocateOverhead(PO_001.lines, totalOverhead(PO_001.overhead));
    expect(line?.overheadCents).toBe(parseMoney('30.77'));
    expect(line?.landedCostCents).toBe(parseMoney('147.74'));
    expect(unitCost({ quantity: 5, valueCents: line?.landedCostCents ?? 0 })).toBe(29.548);
  });
});

describe('V001 margin on the real cost base', () => {
  it('books COGS at weighted-average landed cost, not the list price', () => {
    const [line] = allocateOverhead(PO_001.lines, totalOverhead(PO_001.overhead));
    const stock = receiveStock(EMPTY_VALUATION, 5, line?.landedCostCents ?? 0);

    const { cogsCents, next, shortfall } = consumeStock(stock, 4);

    expect(shortfall).toBe(0);
    expect(cogsCents).toBe(parseMoney('118.19')); // sheet says 155.96
    expect(next).toEqual({ quantity: 1, valueCents: parseMoney('29.55') });

    const result = margin(parseMoney('220.00'), cogsCents);
    expect(result.grossCents).toBe(parseMoney('101.81')); // sheet says 64.04
    expect(result.rate).toBeCloseTo(0.4628, 4);
  });

  it('is materially better than the spreadsheet reported', () => {
    const sheetGross = parseMoney('220.00') - 4 * parseMoney('38.99');
    const [line] = allocateOverhead(PO_001.lines, totalOverhead(PO_001.overhead));
    const stock = receiveStock(EMPTY_VALUATION, 5, line?.landedCostCents ?? 0);
    const { cogsCents } = consumeStock(stock, 4);

    expect(sheetGross).toBe(parseMoney('64.04'));
    expect(parseMoney('220.00') - cogsCents - sheetGross).toBe(parseMoney('37.77'));
  });
});

describe('allocateOverhead', () => {
  it('always sums to exactly the overhead, never a cent more or less', () => {
    // 100 cents across three equal lines cannot divide evenly; largest
    // remainder must still make it foot.
    const lines = [
      { id: 'a', subtotalCents: 1000, quantity: 1 },
      { id: 'b', subtotalCents: 1000, quantity: 1 },
      { id: 'c', subtotalCents: 1000, quantity: 1 },
    ];
    const allocated = allocateOverhead(lines, 100);
    expect(sum(allocated.map((l) => l.overheadCents))).toBe(100);
    expect(allocated.map((l) => l.overheadCents)).toEqual([34, 33, 33]);
  });

  it('weights by line value', () => {
    const allocated = allocateOverhead(
      [
        { id: 'big', subtotalCents: 7500, quantity: 1 },
        { id: 'small', subtotalCents: 2500, quantity: 1 },
      ],
      1000,
    );
    expect(allocated.map((l) => l.overheadCents)).toEqual([750, 250]);
  });

  it('falls back to quantity when every line is free', () => {
    const allocated = allocateOverhead(
      [
        { id: 'a', subtotalCents: 0, quantity: 3 },
        { id: 'b', subtotalCents: 0, quantity: 1 },
      ],
      400,
    );
    expect(allocated.map((l) => l.overheadCents)).toEqual([300, 100]);
  });

  it('foots across two hundred awkward splits', () => {
    for (let overhead = 1; overhead <= 200; overhead++) {
      const lines = [
        { id: 'a', subtotalCents: 333, quantity: 1 },
        { id: 'b', subtotalCents: 333, quantity: 1 },
        { id: 'c', subtotalCents: 334, quantity: 1 },
      ];
      const allocated = allocateOverhead(lines, overhead);
      expect(sum(allocated.map((l) => l.overheadCents))).toBe(overhead);
    }
  });

  it('handles an empty order and zero overhead', () => {
    expect(allocateOverhead([], 500)).toEqual([]);
    const [line] = allocateOverhead([{ id: 'a', subtotalCents: 100, quantity: 1 }], 0);
    expect(line?.landedCostCents).toBe(100);
  });
});

describe('consumeStock', () => {
  it('conserves cents exactly when the holding is fully sold', () => {
    const stock = receiveStock(EMPTY_VALUATION, 3, 10_000);
    const { cogsCents, next } = consumeStock(stock, 3);
    expect(cogsCents).toBe(10_000);
    expect(next).toEqual({ quantity: 0, valueCents: 0 });
  });

  it('leaves no orphaned fractions draining one unit at a time', () => {
    // 100 dollars over 3 units is 33.333 recurring, the classic place a
    // ledger springs a leak.
    let stock = receiveStock(EMPTY_VALUATION, 3, 10_000);
    let booked = 0;
    for (let i = 0; i < 3; i++) {
      const step = consumeStock(stock, 1);
      booked += step.cogsCents;
      stock = step.next;
    }
    expect(booked).toBe(10_000);
    expect(stock).toEqual({ quantity: 0, valueCents: 0 });
  });

  it('averages across receipts at different prices', () => {
    let stock = receiveStock(EMPTY_VALUATION, 5, parseMoney('147.74'));
    stock = receiveStock(stock, 5, parseMoney('160.00'));
    expect(stock).toEqual({ quantity: 10, valueCents: parseMoney('307.74') });
    const { cogsCents } = consumeStock(stock, 1);
    expect(cogsCents).toBe(parseMoney('30.77')); // 30.774 rounds to 30.77
  });

  it('reports a shortfall instead of silently overselling', () => {
    const stock = receiveStock(EMPTY_VALUATION, 2, 5000);
    const { cogsCents, next, shortfall } = consumeStock(stock, 5);
    expect(shortfall).toBe(3);
    expect(cogsCents).toBe(5000);
    expect(next.quantity).toBe(-3);
  });

  it('rejects non-positive quantities', () => {
    expect(() => consumeStock({ quantity: 5, valueCents: 100 }, 0)).toThrow(RangeError);
    expect(() => receiveStock(EMPTY_VALUATION, -1, 100)).toThrow(RangeError);
  });
});

describe('unitCost', () => {
  it('exposes sub-cent precision the stored integers cannot hold', () => {
    expect(unitCost({ quantity: 5, valueCents: 14_774 })).toBe(29.548);
    expect(unitCost({ quantity: 3, valueCents: 10_000 })).toBe(33.3333);
  });

  it('returns null rather than dividing by zero', () => {
    expect(unitCost(EMPTY_VALUATION)).toBeNull();
  });
});
