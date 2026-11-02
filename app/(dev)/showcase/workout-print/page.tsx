import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { LanguageSwitcher } from '../../../../components/preferences/LanguageSwitcher';
import { ThemeSwitcher } from '../../../../components/preferences/ThemeSwitcher';
import { BrandScope } from '../../../../components/ui/BrandScope';
import { WorkoutPrintDocument } from '../../../../components/plans/export/WorkoutPrintDocument';
import {
  LOCALE_COOKIE,
  parseLocale,
  parseTheme,
  THEME_COOKIE,
} from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { getMessages } from '../../../../lib/i18n';
import type { PublishedWorkoutVersionApiResponse } from '../../../../lib/plans/export/excel';
import styles from './page.module.css';

function previewVersion(
  locale: 'ar' | 'en',
): PublishedWorkoutVersionApiResponse {
  return JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        `tests/fixtures/workout/published-version-${locale}.json`,
      ),
      'utf8',
    ),
  ) as PublishedWorkoutVersionApiResponse;
}

export default async function WorkoutPrintPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string | string[] }>;
}) {
  if (!isShowcaseEnabled(process.env)) notFound();
  const [preferences, query] = await Promise.all([cookies(), searchParams]);
  const queryLocale = Array.isArray(query.locale)
    ? query.locale[0]
    : query.locale;
  const locale = parseLocale(
    queryLocale ?? preferences.get(LOCALE_COOKIE)?.value,
  );
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  const m = getMessages(locale);

  return (
    <BrandScope color="#E11D48">
      <div className={styles.page}>
        <nav className={styles.controls} aria-label={m['showcase.preferences']}>
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
          <a
            href={`/showcase/workout-print?locale=${locale === 'ar' ? 'en' : 'ar'}`}
          >
            {locale === 'ar' ? m['language.en'] : m['language.ar']}
          </a>
          <a href="/showcase">{m['showcase.backToShowcase']}</a>
        </nav>
        <WorkoutPrintDocument
          version={previewVersion(locale)}
          locale={locale}
        />
      </div>
    </BrandScope>
  );
}
