import type {
  Alternative,
  Item,
  Meal,
  NutritionDocument,
  Quantity,
} from './schema';

export type NutritionAlternativeSelection = Readonly<{
  itemId: string;
  alternativeId: string;
}>;

export type NutritionItemLocation = Readonly<{
  mealId: string;
  itemId: string;
}>;

export type NutritionItemIdAssignment = Readonly<{
  itemId: string;
  alternativeIds: readonly string[];
}>;

export type NutritionIdDisposition = 'retain' | 'replace' | 'remove';
export type NutritionSelectionDisposition = 'carry' | 'reset' | 'none';

export type NutritionIdContinuityRule = Readonly<{
  itemId: NutritionIdDisposition;
  alternativeId: NutritionIdDisposition;
  selection: NutritionSelectionDisposition;
}>;

export const NUTRITION_ID_CONTINUITY_RULES: Readonly<{
  quantity: NutritionIdContinuityRule;
  notes: NutritionIdContinuityRule;
  reorder: NutritionIdContinuityRule;
  move: NutritionIdContinuityRule;
  replaceItemFood: NutritionIdContinuityRule;
  replaceAlternativeFood: NutritionIdContinuityRule;
  remove: NutritionIdContinuityRule;
  duplicate: NutritionIdContinuityRule;
}> = Object.freeze({
  quantity: Object.freeze({
    itemId: 'retain',
    alternativeId: 'retain',
    selection: 'carry',
  }),
  notes: Object.freeze({
    itemId: 'retain',
    alternativeId: 'retain',
    selection: 'carry',
  }),
  reorder: Object.freeze({
    itemId: 'retain',
    alternativeId: 'retain',
    selection: 'carry',
  }),
  move: Object.freeze({
    itemId: 'retain',
    alternativeId: 'retain',
    selection: 'carry',
  }),
  replaceItemFood: Object.freeze({
    itemId: 'replace',
    alternativeId: 'replace',
    selection: 'reset',
  }),
  replaceAlternativeFood: Object.freeze({
    itemId: 'retain',
    alternativeId: 'replace',
    selection: 'reset',
  }),
  remove: Object.freeze({
    itemId: 'remove',
    alternativeId: 'remove',
    selection: 'reset',
  }),
  duplicate: Object.freeze({
    itemId: 'replace',
    alternativeId: 'replace',
    selection: 'none',
  }),
});

export class NutritionIdContinuityError extends Error {
  readonly code = 'invalid_nutrition_id_continuity';

  constructor(message: string) {
    super(message);
    this.name = 'NutritionIdContinuityError';
  }
}

type IndexedItem = {
  readonly item: Item;
  readonly mealId: string;
};

type IndexedAlternative = {
  readonly alternative: Alternative;
  readonly itemId: string;
};

type NutritionDocumentIndex = {
  readonly allIds: Set<string>;
  readonly meals: Map<string, Meal>;
  readonly items: Map<string, IndexedItem>;
  readonly alternatives: Map<string, IndexedAlternative>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new NutritionIdContinuityError(`${label} must be a UUID`);
  }
  return value;
}

function indexDocument(
  document: NutritionDocument,
  label: string,
): NutritionDocumentIndex {
  const allIds = new Set<string>();
  const meals = new Map<string, Meal>();
  const items = new Map<string, IndexedItem>();
  const alternatives = new Map<string, IndexedAlternative>();

  function claimId(value: unknown, idLabel: string): string {
    const id = requireUuid(value, idLabel);
    if (allIds.has(id)) {
      throw new NutritionIdContinuityError(`${idLabel} must be unique`);
    }
    allIds.add(id);
    return id;
  }

  for (const [mealIndex, meal] of document.meals.entries()) {
    const mealId = claimId(meal.id, `${label}.meals[${mealIndex}].id`);
    meals.set(mealId, meal);

    for (const [itemIndex, item] of meal.items.entries()) {
      const itemId = claimId(
        item.id,
        `${label}.meals[${mealIndex}].items[${itemIndex}].id`,
      );
      items.set(itemId, { item, mealId });

      for (const [
        alternativeIndex,
        alternative,
      ] of item.alternatives.entries()) {
        const alternativeId = claimId(
          alternative.id,
          `${label}.meals[${mealIndex}].items[${itemIndex}].alternatives[${alternativeIndex}].id`,
        );
        alternatives.set(alternativeId, { alternative, itemId });
      }
    }
  }

  return { allIds, meals, items, alternatives };
}

function findUniqueMatch<T>(
  values: readonly T[],
  isMatch: (value: T) => boolean,
): T | undefined {
  const matches = values.filter(isMatch);
  return matches.length === 1 ? matches[0] : undefined;
}

function quantityKey(quantity: Quantity): string {
  return JSON.stringify([quantity.value, quantity.unit]);
}

function alternativeKey(alternative: Alternative): string {
  return JSON.stringify([
    alternative.foodVersionId,
    quantityKey(alternative.quantity),
  ]);
}

