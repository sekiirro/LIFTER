import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { LanguageSwitcher } from '../../../../components/preferences/LanguageSwitcher';
import { ThemeSwitcher } from '../../../../components/preferences/ThemeSwitcher';
import { WorkoutBuilder } from '../../../../components/plans/workout/WorkoutBuilder';
import {
  LOCALE_COOKIE,
  parseLocale,
  parseTheme,
  THEME_COOKIE,
} from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { createWorkoutBuilderFixture } from '../../../../lib/plans/workout/builder-fixtures';
import styles from '../workout-volume/page.module.css';

export default async function WorkoutBuilderShowcasePage() {
  if (!isShowcaseEnabled(process.env)) notFound();
  const preferences = await cookies();
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  const { getMessages } = await import('../../../../lib/i18n');
  const m = getMessages(locale);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{m['builder.showcaseTitle']}</h1>
        <p>{m['builder.showcaseIntro']}</p>
      </header>
      <div className={styles.controls}>
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
        <LanguageSwitcher
          value={locale}
          label={m['language.label']}
          labels={{ ar: m['language.ar'], en: m['language.en'] }}
        />
        <a className={styles.back} href="/showcase">
          {m['showcase.backToShowcase']}
        </a>
      </div>
      <WorkoutBuilder
        locale={locale}
        messages={m}
        fixture={createWorkoutBuilderFixture(locale)}
      />
    </main>
  );
}
