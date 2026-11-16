import type {
  NutritionSnapshotEntry,
  NutritionSnapshotMap,
} from '../../../lib/plans/nutrition/macros';
import { snapshotMapKey } from '../../../lib/plans/nutrition/macros';
import {
  nutritionUnitContextKey,
  type NutritionAlternative,
  type NutritionDayType,
  type NutritionDocumentV1,
  type NutritionItem,
  type NutritionMeal,
  type NutritionQuantityUnit,
  type NutritionUnitContext,
} from '../../../lib/plans/nutrition/schema';

/**
 * F18 T025 slice 1 editor helpers (F18-FR-002, F18-FR-006, F18-FR-021,
 * F18-FR-023). Pure, immutable operations only: every macro value and every
 * validity decision is delegated to the merged `lib/plans/nutrition` macros
 * and schema modules. Meals are never filtered by day type, and the meal note
 * and food note setters touch exactly one field.
 */

export type DaySlot = {
  dayIndex: number;
  dayType: NutritionDayType | null;
  meals: NutritionMeal[];
};

export type IdFactory = () => string;

/** Exact food version identity of either snapshot entry kind. */
export function entryIdentity(entry: NutritionSnapshotEntry): {
  foodId: string;
  version: number;
} {
  return entry.kind === 'basis'
    ? { foodId: entry.foodId, version: entry.version }
    : { foodId: entry.snapshot.foodId, version: entry.snapshot.version };
}

/** Build the snapshot map keyed exactly as `computeDocumentValues` looks up. */
export function snapshotMapFromEntries(
  entries: readonly NutritionSnapshotEntry[],
): NutritionSnapshotMap {
  const map: NutritionSnapshotMap = Object.create(null);
  for (const entry of entries) {
    const unit: NutritionQuantityUnit =
      entry.kind === 'basis'
        ? { kind: 'basis', value: entry.basis }
        : { kind: 'serving', unitKey: entry.unitKey };
    const { foodId, version } = entryIdentity(entry);
    map[snapshotMapKey(foodId, version, unit)] = entry;
  }
  return map;
}

/** Declared basis and serving units per exact food version (schema context). */
export function unitContextFromEntries(
  entries: readonly NutritionSnapshotEntry[],
): NutritionUnitContext {
  const context: NutritionUnitContext = {};
  for (const entry of entries) {
    const { foodId, version } = entryIdentity(entry);
    const key = nutritionUnitContextKey(foodId, version);
    const current = context[key];
    const basis = entry.kind === 'basis' ? entry.basis : entry.snapshot.basis;
    const servingUnitKeys = current ? [...current.servingUnitKeys] : [];
    if (entry.kind === 'serving' && !servingUnitKeys.includes(entry.unitKey)) {
      servingUnitKeys.push(entry.unitKey);
    }
    context[key] = { basis, servingUnitKeys };
  }
  return context;
}

/** Bilingual names of one snapshot entry, whichever kind it is. */
export function entryNames(entry: NutritionSnapshotEntry): {
  ar?: string;
  en?: string;
} {
  return entry.kind === 'basis' ? entry.names : entry.snapshot.names;
}

/** Catalog serving labels of one snapshot entry (null for basis entries). */
export function entryServingLabels(
  entry: NutritionSnapshotEntry,
): { ar?: string; en?: string } | null {
  return entry.kind === 'serving' ? entry.snapshot.serving.labels : null;
}

/** True when the exact food version + unit is present in the snapshot map. */
export function isAvailable(
  snapshotMap: NutritionSnapshotMap,
  foodId: string,
  foodVersion: number,
  unit: NutritionQuantityUnit,
): boolean {
  return snapshotMap[snapshotMapKey(foodId, foodVersion, unit)] !== undefined;
}

/** Every day slot in the document, in day order; never filtered by day type. */
export function daySlots(document: NutritionDocumentV1): DaySlot[] {
  const dayTypeOf = (id: string | undefined) =>
    document.dayTypes.find((type) => type.id === id) ?? null;
  if (document.structure === 'single_day') {
    return [
      {
        dayIndex: 0,
        dayType: dayTypeOf(document.implicitDayTypeId),
        meals: document.meals ?? [],
      },
    ];
  }
  return (document.days ?? [])
    .slice()
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((day) => ({
      dayIndex: day.dayIndex,
      dayType: dayTypeOf(day.dayTypeId),
      meals: day.meals,
    }));
}

/** Meals of one day. Day type never filters visibility or totals. */
export function mealsForDay(
  document: NutritionDocumentV1,
  dayIndex: number,
): NutritionMeal[] {
  return (
    daySlots(document).find((slot) => slot.dayIndex === dayIndex)?.meals ?? []
  );
}

function mapMealLists(
  document: NutritionDocumentV1,
  update: (meals: NutritionMeal[]) => NutritionMeal[],
): NutritionDocumentV1 {
  if (document.structure === 'single_day') {
    return { ...document, meals: update(document.meals ?? []) };
  }
  return {
    ...document,
    days: (document.days ?? []).map((day) => ({
      ...day,
      meals: update(day.meals),
    })),
  };
}

function mapItem(
  document: NutritionDocumentV1,
  itemId: string,
  update: (item: NutritionItem) => NutritionItem,
): NutritionDocumentV1 {
  return mapMealLists(document, (meals) =>
    meals.map((meal) => ({
      ...meal,
      items: meal.items.map((item) =>
        item.id === itemId ? update(item) : item,
      ),
    })),
  );
}

