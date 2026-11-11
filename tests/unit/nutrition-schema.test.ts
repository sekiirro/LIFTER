import { describe, expect, it } from 'vitest';
import {
  NUTRITION_DOCUMENT_SCHEMA_VERSION,
  NutritionDocumentError,
  validateNutritionDocument,
  type FoodVersionUnitContext,
  type NutritionDocumentV1,
} from '../../lib/plans/nutrition/schema';

// Food version unit context used by the fixtures: (foodId@version) -> basis and
// declared catalog serving unit keys (F18-FR-004; contract section 2.5).
const FOOD_A: FoodVersionUnitContext = {
  basis: 'g',
  servingUnitKeys: ['scoop', 'g'],
};
const FOOD_B: FoodVersionUnitContext = {
  basis: 'ml',
  servingUnitKeys: ['cup'],
};
const CONTEXT: Record<string, FoodVersionUnitContext> = {
  '11111111-1111-1111-1111-111111111111@3': FOOD_A,
  '22222222-2222-2222-2222-222222222222@2': FOOD_B,
};

function item(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'i-1',
    foodId: '11111111-1111-1111-1111-111111111111',
    foodVersion: 3,
    quantity: { value: '37.5', unit: { kind: 'basis', value: 'g' } },
    note: null,
    alternatives: [],
    ...overrides,
  };
}

function meal(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'm-1',
    name: { ar: 'فطور', en: 'Breakfast' },
    note: null,
    recipeUrl: null,
    items: [item()],
    ...overrides,
  };
}

function dayType(
  id: string,
  trainingDay: boolean,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    name: { ar: 'يوم تمرين', en: 'Training day' },
    trainingDay,
    targets: null,
    ...overrides,
  };
}

function singleDayDocument(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: NUTRITION_DOCUMENT_SCHEMA_VERSION,
    structure: 'single_day',
    implicitDayTypeId: 'dt-rest',
    dayTypes: [dayType('dt-rest', false)],
    meals: [meal()],
    title: { ar: 'خطة', en: 'Plan' },
    notes: null,
    ...overrides,
  };
}

function sevenDayDocument(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: NUTRITION_DOCUMENT_SCHEMA_VERSION,
    structure: 'seven_day',
    dayTypes: [dayType('dt-train', true), dayType('dt-rest', false)],
    days: Array.from({ length: 7 }, (_, dayIndex) => ({
      dayIndex,
      dayTypeId: dayIndex % 2 === 0 ? 'dt-train' : 'dt-rest',
      meals: [
        meal({ id: `m-${dayIndex}`, items: [item({ id: `i-${dayIndex}` })] }),
      ],
    })),
    title: null,
    notes: null,
    ...overrides,
  };
}

