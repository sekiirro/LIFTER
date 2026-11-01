import { describe, expect, it } from 'vitest';
import {
  allocateRefund,
  type RefundCollectionSource,
} from '../../lib/payments/refund-allocation';

const sources: RefundCollectionSource[] = [
  {
    eventId: '00000000-0000-4000-8000-000000000003',
    collectedOn: '2026-11-02',
    installmentSequence: 1,
    collectedPrincipal: 5,
    storedCommission: 2,
  },
  {
    eventId: '00000000-0000-4000-8000-000000000002',
    collectedOn: '2026-11-01',
    installmentSequence: 2,
    collectedPrincipal: 4,
    storedCommission: 1,
  },
  {
    eventId: '00000000-0000-4000-8000-000000000001',
    collectedOn: '2026-11-01',
    installmentSequence: 1,
    collectedPrincipal: 3,
    storedCommission: 1,
  },
];

function compositions(total: number): number[][] {
  if (total <= 0) return [];
  const all: number[][] = [];
  for (let first = 1; first <= total; first += 1) {
    if (first === total) all.push([first]);
    else
      for (const tail of compositions(total - first))
        all.push([first, ...tail]);
  }
  return all;
}

describe('refund allocation ordering and caps', () => {
  it('allocates FIFO by Cairo collection date, installment sequence, then event UUID', () => {
    const result = allocateRefund(8, sources);
    expect(
      result.map(({ sourceEventId, principalAmount }) => [
        sourceEventId,
        principalAmount,
      ]),
    ).toEqual([
      ['00000000-0000-4000-8000-000000000001', 3],
      ['00000000-0000-4000-8000-000000000002', 4],
      ['00000000-0000-4000-8000-000000000003', 1],
    ]);
  });

  it('returns the same FIFO result for every permutation of the supplied source order', () => {
    const expected = allocateRefund(8, sources);
    for (const a of [0, 1, 2]) {
      for (const b of [0, 1, 2]) {
        for (const c of [0, 1, 2]) {
          if (new Set([a, b, c]).size !== 3) continue;
          expect(
            allocateRefund(8, [sources[a]!, sources[b]!, sources[c]!]),
          ).toEqual(expected);
        }
      }
    }
  });

  it('respects previous allocations and rejects amounts above the remaining source cap', () => {
    const partiallyRefunded = [
      {
        ...sources[2]!,
        refundedPrincipal: 2,
      },
    ];
    expect(allocateRefund(1, partiallyRefunded)[0]).toMatchObject({
      principalAmount: 1,
      cumulativeRefundedPrincipal: 3,
      cumulativeCommissionTarget: 1,
      commissionReversalAmount: 0,
    });
    expect(() => allocateRefund(2, partiallyRefunded)).toThrow(RangeError);
  });

  it('rejects zero, unsafe, duplicate, or malformed inputs', () => {
    expect(() => allocateRefund(0, sources)).toThrow(RangeError);
    expect(() => allocateRefund(Number.MAX_SAFE_INTEGER + 1, sources)).toThrow(
      RangeError,
    );
    expect(() => allocateRefund(1, [sources[0]!, sources[0]!])).toThrow(
      RangeError,
    );
    expect(() =>
      allocateRefund(1, [{ ...sources[0]!, collectedPrincipal: 0 }]),
    ).toThrow(RangeError);
  });
});

describe('cumulative proportional commission allocation', () => {
  it('reverses exactly the stored commission through odd-amount partitions', () => {
    const source: RefundCollectionSource = {
      eventId: '10000000-0000-4000-8000-000000000001',
      collectedOn: '2026-11-01',
      installmentSequence: 1,
      collectedPrincipal: 10_001,
      storedCommission: 3_333,
    };
    const first = allocateRefund(3_000, [source])[0]!;
    const second = allocateRefund(3_000, [
      { ...source, refundedPrincipal: 3_000 },
    ])[0]!;
    const third = allocateRefund(4_001, [
      { ...source, refundedPrincipal: 6_000 },
    ])[0]!;

    expect([
      first.commissionReversalAmount,
      second.commissionReversalAmount,
      third.commissionReversalAmount,
    ]).toEqual([1_000, 1_000, 1_333]);
    expect(
      first.commissionReversalAmount +
        second.commissionReversalAmount +
        third.commissionReversalAmount,
    ).toBe(3_333);
  });

  it('keeps a one-minor-unit commission capped for every partition of a tiny source', () => {
    const source: RefundCollectionSource = {
      eventId: '20000000-0000-4000-8000-000000000001',
      collectedOn: '2026-11-01',
      installmentSequence: 1,
      collectedPrincipal: 3,
      storedCommission: 1,
    };

    for (const partition of compositions(3)) {
      let refundedPrincipal = 0;
      let commissionReversed = 0;
      for (const amount of partition) {
        const allocation = allocateRefund(amount, [
          { ...source, refundedPrincipal },
        ])[0]!;
        refundedPrincipal = allocation.cumulativeRefundedPrincipal;
        commissionReversed += allocation.commissionReversalAmount;
        expect(allocation.commissionReversalAmount).toBeGreaterThanOrEqual(0);
        expect(commissionReversed).toBeLessThanOrEqual(source.storedCommission);
      }
      expect(refundedPrincipal).toBe(3);
      expect(commissionReversed).toBe(1);
    }
  });

  it('never repeats a half-up tie commission unit across partial refunds', () => {
    const source: RefundCollectionSource = {
      eventId: '30000000-0000-4000-8000-000000000001',
      collectedOn: '2026-11-01',
      installmentSequence: 1,
      collectedPrincipal: 2,
      storedCommission: 1,
    };
    const first = allocateRefund(1, [source])[0]!;
    const second = allocateRefund(1, [{ ...source, refundedPrincipal: 1 }])[0]!;

    expect(
      first.commissionReversalAmount + second.commissionReversalAmount,
    ).toBeLessThanOrEqual(1);
    expect([
      first.commissionReversalAmount,
      second.commissionReversalAmount,
    ]).toEqual([1, 0]);
  });

  it('preserves source totals across every small refund partition and caller source order', () => {
    const inputOrder = [sources[2]!, sources[0]!, sources[1]!];
    const total = sources.reduce(
      (sum, source) => sum + source.collectedPrincipal,
      0,
    );
    for (const partition of compositions(total)) {
      let current = inputOrder.map((source) => ({ ...source }));
      const principalBySource = new Map<string, number>();
      const commissionBySource = new Map<string, number>();
      for (const amount of partition) {
        const allocation = allocateRefund(amount, current);
        for (const row of allocation) {
          principalBySource.set(
            row.sourceEventId,
            (principalBySource.get(row.sourceEventId) ?? 0) +
              row.principalAmount,
          );
          commissionBySource.set(
            row.sourceEventId,
            (commissionBySource.get(row.sourceEventId) ?? 0) +
              row.commissionReversalAmount,
          );
        }
        current = current.map((source) => ({
          ...source,
          refundedPrincipal: principalBySource.get(source.eventId) ?? 0,
        }));
        for (const source of sources) {
          expect(
            commissionBySource.get(source.eventId) ?? 0,
          ).toBeLessThanOrEqual(source.storedCommission);
        }
      }

      for (const source of sources) {
        expect(principalBySource.get(source.eventId)).toBe(
          source.collectedPrincipal,
        );
        expect(commissionBySource.get(source.eventId)).toBe(
          source.storedCommission,
        );
      }
    }
  });
});
