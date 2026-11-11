import { describe, expect, it } from 'vitest';
import {
  computeAlternativeValues,
  computeDocumentValues,
  displayCalories,
  displayMacroGrams,
  type NutritionSnapshotEntry,
  type NutritionSnapshotMap,
} from '../../lib/plans/nutrition/macros';
import {
  NUTRITION_DOCUMENT_SCHEMA_VERSION,
  validateNutritionDocument,
} from '../../lib/plans/nutrition/schema';

// Frozen golden fixture set (F18-FR-003, F18-SC-001, F18-SC-011).
// Stored values are exact decimal strings at the scale of the declared input
// scales: item scale = per100 scale + quantity scale (+ serving basis-quantity
// scale) + 2 (the division by 100). No storage rounding anywhere.
const FOOD_F1 = '11111111-1111-1111-1111-111111111111';
const FOOD_F2 = '22222222-2222-2222-2222-222222222222';
const FOOD_F3 = '33333333-3333-3333-3333-333333333333';

function basisEntry(
  foodId: string,
  version: number,
  per100: { kcal: string; protein: string; carbs: string; fat: string },
  basis: 'g' | 'ml' = 'g',
): NutritionSnapshotEntry {
  return {
    kind: 'basis',
    foodId,
    version,
    names: { ar: 'طعام', en: 'Food' },
    basis,
    productIdentity: 'raw',
    preparationIdentity: 'raw',
    weighingState: 'raw',
    per100: { ...per100, fiber: null },
  };
}

function servingEntry(
  foodId: string,
  version: number,
  per100: { kcal: string; protein: string; carbs: string; fat: string },
  unitKey: string,
  basisQuantity: string,
  basis: 'g' | 'ml' = 'g',
): NutritionSnapshotEntry {
  return {
    kind: 'serving',
    unitKey,
    snapshot: {
      foodId,
      version,
      names: { ar: 'طعام', en: 'Food' },
      basis,
      productIdentity: 'raw',
      preparationIdentity: 'raw',
      weighingState: 'raw',
      kcal: per100.kcal,
      protein: per100.protein,
      carbs: per100.carbs,
      fat: per100.fat,
      fiber: null,
      serving: {
        servingId: unitKey,
        labels: { ar: 'حصة', en: 'Serving' },
        basisQuantity,
      },
    },
  };
}

const SNAPSHOT_MAP: NutritionSnapshotMap = {
  [`food:${FOOD_F1}@3#basis:g`]: basisEntry(FOOD_F1, 3, {
    kcal: '250.0',
    protein: '12.34',
    carbs: '50.00',
    fat: '12.34',
  }),
  [`food:${FOOD_F1}@4#basis:g`]: basisEntry(FOOD_F1, 4, {
    kcal: '400.0',
    protein: '30.00',
    carbs: '10.00',
    fat: '5.00',
  }),
  [`food:${FOOD_F2}@2#basis:ml`]: basisEntry(
    FOOD_F2,
    2,
    { kcal: '0.0', protein: '0.00', carbs: '0.00', fat: '0.00' },
    'ml',
  ),
  [`food:${FOOD_F3}@1#serving:g`]: servingEntry(
    FOOD_F3,
    1,
    { kcal: '300.0', protein: '20.00', carbs: '20.00', fat: '10.00' },
    'g',
    '30.000',
  ),
  [`food:${FOOD_F3}@1#basis:g`]: basisEntry(FOOD_F3, 1, {
    kcal: '300.0',
    protein: '20.00',
    carbs: '20.00',
    fat: '10.00',
  }),
};

function item(
  id: string,
  foodId: string,
  foodVersion: number,
  value: string,
  unit: Record<string, unknown>,
) {
  return {
    id,
    foodId,
    foodVersion,
    quantity: { value, unit },
    note: null,
    alternatives: [],
  };
}

function meal(id: string, items: unknown[]) {
  return {
    id,
    name: { ar: 'وجبة', en: 'Meal' },
    note: null,
    recipeUrl: null,
    items,
  };
}

const DAY_TYPES = [
  {
    id: 'dt-rest',
    name: { ar: 'راحة', en: 'Rest' },
    trainingDay: false,
    targets: null,
  },
];

// Declared basis and serving keys per referenced food version (F18-FR-004).
const GOLDEN_CONTEXT = {
  [`${FOOD_F1}@3`]: { basis: 'g', servingUnitKeys: ['g'] },
  [`${FOOD_F1}@4`]: { basis: 'g', servingUnitKeys: ['g'] },
  [`${FOOD_F2}@2`]: { basis: 'ml', servingUnitKeys: [] },
  [`${FOOD_F3}@1`]: { basis: 'g', servingUnitKeys: ['g'] },
} as const;