function expectReject(
  document: unknown,
  context: Record<string, FoodVersionUnitContext> = CONTEXT,
  code?: string,
  field?: string,
): void {
  let caught: unknown;
  try {
    validateNutritionDocument(document, context);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(NutritionDocumentError);
  const err = caught as NutritionDocumentError;
  if (code) expect(err.code).toBe(code);
  if (field) expect(err.field).toBe(field);
}

describe('nutrition document v1 validator (F18-FR-002, T001)', () => {
  it('accepts the valid single-day fixture (GREEN)', () => {
    const parsed = validateNutritionDocument(singleDayDocument(), CONTEXT);
    expect(parsed.structure).toBe('single_day');
    expect(parsed.implicitDayTypeId).toBe('dt-rest');
    expect(parsed.meals).toHaveLength(1);
  });

  it('accepts the valid seven-day fixture (GREEN)', () => {
    const parsed = validateNutritionDocument(sevenDayDocument(), CONTEXT);
    expect(parsed.structure).toBe('seven_day');
    expect(parsed.days!).toHaveLength(7);
    expect(parsed.days!.map((d) => d.dayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('rejects single_day without implicitDayTypeId', () => {
    const doc = singleDayDocument();
    delete doc.implicitDayTypeId;
    expectReject(doc, CONTEXT, 'implicit_day_type_id', 'implicitDayTypeId');
  });

  it('rejects single_day that also carries a days array (mutually exclusive containers)', () => {
    expectReject(singleDayDocument({ days: [] }), CONTEXT, 'structure', 'days');
  });

  it('rejects seven_day with implicitDayTypeId present', () => {
    expectReject(
      sevenDayDocument({ implicitDayTypeId: 'dt-train' }),
      CONTEXT,
      'implicit_day_type_id',
      'implicitDayTypeId',
    );
  });

  it('rejects seven_day with a duplicate dayIndex and a missing dayIndex', () => {
    const dup = sevenDayDocument();
    (dup.days as Record<string, unknown>[])[6] = {
      dayIndex: 0,
      dayTypeId: 'dt-train',
      meals: [],
    };
    expectReject(dup, CONTEXT, 'day_index', 'days[6].dayIndex');
    const missing = sevenDayDocument();
    (missing.days as Record<string, unknown>[]).splice(3, 1);
    expectReject(missing, CONTEXT, 'day_index', 'days');
  });

  it('rejects seven_day with an unresolvable dayTypeId reference', () => {
    const doc = sevenDayDocument();
    (doc.days as Record<string, unknown>[])[2] = {
      dayIndex: 2,
      dayTypeId: 'dt-missing',
      meals: [],
    };
    expectReject(doc, CONTEXT, 'unresolved_reference', 'days[2].dayTypeId');
  });

  it('rejects duplicate meal ids, item ids and alternative ids within the document', () => {
    expectReject(
      singleDayDocument({ meals: [meal(), meal()] }),
      CONTEXT,
      'duplicate_id',
    );
    expectReject(
      singleDayDocument({
        meals: [meal(), meal({ id: 'm-2', items: [item(), item()] })],
      }),
      CONTEXT,
      'duplicate_id',
    );
    expectReject(
      singleDayDocument({
        meals: [
          meal({
            items: [
              item({
                alternatives: [
                  {
                    id: 'a-1',
                    foodId: '11111111-1111-1111-1111-111111111111',
                    foodVersion: 3,
                    quantity: {
                      value: '1',
                      unit: { kind: 'serving', unitKey: 'scoop' },
                    },
                  },
                ],
              }),
            ],
          }),
          meal({
            id: 'm-2',
            items: [
              item({
                alternatives: [
                  {
                    id: 'a-1',
                    foodId: '11111111-1111-1111-1111-111111111111',
                    foodVersion: 3,
                    quantity: {
                      value: '1',
                      unit: { kind: 'serving', unitKey: 'scoop' },
                    },
                  },
                ],
              }),
            ],
          }),
        ],
      }),
      CONTEXT,
      'duplicate_id',
    );
  });

  it('rejects duplicate day-type ids', () => {
    expectReject(
      singleDayDocument({
        dayTypes: [dayType('dt-rest', false), dayType('dt-rest', true)],
      }),
      CONTEXT,
      'duplicate_id',
    );
  });

  it('rejects unknown keys at every level (strict parse)', () => {
    expectReject(
      singleDayDocument({ sneaky: true }),
      CONTEXT,
      'unknown_key',
      'document.sneaky',
    );
    expectReject(
      singleDayDocument({ meals: [meal({ clientIds: ['c-1'] })] }),
      CONTEXT,
      'unknown_key',
      'meals[0].clientIds',
    );
    expectReject(
      singleDayDocument({
        meals: [meal({ items: [item({ computedKcal: '100' })] })],
      }),
      CONTEXT,
      'unknown_key',
      'meals[0].items[0].computedKcal',
    );
  });

  it('rejects non-positive, malformed or over-precise quantities', () => {
    for (const value of [
      '0',
      '0.000',
      '-1',
      '+1',
      '1e2',
      '1,5',
      '١٢',
      '1.',
      '.5',
      '',
    ]) {
      expectReject(
        singleDayDocument({
          meals: [
            meal({
              items: [
                item({
                  quantity: { value, unit: { kind: 'basis', value: 'g' } },
                }),
              ],
            }),
          ],
        }),
        CONTEXT,
        'quantity',
      );
    }
    expectReject(
      singleDayDocument({
        meals: [
          meal({
            items: [
              item({
                quantity: {
                  value: '1.0001',
                  unit: { kind: 'basis', value: 'g' },
                },
              }),
            ],
          }),
        ],
      }),
      CONTEXT,
      'quantity',
    );
  });

  it('accepts boundary quantities 0.001 and 9999.999 at three decimals', () => {
    validateNutritionDocument(
      singleDayDocument({
        meals: [
          meal({
            items: [
              item({
                quantity: {
                  value: '0.001',
                  unit: { kind: 'basis', value: 'g' },
                },
              }),
            ],
          }),
        ],
      }),
      CONTEXT,
    );
    validateNutritionDocument(
      singleDayDocument({
        meals: [
          meal({
            items: [
              item({
                quantity: {
                  value: '9999.999',
                  unit: { kind: 'basis', value: 'g' },
                },
              }),
            ],
          }),
        ],
      }),
      CONTEXT,
    );
  });

  it('rejects a non-declared serving unit for the referenced food version', () => {
    expectReject(
      singleDayDocument({
        meals: [
          meal({
            items: [
              item({
                quantity: {
                  value: '1',
                  unit: { kind: 'serving', unitKey: 'tablespoon' },
                },
              }),
            ],
          }),
        ],
      }),
      CONTEXT,
      'unit',
    );
  });

  it('rejects a cross-basis request (basis unit not matching the food basis)', () => {
    expectReject(
      singleDayDocument({
        meals: [
          meal({
            items: [
              item({
                quantity: {
                  value: '100',
                  unit: { kind: 'basis', value: 'ml' },
                },
              }),
            ],
          }),
        ],
      }),
      CONTEXT,
      'unit',
    );
  });

  it('accepts a catalog serving key that equals the food basis (tagged serving)', () => {
    const parsed = validateNutritionDocument(
      singleDayDocument({
        meals: [
          meal({
            items: [
              item({
                quantity: {
                  value: '1',
                  unit: { kind: 'serving', unitKey: 'g' },
                },
              }),
            ],
          }),
        ],
      }),
      CONTEXT,
    );
    const q = parsed.meals![0]?.items[0]?.quantity;
    expect(q).toEqual({ value: '1', unit: { kind: 'serving', unitKey: 'g' } });
  });

  it('rejects at most three alternatives per item (F18-FR-006)', () => {
    const alts = [1, 2, 3, 4].map((n) => ({
      id: `a-${n}`,
      foodId: '11111111-1111-1111-1111-111111111111',
      foodVersion: 3,
      quantity: { value: '1', unit: { kind: 'serving', unitKey: 'scoop' } },
    }));
    expectReject(
      singleDayDocument({
        meals: [meal({ items: [item({ alternatives: alts })] })],
      }),
      CONTEXT,
      'alternative_limit',
    );
    const three = validateNutritionDocument(
      singleDayDocument({
        meals: [meal({ items: [item({ alternatives: alts.slice(0, 3) })] })],
      }),
      CONTEXT,
    );
    expect(three.meals![0]?.items[0]?.alternatives).toHaveLength(3);
  });

  it('rejects wrong-host and non-HTTPS recipe URLs (D18-6)', () => {
    for (const url of [
      'http://www.youtube.com/watch?v=x',
      'https://example.com/watch?v=x',
      'https://docs.google.com/document/d/x',
      'https://drive.google.com.evil.test/x',
      'not a url',
      'https://user:pass@drive.google.com/file/d/x',
    ]) {
      expectReject(
        singleDayDocument({ meals: [meal({ recipeUrl: url })] }),
        CONTEXT,
        'recipe_url',
      );
    }
  });

  it('accepts YouTube and Google Drive HTTPS recipe URLs', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=x',
      'https://youtu.be/x',
      'https://drive.google.com/file/d/x',
    ]) {
      const parsed = validateNutritionDocument(
        singleDayDocument({ meals: [meal({ recipeUrl: url })] }),
        CONTEXT,
      );
      expect(parsed.meals![0]?.recipeUrl).toBe(url);
    }
  });

  it('validates Meal Notes and Food Notes as separate fields (F18-FR-023)', () => {
    const parsed = validateNutritionDocument(
      singleDayDocument({
        meals: [
          meal({
            note: 'Meal notes text',
            items: [item({ note: 'Food notes text' })],
          }),
        ],
      }),
      CONTEXT,
    );
    const m = parsed.meals![0];
    expect(m?.note).toBe('Meal notes text');
    expect(m?.items[0]?.note).toBe('Food notes text');
    // clearing one preserves the other: both independently optional
    const clearedMealNote = validateNutritionDocument(
      singleDayDocument({
        meals: [
          meal({ note: null, items: [item({ note: 'Food notes text' })] }),
        ],
      }),
      CONTEXT,
    );
    expect(clearedMealNote.meals![0]?.note).toBeNull();
    expect(clearedMealNote.meals![0]?.items[0]?.note).toBe('Food notes text');
    const clearedFoodNote = validateNutritionDocument(
      singleDayDocument({
        meals: [
          meal({ note: 'Meal notes text', items: [item({ note: null })] }),
        ],
      }),
      CONTEXT,
    );
    expect(clearedFoodNote.meals![0]?.note).toBe('Meal notes text');
    expect(clearedFoodNote.meals![0]?.items[0]?.note).toBeNull();
  });

  it('validates targets: null is valid and totals are still computed (D18-2=A)', () => {
    const parsed = validateNutritionDocument(
      singleDayDocument({
        dayTypes: [dayType('dt-rest', false, { targets: null })],
      }),
      CONTEXT,
    );
    expect(parsed.dayTypes[0]?.targets).toBeNull();
  });

  it('rejects negative or over-precise targets and unknown target keys', () => {
    expectReject(
      singleDayDocument({
        dayTypes: [
          dayType('dt-rest', false, {
            targets: { kcal: '-1', protein: '1', carbs: '1', fat: '1' },
          }),
        ],
      }),
      CONTEXT,
      'targets',
    );
    expectReject(
      singleDayDocument({
        dayTypes: [
          dayType('dt-rest', false, {
            targets: { kcal: '1.0001', protein: '1', carbs: '1', fat: '1' },
          }),
        ],
      }),
      CONTEXT,
      'targets',
    );
    expectReject(
      singleDayDocument({
        dayTypes: [
          dayType('dt-rest', false, {
            targets: {
              kcal: '1',
              protein: '1',
              carbs: '1',
              fat: '1',
              sugar: '1',
            },
          }),
        ],
      }),
      CONTEXT,
      'unknown_key',
    );
  });

  it('keeps every meal visible on its containing day regardless of day type (no day-type filter)', () => {
    // all-rest seven-day plan with different meals per day: nothing is filtered
    const doc = sevenDayDocument({
      dayTypes: [dayType('dt-train', false), dayType('dt-rest', false)],
    });
    const parsed = validateNutritionDocument(
      doc,
      CONTEXT,
    ) as NutritionDocumentV1;
    expect(parsed.days!).toHaveLength(7);
    const day0 = parsed.days?.[0];
    const day6 = parsed.days?.[6];
    expect(day0?.meals!.map((m) => m.id)).toEqual(['m-0']);
    expect(day6?.meals!.map((m) => m.id)).toEqual(['m-6']);
    // a meal stored in one days[] entry never appears on another day
    expect(day6?.meals!.map((m) => m.id)).not.toContain('m-0');
    // single implicit day whose day type is rest still holds its meals
    const singleRest = validateNutritionDocument(singleDayDocument(), CONTEXT);
    expect(singleRest.meals).toHaveLength(1);
    expect(singleRest.dayTypes[0]?.trainingDay).toBe(false);
  });

  it('rejects a schemaVersion other than 1 (frozen validator per version)', () => {
    expectReject(
      singleDayDocument({ schemaVersion: 2 }),
      CONTEXT,
      'schema_version',
    );
  });

  it('rejects a document that is not an object or is missing the structure discriminant', () => {
    expectReject(null, CONTEXT, 'structure');
    expectReject([], CONTEXT, 'structure');
    expectReject({ schemaVersion: 1 }, CONTEXT, 'structure');
  });
});
