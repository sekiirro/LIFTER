import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { LanguageSwitcher } from '../../../components/preferences/LanguageSwitcher';
import { ThemeSwitcher } from '../../../components/preferences/ThemeSwitcher';
import { Bidi } from '../../../components/ui/Bidi';
import {
  LOCALE_COOKIE,
  parseLocale,
  parseTheme,
  THEME_COOKIE,
} from '../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../lib/design/showcase';
import { getMessages } from '../../../lib/i18n';
import styles from './print.module.css';

export default async function PrintSamplePage() {
  if (!isShowcaseEnabled(process.env)) notFound();
  const preferences = await cookies();
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  const m = getMessages(locale);
  const ar = getMessages('ar');
  return (
    <main className={styles.page}>
      <div
        data-screen-only=""
        data-testid="print-switchers"
        className={styles.controls}
      >
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
        <a href="/showcase">{m['showcase.backToShowcase']}</a>
      </div>
      <article lang="ar" dir="rtl" className={styles.article}>
        <h1>{ar['print.title']}</h1>
        <p>
          {ar['print.description']} {ar['showcase.weight']}{' '}
          <Bidi dir="ltr">{ar['showcase.measurement']}</Bidi> —{' '}
          <Bidi dir="ltr">{ar['showcase.code']}</Bidi>
        </p>
        <p lang="en" dir="ltr">
          {getMessages('en')['print.englishParagraph']}
        </p>
        <table className={styles.table} data-testid="print-table">
          <thead>
            <tr>
              <th scope="col">{ar['print.exercise']}</th>
              <th scope="col">{ar['print.sets']}</th>
              <th scope="col">{ar['print.reps']}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 25 }, (_, index) => (
              <tr key={index}>
                <th scope="row">
                  {ar['print.exerciseName']} <Bidi>{index + 1}</Bidi>
                </th>
                <td>
                  <Bidi>3</Bidi>
                </td>
                <td>
                  <Bidi>12</Bidi>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </main>
  );
}
