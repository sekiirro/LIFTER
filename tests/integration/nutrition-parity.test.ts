import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
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
import { sql } from './harness';

let db: ReturnType<typeof sql>;

beforeAll(() => {
  db = sql();
});

afterAll(async () => db?.end());

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
  [`food:${FOOD_F3}@1#serving:1%20cup%20%28240ml%29`]: servingEntry(
    FOOD_F3,
    1,
    { kcal: '300.0', protein: '20.00', carbs: '20.00', fat: '10.00' },
    '1 cup (240ml)',
    '240.000',
  ),
};

const DAY_TYPES = [
  {
    id: 'dt-rest',
    name: { ar: 'راحة', en: 'Rest' },
    trainingDay: false,
    targets: null,
  },
  {
    id: 'dt-train',
    name: { ar: 'تمرين', en: 'Training' },
    trainingDay: true,
    targets: { kcal: '2200', protein: '180', carbs: '220', fat: '70' },
  },
];

const GOLDEN_CONTEXT = {
  [`${FOOD_F1}@3`]: { basis: 'g', servingUnitKeys: ['g'] },
  [`${FOOD_F1}@4`]: { basis: 'g', servingUnitKeys: ['g'] },
  [`${FOOD_F2}@2`]: { basis: 'ml', servingUnitKeys: [] },
  [`${FOOD_F3}@1`]: { basis: 'g', servingUnitKeys: ['g', '1 cup (240ml)'] },
} as const;

