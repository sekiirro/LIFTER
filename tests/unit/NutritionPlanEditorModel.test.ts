import { describe, expect, it } from 'vitest';
import type { NutritionSnapshotEntry } from '../../lib/plans/nutrition/macros';
import type {
  NutritionDocumentV1,
  NutritionMeal,
} from '../../lib/plans/nutrition/schema';
import {
  addAlternative,
  daySlots,
  duplicateMeal,
  entryIdentity,
  entryNames,
  isAvailable,
  mealsForDay,
  moveAlternative,
  moveMeal,
  removeAlternative,
  removeItem,
  removeMeal,
  setAlternativeQuantity,
  setItemNote,
  setItemQuantity,
  setMealNote,
  snapshotMapFromEntries,
  unitContextFromEntries,
} from '../../components/plans/nutrition/model';

const FOODS: NutritionSnapshotEntry[] = [
  {
    kind: 'basis',
    foodId: 'chicken',
    version: 1,
    names: { ar: 'فراخ', en: 'Chicken' },
    basis: 'g',
    productIdentity: 'chicken',
    preparationIdentity: 'grilled',
    weighingState: 'cooked',
    per100: { kcal: '165', protein: '31', carbs: '0', fat: '3.6', fiber: null },
  },
  {
    kind: 'basis',
    foodId: 'rice',
    version: 1,
    names: { ar: 'رز', en: 'Rice' },
    basis: 'g',
    productIdentity: 'rice',
    preparationIdentity: 'boiled',
    weighingState: 'cooked',
    per100: {
      kcal: '130',
      protein: '2.7',
      carbs: '28',
      fat: '0.3',
      fiber: null,
    },
  },
  {
    kind: 'serving',
    unitKey: 'slice',
    snapshot: {
      foodId: 'bread',
      version: 2,
      names: { ar: 'عيش', en: 'Bread' },
      basis: 'g',
      productIdentity: 'bread',
      preparationIdentity: 'baked',
      weighingState: 'cooked',
      kcal: '80',
      protein: '3',
      carbs: '14',
      fat: '1',
      fiber: null,
      serving: {
        servingId: 'slice-1',
        labels: { ar: 'شريحة', en: 'Slice' },
        basisQuantity: '30',
      },
    },
  },
];

function meal(id: string, items: NutritionMeal['items'] = []): NutritionMeal {
  return {
    id,
    name: { ar: `وجبة ${id}`, en: `Meal ${id}` },
    note: null,
    recipeUrl: null,
    items,
  };
}

const ITEM = {
  id: 'item-chicken',
  foodId: 'chicken',
  foodVersion: 1,
  quantity: { value: '150', unit: { kind: 'basis', value: 'g' } } as const,
  note: 'food note',
  alternatives: [
    {
      id: 'alt-rice',
      foodId: 'rice',
      foodVersion: 1,
      quantity: { value: '100', unit: { kind: 'basis', value: 'g' } } as const,
    },
  ],
};

function singleDay(): NutritionDocumentV1 {
  return {
    schemaVersion: 1,
    structure: 'single_day',
    dayTypes: [
      {
        id: 'rest',
        name: { ar: 'راحة', en: 'Rest' },
        trainingDay: false,
        targets: null,
      },
    ],
    implicitDayTypeId: 'rest',
    meals: [meal('a', [{ ...ITEM }]), meal('b')],
    title: null,
    notes: null,
  };
}

function sevenDay(): NutritionDocumentV1 {
  const dayTypes = [
    {
      id: 'train',
      name: { ar: 'تمرين', en: 'Training' },
      trainingDay: true,
      targets: null,
    },
    {
      id: 'rest',
      name: { ar: 'راحة', en: 'Rest' },
      trainingDay: false,
      targets: null,
    },
  ];
  return {
    schemaVersion: 1,
    structure: 'seven_day',
    dayTypes,
    days: Array.from({ length: 7 }, (_, index) => ({
      dayIndex: index,
      dayTypeId: index === 2 ? 'rest' : 'train',
      meals:
        index === 2
          ? [meal('rest-a', [{ ...ITEM }]), meal('rest-b')]
          : [meal(`day-${index}`)],
    })),
    title: null,
    notes: null,
  };
}

