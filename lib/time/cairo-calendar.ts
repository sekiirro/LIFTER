const CAIRO_TIME_ZONE = 'Africa/Cairo';
const MILLISECONDS_PER_DAY = 86_400_000;

export type CairoDate = string;

const cairoDateFormatter = new Intl.DateTimeFormat(
  'en-CA-u-ca-iso8601-nu-latn',
  {
    timeZone: CAIRO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  },
);

function parseCairoDate(value: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError('Invalid Cairo calendar date');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new RangeError('Invalid Cairo calendar date');
  }

  const check = new Date(0);
  check.setUTCHours(0, 0, 0, 0);
  check.setUTCFullYear(year, month - 1, day);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError('Invalid Cairo calendar date');
  }

  return { year, month, day };
}

function utcDateNumber(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
}

function cairoDateAtMilliseconds(milliseconds: number): CairoDate {
  const parts = cairoDateFormatter.formatToParts(milliseconds);
  const fields = new Map(parts.map(({ type, value }) => [type, value]));
  const year = fields.get('year');
  const month = fields.get('month');
  const day = fields.get('day');
  if (!year || !month || !day)
    throw new RangeError('Unable to resolve Cairo calendar date');
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Returns the Africa/Cairo calendar date containing an instant. */
export function cairoDateAt(instant: Date | string): CairoDate {
  const milliseconds =
    instant instanceof Date ? instant.getTime() : Date.parse(instant);
  if (!Number.isFinite(milliseconds)) throw new RangeError('Invalid instant');
  return cairoDateAtMilliseconds(milliseconds);
}

/**
 * Returns the first existing instant of a Cairo date. Searching the instant
 * timeline handles skipped or repeated local clock times without assuming an
 * offset or treating a calendar day as 24 elapsed hours.
 */
export function cairoDateStart(value: string): string {
  const { year, month, day } = parseCairoDate(value);
  const nominal = utcDateNumber(year, month, day);

  let low = nominal;
  let high = nominal;
  let steps = 0;
  while (cairoDateAtMilliseconds(low) >= value && steps < 16) {
    low -= MILLISECONDS_PER_DAY;
    steps += 1;
  }
  steps = 0;
  while (cairoDateAtMilliseconds(high) < value && steps < 16) {
    high += MILLISECONDS_PER_DAY;
    steps += 1;
  }
  if (
    cairoDateAtMilliseconds(low) >= value ||
    cairoDateAtMilliseconds(high) < value
  ) {
    throw new RangeError('Unable to bracket Cairo calendar date');
  }

  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    if (cairoDateAtMilliseconds(middle) >= value) high = middle;
    else low = middle;
  }
  if (cairoDateAtMilliseconds(high) !== value) {
    throw new RangeError(
      'Cairo calendar date does not exist in the selected time zone',
    );
  }
  return new Date(high).toISOString();
}

/** Adds whole Gregorian calendar days without elapsed-time arithmetic. */
export function addCairoDays(value: string, amount: number): CairoDate {
  const { year, month, day } = parseCairoDate(value);
  if (!Number.isSafeInteger(amount))
    throw new RangeError('Day adjustment must be a safe integer');
  const result = new Date(
    utcDateNumber(year, month, day) + amount * MILLISECONDS_PER_DAY,
  );
  if (!Number.isFinite(result.getTime()))
    throw new RangeError('Cairo date is outside the supported range');
  const resultYear = result.getUTCFullYear();
  if (resultYear < 1 || resultYear > 9999)
    throw new RangeError('Cairo date is outside the supported range');
  return `${String(resultYear).padStart(4, '0')}-${String(result.getUTCMonth() + 1).padStart(2, '0')}-${String(result.getUTCDate()).padStart(2, '0')}`;
}

/** Compares two Cairo dates, returning -1, 0 or 1. */
export function compareCairoDates(left: string, right: string): -1 | 0 | 1 {
  parseCairoDate(left);
  parseCairoDate(right);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Counts date boundaries from the first date up to, but excluding, the second. */
export function daysBetweenCairoDates(start: string, end: string): number {
  const startParts = parseCairoDate(start);
  const endParts = parseCairoDate(end);
  return (
    (utcDateNumber(endParts.year, endParts.month, endParts.day) -
      utcDateNumber(startParts.year, startParts.month, startParts.day)) /
    MILLISECONDS_PER_DAY
  );
}
