import { describe, expect, it } from 'vitest';
import { getClientReminderSchedule } from '../../lib/forms/staff-policy';

describe('F15 client-late reminder schedule', () => {
  it('notifies owners at the deadline and keeps client-late separate from D-03', () => {
    const schedule = (
      getClientReminderSchedule as (deadline: string) => Record<string, unknown>
    )('2026-02-01T10:00:00.000Z');
    expect(schedule).toEqual({
      firstAt: '2026-02-01T10:00:00.000Z',
      firstAudience: 'owners',
      reassignmentResetsClock: false,
      trainerLatePolicy: 'd03',
    });
  });
});
