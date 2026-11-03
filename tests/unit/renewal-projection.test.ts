import { describe, expect, it } from 'vitest';
import {
  assertNoUnstartedRenewal,
  projectRenewalDates,
  reprojectUnstartedRenewal,
} from '../../lib/subscriptions/renewal-dates';
import {
  projectCoverage,
  type CoverageInterval,
} from '../../lib/subscriptions/entitlement';

describe('renewal date projection', () => {
  it('separates renewal recording/activation from an early service start', () => {
    expect(
      projectRenewalDates({
        recordingDate: '2026-11-01',
        initialActivationDate: '2026-10-01',
        predecessorCoverageEndExclusive: '2026-11-11',
        durationDays: 30,
        installmentOffsetsDays: [0, 30],
      }),
    ).toEqual({
      recordingDate: '2026-11-01',
      serviceStartDate: '2026-11-11',
      serviceEndExclusive: '2026-12-11',
      installmentDueDates: ['2026-11-01', '2026-12-01'],
    });
  });

  it('starts a late renewal on its Cairo recording date', () => {
    expect(
      projectRenewalDates({
        recordingDate: '2026-11-05',
        initialActivationDate: '2026-10-01',
        predecessorCoverageEndExclusive: '2026-11-01',
        durationDays: 30,
        installmentOffsetsDays: [0, 30],
      }).serviceStartDate,
    ).toBe('2026-11-05');
  });

  it('anchors each issued installment offset to recording date', () => {
    const result = projectRenewalDates({
      recordingDate: '2028-02-28',
      initialActivationDate: '2028-01-01',
      predecessorCoverageEndExclusive: '2028-03-10',
      durationDays: 30,
      installmentOffsetsDays: [0, 2, 30],
    });
    expect(result.installmentDueDates).toEqual([
      '2028-02-28',
      '2028-03-01',
      '2028-03-29',
    ]);
    expect(result.serviceStartDate).toBe('2028-03-10');
  });

  it('denies projection before initial activation', () => {
    expect(() =>
      projectRenewalDates({
        recordingDate: '2026-11-01',
        initialActivationDate: null,
        predecessorCoverageEndExclusive: null,
        durationDays: 30,
        installmentOffsetsDays: [0],
      }),
    ).toThrow(RangeError);
  });

  it('rejects more than one unstarted renewal', () => {
    expect(() => assertNoUnstartedRenewal(0)).not.toThrow();
    expect(() => assertNoUnstartedRenewal(1)).toThrow(RangeError);
    expect(() => assertNoUnstartedRenewal(2)).toThrow(RangeError);
  });
});

describe('renewal coverage projection', () => {
  it('merges contiguous predecessor and early-renewal coverage without losing remaining days', () => {
    const predecessor: CoverageInterval = {
      serviceStartDate: '2026-11-01',
      serviceEndExclusive: '2026-11-11',
    };
    const renewal = projectRenewalDates({
      recordingDate: '2026-11-01',
      initialActivationDate: '2026-10-01',
      predecessorCoverageEndExclusive: predecessor.serviceEndExclusive,
      durationDays: 30,
      installmentOffsetsDays: [0],
    });
    expect(
      projectCoverage([
        predecessor,
        {
          serviceStartDate: renewal.serviceStartDate,
          serviceEndExclusive: renewal.serviceEndExclusive,
        },
      ]),
    ).toEqual([
      { serviceStartDate: '2026-11-01', serviceEndExclusive: '2026-12-11' },
    ]);
  });

  it('preserves gaps instead of granting renewal grace', () => {
    expect(
      projectCoverage([
        { serviceStartDate: '2026-11-01', serviceEndExclusive: '2026-11-11' },
        { serviceStartDate: '2026-11-13', serviceEndExclusive: '2026-12-13' },
      ]),
    ).toEqual([
      { serviceStartDate: '2026-11-01', serviceEndExclusive: '2026-11-11' },
      { serviceStartDate: '2026-11-13', serviceEndExclusive: '2026-12-13' },
    ]);
  });

  it('shifts an unstarted successor when predecessor coverage extends and keeps PO-2 dues fixed', () => {
    const input = {
      recordingDate: '2026-11-01',
      initialActivationDate: '2026-10-01',
      predecessorCoverageEndExclusive: '2026-11-11',
      durationDays: 30,
      installmentOffsetsDays: [0, 30],
    };
    const current = projectRenewalDates(input);
    expect(
      reprojectUnstartedRenewal({
        renewal: input,
        currentServiceStartDate: current.serviceStartDate,
        updatedPredecessorCoverageEndExclusive: '2026-11-14',
        successorHasStarted: false,
        successorHasDeliveredAccess: false,
      }),
    ).toEqual({
      status: 'reprojected',
      dates: {
        ...current,
        serviceStartDate: '2026-11-14',
        serviceEndExclusive: '2026-12-14',
      },
    });
  });

  it.each([
    ['started', true, false],
    ['delivered', false, true],
  ] as const)(
    'returns a conflict instead of shifting a %s successor',
    (_state, started, delivered) => {
      const renewal = {
        recordingDate: '2026-11-01',
        initialActivationDate: '2026-10-01',
        predecessorCoverageEndExclusive: '2026-11-11',
        durationDays: 30,
        installmentOffsetsDays: [0],
      };
      const current = projectRenewalDates(renewal);
      expect(
        reprojectUnstartedRenewal({
          renewal,
          currentServiceStartDate: current.serviceStartDate,
          updatedPredecessorCoverageEndExclusive: '2026-11-14',
          successorHasStarted: started,
          successorHasDeliveredAccess: delivered,
        }),
      ).toEqual({ status: 'conflict' });
    },
  );

  it('allows an unchanged successor projection after it has started', () => {
    const renewal = {
      recordingDate: '2026-11-01',
      initialActivationDate: '2026-10-01',
      predecessorCoverageEndExclusive: '2026-11-11',
      durationDays: 30,
      installmentOffsetsDays: [0],
    };
    const current = projectRenewalDates(renewal);
    expect(
      reprojectUnstartedRenewal({
        renewal,
        currentServiceStartDate: current.serviceStartDate,
        updatedPredecessorCoverageEndExclusive: '2026-11-11',
        successorHasStarted: true,
        successorHasDeliveredAccess: false,
      }).status,
    ).toBe('reprojected');
  });
});
