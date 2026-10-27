export type ThemePreference = 'dark' | 'light' | 'system';
export type Locale = 'ar' | 'en';
export const THEME_COOKIE = 'lifter_theme';
export const LOCALE_COOKIE = 'lifter_locale';

export function parseTheme(v?: string): ThemePreference {
  return v === 'dark' || v === 'light' ? v : 'system';
}
export function parseLocale(v?: string): Locale {
  return v === 'en' ? 'en' : 'ar';
}
export function dirFor(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
export function serializePreferenceCookie(
  name: typeof THEME_COOKIE | typeof LOCALE_COOKIE,
  value: string,
): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
