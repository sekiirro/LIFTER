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
import {
  isCatalogListKind,
  type CatalogListKind,
  type CatalogListStatus,
} from '../../../../lib/catalog/list';
import { mockExerciseItems, mockFoodItems } from '../../../../lib/catalog/mock';
import { getMessages } from '../../../../lib/i18n';
import { CatalogPreview } from './CatalogPreview';
import styles from './page.module.css';

type PreviewState = 'ready' | 'loading' | 'empty' | 'noResults' | 'error';

const previewStates: readonly PreviewState[] = [
  'ready',
  'loading',
  'empty',
  'noResults',
  'error',
];

function parseKind(value: string | string[] | undefined): CatalogListKind {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isCatalogListKind(candidate) ? candidate : 'exercise';
}

function parsePreviewState(value: string | string[] | undefined): PreviewState {
  const candidate = Array.isArray(value) ? value[0] : value;
  return previewStates.includes(candidate as PreviewState)
    ? (candidate as PreviewState)
    : 'ready';
}

function statusFor(state: PreviewState): CatalogListStatus {
  if (state === 'loading') return 'loading';
  if (state === 'error') return 'error';
  return 'ready';
}

function hrefFor(kind: CatalogListKind, state: PreviewState): string {
  return `/showcase/catalog?kind=${kind}&state=${state}`;
}

export default async function CatalogShowcasePage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string | string[];
    state?: string | string[];
  }>;
}) {
  if (!isShowcaseEnabled(process.env)) notFound();

  const [preferences, query] = await Promise.all([cookies(), searchParams]);
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  const m = getMessages(locale);
  const kind = parseKind(query.kind);
  const previewState = parsePreviewState(query.state);
  const allItems = kind === 'exercise' ? mockExerciseItems : mockFoodItems;
  const items = previewState === 'empty' ? [] : allItems;
  const initialQuery =
    previewState === 'noResults' ? 'zzzz-no-match' : undefined;
  const stateLabels: Record<PreviewState, string> = {
    ready: m['catalog.stateReady'],
    loading: m['catalog.stateLoading'],
    empty: m['catalog.stateEmpty'],
    noResults: m['catalog.stateNoResults'],
    error: m['catalog.stateError'],
  };
  const kindLabels: Record<CatalogListKind, string> = {
    exercise: m['catalog.exerciseTitle'],
    food: m['catalog.foodTitle'],
  };

  return (
    <main className={styles.page} data-testid="catalog-showcase">
      <header className={styles.header}>
        <h1>{m['catalog.showcaseTitle']}</h1>
        <p>{m['catalog.showcaseIntro']}</p>
      </header>

      <section className={styles.controls}>
        <fieldset className={styles.controlGroup}>
          <legend>{m['catalog.previewKind']}</legend>
          <nav aria-label={m['catalog.previewKind']} className={styles.links}>
            {(['exercise', 'food'] as const).map((option) => (
              <a
                key={option}
                href={hrefFor(option, previewState)}
                className={styles.link}
                aria-current={kind === option ? 'page' : undefined}
                data-testid={`catalog-kind-${option}`}
              >
                {kindLabels[option]}
              </a>
            ))}
          </nav>
        </fieldset>

        <fieldset className={styles.controlGroup}>
          <legend>{m['catalog.previewState']}</legend>
          <nav aria-label={m['catalog.previewState']} className={styles.links}>
            {previewStates.map((option) => (
              <a
                key={option}
                href={hrefFor(kind, option)}
                className={styles.link}
                aria-current={previewState === option ? 'page' : undefined}
                data-testid={`catalog-state-${option}`}
              >
                {stateLabels[option]}
              </a>
            ))}
          </nav>
        </fieldset>

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

      <CatalogPreview
        key={`${kind}-${previewState}`}
        locale={locale}
        kind={kind}
        items={items}
        status={statusFor(previewState)}
        initialQuery={initialQuery}
      />

      <footer className={styles.notice}>{m['catalog.showcaseNotice']}</footer>
    </main>
  );
}
