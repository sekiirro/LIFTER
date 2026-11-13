import type { Locale } from '../design/preferences';

export function numberingLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-u-nu-arab' : 'en-u-nu-latn';
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
