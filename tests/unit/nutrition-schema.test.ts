import { describe, expect, it } from 'vitest';
import {
  normalizeNutritionDocument,
  NutritionValidationError,
} from '../../lib/plans/nutrition/schema';

const trainingDayTypeId = '11111111-1111-1111-1111-111111111111';
const restDayTypeId = '22222222-2222-2222-2222-222222222222';
const foodVersionId = '33333333-3333-3333-3333-333333333333';
const alternativeFoodVersionId = '44444444-4444-4444-4444-444444444444';
const mealId = '55555555-5555-5555-5555-555555555555';
const secondMealId = '66666666-6666-6666-6666-666666666666';
const itemId = '77777777-7777-7777-7777-777777777777';
const secondItemId = '99999999-9999-9999-9999-999999999999';
const alternativeId = '88888888-8888-8888-8888-888888888888';

type Targets = {
  calories?: string;
  protein?: string;
  carbs?: string;
  fat?: string;
};

function dayType(id: string, trainingDay: boolean, targets?: Targets): unknown {
  return {
    id,
    name: trainingDay ? 'Training' : 'Rest',
    trainingDay,
    ...(targets !== undefined ? { targets } : {}),
  };
}

function itemEntry(
  overrides: {
    id?: string;
    foodVersionId?: string;
    quantity?: { value: string; unit: string };
    notes?: string;
    alternatives?: unknown[];
  } = {},
): Record<string, unknown> {
  return {
    id: itemId,
    foodVersionId,
    quantity: { value: '100', unit: 'g', ...(overrides.quantity ?? {}) },
    ...(overrides.notes !== undefined ? { notes: overrides.notes } : {}),
    alternatives: overrides.alternatives ?? [],
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
    ...(overrides.foodVersionId !== undefined
      ? { foodVersionId: overrides.foodVersionId }
      : {}),
  };
}

function mealEntry(
  overrides: {
    id?: string;
    conditional?: 'always' | 'training_days_only';
    items?: unknown[];
    recipeVideoUrl?: string;
  } = {},
): Record<string, unknown> {
  return {
    id: mealId,
    conditional: 'always',
    items: [itemEntry()],
    ...(overrides.recipeVideoUrl !== undefined
      ? { recipeVideoUrl: overrides.recipeVideoUrl }
      : {}),
    ...(overrides.conditional !== undefined
      ? { conditional: overrides.conditional }
      : {}),
    ...(overrides.items !== undefined ? { items: overrides.items } : {}),
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
  };
}

function validSingleDay(
  overrides: {
    structure?: unknown;
    dayTypes?: unknown[];
    meals?: unknown[];
  } = {},
): Record<string, unknown> {
  return {
    structure: { kind: 'single_day', implicitDayTypeId: trainingDayTypeId },
    dayTypes: [dayType(trainingDayTypeId, true)],
    meals: [mealEntry()],
    ...overrides,
  };
}

function validSevenDay(
  overrides: {
    structure?: unknown;
    dayTypes?: unknown[];
    meals?: unknown[];
  } = {},
): Record<string, unknown> {
  return {
    structure: {
      kind: 'seven_day',
      days: [
        { dayIndex: 0, dayTypeId: trainingDayTypeId },
        { dayIndex: 1, dayTypeId: restDayTypeId },
        { dayIndex: 2, dayTypeId: trainingDayTypeId },
        { dayIndex: 3, dayTypeId: restDayTypeId },
        { dayIndex: 4, dayTypeId: trainingDayTypeId },
        { dayIndex: 5, dayTypeId: restDayTypeId },
        { dayIndex: 6, dayTypeId: restDayTypeId },
      ],
    },
    dayTypes: [dayType(trainingDayTypeId, true), dayType(restDayTypeId, false)],
    meals: [
      mealEntry({ id: mealId, items: [itemEntry({ id: itemId })] }),
      mealEntry({
        id: secondMealId,
        conditional: 'training_days_only',
        items: [itemEntry({ id: secondItemId })],
      }),
    ],
    ...overrides,
  };
}

function assertAccepted(document: unknown): void {
  const result = normalizeNutritionDocument(document);
  expect(result).toBeDefined();
  expect(result.structure).toBeDefined();
  expect(Array.isArray(result.dayTypes)).toBe(true);
  expect(Array.isArray(result.meals)).toBe(true);
}

function assertRejected(document: unknown): void {
  expect(() => normalizeNutritionDocument(document)).toThrow(
    NutritionValidationError,
  );
}

