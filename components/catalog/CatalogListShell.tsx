'use client';

import { useId, useReducer, type FormEvent } from 'react';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Field } from '../ui/Field';
import { EmptyState, ErrorState, NoResults, Skeleton } from '../ui/States';
import {
  CATALOG_FILTER_KEYS,
  CATALOG_FILTER_OPTIONS,
  buildCatalogSearch,
  catalogItemName,
  catalogSearchKeyAction,
  formatCatalogCount,
  hasActiveCatalogFilters,
  initialCatalogShellState,
  reduceCatalogShellState,
  selectCatalogItems,
  type CatalogFilterKey,
  type CatalogListKind,
  type CatalogListItem,
  type CatalogListStatus,
  type CatalogShellAction,
} from '../../lib/catalog/list';
import type { CatalogSearchFilters } from '../../lib/catalog/schemas';
import { dirFor, type Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import styles from './CatalogListShell.module.css';

export type CatalogListShellProps = {
  locale: Locale;
  kind: CatalogListKind;
  items: readonly CatalogListItem[];
  serverFiltered?: boolean;
  status?: CatalogListStatus;
  initialQuery?: string;
  initialFilters?: CatalogSearchFilters;
  onSearch?: (search: ReturnType<typeof buildCatalogSearch>) => void;
  onRetry?: () => void;
  emptyActionHref?: string;
  emptyActionLabel?: string;
};

const noop = () => {};

export function CatalogListShell({
  locale,
  kind,
  items,
  serverFiltered = false,
  status = 'ready',
  initialQuery = '',
  initialFilters = {},
  onSearch,
  onRetry,
  emptyActionHref,
  emptyActionLabel,
}: CatalogListShellProps) {
  const m = getMessages(locale);
  const titleId = useId();
  const filterIdBase = useId();
  const [state, dispatch] = useReducer(reduceCatalogShellState, undefined, () =>
    initialCatalogShellState(kind, initialQuery, initialFilters),
  );
  const visible = serverFiltered
    ? items
    : selectCatalogItems(items, state.search);
  const hasSearch =
    state.query.trim().length > 0 || hasActiveCatalogFilters(state.filters);
  const filterKeys = CATALOG_FILTER_KEYS[kind];
  const canClear =
    state.query.length > 0 || hasActiveCatalogFilters(state.filters);
  const filterLabels: Record<CatalogFilterKey, string> = {
    muscleGroup: m['catalog.filterMuscle'],
    equipment: m['catalog.filterEquipment'],
    basis: m['catalog.filterBasis'],
  };

  function submitSearch() {
    dispatch({ type: 'submit' });
    onSearch?.(buildCatalogSearch(kind, state.query, state.filters));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitSearch();
  }

  function applyFilter(key: CatalogFilterKey, value: string) {
    const action: CatalogShellAction = { type: 'filter', key, value };
    const next = reduceCatalogShellState(state, action);
    dispatch(action);
    onSearch?.(next.search);
  }

  function clearSearch() {
    dispatch({ type: 'clear' });
    onSearch?.(buildCatalogSearch(kind));
  }

  return (
    <section
      className={styles.shell}
      dir={dirFor(locale)}
      lang={locale}
      data-catalog-locale={locale}
      data-catalog-kind={kind}
      data-testid="catalog-shell"
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <h2 id={titleId}>{m[`catalog.${kind}Title`]}</h2>
        <p>{m[`catalog.${kind}Intro`]}</p>
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
            value: state.query,
            placeholder: m['catalog.searchPlaceholder'],
            autoComplete: 'off',
            enterKeyHint: 'search',
            onChange: (event) =>
              dispatch({ type: 'query', value: event.currentTarget.value }),
            onKeyDown: (event) => {
              const action = catalogSearchKeyAction(event.key);
              if (!action) return;
              event.preventDefault();
              dispatch(action);
              onSearch?.(
                action.type === 'clear'
                  ? buildCatalogSearch(kind)
                  : buildCatalogSearch(kind, state.query, state.filters),
              );
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
        {filterKeys.map((key) => {
          const id = `${filterIdBase}-${key}`;
          const value =
            key === 'basis'
              ? (state.filters.basis ?? '')
              : (state.filters[key] ?? '');
          return (
            <div key={key} className={styles.filter}>
              <label htmlFor={id}>{filterLabels[key]}</label>
              <select
                id={id}
                value={value}
                onChange={(event) =>
                  applyFilter(key, event.currentTarget.value)
                }
              >
                <option value="">{m['catalog.all']}</option>
                {CATALOG_FILTER_OPTIONS[key].map((option) => (
                  <option key={option} value={option}>
                    {key === 'muscleGroup'
                      ? m[`catalog.taxonomy.muscle.${option}` as keyof typeof m]
                      : key === 'equipment'
                        ? m[
                            `catalog.taxonomy.equipment.${option}` as keyof typeof m
                          ]
                        : option}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </fieldset>

      {status === 'ready' && (
        <p className={styles.count} role="status" data-testid="catalog-count">
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
          data-testid="catalog-loading"
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
        >
          {emptyActionHref && emptyActionLabel ? (
            <a className={styles.emptyAction} href={emptyActionHref}>
              {emptyActionLabel}
            </a>
          ) : null}
        </EmptyState>
      ) : visible.length === 0 ? (
        <NoResults
          title={m['catalog.noResultsTitle']}
          description={m['catalog.noResultsDescription']}
        />
      ) : (
        <ul
          className={styles.list}
          aria-label={m['catalog.listLabel']}
          data-testid="catalog-list"
        >
          {visible.map((item) => (
            <li key={item.id}>
              <Card as="article" className={styles.item}>
                <div className={styles.itemHeader}>
                  <h3 className={styles.itemTitle}>
                    <Bidi dir="auto">{catalogItemName(item, locale)}</Bidi>
                  </h3>
                  <span className={styles.kind}>
                    {m[`catalog.${item.kind}Kind`]}
                  </span>
                </div>
                <dl className={styles.meta}>
                  {item.kind === 'exercise' ? (
                    <>
                      <div>
                        <dt>{m['catalog.primaryMuscle']}</dt>
                        <dd>
                          <Bidi dir="ltr">
                            {
                              m[
                                `catalog.taxonomy.muscle.${item.primaryMuscle}` as keyof typeof m
                              ]
                            }
                          </Bidi>
                        </dd>
                      </div>
                      <div>
                        <dt>{m['catalog.equipment']}</dt>
                        <dd>
                          <Bidi dir="ltr">
                            {
                              m[
                                `catalog.taxonomy.equipment.${item.equipment}` as keyof typeof m
                              ]
                            }
                          </Bidi>
                        </dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt>{m['catalog.basis']}</dt>
                        <dd>
                          <Bidi dir="ltr">{item.basis}</Bidi>
                        </dd>
                      </div>
                      <div>
                        <dt>{m['catalog.kcal']}</dt>
                        <dd>
                          <Bidi dir="ltr">{Math.round(item.kcal)}</Bidi>
                        </dd>
                      </div>
                      <div>
                        <dt>{m['catalog.protein']}</dt>
                        <dd>
                          <Bidi dir="ltr">{Math.round(item.protein)}</Bidi>
                        </dd>
                      </div>
                      <div>
                        <dt>{m['catalog.carbs']}</dt>
                        <dd>
                          <Bidi dir="ltr">{Math.round(item.carbs)}</Bidi>
                        </dd>
                      </div>
                      <div>
                        <dt>{m['catalog.fat']}</dt>
                        <dd>
                          <Bidi dir="ltr">{Math.round(item.fat)}</Bidi>
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
