import type {
  NutritionAlternative,
  NutritionDay,
  NutritionDayType,
  NutritionDocumentV1,
  NutritionItem,
  NutritionMeal,
  NutritionQuantity,
  NutritionQuantityUnit,
} from './types';

export type {
  NutritionAlternative,
  NutritionDay,
  NutritionDayType,
  NutritionDocumentV1,
  NutritionItem,
  NutritionMeal,
  NutritionQuantity,
  NutritionQuantityUnit,
} from './types';

/**
 * F18 nutrition document schema v1 validator (F18-FR-002).
 *
 * Contract: `specs/018-nutrition-planner/contracts/nutrition-document.md`
 * sections 1-2. The validator is the frozen v1 schema module: it accepts and
 * rejects the frozen fixture set with stable field codes so the application
 * validator and the SQL/RPC validator can produce identical decisions
 * (contract section 5).
 */

export const NUTRITION_DOCUMENT_SCHEMA_VERSION = 1 as const;

/** Stable validation codes (contract section 2 invariants; fixture-frozen). */
export type NutritionSchemaErrorCode =
  | 'unknown_key'
  | 'schema_version'
  | 'structure'
  | 'implicit_day_type_id'
  | 'day_index'
  | 'duplicate_id'
  | 'unresolved_reference'
  | 'name'
  | 'note'
  | 'targets'
  | 'quantity'
  | 'unit'
  | 'recipe_url'
  | 'alternative_limit'
  | 'food_reference';

export class NutritionDocumentError extends Error {
  readonly code: NutritionSchemaErrorCode;
  readonly field: string;

  constructor(code: NutritionSchemaErrorCode, field: string, message: string) {
    super(message);
    this.name = 'NutritionDocumentError';
    this.code = code;
    this.field = field;
  }
}

/** Exact allowed hosts for the D18-6 recipe/preparation link. */
const RECIPE_URL_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'drive.google.com',
]);

const DOCUMENT_KEYS = [
  'schemaVersion',
  'structure',
  'implicitDayTypeId',
  'dayTypes',
  'days',
  'meals',
  'title',
  'notes',
] as const;

const DAY_TYPE_KEYS = ['id', 'name', 'trainingDay', 'targets'] as const;

const TARGETS_KEYS = ['kcal', 'protein', 'carbs', 'fat'] as const;

const DAY_KEYS = ['dayIndex', 'dayTypeId', 'meals'] as const;

const MEAL_KEYS = ['id', 'name', 'note', 'recipeUrl', 'items'] as const;

const ITEM_KEYS = [
  'id',
  'foodId',
  'foodVersion',
  'quantity',
  'note',
  'alternatives',
] as const;

const ALTERNATIVE_KEYS = ['id', 'foodId', 'foodVersion', 'quantity'] as const;

const QUANTITY_KEYS = ['value', 'unit'] as const;

const UNIT_KEYS = ['kind', 'value', 'unitKey'] as const;

const NAME_KEYS = ['ar', 'en'] as const;

/** Per referenced food version: declared basis and catalog serving unit keys. */
export type FoodVersionUnitContext = {
  basis: 'g' | 'ml';
  servingUnitKeys: readonly string[];
};

/** Keyed by `${foodId}@${foodVersion}` (contract section 2.5: exact version). */
export type NutritionUnitContext = Record<string, FoodVersionUnitContext>;

export function nutritionUnitContextKey(
  foodId: string,
  foodVersion: number,
): string {
  return `${foodId}@${foodVersion}`;
}

const DECIMAL_RE = /^[0-9]+(?:\.[0-9]{1,3})?$/;

function assertPositiveDecimal(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !DECIMAL_RE.test(value) ||
    !/[1-9]/.test(value)
  ) {
    throw new NutritionDocumentError(
      'quantity',
      field,
      `quantity must be a positive decimal string with at most 3 decimals: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

function assertNonNegativeDecimal(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DECIMAL_RE.test(value)) {
    throw new NutritionDocumentError(
      'targets',
      field,
      `target must be a non-negative decimal string with at most 3 decimals: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

function assertObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NutritionDocumentError(
      'structure',
      field,
      `${field} must be an object`,
    );
  }
  return value as Record<string, unknown>;
}

function assertUnknownKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new NutritionDocumentError(
        'unknown_key',
        `${field}.${key}`,
        `unknown key ${field}.${key}`,
      );
    }
  }
}

function assertLocalizedName(
  value: unknown,
  field: string,
): { ar: string; en: string } {
  const obj = assertObject(value, field);
  assertUnknownKeys(obj, NAME_KEYS, field);
  for (const locale of NAME_KEYS) {
    if (typeof obj[locale] !== 'string' || !(obj[locale] as string).trim()) {
      throw new NutritionDocumentError(
        'name',
        `${field}.${locale}`,
        `${field}.${locale} must be a non-empty string`,
      );
    }
  }
  return { ar: obj.ar as string, en: obj.en as string };
}

function assertOptionalNote(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new NutritionDocumentError(
      'note',
      field,
      `${field} must be a string or null`,
    );
  }
  return value;
}

function assertQuantityUnit(
  value: unknown,
  field: string,
  food: FoodVersionUnitContext,
): NutritionQuantityUnit {
  const obj = assertObject(value, field);
  assertUnknownKeys(obj, UNIT_KEYS, field);
  const kind = obj.kind;
  if (kind === 'basis') {
    assertUnknownKeys({ kind: obj.kind, value: obj.value }, UNIT_KEYS, field);
    if (obj.unitKey !== undefined) {
      throw new NutritionDocumentError(
        'unknown_key',
        `${field}.unitKey`,
        `unknown key ${field}.unitKey`,
      );
    }
    if (obj.value !== 'g' && obj.value !== 'ml') {
      throw new NutritionDocumentError(
        'unit',
        `${field}.value`,
        'basis unit must be g or ml',
      );
    }
    if (obj.value !== food.basis) {
      throw new NutritionDocumentError(
        'unit',
        `${field}.value`,
        'basis unit must match the food version basis',
      );
    }
    return { kind: 'basis', value: obj.value as 'g' | 'ml' };
  }
  if (kind === 'serving') {
    assertUnknownKeys(
      { kind: obj.kind, unitKey: obj.unitKey },
      UNIT_KEYS,
      field,
    );
    if (obj.value !== undefined) {
      throw new NutritionDocumentError(
        'unknown_key',
        `${field}.value`,
        `unknown key ${field}.value`,
      );
    }
    if (typeof obj.unitKey !== 'string' || !obj.unitKey.trim()) {
      throw new NutritionDocumentError(
        'unit',
        `${field}.unitKey`,
        'serving unitKey must be a non-empty string',
      );
    }
    if (!food.servingUnitKeys.includes(obj.unitKey)) {
      throw new NutritionDocumentError(
        'unit',
        `${field}.unitKey`,
        'serving unit is not declared for this food version',
      );
    }
    return { kind: 'serving', unitKey: obj.unitKey };
  }
  throw new NutritionDocumentError(
    'unit',
    `${field}.kind`,
    'unit kind must be basis or serving',
  );
}

function assertQuantity(
  value: unknown,
  field: string,
  food: FoodVersionUnitContext,
): NutritionQuantity {
  const obj = assertObject(value, field);
  assertUnknownKeys(obj, QUANTITY_KEYS, field);
  const parsedValue = assertPositiveDecimal(obj.value, `${field}.value`);
  const unit = assertQuantityUnit(obj.unit, `${field}.unit`, food);
  return { value: parsedValue, unit };
}

function resolveFood(
  foodId: string,
  foodVersion: unknown,
  field: string,
  context: NutritionUnitContext,
): FoodVersionUnitContext {
  if (
    typeof foodVersion !== 'number' ||
    !Number.isInteger(foodVersion) ||
    foodVersion < 1
  ) {
    throw new NutritionDocumentError(
      'food_reference',
      `${field}.foodVersion`,
      'foodVersion must be a positive integer',
    );
  }
  const food = context[nutritionUnitContextKey(foodId, foodVersion)];
  if (!food) {
    throw new NutritionDocumentError(
      'unresolved_reference',
      field,
      `referenced food version ${foodId}@${foodVersion} is not declared in the validator context`,
    );
  }
  return food;
}

