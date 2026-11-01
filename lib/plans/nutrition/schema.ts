export type NutritionDocument = {
  structure: NutritionStructure;
  dayTypes: DayType[];
  meals: Meal[];
};

export type NutritionStructure = SingleDayStructure | SevenDayStructure;

export type SingleDayStructure = {
  kind: 'single_day';
  implicitDayTypeId: string;
};

export type SevenDayStructure = {
  kind: 'seven_day';
  days: SevenDay[];
};

export type SevenDay = {
  dayIndex: number;
  dayTypeId: string;
};

export type DayType = {
  id: string;
  name: string;
  trainingDay: boolean;
  targets?: DayTypeTargets;
};

export type DayTypeTargets = {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
};

export type Meal = {
  id: string;
  conditional: 'always' | 'training_days_only';
  recipeVideoUrl?: string;
  items: Item[];
};

export type Item = {
  id: string;
  foodVersionId: string;
  quantity: Quantity;
  notes?: string;
  alternatives: Alternative[];
};

export type Quantity = {
  value: string;
  unit: string;
};

export type Alternative = {
  id: string;
  foodVersionId: string;
  quantity: Quantity;
};

export class NutritionValidationError extends Error {
  readonly code = 'invalid_nutrition_document';

  constructor(message: string) {
    super(message);
    this.name = 'NutritionValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new NutritionValidationError(`${label} is required`);
  }
  return value.trim();
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new NutritionValidationError(
      `${label} must be one of: ${allowed.join(', ')}`,
    );
  }
  return value as T;
}

function requireUuid(value: unknown, label: string): string {
  const str = requireNonEmptyString(value, label);
  if (
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      str,
    )
  ) {
    throw new NutritionValidationError(`${label} must be a UUID`);
  }
  return str;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new NutritionValidationError(`${label} must be a boolean`);
  }
  return value;
}

function requirePositiveDecimalString(value: unknown, label: string): string {
  const str = requireNonEmptyString(value, label);
  if (!/^[0-9]+(\.[0-9]{1,3})?$/.test(str)) {
    throw new NutritionValidationError(
      `${label} must be a positive decimal string with at most three decimal places`,
    );
  }
  if (!/[1-9]/.test(str)) {
    throw new NutritionValidationError(
      `${label} must be a positive decimal string with at most three decimal places`,
    );
  }
  return str;
}

function requireNonNegativeDecimalString(
  value: unknown,
  label: string,
): string {
  const str = requireNonEmptyString(value, label);
  if (!/^[0-9]+(\.[0-9]+)?$/.test(str)) {
    throw new NutritionValidationError(
      `${label} must be a non-negative decimal string`,
    );
  }
  return str;
}

function requireDayIndex(value: unknown, label: string): number {
  if (
    !isFiniteNumber(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 6
  ) {
    throw new NutritionValidationError(
      `${label} must be an integer between 0 and 6`,
    );
  }
  return value;
}

function requireRecipeVideoUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new NutritionValidationError(
      'recipe video link must be an HTTPS YouTube or Google Drive link',
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new NutritionValidationError(
      'recipe video link must be an HTTPS YouTube or Google Drive link',
    );
  }
  if (url.protocol !== 'https:') {
    throw new NutritionValidationError(
      'recipe video link must be an HTTPS YouTube or Google Drive link',
    );
  }
  const host = url.hostname.replace(/^www\./, '');
  if (
    host !== 'youtube.com' &&
    host !== 'youtu.be' &&
    host !== 'drive.google.com'
  ) {
    throw new NutritionValidationError(
      'recipe video link must be an HTTPS YouTube or Google Drive link',
    );
  }
  return value;
}

function rejectUnknownKeys(
  input: Record<string, unknown>,
  known: readonly string[],
  label: string,
): void {
  const knownSet = new Set(known);
  for (const key of Object.keys(input)) {
    if (!knownSet.has(key)) {
      throw new NutritionValidationError(`Unknown key '${key}' in ${label}`);
    }
  }
}

function normalizeQuantity(input: unknown, label: string): Quantity {
  if (!isRecord(input)) {
    throw new NutritionValidationError(`${label} must be an object`);
  }
  const value = requirePositiveDecimalString(input.value, `${label}.value`);
  const unit = requireNonEmptyString(input.unit, `${label}.unit`);
  rejectUnknownKeys(input, ['value', 'unit'], label);
  return { value, unit };
}

function normalizeAlternative(
  input: unknown,
  index: number,
  label: string,
): Alternative {
  const altLabel = `${label}.alternatives[${index}]`;
  if (!isRecord(input)) {
    throw new NutritionValidationError(`${altLabel} must be an object`);
  }
  const id = requireUuid(input.id, `${altLabel}.id`);
  const foodVersionId = requireUuid(
    input.foodVersionId,
    `${altLabel}.foodVersionId`,
  );
  const quantity = normalizeQuantity(input.quantity, `${altLabel}.quantity`);
  rejectUnknownKeys(input, ['id', 'foodVersionId', 'quantity'], altLabel);
  return { id, foodVersionId, quantity };
}

