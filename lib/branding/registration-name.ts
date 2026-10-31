import type { Locale } from '../design/preferences';

type LocalizedName = { ar: string; en: string };

export function registrationBrandName(
  name: LocalizedName | undefined,
  locale: Locale,
  fallbackName: string,
): string {
  return (
    name?.[locale].trim() ||
    name?.[locale === 'ar' ? 'en' : 'ar'].trim() ||
    fallbackName
  );
}
