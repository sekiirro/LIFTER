import { describe, expect, it } from 'vitest';
import {
  canManageFreeze,
  calculateFreezeContribution,
  projectFreezeEnd,
  projectFreezeRemoval,
  validateFreezeApply,
  validateFreezeStop,
  type FreezeApplication,
} from '../../lib/subscriptions/freeze-service';

const application: FreezeApplication = {
  id: 'freeze-1',
  applyDate: '2026-11-01',
  durationDays: 10,
};

describe('pure freeze lifecycle validation', () => {
  it.each(['platform_owner', 'workspace_owner', 'trainer', 'sales'] as const)(
    'allows %s to manage freeze lifecycle actions',
    (role) => expect(canManageFreeze(role)).toBe(true),
  );

  it('does not grant freeze lifecycle actions to client or unknown roles', () => {
    expect(canManageFreeze('client')).toBe(false);
    expect(canManageFreeze('unknown')).toBe(false);
  });

  it('requires an authorized role and an activated subscription to apply a freeze', () => {
    expect(() =>
      validateFreezeApply({
        role: 'client',
        activated: true,
        application,
        existingApplications: [],
      }),
    ).toThrow(RangeError);
    expect(() =>
      validateFreezeApply({
        role: 'sales',
        activated: true,
        application: { ...application, stopDate: '2026-11-02' },
        existingApplications: [],
      }),
    ).toThrow(RangeError);
    expect(() =>
      validateFreezeApply({
        role: 'trainer',
        activated: false,
        application,
        existingApplications: [],
      }),
    ).toThrow(RangeError);
  });

  it('enforces the decided 1–30 day duration bounds', () => {
    for (const durationDays of [1, 30]) {
      expect(() =>
        validateFreezeApply({
          role: 'sales',
          activated: true,
          application: { ...application, durationDays },
          existingApplications: [],
        }),
      ).not.toThrow();
    }
    for (const durationDays of [0, 31, 1.5]) {
      expect(() =>
        validateFreezeApply({
          role: 'sales',
          activated: true,
          application: { ...application, durationDays },
          existingApplications: [],
        }),
      ).toThrow(RangeError);
    }
  });

  it('rejects overlapping applications while allowing sequential intervals', () => {
    const existing: FreezeApplication = {
      id: 'freeze-old',
      applyDate: '2026-11-01',
      durationDays: 10,
    };
    expect(() =>
      validateFreezeApply({
        role: 'workspace_owner',
        activated: true,
        application: { ...application, applyDate: '2026-11-10' },
        existingApplications: [existing],
      }),
    ).toThrow(RangeError);
    expect(() =>
      validateFreezeApply({
        role: 'workspace_owner',
        activated: true,
        application: { ...application, applyDate: '2026-11-11' },
        existingApplications: [existing],
      }),
    ).not.toThrow();
  });

  it('validates Stop and keeps its fact separate from the immutable Apply input', () => {
    const stop = validateFreezeStop({
      role: 'trainer',
      application,
      stopDate: '2026-11-03',
    });
    expect(stop).toEqual({ applicationId: 'freeze-1', stopDate: '2026-11-03' });
    expect(application).toEqual({
      id: 'freeze-1',
      applyDate: '2026-11-01',
      durationDays: 10,
    });
    expect(
      calculateFreezeContribution({ ...application, stopDate: stop.stopDate }),
    ).toBe(2);
    expect(() =>
      validateFreezeStop({
        role: 'client',
        application,
        stopDate: '2026-11-03',
      }),
    ).toThrow(RangeError);
    expect(() =>
      validateFreezeStop({
        role: 'sales',
        application,
        stopDate: '2026-11-12',
      }),
    ).toThrow(RangeError);
  });

  it('credits Apply on a same-day Stop and does not count the Stop day', () => {
    expect(
      calculateFreezeContribution({ ...application, stopDate: '2026-11-01' }),
    ).toBe(1);
    expect(
      calculateFreezeContribution({ ...application, stopDate: '2026-11-02' }),
    ).toBe(1);
  });
});

