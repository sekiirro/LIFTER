import type { Locale } from '../design/preferences';
import { formatUiNumber } from '../i18n/format-digits';
import { interpolateNumbers } from '../i18n/format';

/**
 * Approved-results month label (S55-PO-11): it names the month of the
 * approved result, never "this month", so older winners kept visible while a
 * successor awaits approval are not misdescribed.
 */
export function formatResultsMonth(
  periodMonth: string,
  template: string,
  locale: Locale,
): string {
  const match = /^(\d{4})-(\d{2})-01$/u.exec(periodMonth);
  if (!match) throw new RangeError('Invalid result month');
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const month = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
  return template
    .replace('{month}', month)
    .replace('{year}', formatUiNumber(year, locale));
}

export function formatRankLabel(
  rank: number,
  template: string,
  locale: Locale,
): string {
  return interpolateNumbers(template, { rank }, locale);
}

export function formatQualifyingCount(
  count: number,
  template: string,
  locale: Locale,
): string {
  return interpolateNumbers(template, { count }, locale);
}
