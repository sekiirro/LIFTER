import { describe, expect, it } from 'vitest';
import {
  CATALOG_LIFECYCLE_STATES,
  MAX_SEARCH_PAGE_SIZE,
  EQUIPMENT_CODES,
  MUSCLE_GROUP_CODES,
  normalizeCatalogSearchInput,
  normalizeExerciseInput,
  normalizeFoodInput,
  normalizeLifecycleState,
  normalizeServingInput,
  normalizeWorkspaceScope,
} from '../../lib/catalog/schemas';
import { CatalogValidationError } from '../../lib/catalog/schemas';

const validExercise = {
  names: { ar: ' تمرين ', en: ' Exercise ' },
  primaryMuscle: 'chest',
  equipment: 'barbell',
};

const validServing = {
  labels: { ar: ' حصة ', en: ' serving ' },
  basisQuantity: 100,
};

const validFood = {
  names: { ar: 'أرز', en: 'Rice' },
  basis: 'g',
  productIdentity: 'rice',
  preparationIdentity: 'boiled',
  weighingState: 'cooked',
  kcal: 130,
  protein: 2.7,
  carbs: 28,
  fat: 0.3,
  servings: [validServing],
};

describe('catalog schemas', () => {
  describe('exercise input', () => {
    it('accepts a spec-valid exercise and trims names', () => {
      expect(normalizeExerciseInput(validExercise)).toMatchObject({
        names: { ar: 'تمرين', en: 'Exercise' },
        primaryMuscle: 'chest',
        equipment: 'barbell',
        secondaryMuscles: [],
        lifecycleState: 'active',
      });
    });

    it('requires both ar and en names', () => {
      expect(() =>
        normalizeExerciseInput({ ...validExercise, names: { ar: 'تمرين' } }),
      ).toThrow(/name/i);
      expect(() =>
        normalizeExerciseInput({ ...validExercise, names: { en: 'Exercise' } }),
      ).toThrow(/name/i);
      expect(() =>
        normalizeExerciseInput({ ...validExercise, names: {} }),
      ).toThrow(/name/i);
    });

    it('rejects overlong names and invalid numeric defaults at the schema boundary', () => {
      const nameAtLimit = '\u062A'.repeat(120);
      const nameOverLimit = 'Øª'.repeat(121);
      expect(Array.from(nameAtLimit)).toHaveLength(120);
      expect(Array.from(nameOverLimit)).toHaveLength(121);
      expect(() =>
        normalizeExerciseInput({
          ...validExercise,
          names: { ar: nameAtLimit, en: 'Exercise' },
        }),
      ).not.toThrow();
      expect(() =>
        normalizeExerciseInput({
          ...validExercise,
          names: { ar: nameOverLimit, en: 'Exercise' },
        }),
      ).toThrow(/120|length/i);
      for (const workingSets of [Number.NaN, -1]) {
        expect(() =>
          normalizeExerciseInput({
            ...validExercise,
            defaults: { workingSets },
          }),
        ).toThrow(/working sets/i);
      }
    });

    it('requires primary muscle and equipment', () => {
      expect(() =>
        normalizeExerciseInput({ names: { ar: 'a', en: 'b' } }),
      ).toThrow(/muscle/i);
      expect(() =>
        normalizeExerciseInput({
          names: { ar: 'a', en: 'b' },
          primaryMuscle: 'chest',
        }),
      ).toThrow(/equipment/i);
    });

    it('rejects unsupported taxonomy codes', () => {
      expect(() =>
        normalizeExerciseInput({ ...validExercise, primaryMuscle: 'Legs' }),
      ).toThrow(/muscle/i);
      expect(() =>
        normalizeExerciseInput({ ...validExercise, equipment: 'Rope' }),
      ).toThrow(/equipment/i);
    });

    it('rejects archive lifecycle state', () => {
      expect(() =>
        normalizeExerciseInput({
          ...validExercise,
          lifecycleState: 'archived',
        }),
      ).toThrow(/lifecycle/i);
      expect(() =>
        normalizeExerciseInput({ ...validExercise, lifecycleState: 'archive' }),
      ).toThrow(/lifecycle/i);
    });

    it('accepts secondary muscles and defaults', () => {
      const result = normalizeExerciseInput({
        ...validExercise,
        secondaryMuscles: ['biceps', 'triceps'],
        defaults: {
          warmupSets: 1,
          workingSets: 3,
          reps: { kind: 'range', min: 8, max: 12 },
          restSeconds: 90,
          rir: 2,
        },
      });
      expect(result.secondaryMuscles).toEqual(['biceps', 'triceps']);
      expect(result.defaults?.reps).toEqual({ kind: 'range', min: 8, max: 12 });
    });
  });

  describe('serving input', () => {
    it('accepts a spec-valid serving', () => {
      expect(normalizeServingInput(validServing)).toMatchObject({
        labels: { ar: 'حصة', en: 'serving' },
        basisQuantity: 100,
      });
    });

    it('requires at least one serving label locale', () => {
      expect(() =>
        normalizeServingInput({ labels: {}, basisQuantity: 10 }),
      ).toThrow(/label/i);
    });

    it('requires a positive basis quantity', () => {
      expect(() =>
        normalizeServingInput({ ...validServing, basisQuantity: 0 }),
      ).toThrow(/basis quantity/i);
      expect(() =>
        normalizeServingInput({ ...validServing, basisQuantity: -1 }),
      ).toThrow(/basis quantity/i);
    });
  });

  describe('food input', () => {
    it('accepts a spec-valid food', () => {
      expect(normalizeFoodInput(validFood)).toMatchObject({
        names: { ar: 'أرز', en: 'Rice' },
        basis: 'g',
        weighingState: 'cooked',
        kcal: 130,
        fiber: null,
        alternatives: [],
      });
    });

    it('requires at least one food name locale', () => {
      expect(() => normalizeFoodInput({ ...validFood, names: {} })).toThrow(
        /name/i,
      );
    });

    it('requires basis g or ml', () => {
      expect(() => normalizeFoodInput({ ...validFood, basis: 'kg' })).toThrow(
        /basis/i,
      );
    });

    it('requires non-null product, preparation and weighing state', () => {
      expect(() =>
        normalizeFoodInput({ ...validFood, productIdentity: '' }),
      ).toThrow(/product identity/i);
      expect(() =>
        normalizeFoodInput({ ...validFood, preparationIdentity: ' ' }),
      ).toThrow(/preparation identity/i);
      expect(() =>
        normalizeFoodInput({ ...validFood, weighingState: 'frozen' }),
      ).toThrow(/weighing state/i);
    });

    it('rejects overlong text fields', () => {
      expect(() =>
        normalizeFoodInput({
          ...validFood,
          names: { ar: 'Ø£'.repeat(121), en: 'Rice' },
        }),
      ).toThrow(/120|length/i);
      expect(() =>
        normalizeFoodInput({ ...validFood, productIdentity: 'x'.repeat(121) }),
      ).toThrow(/120|length/i);
    });

    it('requires non-negative nutrition values', () => {
      expect(() => normalizeFoodInput({ ...validFood, kcal: -1 })).toThrow(
        /kcal/i,
      );
      expect(() => normalizeFoodInput({ ...validFood, protein: -0.1 })).toThrow(
        /protein/i,
      );
      expect(() => normalizeFoodInput({ ...validFood, carbs: -0.1 })).toThrow(
        /carbohydr/i,
      );
      expect(() => normalizeFoodInput({ ...validFood, fat: -0.1 })).toThrow(
        /fat/i,
      );
      expect(() => normalizeFoodInput({ ...validFood, fiber: -1 })).toThrow(
        /fiber/i,
      );
    });

    it('rejects macros exceeding 100 per 100 basis units', () => {
      expect(() =>
        normalizeFoodInput({ ...validFood, protein: 60, carbs: 30, fat: 20 }),
      ).toThrow(/100/i);
    });

    it('requires at least one serving', () => {
      expect(() => normalizeFoodInput({ ...validFood, servings: [] })).toThrow(
        /serving/i,
      );
    });

    it('enforces at most three alternatives', () => {
      const alternatives = [
        { alternativeFoodId: 'a', portionQuantity: 1 },
        { alternativeFoodId: 'b', portionQuantity: 1 },
        { alternativeFoodId: 'c', portionQuantity: 1 },
        { alternativeFoodId: 'd', portionQuantity: 1 },
      ];
      expect(() => normalizeFoodInput({ ...validFood, alternatives })).toThrow(
        /three alternatives/i,
      );
    });

    it('accepts up to three alternatives', () => {
      const alternatives = [
        { alternativeFoodId: 'a', portionQuantity: 1 },
        { alternativeFoodId: 'b', portionQuantity: 2 },
        { alternativeFoodId: 'c', portionQuantity: 3 },
      ];
      expect(
        normalizeFoodInput({ ...validFood, alternatives }).alternatives,
      ).toHaveLength(3);
    });

    it('rejects non-finite nutrition values', () => {
      expect(() => normalizeFoodInput({ ...validFood, kcal: NaN })).toThrow(
        /kcal/i,
      );
      expect(() =>
        normalizeFoodInput({ ...validFood, kcal: Infinity }),
      ).toThrow(/kcal/i);
    });
  });

  describe('workspace scope', () => {
    it('requires a non-empty workspace id', () => {
      expect(() => normalizeWorkspaceScope({ workspaceId: '' })).toThrow(
        /workspace id/i,
      );
      expect(() => normalizeWorkspaceScope({})).toThrow(/workspace id/i);
    });

    it('accepts a valid scope', () => {
      expect(normalizeWorkspaceScope({ workspaceId: 'ws-1' })).toEqual({
        workspaceId: 'ws-1',
      });
    });
  });

  describe('search input', () => {
    it('applies defaults and caps page size at 50', () => {
      expect(normalizeCatalogSearchInput({ kind: 'food' })).toMatchObject({
        kind: 'food',
        query: '',
        limit: 20,
        cursor: null,
        workspaceScope: null,
      });
      expect(() =>
        normalizeCatalogSearchInput({ kind: 'food', limit: 51 }),
      ).toThrow(/limit/i);
      expect(() =>
        normalizeCatalogSearchInput({
          kind: 'food',
          limit: MAX_SEARCH_PAGE_SIZE,
        }),
      ).not.toThrow();
    });

    it('requires workspace scope for workspace kinds', () => {
      expect(() =>
        normalizeCatalogSearchInput({ kind: 'workspace_exercise' }),
      ).toThrow(/workspace scope/i);
      expect(() =>
        normalizeCatalogSearchInput({
          kind: 'workspace_exercise',
          workspaceScope: { workspaceId: 'ws-1' },
        }),
      ).not.toThrow();
    });
  });

  describe('lifecycle state', () => {
    it('has no archive state', () => {
      expect(CATALOG_LIFECYCLE_STATES).not.toContain('archive' as never);
      expect(CATALOG_LIFECYCLE_STATES).not.toContain('archived' as never);
      expect(() => normalizeLifecycleState('archived')).toThrow(/lifecycle/i);
    });

    it('accepts active, removed and merged', () => {
      for (const state of ['active', 'removed', 'merged'] as const) {
        expect(normalizeLifecycleState(state)).toBe(state);
      }
      expect(() => normalizeLifecycleState('superseded')).toThrow(/lifecycle/i);
    });
  });

  it('exports taxonomy constants with approved counts', () => {
    expect(MUSCLE_GROUP_CODES).toHaveLength(18);
    expect(new Set(MUSCLE_GROUP_CODES).size).toBe(18);
    expect(EQUIPMENT_CODES).toHaveLength(10);
    expect(MUSCLE_GROUP_CODES).toContain('chest');
    expect(MUSCLE_GROUP_CODES).not.toContain('Chest' as never);
    expect(EQUIPMENT_CODES).toContain('barbell');
    expect(EQUIPMENT_CODES).not.toContain('Barbell' as never);
  });

  it('rejects invalid search kind', () => {
    expect(() => normalizeCatalogSearchInput({ kind: 'nope' })).toThrow(
      /search kind/i,
    );
  });

  it('CatalogValidationError is an Error subclass', () => {
    expect(new CatalogValidationError('x')).toBeInstanceOf(Error);
  });
});