describe('Nutrition document schema v1 (lib/plans/nutrition/schema.ts)', () => {
  describe('rejections (FR-002 unless noted)', () => {
    it('rejects single_day without implicitDayTypeId — FR-002: implicitDayTypeId is always required (spec.md:85)', () => {
      assertRejected({
        structure: { kind: 'single_day' },
        dayTypes: [dayType(trainingDayTypeId, true)],
        meals: [mealEntry()],
      });
    });

    it('rejects single_day whose implicitDayTypeId does not resolve — FR-002: implicitDayTypeId resolves to a day type (spec.md:85)', () => {
      assertRejected({
        ...validSingleDay(),
        structure: {
          kind: 'single_day',
          implicitDayTypeId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        },
      });
    });

    it('rejects seven_day with duplicate dayIndex — FR-002: dayIndex 0-6 each exactly once (spec.md:85)', () => {
      assertRejected({
        ...validSevenDay(),
        structure: {
          kind: 'seven_day',
          days: [
            { dayIndex: 0, dayTypeId: trainingDayTypeId },
            { dayIndex: 0, dayTypeId: restDayTypeId },
            { dayIndex: 1, dayTypeId: restDayTypeId },
            { dayIndex: 2, dayTypeId: restDayTypeId },
            { dayIndex: 3, dayTypeId: restDayTypeId },
            { dayIndex: 4, dayTypeId: restDayTypeId },
            { dayIndex: 5, dayTypeId: restDayTypeId },
            { dayIndex: 6, dayTypeId: restDayTypeId },
          ],
        },
      });
    });

    it('rejects seven_day with missing dayIndex — FR-002: dayIndex 0-6 each exactly once (spec.md:85)', () => {
      assertRejected({
        ...validSevenDay(),
        structure: {
          kind: 'seven_day',
          days: [
            { dayIndex: 0, dayTypeId: trainingDayTypeId },
            { dayIndex: 1, dayTypeId: restDayTypeId },
            { dayIndex: 2, dayTypeId: trainingDayTypeId },
            { dayIndex: 3, dayTypeId: restDayTypeId },
            { dayIndex: 4, dayTypeId: trainingDayTypeId },
            { dayIndex: 5, dayTypeId: restDayTypeId },
          ],
        },
      });
    });

    it('rejects seven_day with unresolved dayTypeId — FR-002: every dayTypeId resolves (spec.md:85)', () => {
      assertRejected({
        ...validSevenDay(),
        structure: {
          kind: 'seven_day',
          days: [
            { dayIndex: 0, dayTypeId: trainingDayTypeId },
            { dayIndex: 1, dayTypeId: restDayTypeId },
            { dayIndex: 2, dayTypeId: trainingDayTypeId },
            { dayIndex: 3, dayTypeId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
            { dayIndex: 4, dayTypeId: trainingDayTypeId },
            { dayIndex: 5, dayTypeId: restDayTypeId },
            { dayIndex: 6, dayTypeId: restDayTypeId },
          ],
        },
      });
    });

    it('rejects structure without kind — FR-002: structure is single_day or seven_day (spec.md:85)', () => {
      assertRejected({
        ...validSingleDay(),
        structure: { implicitDayTypeId: trainingDayTypeId },
      });
    });

    it('rejects training_days_only meal on a rest single_day — FR-002: every meal resolves to at least one day (spec.md:85)', () => {
      assertRejected({
        ...validSingleDay(),
        dayTypes: [dayType(restDayTypeId, false)],
        meals: [mealEntry({ conditional: 'training_days_only' })],
      });
    });

    it('rejects training_days_only meal on an all-rest seven_day — FR-002: every meal resolves to at least one day (spec.md:85)', () => {
      assertRejected({
        ...validSevenDay(),
        structure: {
          kind: 'seven_day',
          days: [
            { dayIndex: 0, dayTypeId: restDayTypeId },
            { dayIndex: 1, dayTypeId: restDayTypeId },
            { dayIndex: 2, dayTypeId: restDayTypeId },
            { dayIndex: 3, dayTypeId: restDayTypeId },
            { dayIndex: 4, dayTypeId: restDayTypeId },
            { dayIndex: 5, dayTypeId: restDayTypeId },
            { dayIndex: 6, dayTypeId: restDayTypeId },
          ],
        },
        dayTypes: [dayType(restDayTypeId, false)],
        meals: [mealEntry({ conditional: 'training_days_only' })],
      });
    });

    it.each([['0'], ['0.000'], ['-5'], ['']])(
      'rejects non-positive quantity %p — FR-002: quantities must be positive (spec.md:85)',
      (value) => {
        assertRejected({
          ...validSingleDay(),
          meals: [
            mealEntry({
              items: [itemEntry({ quantity: { value, unit: 'g' } })],
            }),
          ],
        });
      },
    );

    it('rejects negative calorie target — FR-002: targets must be non-negative (spec.md:85)', () => {
      assertRejected({
        ...validSingleDay(),
        dayTypes: [
          dayType(trainingDayTypeId, true, {
            calories: '-5',
            protein: '50',
            carbs: '50',
            fat: '20',
          }),
        ],
      });
    });

    it('rejects quantity with four decimal places — FR-003: document quantities have at most three decimals (spec.md:86)', () => {
      assertRejected({
        ...validSingleDay(),
        meals: [
          mealEntry({
            items: [itemEntry({ quantity: { value: '10.0000', unit: 'g' } })],
          }),
        ],
      });
    });

    it('rejects duplicate meal id — FR-002: meal ids unique within the document (spec.md:85)', () => {
      assertRejected({
        ...validSingleDay(),
        meals: [mealEntry(), mealEntry()],
      });
    });

    it('rejects duplicate item id across meals — FR-002: item ids unique within the document (spec.md:85)', () => {
      assertRejected({
        ...validSevenDay(),
        meals: [
          mealEntry({ id: mealId, items: [itemEntry({ id: itemId })] }),
          mealEntry({
            id: secondMealId,
            items: [itemEntry({ id: itemId })],
          }),
        ],
      });
    });

    it('rejects an ID reused across day types and meals — FR-002: all document IDs are unique (spec.md:85)', () => {
      assertRejected({
        ...validSingleDay(),
        meals: [mealEntry({ id: trainingDayTypeId })],
      });
    });

    it.each([
      ['http://youtube.com/watch?v=x'],
      ['https://example.com/x'],
      ['ftp://drive.google.com/file/d/x/view'],
    ])(
      'rejects %p as a recipe video link — FR-002 / D18-6: HTTPS YouTube or Google Drive only (spec.md:85)',
      (url) => {
        assertRejected({
          ...validSingleDay(),
          meals: [mealEntry({ recipeVideoUrl: url })],
        });
      },
    );
  });

  describe('acceptances (FR-002 unless noted)', () => {
    it('accepts a valid single_day document — FR-002 (spec.md:85)', () => {
      assertAccepted(validSingleDay());
    });

    it('accepts a single_day document whose training_days_only meal reaches the implicit training day — FR-002 (spec.md:85)', () => {
      assertAccepted({
        ...validSingleDay(),
        meals: [mealEntry({ conditional: 'training_days_only' })],
      });
    });

    it('accepts a valid seven_day document with day types, conditional meals and items referencing exact F16 food version ids — FR-002 / task (spec.md:85)', () => {
      assertAccepted(validSevenDay());
    });

    it('accepts a seven_day document where every day is a rest day and only always meals are present — spec edge case (spec.md: Edge Cases)', () => {
      assertAccepted({
        ...validSevenDay(),
        structure: {
          kind: 'seven_day',
          days: [
            { dayIndex: 0, dayTypeId: restDayTypeId },
            { dayIndex: 1, dayTypeId: restDayTypeId },
            { dayIndex: 2, dayTypeId: restDayTypeId },
            { dayIndex: 3, dayTypeId: restDayTypeId },
            { dayIndex: 4, dayTypeId: restDayTypeId },
            { dayIndex: 5, dayTypeId: restDayTypeId },
            { dayIndex: 6, dayTypeId: restDayTypeId },
          ],
        },
        dayTypes: [dayType(restDayTypeId, false)],
        meals: [mealEntry({ id: mealId })],
      });
    });

    it('accepts optional non-negative targets and a meal without a video link — FR-002 / D18-2=A / D18-6 (spec.md:85)', () => {
      assertAccepted({
        ...validSingleDay(),
        dayTypes: [
          dayType(trainingDayTypeId, true, {
            calories: '2500',
            protein: '150',
            carbs: '250',
            fat: '80',
          }),
        ],
        meals: [mealEntry()],
      });
    });

    it('accepts HTTPS YouTube and Google Drive recipe video links — FR-002 / D18-6 (spec.md:85)', () => {
      assertAccepted({
        ...validSingleDay(),
        meals: [
          mealEntry({ recipeVideoUrl: 'https://www.youtube.com/watch?v=x' }),
          mealEntry({
            id: secondMealId,
            recipeVideoUrl: 'https://drive.google.com/file/d/abc/view',
            items: [itemEntry({ id: secondItemId })],
          }),
        ],
      });
    });

    it('accepts an item with manual alternatives referencing exact food version ids — FR-002 (spec.md:85)', () => {
      assertAccepted({
        ...validSingleDay(),
        meals: [
          mealEntry({
            items: [
              itemEntry({
                alternatives: [
                  {
                    id: alternativeId,
                    foodVersionId: alternativeFoodVersionId,
                    quantity: { value: '200', unit: 'g' },
                  },
                ],
              }),
            ],
          }),
        ],
      });
    });
  });
});
