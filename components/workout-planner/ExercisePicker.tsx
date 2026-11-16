'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { dirFor, type Locale } from '../../lib/design/preferences';
import { getMessages, type MessageKey, type Messages } from '../../lib/i18n';
import { formatUiNumber } from '../../lib/i18n/format-digits';
import {
  CATALOG_FILTER_OPTIONS,
  formatCatalogCount,
} from '../../lib/catalog/list';
import {
  buildPickerAddSelection,
  buildPickerSearch,
  capPickerResults,
  EXERCISE_PICKER_DEBOUNCE_MS,
  hasPickerSearch,
  pickerItemName,
  selectPickerItems,
  type ExercisePickerFilters,
  type ExercisePickerItem,
  type ExercisePickerSelection,
} from '../../lib/workout-planner/exercise-picker';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Field } from '../ui/Field';
import { EmptyState, ErrorState, NoResults, Skeleton } from '../ui/States';
import type { NormalizedCatalogSearch } from '../../lib/catalog/schemas';
import styles from './ExercisePicker.module.css';

export type ExercisePickerStatus = 'loading' | 'ready' | 'error';

export type ExercisePickerProps = {
  locale: Locale;
  /** Current F16 search page (already bounded server-side to <= 50). */
  items: readonly ExercisePickerItem[];
  status?: ExercisePickerStatus;
  /** Active workspace: selects the workspace search scope and hides foreign private rows. */
  workspaceId?: string;
  /** When false, query/filters apply locally; default true (bounded server search). */
  serverFiltered?: boolean;
  initialQuery?: string;
  initialFilters?: ExercisePickerFilters;
  initialSelectedId?: string | null;
  onSearch?: (search: NormalizedCatalogSearch) => void;
  onRetry?: () => void;
  /** Explicit `{source, exerciseId, version, workspaceId?}` for the T031 RPC. */
  onAdd?: (selection: ExercisePickerSelection) => void;
};

const noop = () => {};

function taxonomyLabel(
  kind: 'muscle' | 'equipment',
  code: string | undefined,
  m: Messages,
): ReactNode {
  if (!code) return m['catalog.editorNone'];
  const key = `catalog.taxonomy.${kind}.${code}` as MessageKey;
  if (key in m) return m[key];
  return <Bidi dir="ltr">{code}</Bidi>;
}

function formatPickerReps(
  reps: NonNullable<ExercisePickerItem['defaults']>['reps'],
  locale: Locale,
): ReactNode {
  if (!reps) return null;
  if ('value' in reps)
    return <Bidi dir="ltr">{formatUiNumber(reps.value, locale)}</Bidi>;
  return (
    <Bidi dir="ltr">
      {formatUiNumber(reps.min, locale)}–{formatUiNumber(reps.max, locale)}
    </Bidi>
  );
}

/**
 * Bounded AR/EN exercise search with filters, explicit current-version display
 * and a read-only defaults preview (FR-023, FR-024). Props/callbacks only.
 */