describe('nutrition editor model (F18-FR-002, F18-FR-006, F18-FR-021)', () => {
  it('keys the snapshot map for basis and serving entries and detects gaps', () => {
    const map = snapshotMapFromEntries(FOODS);
    expect(isAvailable(map, 'chicken', 1, { kind: 'basis', value: 'g' })).toBe(
      true,
    );
    expect(
      isAvailable(map, 'bread', 2, { kind: 'serving', unitKey: 'slice' }),
    ).toBe(true);
    expect(isAvailable(map, 'bread', 2, { kind: 'basis', value: 'g' })).toBe(
      false,
    );
    expect(isAvailable(map, 'chicken', 9, { kind: 'basis', value: 'g' })).toBe(
      false,
    );
    expect(entryIdentity(FOODS[2]!)).toEqual({ foodId: 'bread', version: 2 });
    expect(entryNames(FOODS[2]!)).toEqual({ ar: 'عيش', en: 'Bread' });
  });

  it('builds the validator context for basis, serving and merged versions', () => {
    const context = unitContextFromEntries(FOODS);
    expect(context['chicken@1']).toEqual({ basis: 'g', servingUnitKeys: [] });
    expect(context['bread@2']).toEqual({
      basis: 'g',
      servingUnitKeys: ['slice'],
    });
  });

  it('never filters meals by day type', () => {
    const slots = daySlots(singleDay());
    expect(slots).toHaveLength(1);
    expect(slots[0]!.dayType?.trainingDay).toBe(false);
    expect(slots[0]!.meals.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(mealsForDay(singleDay(), 0)).toHaveLength(2);

    const week = daySlots(sevenDay());
    expect(week[2]!.dayType?.trainingDay).toBe(false);
    expect(week[2]!.meals.map((entry) => entry.id)).toEqual([
      'rest-a',
      'rest-b',
    ]);
    expect(mealsForDay(sevenDay(), 2).map((entry) => entry.id)).toEqual([
      'rest-a',
      'rest-b',
    ]);
  });

  it('keeps meal notes and food notes independent and clearable', () => {
    const withMeal = setMealNote(singleDay(), 'a', 'eat slowly');
    expect(withMeal.meals?.[0]?.note).toBe('eat slowly');
    expect(withMeal.meals?.[0]?.items[0]?.note).toBe('food note');
    expect(singleDay().meals?.[0]?.note).toBeNull();

    const withFood = setItemNote(withMeal, 'item-chicken', 'no skin');
    expect(withFood.meals?.[0]?.note).toBe('eat slowly');
    expect(withFood.meals?.[0]?.items[0]?.note).toBe('no skin');

    const clearedMeal = setMealNote(withFood, 'a', '');
    expect(clearedMeal.meals?.[0]?.note).toBeNull();
    expect(clearedMeal.meals?.[0]?.items[0]?.note).toBe('no skin');

    const clearedFood = setItemNote(clearedMeal, 'item-chicken', '   ');
    expect(clearedFood.meals?.[0]?.items[0]?.note).toBeNull();
    expect(withFood.meals?.[0]?.note).toBe('eat slowly');
  });

  it('moves meals and alternatives without mutating the input', () => {
    const doc = singleDay();
    const moved = moveMeal(doc, 'a', 1);
    expect(moved.meals?.map((entry) => entry.id)).toEqual(['b', 'a']);
    expect(doc.meals?.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(moveMeal(doc, 'a', -1)).toEqual(doc);

    const week = moveMeal(sevenDay(), 'rest-a', 1);
    expect(week.days?.[2]?.meals.map((entry) => entry.id)).toEqual([
      'rest-b',
      'rest-a',
    ]);

    const withAlt = {
      ...doc,
      meals: [
        {
          ...doc.meals![0]!,
          items: [
            {
              ...ITEM,
              alternatives: [
                ...ITEM.alternatives.map((entry) => ({ ...entry })),
                {
                  id: 'alt-bread',
                  foodId: 'bread',
                  foodVersion: 2,
                  quantity: {
                    value: '1',
                    unit: { kind: 'serving' as const, unitKey: 'slice' },
                  },
                },
              ],
            },
          ],
        },
      ],
    } satisfies NutritionDocumentV1;
    const reordered = moveAlternative(withAlt, 'item-chicken', 'alt-bread', -1);
    expect(
      reordered.meals?.[0]?.items[0]?.alternatives.map((entry) => entry.id),
    ).toEqual(['alt-bread', 'alt-rice']);
  });

  it('updates quantities immutably and refuses a fourth alternative', () => {
    const doc = singleDay();
    const edited = setItemQuantity(doc, 'item-chicken', '200');
    expect(edited.meals?.[0]?.items[0]?.quantity.value).toBe('200');
    expect(doc.meals?.[0]?.items[0]?.quantity.value).toBe('150');

    const altEdited = setAlternativeQuantity(
      doc,
      'item-chicken',
      'alt-rice',
      '50',
    );
    expect(
      altEdited.meals?.[0]?.items[0]?.alternatives[0]?.quantity.value,
    ).toBe('50');

    let current = doc;
    for (const id of ['one', 'two']) {
      current = addAlternative(current, 'item-chicken', {
        id,
        foodId: 'rice',
        foodVersion: 1,
        quantity: { value: '10', unit: { kind: 'basis', value: 'g' } },
      });
    }
    expect(current.meals?.[0]?.items[0]?.alternatives).toHaveLength(3);
    const refused = addAlternative(current, 'item-chicken', {
      id: 'four',
      foodId: 'rice',
      foodVersion: 1,
      quantity: { value: '10', unit: { kind: 'basis', value: 'g' } },
    });
    expect(refused.meals?.[0]?.items[0]?.alternatives).toHaveLength(3);
  });

  it('duplicates a meal with fresh ids and removes nested records', () => {
    let counter = 0;
    const id = () => `new-${++counter}`;
    const doc = singleDay();
    const copied = duplicateMeal(doc, 'a', id);
    expect(copied.meals).toHaveLength(3);
    expect(copied.meals?.[1]?.id).toBe('new-1');
    expect(copied.meals?.[1]?.items[0]?.id).toBe('new-2');
    expect(copied.meals?.[1]?.items[0]?.alternatives[0]?.id).toBe('new-3');
    expect(copied.meals?.[1]?.items[0]?.note).toBe('food note');
    expect(doc.meals).toHaveLength(2);

    expect(removeMeal(doc, 'a').meals?.map((entry) => entry.id)).toEqual(['b']);
    expect(removeItem(doc, 'item-chicken').meals?.[0]?.items).toHaveLength(0);
    expect(
      removeAlternative(doc, 'item-chicken', 'alt-rice').meals?.[0]?.items[0]
        ?.alternatives,
    ).toHaveLength(0);
  });
});
