// F17 T032: pure exercise-picker helpers (FR-023, FR-024).
//
// Client-safe: no fetch, no RPC. The component receives F16 search results via
// props and emits `NormalizedCatalogSearch` through `onSearch`; the parent owns
// the catalog read and the T031 `f17_add_workout_exercise` call. Bounds come
// from the F16 contract: `catalog_search` returns at most 50 rows and the
// schemas clamp `limit` to `MAX_SEARCH_PAGE_SIZE` (50).

import { normalizeArEnV1 } from '../catalog/normalize';
import {
  compactCatalogFilters,
  hasSubmittedCatalogSearch,
} from '../catalog/list';
import {
  MAX_SEARCH_PAGE_SIZE,
  normalizeCatalogSearchInput,
  type CatalogLifecycleState,
  type CatalogLocale,
  type CatalogSearchFilters,
  type EquipmentCode,
  type MuscleGroupCode,
  type NormalizedCatalogSearch,
} from '../catalog/schemas';

/** F16 `catalog_search` result cap ("Max 50"). Rendered lists never exceed this. */
export const EXERCISE_PICKER_MAX_RESULTS: number = MAX_SEARCH_PAGE_SIZE;

/** Trailing-edge debounce for picker search emission (see report §3.2). */
export const EXERCISE_PICKER_DEBOUNCE_MS = 250;

export type ExercisePickerSource = 'global' | 'workspace_private';

export type ExercisePickerReps =
  { value: number } | { min: number; max: number };

/** Read-only snapshot of the F16 defaults that WILL be copied at add (T033 edits them after add). */
export type ExercisePickerDefaults = {
  restSec?: number;
  rir?: number;
  reps?: ExercisePickerReps;
  description?: string;
  notes?: string;
};

export type ExercisePickerItem = {
  id: string;
  source: ExercisePickerSource;
  /** Owning workspace for `workspace_private` items. */
  workspaceId?: string;
  names: Partial<Record<CatalogLocale, string>>;
  /** Explicit current immutable version of the exercise identity. */
  version: number;
  /** Explicitly selectable immutable versions (defaults to `[version]`). */
  versions?: readonly number[];
  /** Pinned workspace override version, when the effective row carries one. */
  overrideVersion?: number | null;
  primaryMuscle?: MuscleGroupCode;
  equipment?: EquipmentCode;
  lifecycleState?: CatalogLifecycleState;
  defaults?: ExercisePickerDefaults;
};

export type ExercisePickerFilters = Pick<
  CatalogSearchFilters,
  'muscleGroup' | 'equipment'
>;

/**
 * Explicit selection payload. Maps 1:1 onto the T031 RPC arguments
 * (`p_source`, `p_exercise_id`) plus the explicit version pin the receipt
 * must carry; the RPC itself pins the current server-side version.
 */
export type ExercisePickerSelection = {
  source: ExercisePickerSource;
  exerciseId: string;
  version: number;
  workspaceId?: string;
};

function asPositiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? value
    : null;
}

/** Explicitly selectable versions: sorted, unique, always containing current. */
export function resolvePickerVersions(item: ExercisePickerItem): number[] {
  const seen = new Set<number>();
  for (const candidate of item.versions ?? []) {
    const version = asPositiveInt(candidate);
    if (version !== null) seen.add(version);
  }
  const current = asPositiveInt(item.version);
  if (current !== null) seen.add(current);
  return [...seen].sort((a, b) => a - b);
}

/** Honor an explicitly selected version; fall back to current on anything else. */
export function resolvePickerVersion(
  item: ExercisePickerItem,
  selected: unknown,
): number {
  const versions = resolvePickerVersions(item);
  const explicit = asPositiveInt(selected);
  if (explicit !== null && versions.includes(explicit)) return explicit;
  return versions[versions.length - 1] ?? 1;
}

export function pickerItemName(
  item: ExercisePickerItem,
  locale: CatalogLocale,
): string {
  const fallback: CatalogLocale = locale === 'ar' ? 'en' : 'ar';
  return item.names[locale]?.trim() || item.names[fallback]?.trim() || item.id;
}

function matchesPickerQuery(item: ExercisePickerItem, query: string): boolean {
  const normalized = normalizeArEnV1(query.trim());
  if (!normalized) return true;
  return (['ar', 'en'] as const).some((locale) => {
    const name = item.names[locale];
    return name ? normalizeArEnV1(name).includes(normalized) : false;
  });
}

function matchesPickerFilters(
  item: ExercisePickerItem,
  filters: ExercisePickerFilters,
): boolean {
  if (filters.muscleGroup && item.primaryMuscle !== filters.muscleGroup)
    return false;
  if (filters.equipment && item.equipment !== filters.equipment) return false;
  return true;
}

/**
 * Local candidate selection. Only `active` rows are offered; removed/merged
 * rows resolve server-side and are never selectable. Workspace-private rows
 * from another workspace are excluded (the server stays authoritative).
 */
export function selectPickerItems(
  items: readonly ExercisePickerItem[],
  query: string,
  filters: ExercisePickerFilters,
  workspaceId?: string,
): ExercisePickerItem[] {
  return items.filter(
    (item) =>
      (item.lifecycleState ?? 'active') === 'active' &&
      (item.source !== 'workspace_private' ||
        workspaceId === undefined ||
        item.workspaceId === undefined ||
        item.workspaceId === workspaceId) &&
      matchesPickerQuery(item, query) &&
      matchesPickerFilters(item, filters),
  );
}

/** Bounded assertion target: the rendered list never exceeds the contract cap. */
export function capPickerResults(
  items: readonly ExercisePickerItem[],
): ExercisePickerItem[] {
  return items.slice(0, EXERCISE_PICKER_MAX_RESULTS);
}

/** Bounded F16 search for the `onSearch` callback (limit range-checked by F16). */
export function buildPickerSearch(
  query: string,
  filters: ExercisePickerFilters,
  workspaceId?: string,
): NormalizedCatalogSearch {
  return normalizeCatalogSearchInput({
    kind: workspaceId ? 'workspace_exercise' : 'exercise',
    query,
    filters: compactCatalogFilters(filters),
    limit: EXERCISE_PICKER_MAX_RESULTS,
    workspaceScope: workspaceId ? { workspaceId } : null,
  });
}

export function hasPickerSearch(
  query: string,
  filters: ExercisePickerFilters,
): boolean {
  return hasSubmittedCatalogSearch({
    query,
    filters: compactCatalogFilters(filters),
  });
}

/** Explicit add payload, or null when nothing is explicitly selected. */
export function buildPickerAddSelection(
  item: ExercisePickerItem | null | undefined,
  version: unknown,
): ExercisePickerSelection | null {
  if (!item) return null;
  return {
    source: item.source,
    exerciseId: item.id,
    version: resolvePickerVersion(item, version),
    ...(item.source === 'workspace_private' && item.workspaceId
      ? { workspaceId: item.workspaceId }
      : {}),
  };
}

/** Trailing-edge debounce with flush/cancel (tested with fake timers). */
export function createPickerDebounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): {
  schedule: (...args: Args) => void;
  flush: () => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: Args | null = null;
  const fire = () => {
    timer = null;
    const args = latest;
    latest = null;
    if (args) fn(...args);
  };
  return {
    schedule(...args: Args) {
      latest = args;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(fire, waitMs);
    },
    flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      const args = latest;
      latest = null;
      if (args) fn(...args);
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      latest = null;
    },
  };
}
