import {
  computeNutritionMacroTotals,
  type NutritionFoodSnapshot,
  type NutritionMacroInput,
} from '../../lib/plans/nutrition/macros';
import type {
  NutritionDocument,
  Meal,
  Quantity,
} from '../../lib/plans/nutrition/schema';

export function visibleMealsForDay(
  document: NutritionDocument,
  dayIndex: number,
): Meal[] {
  const dayTypeId =
    document.structure.kind === 'single_day'
      ? document.structure.implicitDayTypeId
      : document.structure.days.find((day) => day.dayIndex === dayIndex)
          ?.dayTypeId;
  const dayType = document.dayTypes.find((type) => type.id === dayTypeId);
  if (!dayType) return [];
  return document.meals.filter(
    (meal) => meal.conditional === 'always' || dayType.trainingDay,
  );
}

export function assignDayType(
  document: NutritionDocument,
  dayIndex: number,
  dayTypeId: string,
): NutritionDocument {
  if (document.structure.kind === 'single_day')
    return {
      ...document,
      structure: { ...document.structure, implicitDayTypeId: dayTypeId },
    };
  return {
    ...document,
    structure: {
      ...document.structure,
      days: document.structure.days.map((day) =>
        day.dayIndex === dayIndex ? { ...day, dayTypeId } : day,
      ),
    },
  };
}

export function updateItemQuantity(
  document: NutritionDocument,
  itemId: string,
  quantity: Quantity,
): NutritionDocument {
  return {
    ...document,
    meals: document.meals.map((meal) => ({
      ...meal,
      items: meal.items.map((item) =>
        item.id === itemId ? { ...item, quantity: { ...quantity } } : item,
      ),
    })),
  };
}

export function moveMeal(
  document: NutritionDocument,
  mealId: string,
  direction: 'up' | 'down',
): NutritionDocument {
  const index = document.meals.findIndex((meal) => meal.id === mealId);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= document.meals.length)
    return document;
  const meals = [...document.meals];
  [meals[index], meals[target]] = [meals[target]!, meals[index]!];
  return { ...document, meals };
}

export function duplicateMeal(
  document: NutritionDocument,
  mealId: string,
  createId: () => string,
): NutritionDocument {
  const source = document.meals.find((meal) => meal.id === mealId);
  if (!source) return document;
  const duplicate: Meal = {
    ...source,
    id: createId(),
    items: source.items.map((item) => ({
      ...item,
      id: createId(),
      quantity: { ...item.quantity },
      alternatives: item.alternatives.map((alternative) => ({
        ...alternative,
        id: createId(),
        quantity: { ...alternative.quantity },
      })),
    })),
  };
  const index = document.meals.findIndex((meal) => meal.id === mealId);
  const meals = [...document.meals];
  meals.splice(index + 1, 0, duplicate);
  return { ...document, meals };
}

export function nutritionTotalsForDay(
  document: NutritionDocument,
  dayIndex: number,
  snapshots: readonly NutritionFoodSnapshot[],
) {
  const byVersion = new Map(
    snapshots.map((snapshot) => [snapshot.foodVersionId, snapshot]),
  );
  const inputs: NutritionMacroInput[] = [];
  for (const meal of visibleMealsForDay(document, dayIndex)) {
    for (const item of meal.items) {
      const snapshot = byVersion.get(item.foodVersionId);
      if (!snapshot)
        throw new Error(`Missing nutrition snapshot: ${item.foodVersionId}`);
      inputs.push({ snapshot, quantity: item.quantity });
    }
  }
  return computeNutritionMacroTotals(inputs);
}
