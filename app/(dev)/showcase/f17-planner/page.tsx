import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { LanguageSwitcher } from '../../../../components/preferences/LanguageSwitcher';
import { ThemeSwitcher } from '../../../../components/preferences/ThemeSwitcher';
import { VolumePanel } from '../../../../components/workout-planner/VolumePanel';
import { WorkoutPrintView } from '../../../../components/workout-planner/WorkoutPrintView';
import {
  LOCALE_COOKIE,
  parseLocale,
  parseTheme,
  THEME_COOKIE,
} from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { getMessages } from '../../../../lib/i18n';
import { F17Interactive } from './F17Interactive';
import {
  F17_PRINT_PAYLOAD,
  F17_VOLUME_DAYS,
  F17_VOLUME_MUSCLES,
} from './fixtures';
import styles from './page.module.css';

// F17 T052 design-gate evidence page (FR-024; SC-013): renders every F17 UI
// piece merged on origin/main with fixture data. Copy comes only from
// PO-approved `lib/i18n/messages` keys (generic showcase keys for the page
// frame; each component renders its own approved strings). No fetching,
// no saving, no new copy.
export default async function F17PlannerShowcasePage() {
  if (!isShowcaseEnabled(process.env)) notFound();
  const preferences = await cookies();
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  const m = getMessages(locale);

  return (
    <main className={styles.main} data-testid="f17-planner-showcase">
      <header className={styles.header}>
        <h1>{m['showcase.title']}</h1>
        <p>{m['catalog.showcaseNotice']}</p>
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
        </div>
      </header>

      <div className={styles.section}>
        <F17Interactive locale={locale} />
      </div>

      <section data-section="volume" className={styles.section}>
        <VolumePanel
          locale={locale}
          days={F17_VOLUME_DAYS}
          muscles={F17_VOLUME_MUSCLES}
        />
      </section>

      <section data-section="print" className={styles.section}>
        <WorkoutPrintView locale={locale} payload={F17_PRINT_PAYLOAD} />
      </section>
    </main>
  );
}
