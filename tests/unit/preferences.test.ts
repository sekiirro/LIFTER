import { describe, expect, it } from 'vitest';
import {
  dirFor,
  LOCALE_COOKIE,
  parseLocale,
  parseTheme,
  serializePreferenceCookie,
  THEME_COOKIE,
} from '../../lib/design/preferences';

describe('preferences', () => {
  it('uses stable cookie names', () => {
    expect(THEME_COOKIE).toBe('lifter_theme');
    expect(LOCALE_COOKIE).toBe('lifter_locale');
  });
  it.each([undefined, '', 'system', 'DARK', ' light', 'invalid'])(
    'defaults theme %j to system',
    (input) => {
      expect(parseTheme(input)).toBe('system');
    },
  );
  it.each(['dark', 'light'] as const)('accepts theme %s', (input) => {
    expect(parseTheme(input)).toBe(input);
  });
  it.each([undefined, '', 'EN', ' en', 'fr'])(
    'defaults locale %j to Arabic',
    (input) => {
      expect(parseLocale(input)).toBe('ar');
    },
  );
  it('accepts both locales and maps direction', () => {
    expect(parseLocale('ar')).toBe('ar');
    expect(parseLocale('en')).toBe('en');
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('en')).toBe('ltr');
  });
  it('serializes year-long same-site cookies', () => {
    expect(serializePreferenceCookie(THEME_COOKIE, 'dark')).toBe(
      'lifter_theme=dark; Path=/; Max-Age=31536000; SameSite=Lax',
    );
    expect(serializePreferenceCookie(LOCALE_COOKIE, 'en')).toBe(
      'lifter_locale=en; Path=/; Max-Age=31536000; SameSite=Lax',
    );
    expect(serializePreferenceCookie(THEME_COOKIE, 'x; Path=/other')).toContain(
      'x%3B%20Path%3D%2Fother; Path=/;',
    );
  });
});