function assertRecipeUrl(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new NutritionDocumentError(
      'recipe_url',
      field,
      'recipeUrl must be a string or null',
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new NutritionDocumentError(
      'recipe_url',
      field,
      'recipeUrl must be an absolute URL',
    );
  }
  if (url.protocol !== 'https:') {
    throw new NutritionDocumentError(
      'recipe_url',
      field,
      'recipeUrl must be HTTPS',
    );
  }
  if (url.username || url.password) {
    throw new NutritionDocumentError(
      'recipe_url',
      field,
      'recipeUrl must not contain credentials',
    );
  }
  if (!RECIPE_URL_HOSTS.has(url.hostname)) {
    throw new NutritionDocumentError(
      'recipe_url',
      field,
      'recipeUrl host is not allowed',
    );
  }
  return value;
}

function assertId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new NutritionDocumentError(
      'structure',
      field,
      `${field} must be a non-empty string`,
    );
  }
  return value;
}

function assertAlternatives(
  value: unknown,
  field: string,
  context: NutritionUnitContext,
  idRegistry: Set<string>,
): NutritionAlternative[] {
  if (!Array.isArray(value)) {
    throw new NutritionDocumentError(
      'structure',
      field,
      `${field} must be an array`,
    );
  }
  if (value.length > 3) {
    throw new NutritionDocumentError(
      'alternative_limit',
      field,
      'at most three alternatives per item (F18-FR-006)',
    );
  }
  return value.map((entry, index) => {
    const altField = `${field}[${index}]`;
    const obj = assertObject(entry, altField);
    assertUnknownKeys(obj, ALTERNATIVE_KEYS, altField);
    const id = assertId(obj.id, `${altField}.id`);
    registerUniqueId(idRegistry, id, `${altField}.id`);
    const foodId = assertId(obj.foodId, `${altField}.foodId`);
    const food = resolveFood(foodId, obj.foodVersion, altField, context);
    const quantity = assertQuantity(obj.quantity, `${altField}.quantity`, food);
    return {
      id,
      foodId,
      foodVersion: obj.foodVersion as number,
      quantity,
    };
  });
}

function registerUniqueId(
  registry: Set<string>,
  id: string,
  field: string,
): void {
  if (registry.has(id)) {
    throw new NutritionDocumentError(
      'duplicate_id',
      field,
      `duplicate id ${id}`,
    );
  }
  registry.add(id);
}

function assertItems(
  value: unknown,
  field: string,
  context: NutritionUnitContext,
  idRegistry: Set<string>,
): NutritionItem[] {
  if (!Array.isArray(value)) {
    throw new NutritionDocumentError(
      'structure',
      field,
      `${field} must be an array`,
    );
  }
  return value.map((entry, index) => {
    const itemField = `${field}[${index}]`;
    const obj = assertObject(entry, itemField);
    assertUnknownKeys(obj, ITEM_KEYS, itemField);
    const id = assertId(obj.id, `${itemField}.id`);
    registerUniqueId(idRegistry, id, `${itemField}.id`);
    const foodId = assertId(obj.foodId, `${itemField}.foodId`);
    const food = resolveFood(foodId, obj.foodVersion, itemField, context);
    const quantity = assertQuantity(
      obj.quantity,
      `${itemField}.quantity`,
      food,
    );
    const note = assertOptionalNote(obj.note, `${itemField}.note`);
    const alternatives = assertAlternatives(
      obj.alternatives,
      `${itemField}.alternatives`,
      context,
      idRegistry,
    );
    return {
      id,
      foodId,
      foodVersion: obj.foodVersion as number,
      quantity,
      note,
      alternatives,
    };
  });
}

