import type { NutritionSnapshotEntry } from '../../../../lib/plans/nutrition/macros';
import type { NutritionDocumentV1 } from '../../../../lib/plans/nutrition/schema';

/**
 * F18 T025 slice 1 showcase fixtures. Everything here is mocked on purpose:
 * the real editor receives snapshot entries and a document from its host, so
 * the preview never fetches and never saves.
 */

export const mockFoods: readonly NutritionSnapshotEntry[] = [
  {
    kind: 'basis',
    foodId: 'food-chicken',
    version: 3,
    names: { ar: 'صدور فراخ مشوية', en: 'Grilled chicken breast' },
    basis: 'g',
    productIdentity: 'chicken breast',
    preparationIdentity: 'grilled',
    weighingState: 'cooked',
    per100: {
      kcal: '165',
      protein: '31',
      carbs: '0',
      fat: '3.6',
      fiber: null,
    },
  },
  {
    kind: 'basis',
    foodId: 'food-rice',
    version: 2,
    names: { ar: 'أرز أبيض مطبوخ', en: 'Cooked white rice' },
    basis: 'g',
    productIdentity: 'white rice',
    preparationIdentity: 'boiled',
    weighingState: 'cooked',
    per100: {
      kcal: '130',
      protein: '2.7',
      carbs: '28',
      fat: '0.3',
      fiber: '0.4',
    },
  },
  {
    kind: 'basis',
    foodId: 'food-oats',
    version: 4,
    names: { ar: 'شوفان بالحليب', en: 'Oats with milk' },
    basis: 'g',
    productIdentity: 'oats',
    preparationIdentity: 'cooked with milk',
    weighingState: 'cooked',
    per100: {
      kcal: '120',
      protein: '5',
      carbs: '18',
      fat: '3',
      fiber: '2',
    },
  },
  {
    kind: 'serving',
    unitKey: 'cup',
    snapshot: {
      foodId: 'food-yogurt',
      version: 1,
      names: { ar: 'زبادي يوناني', en: 'Greek yogurt' },
      basis: 'g',
      productIdentity: 'greek yogurt',
      preparationIdentity: 'plain',
      weighingState: 'not_applicable',
      kcal: '86',
      protein: '10',
      carbs: '3.5',
      fat: '2.9',
      fiber: '0',
      serving: {
        servingId: 'serving-yogurt-cup',
        labels: { ar: 'كوب', en: 'cup' },
        basisQuantity: '170',
      },
    },
  },
];

export function mockPlanDocument(): NutritionDocumentV1 {
  return {
    schemaVersion: 1,
    structure: 'single_day',
    dayTypes: [
      {
        id: 'training',
        name: { ar: 'يوم تمرين', en: 'Training day' },
        trainingDay: true,
        targets: null,
      },
      {
        id: 'rest',
        name: { ar: 'يوم راحة', en: 'Rest day' },
        trainingDay: false,
        targets: null,
      },
    ],
    implicitDayTypeId: 'training',
    meals: [
      {
        id: 'meal-breakfast',
        name: { ar: 'الفطار', en: 'Breakfast' },
        note: 'يبدأ اليوم بشوفان قبل التمرين',
        recipeUrl: null,
        items: [
          {
            id: 'item-oats',
            foodId: 'food-oats',
            foodVersion: 4,
            quantity: { value: '200', unit: { kind: 'basis', value: 'g' } },
            note: 'بدون سكر',
            alternatives: [
              {
                id: 'alt-yogurt',
                foodId: 'food-yogurt',
                foodVersion: 1,
                quantity: {
                  value: '1',
                  unit: { kind: 'serving', unitKey: 'cup' },
                },
              },
            ],
          },
        ],
      },
      {
        id: 'meal-lunch',
        name: { ar: 'الغدا', en: 'Lunch' },
        note: 'الوجبة الرئيسية بعد التمرين',
        recipeUrl: null,
        items: [
          {
            id: 'item-chicken',
            foodId: 'food-chicken',
            foodVersion: 3,
            quantity: { value: '180', unit: { kind: 'basis', value: 'g' } },
            note: 'مشوي على الفحم',
            alternatives: [
              {
                id: 'alt-rice',
                foodId: 'food-rice',
                foodVersion: 2,
                quantity: { value: '150', unit: { kind: 'basis', value: 'g' } },
              },
              {
                id: 'alt-oats',
                foodId: 'food-oats',
                foodVersion: 4,
                quantity: { value: '120', unit: { kind: 'basis', value: 'g' } },
              },
            ],
          },
        ],
      },
    ],
    title: { ar: 'خطة ٦ أسابيع', en: 'Six-week plan' },
    notes: null,
  };
}
