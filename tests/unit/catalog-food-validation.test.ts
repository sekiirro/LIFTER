import { describe, expect, it } from 'vitest';
import { validateFoodInput } from '../../lib/catalog/schemas';

const validServing = {
  labels: { ar: 'حصة', en: 'serving' },
  basisQuantity: 100,
};

const baseFood = {
  names: { ar: 'أرز', en: 'Rice' },
  basis: 'g' as const,
  productIdentity: 'rice',
  preparationIdentity: 'boiled',
  weighingState: 'cooked' as const,
  kcal: 130,
  protein: 2.7,
  carbs: 28,
  fat: 0.3,
  servings: [validServing],
};

describe('food numeric and kcal warning validation (T024)', () => {
  it('returns food and empty warnings for a spec-valid food', () => {
    const result = validateFoodInput(baseFood);
    expect(result.food).toMatchObject({
      kcal: 130,
      protein: 2.7,
      carbs: 28,
      fat: 0.3,
    });
    expect(result.warnings).toEqual([]);
  });

  it('warns on kcal discrepancy beyond threshold', () => {
    const result = validateFoodInput({
      ...baseFood,
      kcal: 200,
      protein: 10,
      carbs: 10,
      fat: 10,
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      field: 'kcal',
      code: 'kcal_macro_mismatch',
      computed: 170,
      stated: 200,
    });
    expect(result.food.kcal).toBe(200);
  });

  it('does not warn exactly at threshold (floor branch)', () => {
    const result = validateFoodInput({
      ...baseFood,
      kcal: 100,
      protein: 20,
      carbs: 0,
      fat: 0,
    });
    expect(result.warnings).toEqual([]);
  });

  it('warns just above threshold', () => {
    const result = validateFoodInput({
      ...baseFood,
      kcal: 100,
      protein: 19.75,
      carbs: 0,
      fat: 0,
    });
    expect(result.warnings).toHaveLength(1);
  });

  it('uses 10% branch when larger than 20', () => {
    const noWarn = validateFoodInput({
      ...baseFood,
      kcal: 500,
      protein: 0,
      carbs: 0,
      fat: 50,
    });
    expect(noWarn.warnings).toEqual([]);
    const warn = validateFoodInput({
      ...baseFood,
      kcal: 500,
      protein: 0,
      carbs: 0,
      fat: 49.8,
    });
    // computed = 448.2, diff = 51.8 > 50
    expect(warn.warnings).toHaveLength(1);
  });

  it('kcal=0 with zero macros produces no warning', () => {
    const result = validateFoodInput({
      ...baseFood,
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    expect(result.warnings).toEqual([]);
  });

  it('rejects negative kcal', () => {
    expect(() => validateFoodInput({ ...baseFood, kcal: -1 })).toThrow(/kcal/i);
  });

  it('rejects non-positive serving basis quantity', () => {
    expect(() =>
      validateFoodInput({
        ...baseFood,
        servings: [{ labels: { en: 's' }, basisQuantity: 0 }],
      }),
    ).toThrow(/basis quantity/i);
  });

  it('optional fiber accepted', () => {
    const result = validateFoodInput({ ...baseFood, fiber: 1.2 });
    expect(result.food.fiber).toBe(1.2);
    expect(result.warnings).toEqual([]);
  });
});