function assertMeals(
  value: unknown,
  field: string,
  context: NutritionUnitContext,
  idRegistry: Set<string>,
): NutritionMeal[] {
  if (!Array.isArray(value)) {
    throw new NutritionDocumentError(
      'structure',
      field,
      `${field} must be an array`,
    );
  }
  return value.map((entry, index) => {
    const mealField = `${field}[${index}]`;
    const obj = assertObject(entry, mealField);
    assertUnknownKeys(obj, MEAL_KEYS, mealField);
    const id = assertId(obj.id, `${mealField}.id`);
    registerUniqueId(idRegistry, id, `${mealField}.id`);
    const name = assertLocalizedName(obj.name, `${mealField}.name`);
    const note = assertOptionalNote(obj.note, `${mealField}.note`);
    const recipeUrl = assertRecipeUrl(obj.recipeUrl, `${mealField}.recipeUrl`);
    const items = assertItems(
      obj.items,
      `${mealField}.items`,
      context,
      idRegistry,
    );
    return { id, name, note, recipeUrl, items };
  });
}

function assertDayTypes(
  value: unknown,
  field: string,
  idRegistry: Set<string>,
): NutritionDayType[] {
  if (!Array.isArray(value)) {
    throw new NutritionDocumentError(
      'structure',
      field,
      `${field} must be an array`,
    );
  }
  return value.map((entry, index) => {
    const dtField = `${field}[${index}]`;
    const obj = assertObject(entry, dtField);
    assertUnknownKeys(obj, DAY_TYPE_KEYS, dtField);
    const id = assertId(obj.id, `${dtField}.id`);
    registerUniqueId(idRegistry, id, `${dtField}.id`);
    const name = assertLocalizedName(obj.name, `${dtField}.name`);
    if (typeof obj.trainingDay !== 'boolean') {
      throw new NutritionDocumentError(
        'targets',
        `${dtField}.trainingDay`,
        'trainingDay must be a boolean',
      );
    }
    let targets: NutritionDayType['targets'] = null;
    if (obj.targets !== null && obj.targets !== undefined) {
      const t = assertObject(obj.targets, `${dtField}.targets`);
      assertUnknownKeys(t, TARGETS_KEYS, `${dtField}.targets`);
      targets = {
        kcal: assertNonNegativeDecimal(t.kcal, `${dtField}.targets.kcal`),
        protein: assertNonNegativeDecimal(
          t.protein,
          `${dtField}.targets.protein`,
        ),
        carbs: assertNonNegativeDecimal(t.carbs, `${dtField}.targets.carbs`),
        fat: assertNonNegativeDecimal(t.fat, `${dtField}.targets.fat`),
      };
    }
    return { id, name, trainingDay: obj.trainingDay as boolean, targets };
  });
}

/**
 * Validate one nutrition document v1 against the frozen v1 invariants.
 * `context` declares, for every referenced exact food version, its basis and
 * declared catalog serving unit keys (F18-FR-004 unit resolution).
 */
