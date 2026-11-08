import { normalizeArEnV1 } from './normalize';
import { formatNumber } from '../i18n/format';
import {
  EQUIPMENT_CODES,
  MUSCLE_GROUP_CODES,
  normalizeCatalogSearchInput,
  type CatalogLifecycleState,
  type CatalogLocale,
  type CatalogSearchFilters,
  type EquipmentCode,
  type FoodBasis,
  type MuscleGroupCode,
  type NormalizedCatalogSearch,
  type NormalizedExercise,
  type NormalizedFood,
} from './schemas';

export type CatalogListKind = 'exercise' | 'food';
export type CatalogListStatus = 'loading' | 'ready' | 'error';
export type CatalogFilterKey = 'muscleGroup' | 'equipment' | 'basis';

export type CatalogExerciseListItem = {
  id: string;
  kind: 'exercise';
  names: Record<CatalogLocale, string>;
  primaryMuscle: MuscleGroupCode;
  equipment: EquipmentCode;
  lifecycleState: CatalogLifecycleState;
};

export type CatalogFoodListItem = {
  id: string;
  kind: 'food';
  names: Partial<Record<CatalogLocale, string>>;
  basis: FoodBasis;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  lifecycleState: CatalogLifecycleState;
};

export type CatalogListItem = CatalogExerciseListItem | CatalogFoodListItem;

export type CatalogListProjection = {
  kind: CatalogListKind;
  items: readonly CatalogListItem[];
  status: CatalogListStatus;
};

export const CATALOG_FILTER_KEYS: Record<
  CatalogListKind,
  readonly CatalogFilterKey[]
> = {
  exercise: ['muscleGroup', 'equipment'],
  food: ['basis'],
};

export const CATALOG_FILTER_OPTIONS: Record<
  CatalogFilterKey,
  readonly string[]
> = {
  muscleGroup: MUSCLE_GROUP_CODES,
  equipment: EQUIPMENT_CODES,
  basis: ['g', 'ml'],
};

export const CATALOG_SEARCH_PAGE_LIMIT = 20;

export function isCatalogListKind(value: unknown): value is CatalogListKind {
  return value === 'exercise' || value === 'food';
}

export function toExerciseListItem(
  id: string,
  exercise: NormalizedExercise,
): CatalogExerciseListItem {
  return {
    id,
    kind: 'exercise',
    names: exercise.names,
    primaryMuscle: exercise.primaryMuscle,
    equipment: exercise.equipment,
    lifecycleState: exercise.lifecycleState,
  };
}

export function toFoodListItem(
  id: string,
  food: NormalizedFood,
): CatalogFoodListItem {
  return {
    id,
    kind: 'food',
    names: food.names,
    basis: food.basis,
    kcal: food.kcal,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    lifecycleState: food.lifecycleState,
  };
}

export function catalogItemName(
  item: CatalogListItem,
  locale: CatalogLocale,
): string {
  const fallback: CatalogLocale = locale === 'ar' ? 'en' : 'ar';
  return item.names[locale] ?? item.names[fallback] ?? item.id;
}

export function compactCatalogFilters(
  filters: CatalogSearchFilters,
): CatalogSearchFilters {
  const compact: CatalogSearchFilters = {};
  const muscleGroup = filters.muscleGroup?.trim();
  if (muscleGroup) compact.muscleGroup = muscleGroup;
  const equipment = filters.equipment?.trim();
  if (equipment) compact.equipment = equipment;
  if (filters.basis === 'g' || filters.basis === 'ml')
    compact.basis = filters.basis;
  return compact;
}

export function hasActiveCatalogFilters(
  filters: CatalogSearchFilters,
): boolean {
  return Object.keys(compactCatalogFilters(filters)).length > 0;
}

export function hasSubmittedCatalogSearch(
  search: Pick<NormalizedCatalogSearch, 'query' | 'filters'>,
): boolean {
  return (
    search.query.trim().length > 0 || hasActiveCatalogFilters(search.filters)
  );
}

export function buildCatalogSearch(
  kind: CatalogListKind,
  query = '',
  filters: CatalogSearchFilters = {},
): NormalizedCatalogSearch {
  return normalizeCatalogSearchInput({
    kind,
    query,
    filters: compactCatalogFilters(filters),
    limit: CATALOG_SEARCH_PAGE_LIMIT,
  });
}

function matchesCatalogQuery(item: CatalogListItem, query: string): boolean {
  const normalizedQuery = normalizeArEnV1(query.trim());
  if (!normalizedQuery) return true;
  return (['ar', 'en'] as const).some((locale) => {
    const name = item.names[locale];
    return name ? normalizeArEnV1(name).includes(normalizedQuery) : false;
  });
}

function matchesCatalogFilters(
  item: CatalogListItem,
  filters: CatalogSearchFilters,
): boolean {
  if (item.kind === 'exercise') {
    if (filters.muscleGroup && item.primaryMuscle !== filters.muscleGroup)
      return false;
    if (filters.equipment && item.equipment !== filters.equipment) return false;
    return true;
  }
  if (filters.basis && item.basis !== filters.basis) return false;
  return true;
}

export function selectCatalogItems(
  items: readonly CatalogListItem[],
  search: Pick<NormalizedCatalogSearch, 'kind' | 'query' | 'filters'>,
): CatalogListItem[] {
  return items.filter(
    (item) =>
      item.kind === search.kind &&
      item.lifecycleState === 'active' &&
      matchesCatalogQuery(item, search.query) &&
      matchesCatalogFilters(item, search.filters),
  );
}

export type CatalogShellState = {
  kind: CatalogListKind;
  query: string;
  filters: CatalogSearchFilters;
  search: NormalizedCatalogSearch;
};

export type CatalogShellAction =
  | { type: 'query'; value: string }
  | { type: 'filter'; key: CatalogFilterKey; value: string }
  | { type: 'submit' }
  | { type: 'clear' };

export function initialCatalogShellState(
  kind: CatalogListKind,
  query = '',
  filters: CatalogSearchFilters = {},
): CatalogShellState {
  const compact = compactCatalogFilters(filters);
  return {
    kind,
    query,
    filters: compact,
    search: buildCatalogSearch(kind, query, compact),
  };
}

function setFilterValue(
  filters: CatalogSearchFilters,
  key: CatalogFilterKey,
  value: string,
): CatalogSearchFilters {
  const next = { ...filters };
  if (key === 'basis') {
    if (value === 'g' || value === 'ml') next.basis = value;
    else delete next.basis;
  } else if (value) {
    next[key] = value;
  } else {
    delete next[key];
  }
  return next;
}

export function reduceCatalogShellState(
  state: CatalogShellState,
  action: CatalogShellAction,
): CatalogShellState {
  switch (action.type) {
    case 'query':
      return { ...state, query: action.value };
    case 'filter': {
      const filters = setFilterValue(state.filters, action.key, action.value);
      return {
        ...state,
        filters,
        search: buildCatalogSearch(state.kind, state.query, filters),
      };
    }
    case 'submit':
      return {
        ...state,
        search: buildCatalogSearch(state.kind, state.query, state.filters),
      };
    case 'clear':
      return initialCatalogShellState(state.kind);
  }
}

export function catalogSearchKeyAction(key: string): CatalogShellAction | null {
  if (key === 'Enter') return { type: 'submit' };
  if (key === 'Escape') return { type: 'clear' };
  return null;
}

export function formatCatalogCount(
  template: string,
  count: number,
  locale: CatalogLocale,
): string {
  return template.split('{count}').join(formatNumber(count, locale));
}
