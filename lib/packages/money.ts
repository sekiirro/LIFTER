import { parsePrice } from './validation';
import { formatNumber, numberingLocale } from '../i18n/format';
type Locale = 'ar' | 'en';
// Runtime metadata is descriptive formatting, never an allowed-currency policy.
function exponent(currency: string): number | null {
  if (!Intl.supportedValuesOf('currency').includes(currency)) return null;
  return (
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? null
  );
}
function localDigits(value: string, locale: Locale): string {
  const digits = Array.from({ length: 10 }, (_, n) => formatNumber(n, locale));
  return value.replace(/[0-9]/g, (n) => digits[Number(n)]!);
}
export function formatMinorUnits(
  priceMinor: string | bigint,
  currency: string,
  locale: Locale,
): string {
  const exact = parsePrice(priceMinor);
  if (exact === null || !/^[A-Z]{3}$/.test(currency))
    throw new RangeError('invalid_input');
  const amount = BigInt(exact);
  const places = exponent(currency);
  if (places === null) {
    const text = `${new Intl.NumberFormat(locale).format(amount)} ${locale === 'ar' ? 'وحدات صغرى' : 'minor units'} ${currency}`;
    return locale === 'ar' ? `\u2068${text}\u2069` : text;
  }
  const scale = 10n ** BigInt(places);
  const integer = new Intl.NumberFormat(numberingLocale(locale), {
    maximumFractionDigits: 0,
  }).format(amount / scale);
  const separator =
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((p) => p.type === 'decimal')?.value ?? '.';
  const fraction = places
    ? separator +
      localDigits(String(amount % scale).padStart(places, '0'), locale)
    : '';
  const text = `${integer}${fraction} ${currency}`;
  return locale === 'ar' ? `\u2068${text}\u2069` : text;
}
export function formatCommission(rate: number, locale: Locale): string {
  if (!Number.isInteger(rate) || rate < 0 || rate > 10000)
    throw new RangeError('invalid_input');
  const text = `${Math.floor(rate / 100)}.${String(rate % 100).padStart(2, '0')}%`;
  return locale === 'ar' ? `\u2068${localDigits(text, locale)}\u2069` : text;
}