function itemKey(item: Item): string {
  return JSON.stringify([
    item.foodVersionId,
    quantityKey(item.quantity),
    item.notes ?? null,
    item.alternatives.map(alternativeKey),
  ]);
}

function matchItems(
  previous: NutritionDocumentIndex,
  candidate: NutritionDocumentIndex,
): Map<string, string> {
  const matches = new Map<string, string>();
  const usedPreviousIds = new Set<string>();

  for (const indexedItem of candidate.items.values()) {
    const previousItem = previous.items.get(indexedItem.item.id);
    if (!previousItem) continue;
    if (previousItem.item.foodVersionId !== indexedItem.item.foodVersionId) {
      throw new NutritionIdContinuityError(
        `Replacement food for item ${indexedItem.item.id} must use a new item id`,
      );
    }
    matches.set(indexedItem.item.id, previousItem.item.id);
    usedPreviousIds.add(previousItem.item.id);
  }

  for (const indexedItem of candidate.items.values()) {
    if (matches.has(indexedItem.item.id)) continue;

    const exactMatch = findUniqueMatch(
      [...previous.items.values()],
      (previousItem) =>
        !usedPreviousIds.has(previousItem.item.id) &&
        itemKey(previousItem.item) === itemKey(indexedItem.item),
    );
    if (exactMatch) {
      matches.set(indexedItem.item.id, exactMatch.item.id);
      usedPreviousIds.add(exactMatch.item.id);
      continue;
    }

    const foodMatch = findUniqueMatch(
      [...previous.items.values()],
      (previousItem) =>
        !usedPreviousIds.has(previousItem.item.id) &&
        previousItem.item.foodVersionId === indexedItem.item.foodVersionId,
    );
    if (foodMatch) {
      matches.set(indexedItem.item.id, foodMatch.item.id);
      usedPreviousIds.add(foodMatch.item.id);
    }
  }

  return matches;
}

function matchAlternatives(
  previous: NutritionDocumentIndex,
  candidate: NutritionDocumentIndex,
  itemMatches: ReadonlyMap<string, string>,
): Map<string, string> {
  const matches = new Map<string, string>();
  const usedPreviousIds = new Set<string>();

  for (const indexedItem of candidate.items.values()) {
    const previousItemId = itemMatches.get(indexedItem.item.id);
    if (previousItemId === undefined) {
      for (const alternative of indexedItem.item.alternatives) {
        if (previous.alternatives.has(alternative.id)) {
          throw new NutritionIdContinuityError(
            `Replacement or duplicate item ${indexedItem.item.id} must use new alternative ids`,
          );
        }
      }
      continue;
    }

    const previousItem = previous.items.get(previousItemId)!.item;
    for (const alternative of indexedItem.item.alternatives) {
      const previousAlternative = previous.alternatives.get(alternative.id);
      if (previousAlternative) {
        if (previousAlternative.itemId !== previousItemId) {
          throw new NutritionIdContinuityError(
            `Alternative ${alternative.id} belongs to a different previous item`,
          );
        }
        if (
          previousAlternative.alternative.foodVersionId !==
          alternative.foodVersionId
        ) {
          throw new NutritionIdContinuityError(
            `Replacement food for alternative ${alternative.id} must use a new alternative id`,
          );
        }
        matches.set(alternative.id, previousAlternative.alternative.id);
        usedPreviousIds.add(previousAlternative.alternative.id);
        continue;
      }

      const exactMatch = findUniqueMatch(
        previousItem.alternatives,
        (previousAlternative) =>
          !usedPreviousIds.has(previousAlternative.id) &&
          alternativeKey(previousAlternative) === alternativeKey(alternative),
      );
      if (exactMatch) {
        matches.set(alternative.id, exactMatch.id);
        usedPreviousIds.add(exactMatch.id);
        continue;
      }

      const foodMatch = findUniqueMatch(
        previousItem.alternatives,
        (previousAlternative) =>
          !usedPreviousIds.has(previousAlternative.id) &&
          previousAlternative.foodVersionId === alternative.foodVersionId,
      );
      if (foodMatch) {
        matches.set(alternative.id, foodMatch.id);
        usedPreviousIds.add(foodMatch.id);
      }
    }
  }

  return matches;
}

function cloneQuantity(quantity: Quantity): Quantity {
  return { ...quantity };
}

function cloneAlternative(alternative: Alternative, id: string): Alternative {
  return {
    ...alternative,
    id,
    quantity: cloneQuantity(alternative.quantity),
  };
}

function cloneItem(
  item: Item,
  id: string,
  alternativeIds: readonly string[],
): Item {
  return {
    ...item,
    id,
    quantity: cloneQuantity(item.quantity),
    alternatives: item.alternatives.map((alternative, index) =>
      cloneAlternative(alternative, alternativeIds[index]!),
    ),
  };
}

function cloneMeal(meal: Meal, items: readonly Item[]): Meal {
  return {
    ...meal,
    items: [...items],
  };
}