function normalizeItem(input: unknown, index: number, label: string): Item {
  const itemLabel = `${label}.items[${index}]`;
  if (!isRecord(input)) {
    throw new NutritionValidationError(`${itemLabel} must be an object`);
  }
  const id = requireUuid(input.id, `${itemLabel}.id`);
  const foodVersionId = requireUuid(
    input.foodVersionId,
    `${itemLabel}.foodVersionId`,
  );
  const quantity = normalizeQuantity(input.quantity, `${itemLabel}.quantity`);
  let notes: string | undefined;
  if (input.notes !== undefined) {
    if (typeof input.notes !== 'string') {
      throw new NutritionValidationError(`${itemLabel}.notes must be a string`);
    }
    notes = input.notes;
  }
  const alternativesInput = input.alternatives;
  if (!Array.isArray(alternativesInput)) {
    throw new NutritionValidationError(
      `${itemLabel}.alternatives must be an array`,
    );
  }
  const alternatives = alternativesInput.map((alt, altIndex) =>
    normalizeAlternative(alt, altIndex, itemLabel),
  );
  rejectUnknownKeys(
    input,
    ['id', 'foodVersionId', 'quantity', 'notes', 'alternatives'],
    itemLabel,
  );
  return {
    id,
    foodVersionId,
    quantity,
    ...(notes !== undefined ? { notes } : {}),
    alternatives,
  };
}

function normalizeMeal(input: unknown, index: number): Meal {
  const label = `meals[${index}]`;
  if (!isRecord(input)) {
    throw new NutritionValidationError(`${label} must be an object`);
  }
  const id = requireUuid(input.id, `${label}.id`);
  const conditional = requireEnum(
    input.conditional,
    ['always', 'training_days_only'],
    `${label}.conditional`,
  );
  let recipeVideoUrl: string | undefined;
  if (input.recipeVideoUrl !== undefined) {
    recipeVideoUrl = requireRecipeVideoUrl(input.recipeVideoUrl);
  }
  const itemsInput = input.items;
  if (!Array.isArray(itemsInput) || itemsInput.length === 0) {
    throw new NutritionValidationError(
      `${label}.items must be a non-empty array`,
    );
  }
  const items = itemsInput.map((item, itemIndex) =>
    normalizeItem(item, itemIndex, label),
  );
  rejectUnknownKeys(
    input,
    ['id', 'conditional', 'recipeVideoUrl', 'items'],
    label,
  );
  return {
    id,
    conditional,
    ...(recipeVideoUrl !== undefined ? { recipeVideoUrl } : {}),
    items,
  };
}

function normalizeDayType(input: unknown, index: number): DayType {
  const label = `dayTypes[${index}]`;
  if (!isRecord(input)) {
    throw new NutritionValidationError(`${label} must be an object`);
  }
  const id = requireUuid(input.id, `${label}.id`);
  const name = requireNonEmptyString(input.name, `${label}.name`);
  const trainingDay = requireBoolean(input.trainingDay, `${label}.trainingDay`);
  let targets: DayTypeTargets | undefined;
  if (input.targets !== undefined) {
    if (!isRecord(input.targets)) {
      throw new NutritionValidationError(`${label}.targets must be an object`);
    }
    const t = input.targets;
    targets = {
      calories: requireNonNegativeDecimalString(
        t.calories,
        `${label}.targets.calories`,
      ),
      protein: requireNonNegativeDecimalString(
        t.protein,
        `${label}.targets.protein`,
      ),
      carbs: requireNonNegativeDecimalString(t.carbs, `${label}.targets.carbs`),
      fat: requireNonNegativeDecimalString(t.fat, `${label}.targets.fat`),
    };
    rejectUnknownKeys(
      t,
      ['calories', 'protein', 'carbs', 'fat'],
      `${label}.targets`,
    );
  }
  rejectUnknownKeys(input, ['id', 'name', 'trainingDay', 'targets'], label);
  return {
    id,
    name,
    trainingDay,
    ...(targets !== undefined ? { targets } : {}),
  };
}

function normalizeSevenDay(input: unknown): SevenDayStructure {
  const label = 'structure';
  if (!isRecord(input)) {
    throw new NutritionValidationError(`${label} must be an object`);
  }
  const daysInput = input.days;
  if (!Array.isArray(daysInput)) {
    throw new NutritionValidationError(
      `${label}.days must be an array for seven_day`,
    );
  }
  const days = daysInput.map((day, dayIndex) => {
    const dayLabel = `${label}.days[${dayIndex}]`;
    if (!isRecord(day)) {
      throw new NutritionValidationError(`${dayLabel} must be an object`);
    }
    const dayIndexValue = requireDayIndex(day.dayIndex, `${dayLabel}.dayIndex`);
    const dayTypeId = requireUuid(day.dayTypeId, `${dayLabel}.dayTypeId`);
    rejectUnknownKeys(day, ['dayIndex', 'dayTypeId'], dayLabel);
    return { dayIndex: dayIndexValue, dayTypeId };
  });
  rejectUnknownKeys(input, ['kind', 'days'], `${label} (seven_day)`);
  return { kind: 'seven_day', days };
}

