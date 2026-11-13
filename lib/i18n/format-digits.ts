import type { Locale } from '../design/preferences';

/** Format UI numbers using the product's Arabic/English digit convention. */
export function formatUiNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(
    locale === 'ar' ? 'ar-u-nu-arab' : 'en-u-nu-latn',
    {
      useGrouping: false,
      maximumFractionDigits: 6,
    },
  ).format(value);
}

export function localizeUiDigits(value: string, locale: Locale): string {
  const digits = Array.from({ length: 10 }, (_, number) =>
    formatUiNumber(number, locale),
  );
  return value.replace(/[0-9]/g, (digit) => digits[Number(digit)]!);
}
