import { describe, expect, it } from 'vitest';
import {
  computeNutritionMacro,
  computeNutritionMacroTotals,
  NutritionMacroError,
} from '../../lib/plans/nutrition/macros';
import {
  nutritionMacroErrorGoldenCases,
  nutritionMacroGoldenCases,
} from '../golden/nutrition-macros';

describe('canonical nutrition macro algorithm', () => {
  it.each(nutritionMacroGoldenCases)(
    '$name — exact arithmetic and one half-even rounding pass the golden fixture',
    ({ inputs, expected }) => {
      expect(inputs.map((input) => computeNutritionMacro(input))).toEqual(
        expected.calculations,
      );
      expect(computeNutritionMacroTotals(inputs)).toEqual(expected.total);
    },
  );

  it.each(nutritionMacroErrorGoldenCases)(
    '$name — invalid canonical input is rejected',
    ({ input }) => {
      expect(() => computeNutritionMacro(input)).toThrow(NutritionMacroError);
    },
  );

  it('does not derive an aggregate by adding already-rounded item values', () => {
    const aggregateCase = nutritionMacroGoldenCases.find(
      ({ name }) =>
        name ===
        'aggregate is rounded once rather than summing rounded item values',
    );

    expect(aggregateCase).toBeDefined();
    if (!aggregateCase) return;

    expect(aggregateCase.expected.total.calories).toBe('0.0001');
    expect(aggregateCase.expected.total.carbs).toBe('0.0003');
    expect(computeNutritionMacroTotals(aggregateCase.inputs)).toEqual(
      aggregateCase.expected.total,
    );
  });
});
