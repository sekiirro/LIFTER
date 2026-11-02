import type { Locale } from '../design/preferences';

export function formatDigits(value: string | number, locale: Locale): string {
  const text = String(value);
  if (locale !== 'ar') return text;
  return text.replace(/[0-9]/g, (digit) =>
    new Intl.NumberFormat('ar', {
      useGrouping: false,
      numberingSystem: 'arab',
    }).format(Number(digit)),
  );
}
