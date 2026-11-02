import type { Locale } from '../../design/preferences';
import { formatDigits } from '../../i18n/format-digits';

export type NutritionMacroDisplayName =
  'calories' | 'protein' | 'carbs' | 'fat' | 'fiber';

const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const GRAM_DECIMAL_THRESHOLD = 10n;

type ParsedDecimal = {
  coefficient: bigint;
  scale: number;
};

function parseDecimal(value: string): ParsedDecimal {
  const text = value.trim();
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) {
    throw new RangeError(
      `macro display value ${value} is not a non-negative canonical decimal`,
    );
  }

  const [whole = '0', fraction = ''] = text.split('.');
  return {
    coefficient:
      BigInt(whole) * 10n ** BigInt(fraction.length) + BigInt(fraction || '0'),
    scale: fraction.length,
  };
}

function roundScaledHalfUp(value: ParsedDecimal, extraScale: number): bigint {
  const numerator = value.coefficient * 10n ** BigInt(extraScale);
  const denominator = 10n ** BigInt(value.scale);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

function formatGramDecimal(value: string): string {
  const parsed = parseDecimal(value);
  const belowThreshold =
    parsed.coefficient < GRAM_DECIMAL_THRESHOLD * 10n ** BigInt(parsed.scale);

  if (!belowThreshold) return roundScaledHalfUp(parsed, 0).toString();

  const tenths = roundScaledHalfUp(parsed, 1);
  if (tenths === 0n) return '0';
  if (tenths >= 100n) return (tenths / 10n).toString();
  return `${tenths / 10n}.${tenths % 10n}`;
}

function formatIntegerDecimal(value: string): string {
  return roundScaledHalfUp(parseDecimal(value), 0).toString();
}

/**
 * S27-PO-2 display rule: macro grams below 10 g show one decimal, values at or
 * above 10 g show an integer. Rounding is half-up at display time only.
 */
export function formatMacroGrams(value: string, locale: Locale = 'en'): string {
  return formatDigits(formatGramDecimal(value), locale);
}

export function formatNutritionMacroDisplay(
  value: string,
  name: NutritionMacroDisplayName,
  locale: Locale = 'en',
): string {
  const formatted =
    name === 'calories'
      ? formatIntegerDecimal(value)
      : formatGramDecimal(value);
  return formatDigits(formatted, locale);
}
