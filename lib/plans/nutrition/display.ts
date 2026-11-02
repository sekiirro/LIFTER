import type { Locale } from '../../design/preferences';
import { formatDigits } from '../../i18n/format-digits';

export type NutritionMacroDisplayName =
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'fiber';

// RED stub: the previous integer-only display rule.
export function formatMacroGrams(value: string, locale: Locale = 'en'): string {
  return formatDigits(String(Math.round(Number(value))), locale);
}

export function formatNutritionMacroDisplay(
  value: string,
  name: NutritionMacroDisplayName,
  locale: Locale = 'en',
): string {
  if (name === 'calories') {
    return formatDigits(String(Math.round(Number(value))), locale);
  }
  return formatMacroGrams(value, locale);
}