function cloneDocument(document: NutritionDocument): NutritionDocument {
  return {
    structure:
      document.structure.kind === 'single_day'
        ? { ...document.structure }
        : {
            kind: document.structure.kind,
            days: document.structure.days.map((day) => ({ ...day })),
          },
    dayTypes: document.dayTypes.map((dayType) => ({
      ...dayType,
      ...(dayType.targets ? { targets: { ...dayType.targets } } : {}),
    })),
    meals: document.meals.map((meal) => ({
      ...meal,
      items: meal.items.map((item) => ({
        ...item,
        quantity: cloneQuantity(item.quantity),
        alternatives: item.alternatives.map((alternative) => ({
          ...alternative,
          quantity: cloneQuantity(alternative.quantity),
        })),
      })),
    })),
  };
}

export function retainNutritionDocumentIds(
  previous: NutritionDocument,
  candidate: NutritionDocument,
): NutritionDocument {
  const previousIndex = indexDocument(previous, 'Previous revision');
  const candidateIndex = indexDocument(candidate, 'Candidate revision');
  const itemMatches = matchItems(previousIndex, candidateIndex);
  const alternativeMatches = matchAlternatives(
    previousIndex,
    candidateIndex,
    itemMatches,
  );

  const retainedMeals = candidate.meals.map((meal) =>
    cloneMeal(
      meal,
      meal.items.map((item) => {
        const retainedItemId = itemMatches.get(item.id) ?? item.id;
        const retainedAlternativeIds = item.alternatives.map(
          (alternative) =>
            alternativeMatches.get(alternative.id) ?? alternative.id,
        );
        return cloneItem(item, retainedItemId, retainedAlternativeIds);
      }),
    ),
  );

  const retained: NutritionDocument = {
    ...cloneDocument(candidate),
    meals: retainedMeals,
  };
  indexDocument(retained, 'Retained revision');
  return retained;
}

export function carryForwardNutritionSelection(
  previous: NutritionDocument,
  candidate: NutritionDocument,
  selection: NutritionAlternativeSelection,
): NutritionAlternativeSelection | null {
  const previousIndex = indexDocument(previous, 'Previous revision');
  const candidateIndex = indexDocument(candidate, 'Candidate revision');
  const previousItem = previousIndex.items.get(selection.itemId);
  const previousAlternative = previousIndex.alternatives.get(
    selection.alternativeId,
  );
  if (
    !previousItem ||
    !previousAlternative ||
    previousAlternative.itemId !== selection.itemId
  ) {
    return null;
  }

  const candidateItem = candidateIndex.items.get(selection.itemId);
  const candidateAlternative = candidateIndex.alternatives.get(
    selection.alternativeId,
  );
  if (
    !candidateItem ||
    !candidateAlternative ||
    candidateAlternative.itemId !== selection.itemId
  ) {
    return null;
  }

  if (
    previousItem.item.foodVersionId !== candidateItem.item.foodVersionId ||
    previousAlternative.alternative.foodVersionId !==
      candidateAlternative.alternative.foodVersionId
  ) {
    return null;
  }

  return {
    itemId: selection.itemId,
    alternativeId: selection.alternativeId,
  };
}

function validateNewIds(
  ids: readonly string[],
  usedIds: ReadonlySet<string>,
  label: string,
): void {
  const assignedIds = new Set<string>();
  for (const [index, id] of ids.entries()) {
    const value = requireUuid(id, `${label}[${index}]`);
    if (usedIds.has(value) || assignedIds.has(value)) {
      throw new NutritionIdContinuityError(
        `${label}[${index}] must not collide`,
      );
    }
    assignedIds.add(value);
  }
}

export function duplicateNutritionItem(
  document: NutritionDocument,
  source: NutritionItemLocation,
  assignment: NutritionItemIdAssignment,
): NutritionDocument {
  const index = indexDocument(document, 'Nutrition document');
  const sourceMeal = index.meals.get(source.mealId);
  if (!sourceMeal) {
    throw new NutritionIdContinuityError(
      `Source meal ${source.mealId} was not found`,
    );
  }
  const sourceItem = sourceMeal.items.find((item) => item.id === source.itemId);
  if (!sourceItem) {
    throw new NutritionIdContinuityError(
      `Source item ${source.itemId} was not found in meal ${source.mealId}`,
    );
  }
  if (assignment.alternativeIds.length !== sourceItem.alternatives.length) {
    throw new NutritionIdContinuityError(
      `Duplicate item requires ${sourceItem.alternatives.length} alternative ids`,
    );
  }

  validateNewIds(
    [assignment.itemId, ...assignment.alternativeIds],
    index.allIds,
    'Duplicate item ids',
  );
  const duplicate = cloneItem(
    sourceItem,
    assignment.itemId,
    assignment.alternativeIds,
  );
  const meals = document.meals.map((meal) => {
    if (meal.id !== sourceMeal.id) return meal;
    const items = [...meal.items];
    const sourceIndex = items.findIndex((item) => item.id === sourceItem.id);
    items.splice(sourceIndex + 1, 0, duplicate);
    return { ...meal, items };
  });

  return { ...document, meals };
}