describe('freeze entitlement projections', () => {
  it('projects planned contribution, stopped contribution, and removed contribution without editing facts', () => {
    const stopped = { ...application, stopDate: '2026-11-03' };
    const original = Object.freeze({ ...stopped });
    expect(calculateFreezeContribution(application)).toBe(10);
    expect(calculateFreezeContribution(stopped)).toBe(2);
    expect(calculateFreezeContribution({ ...application, removed: true })).toBe(
      0,
    );
    expect(original).toEqual(stopped);
  });

  it('extends the base end by counted freeze days exactly once', () => {
    expect(
      projectFreezeEnd('2026-11-20', [
        application,
        { id: 'freeze-2', applyDate: '2026-11-11', durationDays: 3 },
      ]),
    ).toEqual({ effectiveEndExclusive: '2026-12-03', extensionDays: 13 });
  });

  it('removes only the selected contribution and clamps to today and delivered access', () => {
    expect(
      projectFreezeRemoval({
        role: 'platform_owner',
        baseEndExclusive: '2026-11-20',
        freezes: [
          application,
          { id: 'freeze-2', applyDate: '2026-11-11', durationDays: 3 },
        ],
        freezeId: 'freeze-1',
        removeDate: '2026-11-25',
        latestDeliveredAccessEndExclusive: '2026-11-30',
      }),
    ).toEqual({
      status: 'removed',
      effectiveEndExclusive: '2026-11-30',
      remainingExtensionDays: 3,
    });
  });

  it('clamps a removed expired term through the next Cairo date', () => {
    expect(
      projectFreezeRemoval({
        role: 'sales',
        baseEndExclusive: '2026-11-01',
        freezes: [application],
        freezeId: 'freeze-1',
        removeDate: '2026-11-25',
        latestDeliveredAccessEndExclusive: null,
      }),
    ).toMatchObject({ status: 'removed', effectiveEndExclusive: '2026-11-26' });
  });

  it('rejects Remove that would move a started or delivered successor service start', () => {
    for (const state of [
      { successorHasStarted: true, successorHasDeliveredAccess: false },
      { successorHasStarted: false, successorHasDeliveredAccess: true },
    ]) {
      expect(
        projectFreezeRemoval({
          role: 'workspace_owner',
          baseEndExclusive: '2026-11-20',
          freezes: [application],
          freezeId: 'freeze-1',
          removeDate: '2026-11-25',
          latestDeliveredAccessEndExclusive: null,
          successor: {
            recordingDate: '2026-11-15',
            currentServiceStartDate: '2026-11-30',
            ...state,
          },
        }),
      ).toEqual({ status: 'conflict' });
    }
  });

  it('rejects removal of a missing or already removed immutable freeze fact', () => {
    const removed = { ...application, removed: true };
    expect(() =>
      projectFreezeRemoval({
        role: 'sales',
        baseEndExclusive: '2026-11-20',
        freezes: [removed],
        freezeId: 'freeze-1',
        removeDate: '2026-11-25',
        latestDeliveredAccessEndExclusive: null,
      }),
    ).toThrow(RangeError);
    expect(() =>
      projectFreezeRemoval({
        role: 'client',
        baseEndExclusive: '2026-11-20',
        freezes: [application],
        freezeId: 'freeze-1',
        removeDate: '2026-11-25',
        latestDeliveredAccessEndExclusive: null,
      }),
    ).toThrow(RangeError);
    expect(() =>
      projectFreezeRemoval({
        role: 'sales',
        baseEndExclusive: '2026-11-20',
        freezes: [application],
        freezeId: 'freeze-1',
        removeDate: '2026-10-31',
        latestDeliveredAccessEndExclusive: null,
      }),
    ).toThrow(RangeError);
    expect(() =>
      projectFreezeRemoval({
        role: 'sales',
        baseEndExclusive: '2026-11-20',
        freezes: [],
        freezeId: 'missing',
        removeDate: '2026-11-25',
        latestDeliveredAccessEndExclusive: null,
      }),
    ).toThrow(RangeError);
  });

  it('keeps the original freeze facts unchanged after removal projection', () => {
    const freeze = Object.freeze({ ...application });
    projectFreezeRemoval({
      role: 'trainer',
      baseEndExclusive: '2026-11-20',
      freezes: [freeze],
      freezeId: 'freeze-1',
      removeDate: '2026-11-25',
      latestDeliveredAccessEndExclusive: null,
    });
    expect(freeze).toEqual(application);
  });
});
