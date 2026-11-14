import { describe, expect, it } from 'vitest';
import {
  checkInDueDates,
  checkInDueIndex,
  checkInReminders,
  dueCheckInReminders,
  isFrozenOn,
  localHourInstant,
} from '../../lib/progress-coaching/checkins/schedule';
import { addCairoDays } from '../../lib/time/cairo-calendar';

const day0 = '2026-11-02';
const day = (n: number) => addCairoDays(day0, n);

describe('weekly check-in schedule (FR-001, FR-002, SC-001, SC-002)', () => {
  it('assigns the first check-in on day 7 and then every 7 days', () => {
    expect(checkInDueIndex(day0, day(7))).toBe(1);
    expect(checkInDueIndex(day0, day(14))).toBe(2);
    expect(checkInDueIndex(day0, day(21))).toBe(3);
    for (const n of [0, 1, 6, 8, 13, 15])
      expect(checkInDueIndex(day0, day(n))).toBeNull();
    expect(checkInDueDates(day0, 3)).toEqual([day(7), day(14), day(21)]);
  });

  it('includes Fridays as due days', () => {
    // 2026-11-06 is a Friday; activation on 2026-10-30 makes it day 7.
    const fridayDue = checkInDueIndex('2026-10-30', '2026-11-06');
    expect(new Date('2026-11-06T12:00:00Z').getUTCDay()).toBe(5);
    expect(fridayDue).toBe(1);
  });

  it('shifts the cycle by frozen days with no catch-up (3-day freeze from day 5)', () => {
    const freezes = [{ appliedOn: day(5), days: 3 }];
    expect(isFrozenOn(day(5), freezes)).toBe(true);
    expect(isFrozenOn(day(7), freezes)).toBe(true);
    expect(isFrozenOn(day(8), freezes)).toBe(false);
    expect(checkInDueIndex(day0, day(7), freezes)).toBeNull();
    expect(checkInDueDates(day0, 2, freezes)).toEqual([day(10), day(17)]);
    // No catch-up: exactly one check-in occurs between day 0 and day 16.
    const due = Array.from({ length: 16 }, (_, i) => day(i + 1)).filter(
      (d) => checkInDueIndex(day0, d, freezes) !== null,
    );
    expect(due).toEqual([day(10)]);
  });

  it('handles a freeze that starts and ends within one 7-day window', () => {
    const freezes = [{ appliedOn: day(2), days: 2 }];
    expect(checkInDueDates(day0, 2, freezes)).toEqual([day(9), day(16)]);
  });

  it('ignores removed freezes (zero effective days)', () => {
    expect(checkInDueDates(day0, 1, [{ appliedOn: day(3), days: 0 }])).toEqual([
      day(7),
    ]);
  });
});

describe('check-in reminders at 10:00 workspace time (FR-006, FR-007, FR-009, SC-003)', () => {
  it('computes 10:00 Africa/Cairo instants including DST', () => {
    // November: Cairo is UTC+2.
    expect(localHourInstant('2026-11-09', 10)).toBe('2026-11-09T08:00:00.000Z');
    // July: Cairo observes DST (UTC+3).
    expect(localHourInstant('2026-07-15', 10)).toBe('2026-07-15T07:00:00.000Z');
  });

  it('schedules the due-day reminder and a follow-up 24 hours later with dedupe keys', () => {
    const reminders = checkInReminders('a-1', '2026-11-09');
    expect(reminders).toEqual([
      {
        kind: 'day_of',
        sendAt: '2026-11-09T08:00:00.000Z',
        dedupeKey: 'checkin-reminder:a-1:day_of',
      },
      {
        kind: 'followup',
        sendAt: '2026-11-10T08:00:00.000Z',
        dedupeKey: 'checkin-reminder:a-1:followup',
      },
    ]);
  });

  it('sends nothing once submitted or while frozen, and never twice', () => {
    const base = {
      assignmentId: 'a-1',
      dueDate: '2026-11-09',
      now: '2026-11-10T09:00:00.000Z',
      submitted: false,
      frozen: false,
      alreadySent: [] as string[],
    };
    expect(dueCheckInReminders(base).map((r) => r.kind)).toEqual([
      'day_of',
      'followup',
    ]);
    expect(
      dueCheckInReminders({ ...base, now: '2026-11-09T07:59:59.000Z' }),
    ).toEqual([]);
    expect(dueCheckInReminders({ ...base, submitted: true })).toEqual([]);
    expect(dueCheckInReminders({ ...base, frozen: true })).toEqual([]);
    expect(
      dueCheckInReminders({
        ...base,
        alreadySent: ['checkin-reminder:a-1:day_of'],
      }).map((r) => r.kind),
    ).toEqual(['followup']);
  });
});
