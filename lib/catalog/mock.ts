import { toExerciseListItem, toFoodListItem } from './list';
import { normalizeExerciseInput, normalizeFoodInput } from './schemas';

// Mock projections for the T017 shell, its unit tests and the dev showcase.
// These are not seeded catalog content and are never written to the database.
const exerciseSeeds = [
  {
    names: { ar: 'ضغط الصدر بالبار', en: 'Barbell Bench Press' },
    primaryMuscle: 'Chest',
    equipment: 'Barbell',
  },
  {
    names: { ar: 'سحب أمامي', en: 'Lat Pulldown' },
    primaryMuscle: 'Lats',
    equipment: 'Cable',
  },
  {
    names: { ar: 'تمرين الضغط', en: 'Push-Up' },
    primaryMuscle: 'Chest',
    equipment: 'Bodyweight',
  },
  {
    names: { ar: 'تمرين مؤرشف', en: 'Archived Curl' },
    primaryMuscle: 'Biceps',
    equipment: 'Dumbbell',
    lifecycleState: 'removed',
  },
  {
    names: { ar: 'رفعة مؤرشفة', en: 'Archived Squat' },
    primaryMuscle: 'Quads',
    equipment: 'Barbell',
    lifecycleState: 'superseded',
  },
];

const foodSeeds = [
  {
    names: { ar: 'صدر الدجاج', en: 'Chicken Breast' },
    basis: 'g',
    productIdentity: 'chicken breast',
    preparationIdentity: 'grilled',
    weighingState: 'cooked',
    kcal: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    servings: [{ labels: { ar: 'حصة', en: 'Serving' }, basisQuantity: 100 }],
  },
  {
    names: { ar: 'أرز مطبوخ', en: 'Cooked Rice' },
    basis: 'g',
    productIdentity: 'white rice',
    preparationIdentity: 'cooked',
    weighingState: 'cooked',
    kcal: 130,
    protein: 2.7,
    carbs: 28,
    fat: 0.3,
    servings: [{ labels: { ar: 'حصة', en: 'Serving' }, basisQuantity: 100 }],
  },
  {
    names: { ar: 'حليب', en: 'Milk' },
    basis: 'ml',
    productIdentity: 'whole milk',
    preparationIdentity: 'ready to drink',
    weighingState: 'not_applicable',
    kcal: 61,
    protein: 3.2,
    carbs: 4.8,
    fat: 3.3,
    servings: [{ labels: { ar: 'كوب', en: 'Cup' }, basisQuantity: 250 }],
  },
  {
    names: { ar: 'طعام مؤرشف', en: 'Archived Food' },
    basis: 'g',
    productIdentity: 'archived sample',
    preparationIdentity: 'cooked',
    weighingState: 'cooked',
    kcal: 100,
    protein: 10,
    carbs: 10,
    fat: 2,
    lifecycleState: 'removed',
    servings: [{ labels: { ar: 'حصة', en: 'Serving' }, basisQuantity: 100 }],
  },
];

export const mockExerciseItems = exerciseSeeds.map((seed, index) =>
  toExerciseListItem(
    `mock-exercise-${index + 1}`,
    normalizeExerciseInput(seed),
  ),
);

export const mockFoodItems = foodSeeds.map((seed, index) =>
  toFoodListItem(`mock-food-${index + 1}`, normalizeFoodInput(seed)),
);
