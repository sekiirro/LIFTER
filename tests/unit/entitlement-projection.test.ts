import { describe, expect, it } from 'vitest';
import {
  projectEntitlement,
  type EntitlementProjectionInput,
} from '../../lib/subscriptions/entitlement';

const base: EntitlementProjectionInput = {
  asOfDate: '2026-11-10',
  activationDate: '2026-11-01',
  serviceStartDate: '2026-11-01',
  durationDays: 10,
  freezes: [],
  successorCoverage: [],
  terminalRefund: false,
};

describe('projectEntitlement', () => {
  it('projects awaiting activation, future, active, and exclusive expiry states', () => {
    expect(
      projectEntitlement({
        ...base,
        activationDate: null,
        serviceStartDate: null,
      }),
    ).toMatchObject({ status: 'awaiting_activation' });
    expect(
      projectEntitlement({
        ...base,
        asOfDate: '2026-10-31',
        serviceStartDate: '2026-11-01',
      }).status,
    ).toBe('future');
    expect(projectEntitlement(base).status).toBe('active');
    expect(projectEntitlement({ ...base, asOfDate: '2026-11-11' }).status).toBe(
      'expired',
    );
  });

  it('treats a refund as terminal regardless of remaining service coverage', () => {
    expect(projectEntitlement({ ...base, terminalRefund: true }).status).toBe(
      'refunded',
    );
  });

  it('includes freeze contribution and reports the freeze window without job state', () => {
    const freeze = {
      id: 'freeze-a',
      applyDate: '2026-11-05',
      durationDays: 3,
    };
    expect(
      projectEntitlement({
        ...base,
        asOfDate: '2026-11-06',
        freezes: [freeze],
      }),
    ).toMatchObject({ status: 'frozen', effectiveEndExclusive: '2026-11-14' });
    expect(
      projectEntitlement({ ...base, asOfDate: '2026-11-13', freezes: [freeze] })
        .effectiveEndExclusive,
    ).toBe('2026-11-14');
  });

  it('uses successor coverage to bridge an expired predecessor', () => {
    expect(
      projectEntitlement({
        ...base,
        asOfDate: '2026-11-12',
        successorCoverage: [
          { serviceStartDate: '2026-11-11', serviceEndExclusive: '2026-11-21' },
        ],
      }),
    ).toMatchObject({ status: 'active', coverageEndExclusive: '2026-11-21' });
  });

  it('rejects inconsistent service facts and invalid dates', () => {
    expect(() =>
      projectEntitlement({ ...base, serviceStartDate: null }),
    ).toThrow();
    expect(() => projectEntitlement({ ...base, durationDays: 0 })).toThrow();
  });
});
