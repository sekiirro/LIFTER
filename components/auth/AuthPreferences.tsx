import { cookies } from 'next/headers';
import { LanguageSwitcher } from '../preferences/LanguageSwitcher';
import { ThemeSwitcher } from '../preferences/ThemeSwitcher';
import {
  LOCALE_COOKIE,
  THEME_COOKIE,
  parseLocale,
  parseTheme,
} from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';

export async function AuthPreferences() {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(store.get(THEME_COOKIE)?.value);
  const m = getMessages(locale);
  return (
    <>
      <LanguageSwitcher
        value={locale}
        label={m['language.label']}
        labels={{ ar: m['language.ar'], en: m['language.en'] }}
      />
      <ThemeSwitcher
        value={theme}
        label={m['theme.label']}
        labels={{
          system: m['theme.system'],
          dark: m['theme.dark'],
          light: m['theme.light'],
        }}
      />
    </>
  );
}
