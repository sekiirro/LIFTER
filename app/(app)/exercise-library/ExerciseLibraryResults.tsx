'use client';

import { useRouter } from 'next/navigation';
import { Button } from '../../../components/ui/Button';
import { CatalogListShell } from '../../../components/catalog/CatalogListShell';
import type { CatalogExerciseListItem } from '../../../lib/catalog/list';
import type { CatalogSearchFilters } from '../../../lib/catalog/schemas';
import type { Locale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import styles from './exercise-library.module.css';

export function ExerciseLibraryResults({
  locale,
  items,
  query,
  filters,
  workspaceId,
  nextHref,
}: {
  locale: Locale;
  items: readonly CatalogExerciseListItem[];
  query: string;
  filters: CatalogSearchFilters;
  workspaceId?: string | null;
  nextHref: string | null;
}) {
  const router = useRouter();
  const m = getMessages(locale);
  function search(value: { query: string; filters: CatalogSearchFilters }) {
    const params = new URLSearchParams();
    if (value.query) params.set('q', value.query);
    if (value.filters.muscleGroup)
      params.set('muscle', value.filters.muscleGroup);
    if (value.filters.equipment)
      params.set('equipment', value.filters.equipment);
    if (workspaceId) params.set('workspace', workspaceId);
    router.push(`/exercise-library${params.size ? `?${params}` : ''}`);
  }
  return (
    <>
      <CatalogListShell
        locale={locale}
        kind="exercise"
        items={items}
        serverFiltered
        initialQuery={query}
        initialFilters={filters}
        emptyActionHref={
          workspaceId
            ? `/exercise-library/new?scope=workspace&workspace=${encodeURIComponent(workspaceId)}`
            : '/exercise-library/new'
        }
        emptyActionLabel={m['catalog.addExercise']}
        itemHref={(item) =>
          `/exercise-library/${item.id}${
            workspaceId
              ? `?scope=workspace&workspace=${encodeURIComponent(workspaceId)}`
              : ''
          }`
        }
        onSearch={(searchState) => search(searchState)}
      />
      {nextHref ? (
        <nav
          aria-label={m['catalog.paginationLabel']}
          className={styles.pagination}
        >
          <Button variant="secondary" onClick={() => router.push(nextHref)}>
            {m['catalog.nextPage']}
          </Button>
        </nav>
      ) : null}
    </>
  );
}