function moveWithin<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const next = list.slice();
  const moved = next[index]!;
  next[index] = next[target]!;
  next[target] = moved;
  return next;
}

/** Reorder one meal inside its own day (keyboard alternative to drag). */
export function moveMeal(
  document: NutritionDocumentV1,
  mealId: string,
  delta: -1 | 1,
): NutritionDocumentV1 {
  return mapMealLists(document, (meals) =>
    moveWithin(
      meals,
      meals.findIndex((meal) => meal.id === mealId),
      delta,
    ),
  );
}

/** Reorder one alternative inside its item (keyboard alternative to drag). */
export function moveAlternative(
  document: NutritionDocumentV1,
  itemId: string,
  alternativeId: string,
  delta: -1 | 1,
): NutritionDocumentV1 {
  return mapItem(document, itemId, (item) => ({
    ...item,
    alternatives: moveWithin(
      item.alternatives,
      item.alternatives.findIndex((entry) => entry.id === alternativeId),
      delta,
    ),
  }));
}

/** Meal Notes: sets only this meal's note; empty text clears to null. */
export function setMealNote(
  document: NutritionDocumentV1,
  mealId: string,
  note: string | null,
): NutritionDocumentV1 {
  const normalized = note === null || note.trim() === '' ? null : note;
  return mapMealLists(document, (meals) =>
    meals.map((meal) =>
      meal.id === mealId ? { ...meal, note: normalized } : meal,
    ),
  );
}

/** Food Notes: sets only this item's note; empty text clears to null. */
export function setItemNote(
  document: NutritionDocumentV1,
  itemId: string,
  note: string | null,
): NutritionDocumentV1 {
  const normalized = note === null || note.trim() === '' ? null : note;
  return mapItem(document, itemId, (item) => ({ ...item, note: normalized }));
}

export function setItemQuantity(
  document: NutritionDocumentV1,
  itemId: string,
  value: string,
): NutritionDocumentV1 {
  return mapItem(document, itemId, (item) => ({
    ...item,
    quantity: { ...item.quantity, value },
  }));
}

export function setAlternativeQuantity(
  document: NutritionDocumentV1,
  itemId: string,
  alternativeId: string,
  value: string,
): NutritionDocumentV1 {
  return mapItem(document, itemId, (item) => ({
    ...item,
    alternatives: item.alternatives.map((entry) =>
      entry.id === alternativeId
        ? { ...entry, quantity: { ...entry.quantity, value } }
        : entry,
    ),
  }));
}

export function removeMeal(
  document: NutritionDocumentV1,
  mealId: string,
): NutritionDocumentV1 {
  return mapMealLists(document, (meals) =>
    meals.filter((meal) => meal.id !== mealId),
  );
}

export function removeItem(
  document: NutritionDocumentV1,
  itemId: string,
): NutritionDocumentV1 {
  return mapMealLists(document, (meals) =>
    meals.map((meal) => ({
      ...meal,
      items: meal.items.filter((item) => item.id !== itemId),
    })),
  );
}

export function removeAlternative(
  document: NutritionDocumentV1,
  itemId: string,
  alternativeId: string,
): NutritionDocumentV1 {
  return mapItem(document, itemId, (item) => ({
    ...item,
    alternatives: item.alternatives.filter(
      (entry) => entry.id !== alternativeId,
    ),
  }));
}

/** Append one alternative, refusing a fourth (F18-FR-006 max three). */
export function addAlternative(
  document: NutritionDocumentV1,
  itemId: string,
  alternative: NutritionAlternative,
): NutritionDocumentV1 {
  return mapItem(document, itemId, (item) =>
    item.alternatives.length >= 3
      ? item
      : { ...item, alternatives: [...item.alternatives, alternative] },
  );
}

/** Insert one meal into the named day. */
export function addMeal(
  document: NutritionDocumentV1,
  dayIndex: number,
  meal: NutritionMeal,
): NutritionDocumentV1 {
  if (document.structure === 'single_day') {
    return { ...document, meals: [...(document.meals ?? []), meal] };
  }
  return {
    ...document,
    days: (document.days ?? []).map((day) =>
      day.dayIndex === dayIndex ? { ...day, meals: [...day.meals, meal] } : day,
    ),
  };
}

/** Deep-copy one meal with fresh meal/item/alternative ids. */
export function duplicateMeal(
  document: NutritionDocumentV1,
  mealId: string,
  newId: IdFactory,
): NutritionDocumentV1 {
  return mapMealLists(document, (meals) => {
    const index = meals.findIndex((meal) => meal.id === mealId);
    if (index < 0) return meals;
    const source = meals[index]!;
    const copy: NutritionMeal = {
      ...source,
      id: newId(),
      items: source.items.map((item) => ({
        ...item,
        id: newId(),
        alternatives: item.alternatives.map((entry) => ({
          ...entry,
          id: newId(),
        })),
      })),
    };
    const next = meals.slice();
    next.splice(index + 1, 0, copy);
    return next;
  });
}

/** Default unit for a newly added alternative of the chosen snapshot entry. */
export function unitForEntry(
  entry: NutritionSnapshotEntry,
): NutritionQuantityUnit {
  return entry.kind === 'basis'
    ? { kind: 'basis', value: entry.basis }
    : { kind: 'serving', unitKey: entry.unitKey };
}