export function ExercisePicker({
  locale,
  items,
  status = 'ready',
  workspaceId,
  serverFiltered = true,
  initialQuery = '',
  initialFilters = {},
  initialSelectedId = null,
  onSearch,
  onRetry,
  onAdd,
}: ExercisePickerProps) {
  const m = getMessages(locale);
  const titleId = useId();
  const filterIdBase = useId();
  const radioName = useId();
  const hintId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<ExercisePickerFilters>(initialFilters);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );

  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(() => {
      onSearchRef.current?.(buildPickerSearch(query, filters, workspaceId));
    }, EXERCISE_PICKER_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, filters, workspaceId]);

  const filtered = useMemo(
    () =>
      serverFiltered
        ? items
        : selectPickerItems(items, query, filters, workspaceId),
    [serverFiltered, items, query, filters, workspaceId],
  );
  const visible = useMemo(() => capPickerResults(filtered), [filtered]);
  const hasSearch = hasPickerSearch(query, filters);
  const canClear = query.length > 0 || Object.keys(filters).length > 0;

  const selectedItem =
    selectedId !== null
      ? (items.find((candidate) => candidate.id === selectedId) ?? null)
      : null;

  function submitNow() {
    onSearchRef.current?.(buildPickerSearch(query, filters, workspaceId));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitNow();
  }

  function applyFilter(key: 'muscleGroup' | 'equipment', value: string) {
    const next: ExercisePickerFilters = { ...filters };
    if (value) next[key] = value;
    else delete next[key];
    setFilters(next);
    onSearchRef.current?.(buildPickerSearch(query, next, workspaceId));
  }

  function clearSearch() {
    setQuery('');
    setFilters({});
    onSearchRef.current?.(buildPickerSearch('', {}, workspaceId));
  }

  function choose(id: string) {
    setSelectedId(id);
  }

  function addSelected() {
    const selection = buildPickerAddSelection(selectedItem);
    if (selection) onAdd?.(selection);
  }

  return (
    <section
      className={styles.picker}
      dir={dirFor(locale)}
      lang={locale}
      data-testid="exercise-picker"
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <h2 id={titleId}>{m['builder.chooseExercise']}</h2>
      </header>

      <form
        role="search"
        aria-label={m['catalog.searchLabel']}
        className={styles.search}
        onSubmit={handleSubmit}
      >
        <Field
          label={m['catalog.searchLabel']}
          inputProps={{
            type: 'search',
            name: 'q',
            value: query,
            placeholder: m['catalog.searchPlaceholder'],
            autoComplete: 'off',
            enterKeyHint: 'search',
            onChange: (event) => setQuery(event.currentTarget.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') return;
              if (event.key !== 'Escape') return;
              event.preventDefault();
              clearSearch();
            },
          }}
        />
        <div className={styles.searchActions}>
          <Button type="submit">{m['catalog.searchSubmit']}</Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!canClear}
            onClick={clearSearch}
          >
            {m['catalog.clear']}
          </Button>
        </div>
      </form>

      <fieldset className={styles.filters}>
        <legend>{m['catalog.filters']}</legend>
        {(
          [
            { key: 'muscleGroup', label: m['catalog.filterMuscle'] },
            { key: 'equipment', label: m['catalog.filterEquipment'] },
          ] as const
        ).map(({ key, label }) => {
          const id = `${filterIdBase}-${key}`;
          return (
            <div key={key} className={styles.filter}>
              <label htmlFor={id}>{label}</label>
              <select
                id={id}
                value={filters[key] ?? ''}
                onChange={(event) =>
                  applyFilter(key, event.currentTarget.value)
                }
              >
                <option value="">{m['catalog.all']}</option>
                {CATALOG_FILTER_OPTIONS[
                  key === 'muscleGroup' ? 'muscleGroup' : 'equipment'
                ].map((option) => (
                  <option key={option} value={option}>
                    {taxonomyLabel(
                      key === 'muscleGroup' ? 'muscle' : 'equipment',
                      option,
                      m,
                    )}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </fieldset>

      {status === 'ready' && (
        <p
          className={styles.count}
          role="status"
          data-testid="exercise-picker-count"
        >
          {formatCatalogCount(
            m['catalog.resultsCount'],
            visible.length,
            locale,
          )}
        </p>
      )}

      {status === 'loading' ? (
        <div
          className={styles.loading}
          role="status"
          aria-busy="true"
          data-testid="exercise-picker-loading"
        >
          <span className={styles.srOnly}>{m['catalog.loading']}</span>
          <Skeleton shape="card" />
          <Skeleton lines={3} />
        </div>
      ) : status === 'error' ? (
        <ErrorState
          title={m['catalog.errorTitle']}
          description={m['catalog.errorDescription']}
          retryLabel={m['catalog.retry']}
          onRetry={onRetry ?? noop}
        />
      ) : items.length === 0 && !hasSearch ? (
        <EmptyState
          title={m['catalog.emptyTitle']}
          description={m['catalog.emptyDescription']}
        />
      ) : visible.length === 0 ? (
        <NoResults
          title={m['catalog.noResultsTitle']}
          description={m['catalog.noResultsDescription']}
        />
      ) : (
        <ul
          className={styles.list}
          aria-label={m['catalog.listLabel']}
          data-testid="exercise-picker-list"
        >
          {visible.map((item) => {
            const checked = selectedId === item.id;
            return (
              <li key={item.id} data-testid="exercise-picker-row">
                <Card as="article" className={styles.item}>
                  <div className={styles.itemHeader}>
                    <h3 className={styles.itemTitle}>
                      <label className={styles.choice}>
                        <input
                          type="radio"
                          name={radioName}
                          checked={checked}
                          onChange={() => choose(item.id)}
                          aria-label={pickerItemName(item, locale)}
                        />
                        <Bidi dir="auto">{pickerItemName(item, locale)}</Bidi>
                      </label>
                    </h3>
                    <span className={styles.kind}>
                      {item.source === 'global'
                        ? m['catalog.editorGlobalScope']
                        : m['catalog.editorWorkspaceScope']}
                    </span>
                  </div>
                  <dl className={styles.meta}>
                    <div>
                      <dt>{m['catalog.detailVersion']}</dt>
                      <dd>
                        <Bidi dir="ltr">
                          {formatUiNumber(item.version, locale)}
                        </Bidi>
                      </dd>
                    </div>
                    <div>
                      <dt>{m['catalog.primaryMuscle']}</dt>
                      <dd>{taxonomyLabel('muscle', item.primaryMuscle, m)}</dd>
                    </div>
                    <div>
                      <dt>{m['catalog.equipment']}</dt>
                      <dd>{taxonomyLabel('equipment', item.equipment, m)}</dd>
                    </div>
                  </dl>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {selectedItem && (
        <div className={styles.detail} data-testid="exercise-picker-detail">
          <h3 className={styles.detailTitle}>
            <Bidi dir="auto">{pickerItemName(selectedItem, locale)}</Bidi>
          </h3>
          <p className={styles.versionRow}>
            <span>{m['templates.version']}</span>{' '}
            <Bidi dir="ltr">
              {formatUiNumber(selectedItem.version, locale)}
            </Bidi>
          </p>
          <h4 className={styles.defaultsTitle}>
            {m['catalog.editorDefaultsTitle']}
          </h4>
          <dl
            className={styles.defaults}
            data-testid="exercise-picker-defaults"
          >
            <div>
              <dt>{m['catalog.editorRest']}</dt>
              <dd>
                {selectedItem.defaults?.restSec !== undefined ? (
                  <>
                    <Bidi dir="ltr">
                      {formatUiNumber(selectedItem.defaults.restSec, locale)}
                    </Bidi>{' '}
                    {m['catalog.editorSeconds']}
                  </>
                ) : (
                  m['catalog.editorNone']
                )}
              </dd>
            </div>
            <div>
              <dt>{m['catalog.editorRir']}</dt>
              <dd>
                {selectedItem.defaults?.rir !== undefined ? (
                  <Bidi dir="ltr">
                    {formatUiNumber(selectedItem.defaults.rir, locale)}
                  </Bidi>
                ) : (
                  m['catalog.editorNone']
                )}
              </dd>
            </div>
            <div>
              <dt>{m['catalog.editorReps']}</dt>
              <dd>
                {selectedItem.defaults?.reps
                  ? formatPickerReps(selectedItem.defaults.reps, locale)
                  : m['catalog.editorNone']}
              </dd>
            </div>
            <div>
              <dt>{m['catalog.editorDescription']}</dt>
              <dd>
                {selectedItem.defaults?.description ?? m['catalog.editorNone']}
              </dd>
            </div>
            <div>
              <dt>{m['catalog.editorNotes']}</dt>
              <dd>{selectedItem.defaults?.notes ?? m['catalog.editorNone']}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className={styles.actions}>
        {!selectedItem && (
          <p id={hintId} className={styles.hint}>
            {m['builder.noExerciseSelected']}
          </p>
        )}
        <Button
          type="button"
          data-testid="exercise-picker-add"
          aria-describedby={!selectedItem ? hintId : undefined}
          onClick={addSelected}
        >
          {m['builder.addExercise']}
        </Button>
      </div>
    </section>
  );
}