function item(
  id: string,
  foodId: string,
  foodVersion: number,
  value: string,
  unit: Record<string, unknown>,
  alternatives: unknown[] = [],
) {
  return {
    id,
    foodId,
    foodVersion,
    quantity: { value, unit },
    note: null,
    alternatives,
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

async function computeInSql(
  doc: unknown,
  snapshotMap: NutritionSnapshotMap,
  selection: Record<string, string | null> | null = null,
) {
  const [row] = await db`
    select app_private.nutrition_compute_values(
      ${db.json(doc as never)},
      ${db.json(snapshotMap as never)},
      ${selection === null ? null : db.json(selection as never)}
    ) as computed
  `;
  return row!.computed;
}

describe('F18 T008 SQL app_private.nutrition_compute_values & TS parity', () => {
  it('installs the compute and display functions inside app_private', async () => {
    const [procs] = await db`
      select
        to_regprocedure('app_private.nutrition_compute_values(jsonb,jsonb,jsonb)')::text as compute_fn,
        to_regprocedure('app_private.nutrition_display_calories(text)')::text as kcal_fn,
        to_regprocedure('app_private.nutrition_display_macro_grams(text)')::text as macro_fn
    `;
    expect(procs).toEqual({
      compute_fn: 'app_private.nutrition_compute_values(jsonb,jsonb,jsonb)',
      kcal_fn: 'app_private.nutrition_display_calories(text)',
      macro_fn: 'app_private.nutrition_display_macro_grams(text)',
    });
  });

  it('matches TS display rounding for finite-decimal ties, double-rounding, and thresholds', async () => {
    const macroCases = [
      '0',
      '0.05',
      '0.15',
      '0.4',
      '1.44996',
      '1.449999',
      '1.45001',
      '2.45',
      '5',
      '9.94',
      '9.95',
      '9.96',
      '10',
      '10.00',
      '10.04',
      '10.49',
      '10.5',
      '45',
    ];
    for (const exact of macroCases) {
      const [row] = await db`
        select app_private.nutrition_display_macro_grams(${exact}) as val
      `;
      expect(row!.val).toBe(displayMacroGrams(exact));
    }

    const kcalCases = ['0', '1.5', '2.5', '5', '45', '92.500', '1999.6'];
    for (const exact of kcalCases) {
      const [row] = await db`
        select app_private.nutrition_display_calories(${exact}) as val
      `;
      expect(row!.val).toBe(displayCalories(exact));
    }
  });

  it('matches TS exact persistence without storage rounding (37 g worked example)', async () => {
    const doc = validateNutritionDocument(
      {
        schemaVersion: NUTRITION_DOCUMENT_SCHEMA_VERSION,
        structure: 'single_day',
        implicitDayTypeId: 'dt-rest',
        dayTypes: DAY_TYPES,
        meals: [
          meal('m-1', [
            item('i-1', FOOD_F1, 3, '37', { kind: 'basis', value: 'g' }),
          ]),
        ],
        title: null,
        notes: null,
      },
      GOLDEN_CONTEXT,
    );
    const tsValues = computeDocumentValues(doc, SNAPSHOT_MAP);
    const sqlValues = await computeInSql(doc, SNAPSHOT_MAP);
    expect(sqlValues).toEqual(tsValues);
  });

  it('derives aggregates from exact items, never from rounded items (3 x 1.175 g)', async () => {
    const doc = validateNutritionDocument(
      {
        schemaVersion: NUTRITION_DOCUMENT_SCHEMA_VERSION,
        structure: 'single_day',
        implicitDayTypeId: 'dt-rest',
        dayTypes: DAY_TYPES,
        meals: [
          meal('m-1', [
            item('i-1', FOOD_F1, 3, '1.175', { kind: 'basis', value: 'g' }),
            item('i-2', FOOD_F1, 3, '1.175', { kind: 'basis', value: 'g' }),
            item('i-3', FOOD_F1, 3, '1.175', { kind: 'basis', value: 'g' }),
          ]),
        ],
        title: null,
        notes: null,
      },
      GOLDEN_CONTEXT,
    );
    const tsValues = computeDocumentValues(doc, SNAPSHOT_MAP);
    const sqlValues = await computeInSql(doc, SNAPSHOT_MAP);
    expect(sqlValues).toEqual(tsValues);
    expect(sqlValues.meals['m-1'].protein).toBe('0.4349850');
  });

  it('counts every meal in its containing day regardless of day type (seven_day)', async () => {
    const doc = validateNutritionDocument(
      {
        schemaVersion: NUTRITION_DOCUMENT_SCHEMA_VERSION,
        structure: 'seven_day',
        dayTypes: DAY_TYPES,
        days: [
          {
            dayIndex: 0,
            dayTypeId: 'dt-rest',
            meals: [
              meal('m-0', [
                item('i-0a', FOOD_F1, 3, '100', { kind: 'basis', value: 'g' }),
              ]),
            ],
          },
          { dayIndex: 1, dayTypeId: 'dt-rest', meals: [] },
          { dayIndex: 2, dayTypeId: 'dt-train', meals: [] },
          {
            dayIndex: 3,
            dayTypeId: 'dt-train',
            meals: [
              meal('m-3', [
                item('i-3a', FOOD_F1, 4, '200', { kind: 'basis', value: 'g' }),
              ]),
            ],
          },
          { dayIndex: 4, dayTypeId: 'dt-rest', meals: [] },
          { dayIndex: 5, dayTypeId: 'dt-rest', meals: [] },
          { dayIndex: 6, dayTypeId: 'dt-train', meals: [] },
        ],
        title: null,
        notes: null,
      },
      GOLDEN_CONTEXT,
    );
    const tsValues = computeDocumentValues(doc, SNAPSHOT_MAP);
    const sqlValues = await computeInSql(doc, SNAPSHOT_MAP);
    expect(sqlValues).toEqual(tsValues);
  });

  it('handles basis vs serving disambiguation, percent-encoded unitKeys, zero-valued foods, and selected alternatives', async () => {
    const doc = validateNutritionDocument(
      {
        schemaVersion: NUTRITION_DOCUMENT_SCHEMA_VERSION,
        structure: 'single_day',
        implicitDayTypeId: 'dt-rest',
        dayTypes: DAY_TYPES,
        meals: [
          meal('m-1', [
            item('i-basis', FOOD_F3, 1, '100', { kind: 'basis', value: 'g' }),
            item('i-serving', FOOD_F3, 1, '1.5', {
              kind: 'serving',
              unitKey: 'g',
            }),
            item('i-encoded', FOOD_F3, 1, '2', {
              kind: 'serving',
              unitKey: '1 cup (240ml)',
            }),
            item('i-zero', FOOD_F2, 2, '250', { kind: 'basis', value: 'ml' }),
            item('i-alt', FOOD_F1, 3, '100', { kind: 'basis', value: 'g' }, [
              {
                id: 'a-1',
                foodId: FOOD_F1,
                foodVersion: 4,
                quantity: {
                  value: '150',
                  unit: { kind: 'basis', value: 'g' },
                },
              },
            ]),
          ]),
        ],
        title: null,
        notes: null,
      },
      GOLDEN_CONTEXT,
    );
    expect(await computeInSql(doc, SNAPSHOT_MAP)).toEqual(
      computeDocumentValues(doc, SNAPSHOT_MAP),
    );
    expect(await computeInSql(doc, SNAPSHOT_MAP, { 'i-alt': 'a-1' })).toEqual(
      computeDocumentValues(doc, SNAPSHOT_MAP, { 'i-alt': 'a-1' }),
    );
  });

  it('rejects a cross-basis unit or missing snapshot entry', async () => {
    const crossBasisDoc = {
      schemaVersion: NUTRITION_DOCUMENT_SCHEMA_VERSION,
      structure: 'single_day',
      implicitDayTypeId: 'dt-rest',
      dayTypes: DAY_TYPES,
      meals: [
        meal('m-1', [
          item('i-bad', FOOD_F1, 3, '100', { kind: 'basis', value: 'ml' }),
        ]),
      ],
      title: null,
      notes: null,
    };
    await expect(computeInSql(crossBasisDoc, SNAPSHOT_MAP)).rejects.toThrow();

    // Even if a forged snapshot map places a 'g' entry under the '#basis:ml' key, SQL must reject cross-basis
    const forgedMap: NutritionSnapshotMap = {
      ...SNAPSHOT_MAP,
      [`food:${FOOD_F1}@3#basis:ml`]: basisEntry(
        FOOD_F1,
        3,
        { kcal: '250.0', protein: '12.34', carbs: '50.00', fat: '12.34' },
        'g',
      ),
    };
    await expect(computeInSql(crossBasisDoc, forgedMap)).rejects.toThrow();
  });
});
