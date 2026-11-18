import type { Locale } from '../../lib/design/preferences';
import { numberingLocale } from '../../lib/i18n/format';

/** Formats an F13 `YYYY-MM-DD` Cairo calendar date without shifting it. */
export function formatCalendarDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(numberingLocale(locale), {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

/** Formats an immutable publication instant in Africa/Cairo. */
export function formatPublishedAt(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(numberingLocale(locale), {
    dateStyle: 'medium',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}

export function formatCount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(numberingLocale(locale), {
    useGrouping: false,
  }).format(value);
}
