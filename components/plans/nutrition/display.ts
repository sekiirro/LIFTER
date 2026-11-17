import { localizeUiDigits } from '../../../lib/i18n/format-digits';
import type { Messages } from '../../../lib/i18n';
import type { Locale } from '../../../lib/design/preferences';
import type { NutritionSnapshotEntry } from '../../../lib/plans/nutrition/macros';
import type { NutritionQuantityUnit } from '../../../lib/plans/nutrition/schema';

/** Display a macro decimal string with the product's digit convention. */
export function macroText(value: string | undefined, locale: Locale): string {
  if (value === undefined) return '';
  const digits = localizeUiDigits(value, locale);
  return locale === 'ar' ? digits.replace('.', '\u066b') : digits;
}

/** Normalize a quantity input back to the canonical decimal string. */
export function normalizeQuantityInput(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x0660),
    )
    .replace(/[\u06f0-\u06f9]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x06f0),
    )
    .replace(/\u066b/g, '.');
}

/** Quantity value for an input field, localized for display. */
export function quantityInputText(value: string, locale: Locale): string {
  return locale === 'ar'
    ? localizeUiDigits(value, locale).replace('.', '\u066b')
    : value;
}

/** Approved unit label for one quantity unit. */
export function unitText(
  unit: NutritionQuantityUnit,
  entry: NutritionSnapshotEntry | undefined,
  locale: Locale,
  messages: Messages,
): string {
  if (unit.kind === 'basis') {
    return unit.value === 'g'
      ? messages['nutritionAlternatives.grams']
      : messages['nutritionAlternatives.milliliters'];
  }
  const labels =
    entry?.kind === 'serving' ? entry.snapshot.serving.labels : undefined;
  return (
    (locale === 'ar'
      ? (labels?.ar ?? labels?.en)
      : (labels?.en ?? labels?.ar)) ?? unit.unitKey
  );
}

/** Authored food name from a snapshot entry, falling back to the other locale. */
export function foodName(
  entry: NutritionSnapshotEntry | undefined,
  locale: Locale,
): string {
  const names = entry
    ? entry.kind === 'basis'
      ? entry.names
      : entry.snapshot.names
    : undefined;
  if (!names) return '';
  return locale === 'ar'
    ? (names.ar ?? names.en ?? '')
    : (names.en ?? names.ar ?? '');
}
