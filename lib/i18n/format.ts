import type { Locale } from '../design/preferences';

export function numberingLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-u-nu-arab' : 'en-u-nu-latn';
}

/** Cairo date/time for instants such as workforce recorded_at and opened_at. */
export function formatCairoDateTime(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(numberingLocale(locale), {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(numberingLocale(locale), {
    useGrouping: false,
    maximumFractionDigits: 2,
  }).format(value);
}

export function interpolateNumbers(
  message: string,
  values: Record<string, number>,
  locale: Locale,
): string {
  return message.replace(/\{([a-zA-Z]+)\}/g, (placeholder, key: string) => {
    const value = values[key];
    return value === undefined ? placeholder : formatNumber(value, locale);
  });
}