export function validateNutritionDocument(
  input: unknown,
  context: NutritionUnitContext,
): NutritionDocumentV1 {
  const doc = assertObject(input, 'document');
  assertUnknownKeys(doc, DOCUMENT_KEYS, 'document');

  if (doc.schemaVersion !== NUTRITION_DOCUMENT_SCHEMA_VERSION) {
    throw new NutritionDocumentError(
      'schema_version',
      'schemaVersion',
      'schemaVersion must be 1',
    );
  }

  const structure = doc.structure;
  if (structure !== 'single_day' && structure !== 'seven_day') {
    throw new NutritionDocumentError(
      'structure',
      'structure',
      'structure must be single_day or seven_day',
    );
  }

  const idRegistry = new Set<string>();
  const dayTypes = assertDayTypes(doc.dayTypes, 'dayTypes', idRegistry);
  const dayTypeIds = new Set(dayTypes.map((dt) => dt.id));

  let days: NutritionDay[] | undefined;
  let meals: NutritionMeal[] | undefined;
  let implicitDayTypeId: string | undefined;

  if (structure === 'single_day') {
    if (doc.days !== undefined) {
      throw new NutritionDocumentError(
        'structure',
        'days',
        'single_day must not carry a days array',
      );
    }
    if (typeof doc.implicitDayTypeId !== 'string') {
      throw new NutritionDocumentError(
        'implicit_day_type_id',
        'implicitDayTypeId',
        'implicitDayTypeId is always required for single_day',
      );
    }
    if (!dayTypeIds.has(doc.implicitDayTypeId)) {
      throw new NutritionDocumentError(
        'unresolved_reference',
        'implicitDayTypeId',
        'implicitDayTypeId must resolve to a declared day type',
      );
    }
    implicitDayTypeId = doc.implicitDayTypeId;
    meals = assertMeals(doc.meals, 'meals', context, idRegistry);
  } else {
    if (doc.implicitDayTypeId !== undefined) {
      throw new NutritionDocumentError(
        'implicit_day_type_id',
        'implicitDayTypeId',
        'implicitDayTypeId must be absent for seven_day',
      );
    }
    if (doc.meals !== undefined) {
      throw new NutritionDocumentError(
        'structure',
        'meals',
        'seven_day must not carry a top-level meals array',
      );
    }
    if (!Array.isArray(doc.days)) {
      throw new NutritionDocumentError(
        'structure',
        'days',
        'seven_day requires a days array',
      );
    }
    const seen = new Set<number>();
    days = doc.days.map((entry, index) => {
      const dayField = `days[${index}]`;
      const obj = assertObject(entry, dayField);
      assertUnknownKeys(obj, DAY_KEYS, dayField);
      const dayIndex = obj.dayIndex;
      if (
        typeof dayIndex !== 'number' ||
        !Number.isInteger(dayIndex) ||
        dayIndex < 0 ||
        dayIndex > 6
      ) {
        throw new NutritionDocumentError(
          'day_index',
          `${dayField}.dayIndex`,
          'dayIndex must be an integer 0-6',
        );
      }
      if (seen.has(dayIndex)) {
        throw new NutritionDocumentError(
          'day_index',
          `${dayField}.dayIndex`,
          `duplicate dayIndex ${dayIndex}`,
        );
      }
      seen.add(dayIndex);
      if (typeof obj.dayTypeId !== 'string' || !dayTypeIds.has(obj.dayTypeId)) {
        throw new NutritionDocumentError(
          'unresolved_reference',
          `${dayField}.dayTypeId`,
          'dayTypeId must resolve to a declared day type',
        );
      }
      const dayMeals = assertMeals(
        obj.meals,
        `${dayField}.meals`,
        context,
        idRegistry,
      );
      return {
        dayIndex,
        dayTypeId: obj.dayTypeId,
        meals: dayMeals,
      };
    });
    if (seen.size !== 7) {
      throw new NutritionDocumentError(
        'day_index',
        'days',
        'seven_day requires dayIndex 0-6 each exactly once',
      );
    }
  }

  let title: { ar: string; en: string } | null = null;
  if (doc.title !== null && doc.title !== undefined) {
    title = assertLocalizedName(doc.title, 'title');
  } else if (doc.title === undefined) {
    throw new NutritionDocumentError(
      'structure',
      'title',
      'title is required (null allowed)',
    );
  }

  let notes: string | null = null;
  if (doc.notes !== null && doc.notes !== undefined) {
    if (typeof doc.notes !== 'string') {
      throw new NutritionDocumentError(
        'note',
        'notes',
        'notes must be a string or null',
      );
    }
    notes = doc.notes;
  } else if (doc.notes === undefined) {
    throw new NutritionDocumentError(
      'structure',
      'notes',
      'notes is required (null allowed)',
    );
  }

  const result: NutritionDocumentV1 = {
    schemaVersion: NUTRITION_DOCUMENT_SCHEMA_VERSION,
    structure,
    dayTypes,
    title,
    notes,
  };
  if (implicitDayTypeId !== undefined) {
    result.implicitDayTypeId = implicitDayTypeId;
    result.meals = meals ?? [];
  } else {
    result.days = days ?? [];
  }
  return result;
}
