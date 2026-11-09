import { describe, expect, it } from 'vitest';

import {
  calculateCairoClientSubmissionDeadline,
  calculateClientLateAlertSchedule,
} from '../../lib/forms/cairo-deadline';

describe('calculateCairoClientSubmissionDeadline', () => {
  it('uses assignment day as day zero and ends on the third following Cairo date', () => {
    expect(
      calculateCairoClientSubmissionDeadline('2026-10-29T20:59:59.999Z'),
    ).toEqual({
      assignedDate: '2026-10-29',
      deadlineDate: '2026-11-01',
      deadlineAt: '2026-11-01T21:59:59.999Z',
      daysAfterAssignment: 3,
    });
  });

  it('uses Cairo local date when assignment falls just before and after Cairo midnight', () => {
    expect(
      calculateCairoClientSubmissionDeadline('2026-06-14T20:59:59.999Z'),
    ).toMatchObject({ assignedDate: '2026-06-14', deadlineDate: '2026-06-17' });
    expect(
      calculateCairoClientSubmissionDeadline('2026-06-14T21:00:00.000Z'),
    ).toMatchObject({ assignedDate: '2026-06-15', deadlineDate: '2026-06-18' });
    expect(
      calculateCairoClientSubmissionDeadline('2026-06-14T20:59:59.998Z'),
    ).toMatchObject({ assignedDate: '2026-06-14', deadlineDate: '2026-06-17' });
    expect(
      calculateCairoClientSubmissionDeadline('2026-10-29T20:59:59.999Z'),
    ).toMatchObject({ assignedDate: '2026-10-29', deadlineDate: '2026-11-01' });
  });

  it('supports 1 and 14 Cairo calendar days, including an explicit default of 3', () => {
    expect(
      calculateCairoClientSubmissionDeadline('2026-06-14T21:00:00.000Z', 1),
    ).toMatchObject({ deadlineDate: '2026-06-16', daysAfterAssignment: 1 });
    expect(
      calculateCairoClientSubmissionDeadline('2026-06-14T21:00:00.000Z', 14),
    ).toMatchObject({ deadlineDate: '2026-06-29', daysAfterAssignment: 14 });
    expect(
      calculateCairoClientSubmissionDeadline('2026-06-14T21:00:00.000Z'),
    ).toMatchObject({ deadlineDate: '2026-06-18', daysAfterAssignment: 3 });
  });

  it('counts calendar boundaries, leap dates, and Cairo DST gap/fold using local dates', () => {
    expect(
      calculateCairoClientSubmissionDeadline('2026-12-30T12:00:00.000Z'),
    ).toMatchObject({ assignedDate: '2026-12-30', deadlineDate: '2027-01-02' });
    expect(
      calculateCairoClientSubmissionDeadline('2028-02-27T12:00:00.000Z'),
    ).toMatchObject({ assignedDate: '2028-02-27', deadlineDate: '2028-03-01' });
    expect(
      calculateCairoClientSubmissionDeadline('2023-04-27T12:00:00.000Z', 1),
    ).toEqual({
      assignedDate: '2023-04-27',
      deadlineDate: '2023-04-28',
      deadlineAt: '2023-04-28T20:59:59.999Z',
      daysAfterAssignment: 1,
    });
    expect(
      calculateCairoClientSubmissionDeadline('2023-04-27T21:30:00.000Z', 1),
    ).toEqual({
      assignedDate: '2023-04-27',
      deadlineDate: '2023-04-28',
      deadlineAt: '2023-04-28T20:59:59.999Z',
      daysAfterAssignment: 1,
    });
    expect(
      calculateCairoClientSubmissionDeadline('2023-10-25T12:00:00.000Z', 1),
    ).toMatchObject({
      assignedDate: '2023-10-25',
      deadlineDate: '2023-10-26',
      deadlineAt: '2023-10-26T21:59:59.999Z',
    });
  });

  it.each([0, 15, 1.5, Number.NaN])(
    'rejects invalid configurable day count %s',
    (days) => {
      expect(() =>
        calculateCairoClientSubmissionDeadline(
          '2026-10-29T12:00:00.000Z',
          days,
        ),
      ).toThrow();
    },
  );

  it('rejects invalid assignment instants', () => {
    expect(() =>
      calculateCairoClientSubmissionDeadline('not-an-instant'),
    ).toThrow();
  });
});

describe('calculateClientLateAlertSchedule', () => {
  it('notifies owners at the configured deadline with no delayed stage', () => {
    expect(
      calculateClientLateAlertSchedule('2026-10-29T21:59:59.999Z'),
    ).toEqual({
      ownersAt: '2026-10-29T21:59:59.999Z',
      reassignmentResetsClock: false,
    });
  });

  it('keeps the owner notice instant anchored to the original deadline', () => {
    const schedule = calculateClientLateAlertSchedule(
      '2023-04-27T20:59:59.999Z',
    );
    expect(schedule).toEqual({
      ownersAt: '2023-04-27T20:59:59.999Z',
      reassignmentResetsClock: false,
    });
  });

  it('rejects an invalid deadline', () => {
    expect(() => calculateClientLateAlertSchedule('bad')).toThrow();
  });
});
