import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ExerciseEditor } from '../../../../components/catalog/ExerciseEditor';
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
import type { CatalogStaffRole } from '../../../../lib/catalog/exercise-editor';
import {
  mockExerciseAlternatives,
  mockExerciseEditorFixture,
  mockExerciseEditorRangeFixture,
  mockExerciseItems,
  mockFoodItems,
} from '../../../../lib/catalog/mock';
import { getMessages } from '../../../../lib/i18n';
import { CatalogPreview } from './CatalogPreview';
import styles from './page.module.css';

type PreviewState = 'ready' | 'loading' | 'empty' | 'noResults' | 'error';
type ShowcaseView = 'list' | 'editor';
type ShowcaseRole = Extract<CatalogStaffRole, 'po' | 'trainer'>;
type ShowcaseReps = 'fixed' | 'range';

const previewStates: readonly PreviewState[] = [
  'ready',
  'loading',
  'empty',
  'noResults',
  'error',
];
const showcaseViews: readonly ShowcaseView[] = ['list', 'editor'];
const showcaseRoles: readonly ShowcaseRole[] = ['po', 'trainer'];
const showcaseReps: readonly ShowcaseReps[] = ['fixed', 'range'];

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

function parseView(value: string | string[] | undefined): ShowcaseView {
  const candidate = Array.isArray(value) ? value[0] : value;
  return showcaseViews.includes(candidate as ShowcaseView)
    ? (candidate as ShowcaseView)
    : 'list';
}

function parseRole(value: string | string[] | undefined): ShowcaseRole {
  const candidate = Array.isArray(value) ? value[0] : value;
  return showcaseRoles.includes(candidate as ShowcaseRole)
    ? (candidate as ShowcaseRole)
    : 'po';
}

function parseReps(value: string | string[] | undefined): ShowcaseReps {
  const candidate = Array.isArray(value) ? value[0] : value;
  return showcaseReps.includes(candidate as ShowcaseReps)
    ? (candidate as ShowcaseReps)
    : 'fixed';
}

function statusFor(state: PreviewState): CatalogListStatus {
  if (state === 'loading') return 'loading';
  if (state === 'error') return 'error';
  return 'ready';
}

type ShowcaseQuery = {
  kind: CatalogListKind;
  state: PreviewState;
  view: ShowcaseView;
  role: ShowcaseRole;
  reps: ShowcaseReps;
};

function hrefFor(query: ShowcaseQuery): string {
  return `/showcase/catalog?kind=${query.kind}&state=${query.state}&view=${query.view}&role=${query.role}&reps=${query.reps}`;
}

export default async function CatalogShowcasePage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string | string[];
    state?: string | string[];
    view?: string | string[];
    role?: string | string[];
    reps?: string | string[];
  }>;
}) {
  if (!isShowcaseEnabled(process.env)) notFound();

  const [preferences, search] = await Promise.all([cookies(), searchParams]);
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  const m = getMessages(locale);
  const kind = parseKind(search.kind);
  const previewState = parsePreviewState(search.state);
  const view = parseView(search.view);
  const role = parseRole(search.role);
  const reps = parseReps(search.reps);
  const query: ShowcaseQuery = {
    kind,
    state: previewState,
    view,
    role,
    reps,
  };
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
  const viewLabels: Record<ShowcaseView, string> = {
    list: m['catalog.showcaseViewList'],
    editor: m['catalog.showcaseViewEditor'],
  };
  const roleLabels: Record<ShowcaseRole, string> = {
    po: m['catalog.showcaseRolePo'],
    trainer: m['catalog.showcaseRoleTrainer'],
  };
  const repsLabels: Record<ShowcaseReps, string> = {
    fixed: m['catalog.showcaseRepsFixed'],
    range: m['catalog.showcaseRepsRange'],
  };

  return (
    <main className={styles.page} data-testid="catalog-showcase">
      <header className={styles.header}>
        <h1>{m['catalog.showcaseTitle']}</h1>
        <p>{m['catalog.showcaseIntro']}</p>
      </header>

      <section className={styles.controls}>
        <fieldset className={styles.controlGroup}>
          <legend>{m['catalog.showcaseView']}</legend>
          <nav aria-label={m['catalog.showcaseView']} className={styles.links}>
            {showcaseViews.map((option) => (
              <a
                key={option}
                href={hrefFor({ ...query, view: option })}
                className={styles.link}
                aria-current={view === option ? 'page' : undefined}
                data-testid={`catalog-view-${option}`}
              >
                {viewLabels[option]}
              </a>
            ))}
          </nav>
        </fieldset>

        {view === 'list' ? (
          <>
            <fieldset className={styles.controlGroup}>
              <legend>{m['catalog.previewKind']}</legend>
              <nav
                aria-label={m['catalog.previewKind']}
                className={styles.links}
              >
                {(['exercise', 'food'] as const).map((option) => (
                  <a
                    key={option}
                    href={hrefFor({ ...query, kind: option })}
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
              <nav
                aria-label={m['catalog.previewState']}
                className={styles.links}
              >
                {previewStates.map((option) => (
                  <a
                    key={option}
                    href={hrefFor({ ...query, state: option })}
                    className={styles.link}
                    aria-current={previewState === option ? 'page' : undefined}
                    data-testid={`catalog-state-${option}`}
                  >
                    {stateLabels[option]}
                  </a>
                ))}
              </nav>
            </fieldset>
          </>
        ) : (
          <>
            <fieldset className={styles.controlGroup}>
              <legend>{m['catalog.showcaseRole']}</legend>
              <nav
                aria-label={m['catalog.showcaseRole']}
                className={styles.links}
              >
                {showcaseRoles.map((option) => (
                  <a
                    key={option}
                    href={hrefFor({ ...query, role: option })}
                    className={styles.link}
                    aria-current={role === option ? 'page' : undefined}
                    data-testid={`catalog-role-${option}`}
                  >
                    {roleLabels[option]}
                  </a>
                ))}
              </nav>
            </fieldset>

            <fieldset className={styles.controlGroup}>
              <legend>{m['catalog.showcaseReps']}</legend>
              <nav
                aria-label={m['catalog.showcaseReps']}
                className={styles.links}
              >
                {showcaseReps.map((option) => (
                  <a
                    key={option}
                    href={hrefFor({ ...query, reps: option })}
                    className={styles.link}
                    aria-current={reps === option ? 'page' : undefined}
                    data-testid={`catalog-reps-${option}`}
                  >
                    {repsLabels[option]}
                  </a>
                ))}
              </nav>
            </fieldset>
          </>
        )}

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

      {view === 'editor' ? (
        <ExerciseEditor
          key={`editor-${role}-${reps}`}
          locale={locale}
          role={role}
          exercise={
            reps === 'range'
              ? mockExerciseEditorRangeFixture
              : mockExerciseEditorFixture
          }
          alternatives={mockExerciseAlternatives}
          lifecycleState="active"
        />
      ) : (
        <CatalogPreview
          key={`${kind}-${previewState}`}
          locale={locale}
          kind={kind}
          items={items}
          status={statusFor(previewState)}
          initialQuery={initialQuery}
        />
      )}

      <footer className={styles.notice}>{m['catalog.showcaseNotice']}</footer>
    </main>
  );
}
