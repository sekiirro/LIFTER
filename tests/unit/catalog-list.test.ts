import { describe, expect, it } from 'vitest';
import {
  buildCatalogSearch,
  catalogItemName,
  catalogSearchKeyAction,
  formatCatalogCount,
  hasActiveCatalogFilters,
  hasSubmittedCatalogSearch,
  initialCatalogShellState,
  isCatalogListKind,
  reduceCatalogShellState,
  selectCatalogItems,
  toExerciseListItem,
  toFoodListItem,
} from '../../lib/catalog/list';
import { mockExerciseItems, mockFoodItems } from '../../lib/catalog/mock';
import {
  normalizeExerciseInput,
  normalizeFoodInput,
} from '../../lib/catalog/schemas';

const exerciseIds = (query = '', filters = {}) =>
  selectCatalogItems(
    mockExerciseItems,
    buildCatalogSearch('exercise', query, filters),
  ).map((item) => item.id);

const foodIds = (query = '', filters = {}) =>
  selectCatalogItems(
    mockFoodItems,
    buildCatalogSearch('food', query, filters),
  ).map((item) => item.id);

describe('catalog list projection', () => {
  it('uses the submitted query when pending input changes the live query', () => {
    const initial = initialCatalogShellState('exercise', 'previous search');
    const edited = reduceCatalogShellState(initial, { type: 'query', value: '' });
    expect(edited.query).toBe('');
    expect(hasSubmittedCatalogSearch(edited.search)).toBe(true);
  });

  it('keeps only active items of the requested kind', () => {
    expect(exerciseIds()).toEqual([
      'mock-exercise-1',
      'mock-exercise-2',
      'mock-exercise-3',
    ]);
    expect(foodIds()).toEqual(['mock-food-1', 'mock-food-2', 'mock-food-3']);
    expect(
      selectCatalogItems(mockExerciseItems, buildCatalogSearch('food')),
    ).toEqual([]);
  });

  it('matches names in Arabic and English with normalization', () => {
    expect(exerciseIds('bench')).toEqual(['mock-exercise-1']);
    expect(exerciseIds('BARBELL')).toEqual(['mock-exercise-1']);
    expect(exerciseIds('سحب')).toEqual(['mock-exercise-2']);
    expect(foodIds('ارز')).toEqual(['mock-food-2']);
    expect(foodIds('صدر')).toEqual(['mock-food-1']);
    expect(foodIds('not-a-food')).toEqual([]);
  });

  it('applies muscle, equipment and basis filters', () => {
    expect(exerciseIds('', { muscleGroup: 'chest' })).toEqual([
      'mock-exercise-1',
      'mock-exercise-3',
    ]);
    expect(exerciseIds('', { equipment: 'barbell' })).toEqual([
      'mock-exercise-1',
    ]);
    expect(foodIds('', { basis: 'g' })).toEqual(['mock-food-1', 'mock-food-2']);
    expect(foodIds('', { basis: 'ml' })).toEqual(['mock-food-3']);
  });

  it('builds a normalized T002 search projection', () => {
    expect(buildCatalogSearch('food', '  ارز  ', { basis: 'g' })).toEqual({
      kind: 'food',
      query: 'ارز',
      filters: { basis: 'g' },
      cursor: null,
      limit: 20,
      workspaceScope: null,
    });
    expect(buildCatalogSearch('exercise', '', { muscleGroup: '' })).toEqual({
      kind: 'exercise',
      query: '',
      filters: {},
      cursor: null,
      limit: 20,
      workspaceScope: null,
    });
  });

  it('maps T002 exercise and food projections into list items', () => {
    const exercise = toExerciseListItem(
      'ex-1',
      normalizeExerciseInput({
        names: { ar: 'ضغط الصدر', en: 'Bench Press' },
        primaryMuscle: 'chest',
        equipment: 'barbell',
      }),
    );
    expect(exercise).toEqual({
      id: 'ex-1',
      kind: 'exercise',
      names: { ar: 'ضغط الصدر', en: 'Bench Press' },
      primaryMuscle: 'chest',
      equipment: 'barbell',
      lifecycleState: 'active',
    });

    const food = toFoodListItem(
      'food-1',
      normalizeFoodInput({
        names: { ar: 'أرز', en: 'Rice' },
        basis: 'g',
        productIdentity: 'rice',
        preparationIdentity: 'cooked',
        weighingState: 'cooked',
        kcal: 130,
        protein: 2.7,
        carbs: 28,
        fat: 0.3,
        servings: [
          { labels: { ar: 'حصة', en: 'Serving' }, basisQuantity: 100 },
        ],
      }),
    );
    expect(food).toMatchObject({
      id: 'food-1',
      kind: 'food',
      basis: 'g',
      kcal: 130,
      protein: 2.7,
      carbs: 28,
      fat: 0.3,
      lifecycleState: 'active',
    });
  });

  it('falls back to the other locale when a food name is missing', () => {
    const item = {
      id: 'food-1',
      kind: 'food' as const,
      names: { en: 'Rice' },
      basis: 'g' as const,
      kcal: 130,
      protein: 2.7,
      carbs: 28,
      fat: 0.3,
      lifecycleState: 'active' as const,
    };
    expect(catalogItemName(item, 'ar')).toBe('Rice');
    expect(catalogItemName(item, 'en')).toBe('Rice');
  });

  it('maps Enter to submit and Escape to clear for keyboard search', () => {
    expect(catalogSearchKeyAction('Enter')).toEqual({ type: 'submit' });
    expect(catalogSearchKeyAction('Escape')).toEqual({ type: 'clear' });
    expect(catalogSearchKeyAction('a')).toBeNull();
  });

  it('updates query, applies filters immediately, submits and clears', () => {
    const initial = initialCatalogShellState('exercise');
    expect(initial.search.query).toBe('');
    expect(initial.search.filters).toEqual({});

    const typed = reduceCatalogShellState(initial, {
      type: 'query',
      value: 'bench',
    });
    expect(typed.query).toBe('bench');
    expect(typed.search.query).toBe('');
    expect(exerciseIds(typed.search.query, typed.search.filters)).toHaveLength(
      3,
    );

    const submitted = reduceCatalogShellState(typed, { type: 'submit' });
    expect(submitted.search.query).toBe('bench');

    const filtered = reduceCatalogShellState(submitted, {
      type: 'filter',
      key: 'equipment',
      value: 'barbell',
    });
    expect(filtered.filters).toEqual({ equipment: 'barbell' });
    expect(filtered.search.filters).toEqual({ equipment: 'barbell' });

    const cleared = reduceCatalogShellState(filtered, { type: 'clear' });
    expect(cleared.query).toBe('');
    expect(cleared.filters).toEqual({});
    expect(cleared.search).toEqual(buildCatalogSearch('exercise'));
  });

  it('removes a filter when its value is empty', () => {
    const initial = initialCatalogShellState('food', '', { basis: 'ml' });
    const next = reduceCatalogShellState(initial, {
      type: 'filter',
      key: 'basis',
      value: '',
    });
    expect(next.filters).toEqual({});
    expect(next.search.filters).toEqual({});
  });

  it('reports active filters and formats localized counts', () => {
    expect(hasActiveCatalogFilters({})).toBe(false);
    expect(hasActiveCatalogFilters({ basis: 'g' })).toBe(true);
    expect(hasActiveCatalogFilters({ muscleGroup: '' })).toBe(false);
    expect(formatCatalogCount('النتائج: {count}', 3, 'ar')).toBe('النتائج: ٣');
    expect(formatCatalogCount('Results: {count}', 0, 'en')).toBe('Results: 0');
  });

  it('recognizes the two supported catalog kinds', () => {
    expect(isCatalogListKind('exercise')).toBe(true);
    expect(isCatalogListKind('food')).toBe(true);
    expect(isCatalogListKind('variation')).toBe(false);
    expect(isCatalogListKind(undefined)).toBe(false);
  });
});
