const CAIRO_TIME_ZONE = 'Africa/Cairo';
const RULE_ID = 'cairo-d03-v1';
const MINUTE_MS = 60_000;

export type CairoD03Deadline = {
  ruleId: typeof RULE_ID;
  startDate: string;
  dayFiveDate: string;
  deadlineAt: string;
};

const cairoParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAIRO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function partsAt(instant: number): Record<string, string> {
  return Object.fromEntries(
    cairoParts
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== 'literal')
      .map(({ type, value }) => [type, value]),
  );
}

function dateAt(instant: number): string {
  const parts = partsAt(instant);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateParts(date: string): [number, number, number] {
  return date.split('-').map(Number) as [number, number, number];
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = dateParts(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return [
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  ]
    .map((part, index) =>
      index === 0
        ? String(part).padStart(4, '0')
        : String(part).padStart(2, '0'),
    )
    .join('-');
}

function weekday(date: string): number {
  const [year, month, day] = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function nextWorkingDate(date: string): string {
  let next = shiftDate(date, 1);
  while (weekday(next) === 5) next = shiftDate(next, 1);
  return next;
}

function firstValidInstantOfDate(date: string): number {
  const [year, month, day] = dateParts(date);
  const utcMidnight = Date.UTC(year, month - 1, day);
  const from = utcMidnight - 36 * 60 * MINUTE_MS;
  const until = utcMidnight + 36 * 60 * MINUTE_MS;

  let previous = from;
  for (let candidate = from; candidate <= until; candidate += MINUTE_MS) {
    if (dateAt(candidate) !== date) {
      previous = candidate;
      continue;
    }

    let low = previous;
    let high = candidate;
    while (high - low > 1) {
      const middle = low + Math.floor((high - low) / 2);
      if (dateAt(middle) === date) high = middle;
      else low = middle;
    }
    return high;
  }

  throw new RangeError(
    `No valid ${CAIRO_TIME_ZONE} instant exists for ${date}`,
  );
}

/** Calculates the fixed F15 D-03 deadline from a submitted instant. */
export function calculateCairoD03Deadline(
  submittedAt: string,
): CairoD03Deadline {
  const submittedInstant = Date.parse(submittedAt);
  if (!Number.isFinite(submittedInstant))
    throw new TypeError('submittedAt must be a valid instant');

  const submittedParts = partsAt(submittedInstant);
  const submittedDate = `${submittedParts.year}-${submittedParts.month}-${submittedParts.day}`;
  const submittedTime =
    Number(submittedParts.hour) * 60 + Number(submittedParts.minute);
  let startDate = submittedDate;
  if (weekday(startDate) === 5 || submittedTime >= 18 * 60) {
    startDate = nextWorkingDate(startDate);
  }

  let dayFiveDate = startDate;
  let workingDays = 0;
  while (workingDays < 5) {
    if (weekday(dayFiveDate) !== 5) workingDays += 1;
    if (workingDays < 5) dayFiveDate = shiftDate(dayFiveDate, 1);
  }

  const deadlineDate = shiftDate(dayFiveDate, 1);
  return {
    ruleId: RULE_ID,
    startDate,
    dayFiveDate,
    deadlineAt: new Date(firstValidInstantOfDate(deadlineDate)).toISOString(),
  };
}
