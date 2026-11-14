import {
  addCairoDays,
  compareCairoDates,
  daysBetweenCairoDates,
} from '../../time/cairo-calendar';
import {
  CHECKIN_INTERVAL_ACTIVE_DAYS,
  CHECKIN_REMINDER_HOUR,
  WORKSPACE_TIME_ZONE,
} from '../constants';

/** One effective F13 freeze: Apply date counted, `days` consecutive frozen days. */
export type EffectiveFreeze = { appliedOn: string; days: number };

export function isFrozenOn(
  day: string,
  freezes: readonly EffectiveFreeze[],
): boolean {
  return freezes.some(
    (freeze) =>
      freeze.days > 0 &&
      compareCairoDates(freeze.appliedOn, day) <= 0 &&
      compareCairoDates(day, addCairoDays(freeze.appliedOn, freeze.days)) < 0,
  );
}

/**
 * Pure mirror of `app_private.f23_checkin_due_index`: the check-in index due on
 * `day`, or null. Occurrence n is due when the client reaches 7n non-frozen days
 * after the activation anchor (FR-001/FR-002). Frozen days shift the cycle; a
 * frozen day is never due, and missed days are never caught up.
 */
export function checkInDueIndex(
  anchor: string,
  day: string,
  freezes: readonly EffectiveFreeze[] = [],
): number | null {
  if (compareCairoDates(day, anchor) <= 0 || isFrozenOn(day, freezes))
    return null;
  const span = daysBetweenCairoDates(anchor, day);
  let active = 0;
  for (let offset = 1; offset <= span; offset += 1)
    if (!isFrozenOn(addCairoDays(anchor, offset), freezes)) active += 1;
  return active > 0 && active % CHECKIN_INTERVAL_ACTIVE_DAYS === 0
    ? active / CHECKIN_INTERVAL_ACTIVE_DAYS
    : null;
}

/** Lists due dates for the first `count` check-ins (test/support helper). */
export function checkInDueDates(
  anchor: string,
  count: number,
  freezes: readonly EffectiveFreeze[] = [],
): string[] {
  const dates: string[] = [];
  let day = anchor;
  // Bounded walk: every frozen day delays at most one day.
  const limit =
    count * CHECKIN_INTERVAL_ACTIVE_DAYS +
    freezes.reduce((sum, freeze) => sum + Math.max(0, freeze.days), 0) +
    1;
  for (let step = 0; step < limit && dates.length < count; step += 1) {
    day = addCairoDays(day, 1);
    if (checkInDueIndex(anchor, day, freezes) !== null) dates.push(day);
  }
  return dates;
}

function offsetMinutesAt(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instantMs);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  return Math.round((asUtc - Math.floor(instantMs / 1000) * 1000) / 60000);
}

/** The instant of `hour`:00 local time on a calendar date in `timeZone`. */
export function localHourInstant(
  day: string,
  hour: number,
  timeZone: string = WORKSPACE_TIME_ZONE,
): string {
  const [year, month, date] = day.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const nominal = Date.UTC(year, month - 1, date, hour, 0, 0);
  let instant = nominal - offsetMinutesAt(nominal, timeZone) * 60000;
  instant = nominal - offsetMinutesAt(instant, timeZone) * 60000;
  return new Date(instant).toISOString();
}

export type CheckInReminder = {
  kind: 'day_of' | 'followup';
  sendAt: string;
  dedupeKey: string;
};

/**
 * FR-006/FR-007: reminder on the due day and a follow-up 24 hours later, both
 * at 10:00 workspace time. The follow-up applies only while unanswered.
 */
export function checkInReminders(
  assignmentId: string,
  dueDate: string,
  timeZone: string = WORKSPACE_TIME_ZONE,
): CheckInReminder[] {
  return [
    {
      kind: 'day_of',
      sendAt: localHourInstant(dueDate, CHECKIN_REMINDER_HOUR, timeZone),
      dedupeKey: `checkin-reminder:${assignmentId}:day_of`,
    },
    {
      kind: 'followup',
      sendAt: localHourInstant(
        addCairoDays(dueDate, 1),
        CHECKIN_REMINDER_HOUR,
        timeZone,
      ),
      dedupeKey: `checkin-reminder:${assignmentId}:followup`,
    },
  ];
}

/** Reminders still owed at `now`: unanswered, and never for a frozen client (FR-009). */
export function dueCheckInReminders(input: {
  assignmentId: string;
  dueDate: string;
  now: string;
  submitted: boolean;
  frozen: boolean;
  alreadySent: readonly string[];
  timeZone?: string;
}): CheckInReminder[] {
  if (input.submitted || input.frozen) return [];
  const now = Date.parse(input.now);
  return checkInReminders(input.assignmentId, input.dueDate, input.timeZone)
    .filter((reminder) => Date.parse(reminder.sendAt) <= now)
    .filter((reminder) => !input.alreadySent.includes(reminder.dedupeKey));
}