function sevenDayDoc(days: Array<{ dayIndex: number; meals: unknown[] }>) {
  const filled = Array.from({ length: 7 }, (_, i) => {
    const found = days.find((d) => d.dayIndex === i);
    return {
      dayIndex: i,
      dayTypeId: 'dt-rest',
      meals: found ? found.meals : [],
    };
  });
  return validateNutritionDocument(
    {
      schemaVersion: NUTRITION_DOCUMENT_SCHEMA_VERSION,
      structure: 'seven_day',
      dayTypes: DAY_TYPES,
      days: filled,
      title: null,
      notes: null,
    },
    GOLDEN_CONTEXT,
  );
}

function singleDayDoc(meals: unknown[]) {
  return validateNutritionDocument(
    {
      schemaVersion: NUTRITION_DOCUMENT_SCHEMA_VERSION,
      structure: 'single_day',
      implicitDayTypeId: 'dt-rest',
      dayTypes: DAY_TYPES,
      meals,
      title: null,
      notes: null,
    },
    GOLDEN_CONTEXT,
  );
}

describe('nutrition macros goldens (F18-FR-003, T002)', () => {
  it('persists the exact computed decimal with no storage rounding', () => {
    // data-model worked example: protein 12.34 per 100 g at 37 g → exact 4.5658
    const doc = singleDayDoc([
      meal('m-1', [
        item('i-1', FOOD_F1, 3, '37', { kind: 'basis', value: 'g' }),
      ]),
    ]);
    const values = computeDocumentValues(doc, SNAPSHOT_MAP);
    // scale = per100(2) + qty(0) + 2 = 4 for macros; kcal per100(1) → scale 3
    expect(values.items['i-1']).toEqual({
      kcal: '92.500',
      protein: '4.5658',
      carbs: '18.5000',
      fat: '4.5658',
    });
    // display rounds half-up once from the exact value
    expect(displayMacroGrams(values.items['i-1']!.protein)).toBe('4.6');
    expect(displayCalories(values.items['i-1']!.kcal)).toBe('93');
  });

  it('renders exact 1.44996 as 1.4 at one decimal (S43-R9 Sol-1 acceptance)', () => {
    expect(displayMacroGrams('1.44996')).toBe('1.4');
    // a value that a double rounding would push to 1.5 stays 1.4
    expect(displayMacroGrams('1.449999')).toBe('1.4');
    expect(displayMacroGrams('1.45001')).toBe('1.5');
  });

  it('rounds finite-decimal ties half-up exactly once', () => {
    expect(displayMacroGrams('0.15')).toBe('0.2');
    expect(displayMacroGrams('2.45')).toBe('2.5');
    expect(displayMacroGrams('9.95')).toBe('10');
    expect(displayCalories('2.5')).toBe('3');
    expect(displayCalories('1.5')).toBe('2');
  });

  it('follows the display thresholds: below 10 g one decimal, at or above 10 g integer', () => {
    expect(displayMacroGrams('0')).toBe('0');
    expect(displayMacroGrams('0.05')).toBe('0.1');
    expect(displayMacroGrams('0.4')).toBe('0.4');
    expect(displayMacroGrams('9.96')).toBe('10');
    expect(displayMacroGrams('9.94')).toBe('9.9');
    // S48-PO-11 (S48-R14): anything that rounds to 10 shows as an integer
    expect(displayMacroGrams('10.00')).toBe('10');
    expect(displayMacroGrams('10.04')).toBe('10');
    expect(displayMacroGrams('10')).toBe('10');
    expect(displayMacroGrams('10.49')).toBe('10');
    expect(displayMacroGrams('10.5')).toBe('11');
    expect(displayCalories('0')).toBe('0');
    expect(displayCalories('1999.6')).toBe('2000');
  });

  it('keeps the magnitude when a display input has fewer decimals than the target (integer inputs)', () => {
    // integer strings enter the scale<=dp branch: the coefficient must be
    // rescaled, not reused (review: displayMacroGrams('5') was '0.5')
    expect(displayMacroGrams('5')).toBe('5.0');
    expect(displayMacroGrams('45')).toBe('45');
    expect(displayCalories('5')).toBe('5');
    expect(displayCalories('45')).toBe('45');
  });

  it('does not pollute object prototypes for dangerous document ids', () => {
    const sentinel = Object.prototype.toString;
    const doc = singleDayDoc([
      meal('m-1', [
        item('__proto__', FOOD_F1, 3, '37', { kind: 'basis', value: 'g' }),
        item('toString', FOOD_F1, 3, '37', { kind: 'basis', value: 'g' }),
      ]),
    ]);
    const values = computeDocumentValues(doc, SNAPSHOT_MAP);
    expect(Object.prototype.toString).toBe(sentinel);
    expect(values.items['__proto__']).toEqual({
      kcal: '92.500',
      protein: '4.5658',
      carbs: '18.5000',
      fat: '4.5658',
    });
    expect(values.items['toString']).toEqual({
      kcal: '92.500',
      protein: '4.5658',
      carbs: '18.5000',
      fat: '4.5658',
    });
  });

  it('derives aggregates from exact item values, never from rounded items', () => {
    // three items of 1.175 g each: each item displays 0.1 (protein), but the
    // exact sum 0.4349850 displays 0.4 — the golden demands the exact sum
    const doc = singleDayDoc([
      meal('m-1', [
        item('i-1', FOOD_F1, 3, '1.175', { kind: 'basis', value: 'g' }),
        item('i-2', FOOD_F1, 3, '1.175', { kind: 'basis', value: 'g' }),
        item('i-3', FOOD_F1, 3, '1.175', { kind: 'basis', value: 'g' }),
      ]),
    ]);
    const values = computeDocumentValues(doc, SNAPSHOT_MAP);
    // 12.34 × 1.175 / 100 = 0.144995 exactly, scale = 2 + 3 + 2 = 7
    expect(values.items['i-1']).toEqual({
      kcal: '2.937500',
      protein: '0.1449950',
      carbs: '0.5875000',
      fat: '0.1449950',
    });
    expect(values.meals['m-1']).toEqual({
      kcal: '8.812500',
      protein: '0.4349850',
      carbs: '1.7625000',
      fat: '0.4349850',
    });
    // each displayed item is 0.1, but the meal total displays 0.4 from the exact sum
    expect(displayMacroGrams(values.items['i-1']!.protein)).toBe('0.1');
    expect(displayMacroGrams(values.meals['m-1']!.protein)).toBe('0.4');
    // the stored aggregate is the exact sum, not the sum of displayed values
    expect(values.meals['m-1']!.protein).toBe('0.4349850');
    expect(values.meals['m-1']!.protein).not.toBe('0.3000000');
  });

  it('counts each meal only in its containing day regardless of day type', () => {
    // days 0 and 3 hold different meals; every day type is rest (no filtering)
    const doc = sevenDayDoc([
      {
        dayIndex: 0,
        meals: [
          meal('m-0', [
            item('i-0a', FOOD_F1, 3, '100', { kind: 'basis', value: 'g' }),
          ]),
        ],
      },
      {
        dayIndex: 3,
        meals: [
          meal('m-3', [
            item('i-3a', FOOD_F1, 4, '200', { kind: 'basis', value: 'g' }),
          ]),
        ],
      },
    ]);
    const values = computeDocumentValues(doc, SNAPSHOT_MAP);
    // day 0: protein 12.34 per 100 g at 100 g → 12.34 exactly
    expect(values.days['0']).toEqual({
      kcal: '250.000',
      protein: '12.3400',
      carbs: '50.0000',
      fat: '12.3400',
    });
    // day 3: protein 30.00 per 100 g at 200 g → 60.00 — must not include day 0's values
    expect(values.days['3']).toEqual({
      kcal: '800.000',
      protein: '60.0000',
      carbs: '20.0000',
      fat: '10.0000',
    });
    // a day holding no meals counts zero
    expect(values.days['1']).toEqual({
      kcal: '0',
      protein: '0',
      carbs: '0',
      fat: '0',
    });
    // document totals are the exact sum of the day totals
    expect(values.totals).toEqual({
      kcal: '1050.000',
      protein: '72.3400',
      carbs: '70.0000',
      fat: '22.3400',
    });
  });

  it('keeps basis and serving references distinct even when the catalog key matches the basis', () => {
    const doc = singleDayDoc([
      meal('m-1', [
        item('i-basis', FOOD_F3, 1, '100', { kind: 'basis', value: 'g' }),
        item('i-serving', FOOD_F3, 1, '1', { kind: 'serving', unitKey: 'g' }),
      ]),
    ]);
    const values = computeDocumentValues(doc, SNAPSHOT_MAP);
    // basis g: protein 20.00 per 100 g at 100 g → 20.0000 (scale 2+0+2)
    expect(values.items['i-basis']!.protein).toBe('20.0000');
    // serving key "g" with basisQuantity 30.000: 20.00 per 100 g at 30 g → 6 (scale 2+0+3+2)
    expect(values.items['i-serving']!.protein).toBe('6.0000000');
  });

  it('multiplies a serving quantity by the serving basis quantity exactly', () => {
    // 1.5 servings of a 30.000 g serving → 45.0000 g basis
    const doc = singleDayDoc([
      meal('m-1', [
        item('i-1', FOOD_F3, 1, '1.5', { kind: 'serving', unitKey: 'g' }),
      ]),
    ]);
    const values = computeDocumentValues(doc, SNAPSHOT_MAP);
    // kcal 300.0 per 100 g at 45 g → 135 exactly (scale 1+4+2 = 7)
    expect(values.items['i-1']).toEqual({
      kcal: '135.0000000',
      protein: '9.00000000',
      carbs: '9.00000000',
      fat: '4.50000000',
    });
  });

  it('keeps zero-valued foods exact and displayed as 0', () => {
    const doc = singleDayDoc([
      meal('m-1', [
        item('i-1', FOOD_F2, 2, '250', { kind: 'basis', value: 'ml' }),
      ]),
    ]);
    const values = computeDocumentValues(doc, SNAPSHOT_MAP);
    expect(values.items['i-1']).toEqual({
      kcal: '0.000',
      protein: '0.0000',
      carbs: '0.0000',
      fat: '0.0000',
    });
    expect(values.totals).toEqual({
      kcal: '0.000',
      protein: '0.0000',
      carbs: '0.0000',
      fat: '0.0000',
    });
    expect(displayCalories(values.items['i-1']!.kcal)).toBe('0');
    expect(displayMacroGrams(values.items['i-1']!.protein)).toBe('0');
  });

  it('computes alternative values and selected-alternative totals from the exact same algorithm', () => {
    const doc = validateNutritionDocument(
      {
        schemaVersion: NUTRITION_DOCUMENT_SCHEMA_VERSION,
        structure: 'single_day',
        implicitDayTypeId: 'dt-rest',
        dayTypes: DAY_TYPES,
        meals: [
          meal('m-1', [
            {
              id: 'i-1',
              foodId: FOOD_F1,
              foodVersion: 3,
              quantity: { value: '100', unit: { kind: 'basis', value: 'g' } },
              note: null,
              alternatives: [
                {
                  id: 'a-1',
                  foodId: FOOD_F1,
                  foodVersion: 4,
                  quantity: {
                    value: '150',
                    unit: { kind: 'basis', value: 'g' },
                  },
                },
              ],
            },
          ]),
        ],
        title: null,
        notes: null,
      },
      GOLDEN_CONTEXT,
    );
    const altValues = computeAlternativeValues(doc, SNAPSHOT_MAP);
    // alternative: protein 30.00 per 100 g at 150 g → 45 exactly
    expect(altValues['i-1']?.['a-1']).toEqual({
      kcal: '600.000',
      protein: '45.0000',
      carbs: '15.0000',
      fat: '7.5000',
    });
    const selected = computeDocumentValues(doc, SNAPSHOT_MAP, { 'i-1': 'a-1' });
    expect(selected.items['i-1']).toEqual(altValues['i-1']?.['a-1']);
    expect(selected.totals).toEqual(altValues['i-1']?.['a-1']);
    // the coach-authored values are unchanged when no selection is applied
    const unselected = computeDocumentValues(doc, SNAPSHOT_MAP);
    expect(unselected.items['i-1']).toEqual({
      kcal: '250.000',
      protein: '12.3400',
      carbs: '50.0000',
      fat: '12.3400',
    });
    expect(unselected.totals).toEqual(unselected.meals['m-1']);
  });

  it('derives single-day totals from the implicit day and meal values from exact items', () => {
    const doc = singleDayDoc([
      meal('m-1', [
        item('i-1', FOOD_F1, 3, '37.5', { kind: 'basis', value: 'g' }),
      ]),
      meal('m-2', [
        item('i-2', FOOD_F1, 3, '62.5', { kind: 'basis', value: 'g' }),
      ]),
    ]);
    const values = computeDocumentValues(doc, SNAPSHOT_MAP);
    // 12.34 × 62.5 / 100 = 7.7125 exactly (scale 2+1+2 = 5)
    expect(values.items['i-2']).toEqual({
      kcal: '156.2500',
      protein: '7.71250',
      carbs: '31.25000',
      fat: '7.71250',
    });
    expect(values.days['0']).toEqual({
      kcal: '250.0000',
      protein: '12.34000',
      carbs: '50.00000',
      fat: '12.34000',
    });
    expect(values.totals).toEqual(values.days['0']);
  });
});
