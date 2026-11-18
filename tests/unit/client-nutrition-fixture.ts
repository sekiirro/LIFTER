// Synthetic F18 nutrition revision for the F22 client view/export unit tests.
import {
  computeDocumentValues,
  snapshotMapKey,
  type NutritionSnapshotMap,
} from '../../lib/plans/nutrition/macros';
import type { NutritionDocumentV1 } from '../../lib/plans/nutrition/types';

export const PLAN_ID = '11111111-1111-4111-8111-aaaaaaaaaaaa';
export const WORKSPACE_ID = '22222222-2222-4222-8222-bbbbbbbbbbbb';
export const CLIENT_ID = '33333333-3333-4333-8333-cccccccccccc';
export const REVISION_ID = '44444444-4444-4444-8444-dddddddddddd';
export const ITEM_ID = '11111111-1111-4111-8111-111111111111';
export const ALT_ONE = '22222222-2222-4222-8222-222222222222';
export const ALT_TWO = '33333333-3333-4333-8333-333333333333';

const unit = { kind: 'basis', value: 'g' } as const;

export const document = {
  schemaVersion: 1,
  structure: 'single_day',
  implicitDayTypeId: 'dt-rest',
  dayTypes: [
    {
      id: 'dt-rest',
      name: { ar: 'راحة', en: 'Rest' },
      trainingDay: false,
      targets: null,
    },
  ],
  meals: [
    {
      id: 'm-1',
      name: { ar: 'فطور', en: 'Breakfast' },
      note: '=HYPERLINK("https://example.invalid","x") meal note',
      recipeUrl: null,
      items: [
        {
          id: ITEM_ID,
          foodId: '00000000-0000-4000-8000-000000000001',
          foodVersion: 1,
          quantity: { value: '100', unit },
          note: null,
          alternatives: [
            {
              id: ALT_ONE,
              foodId: '00000000-0000-4000-8000-000000000002',
              foodVersion: 1,
              quantity: { value: '150', unit },
            },
            {
              id: ALT_TWO,
              foodId: '00000000-0000-4000-8000-000000000003',
              foodVersion: 1,
              quantity: { value: '200', unit },
            },
          ],
        },
      ],
    },
  ],
  title: { ar: 'خطة اختبار', en: 'Synthetic Plan' },
  notes: null,
} as unknown as NutritionDocumentV1;

function entry(n: number, nameEn: string, kcal: string, protein: string) {
  return {
    foodId: `00000000-0000-4000-8000-00000000000${n}`,
    foodVersion: 1,
    kind: 'basis',
    unit,
    names: { ar: nameEn, en: nameEn },
    per100: { kcal, protein, carbs: '10', fat: '2' },
  };
}

export const snapshotMap = Object.fromEntries(
  [
    [1, 'Coach Original Food', '100', '10'],
    [2, 'Alternative One', '150', '15'],
    [3, 'Alternative Two', '200', '20'],
  ].map(([n, name, kcal, protein]) => [
    snapshotMapKey(`00000000-0000-4000-8000-00000000000${n}`, 1, unit),
    entry(n as number, name as string, kcal as string, protein as string),
  ]),
) as unknown as NutritionSnapshotMap;

export const computedValues = computeDocumentValues(document, snapshotMap);

export function rawOk(
  overrides: {
    selections?: Array<{ item_id: string; alternative_id: string }>;
    revisionNumber?: number;
  } = {},
) {
  return {
    status: 'ok',
    subscription: { status: 'active', effective_end_exclusive: '2027-01-01' },
    plan: {
      plan_id: PLAN_ID,
      workspace_id: WORKSPACE_ID,
      client_id: CLIENT_ID,
      revision_id: REVISION_ID,
      revision_number: overrides.revisionNumber ?? 2,
      published_at: '2026-11-10T12:00:00Z',
    },
    content: {
      document,
      snapshot_map: snapshotMap,
      computed_values: computedValues,
    },
    selections: overrides.selections ?? [],
  };
}
