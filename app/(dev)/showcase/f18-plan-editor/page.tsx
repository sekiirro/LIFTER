import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { LanguageSwitcher } from '../../../../components/preferences/LanguageSwitcher';
import { ThemeSwitcher } from '../../../../components/preferences/ThemeSwitcher';
import {
  LOCALE_COOKIE,
  parseLocale,
  parseTheme,
  THEME_COOKIE,
} from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { getMessages } from '../../../../lib/i18n';
import { F18PlanEditorPreview } from './F18PlanEditorPreview';
import styles from './page.module.css';

export default async function F18PlanEditorShowcasePage() {
  if (!isShowcaseEnabled(process.env)) notFound();

  const preferences = await cookies();
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  const m = getMessages(locale);

  return (
    <main className={styles.page} data-testid="f18-plan-editor-showcase">
      <header className={styles.header}>
        <h1>{m['nutritionPlan.previewTitle']}</h1>
        <p>{m['nutritionPlan.previewIntro']}</p>
      </header>

      <section className={styles.controls}>
        <div className={styles.preferences}>
          <LanguageSwitcher
            value={locale}
            label={m['language.label']}
            labels={{ ar: m['language.ar'], en: m['language.en'] }}
          />
          <ThemeSwitcher
            key={theme}
            value={theme}
            label={m['theme.label']}
            labels={{
              system: m['theme.system'],
              dark: m['theme.dark'],
              light: m['theme.light'],
            }}
          />
        </div>
      </section>

      <section className={styles.preview}>
        <F18PlanEditorPreview locale={locale} />
      </section>

      <footer className={styles.notice}>
        {m['nutritionPlan.previewNotice']}
      </footer>
    </main>
  );
}