function normalizeSingleDay(input: unknown): SingleDayStructure {
  const label = 'structure';
  if (!isRecord(input)) {
    throw new NutritionValidationError(`${label} must be an object`);
  }
  const implicitDayTypeId = requireUuid(
    input.implicitDayTypeId,
    `${label}.implicitDayTypeId`,
  );
  rejectUnknownKeys(
    input,
    ['kind', 'implicitDayTypeId'],
    `${label} (single_day)`,
  );
  return { kind: 'single_day', implicitDayTypeId };
}

function normalizeStructure(input: unknown): NutritionStructure {
  if (!isRecord(input)) {
    throw new NutritionValidationError('Structure must be an object');
  }
  const kind = requireEnum(
    input.kind,
    ['single_day', 'seven_day'],
    'Structure kind',
  );
  if (kind === 'single_day') {
    return normalizeSingleDay(input);
  }
  return normalizeSevenDay(input);
}

export function normalizeNutritionDocument(input: unknown): NutritionDocument {
  if (!isRecord(input)) {
    throw new NutritionValidationError('Nutrition document must be an object');
  }

  rejectUnknownKeys(
    input,
    ['structure', 'dayTypes', 'meals'],
    'Nutrition document',
  );

  const structure = normalizeStructure(input.structure);

  const dayTypesInput = input.dayTypes;
  if (!Array.isArray(dayTypesInput)) {
    throw new NutritionValidationError('dayTypes must be an array');
  }
  const dayTypes = dayTypesInput.map((dayType, index) =>
    normalizeDayType(dayType, index),
  );

  const mealsInput = input.meals;
  if (!Array.isArray(mealsInput)) {
    throw new NutritionValidationError('meals must be an array');
  }
  const meals = mealsInput.map((meal, index) => normalizeMeal(meal, index));

  const dayTypeById = new Map<string, DayType>();
  const documentIds = new Set<string>();
  for (const dayType of dayTypes) {
    if (documentIds.has(dayType.id)) {
      throw new NutritionValidationError(`duplicate document id ${dayType.id}`);
    }
    documentIds.add(dayType.id);
    dayTypeById.set(dayType.id, dayType);
  }

  let trainingDayCount = 0;
  if (structure.kind === 'single_day') {
    const implicitDayType = dayTypeById.get(structure.implicitDayTypeId);
    if (!implicitDayType) {
      throw new NutritionValidationError(
        'implicitDayTypeId does not resolve to a defined day type',
      );
    }
    if (implicitDayType.trainingDay) {
      trainingDayCount = 1;
    }
  } else {
    const seenIndexes = new Set<number>();
    for (const day of structure.days) {
      if (seenIndexes.has(day.dayIndex)) {
        throw new NutritionValidationError(
          `duplicate dayIndex ${day.dayIndex}`,
        );
      }
      seenIndexes.add(day.dayIndex);
      const resolvedDayType = dayTypeById.get(day.dayTypeId);
      if (!resolvedDayType) {
        throw new NutritionValidationError(
          `day type id ${day.dayTypeId} is not defined`,
        );
      } else if (resolvedDayType.trainingDay) {
        trainingDayCount += 1;
      }
    }
    if (
      seenIndexes.size !== 7 ||
      ![0, 1, 2, 3, 4, 5, 6].every((dayIndex) => seenIndexes.has(dayIndex))
    ) {
      throw new NutritionValidationError(
        'seven_day must define dayIndex 0-6 exactly once',
      );
    }
  }

  for (const meal of meals) {
    if (documentIds.has(meal.id)) {
      throw new NutritionValidationError(`duplicate document id ${meal.id}`);
    }
    documentIds.add(meal.id);
    if (meal.conditional === 'training_days_only' && trainingDayCount === 0) {
      throw new NutritionValidationError(
        'training_days_only meal has no reachable training day',
      );
    }
    for (const item of meal.items) {
      if (documentIds.has(item.id)) {
        throw new NutritionValidationError(`duplicate document id ${item.id}`);
      }
      documentIds.add(item.id);
      for (const alternative of item.alternatives) {
        if (documentIds.has(alternative.id)) {
          throw new NutritionValidationError(
            `duplicate document id ${alternative.id}`,
          );
        }
        documentIds.add(alternative.id);
      }
    }
  }

  return { structure, dayTypes, meals };
}
