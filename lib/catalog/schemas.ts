export type CatalogLocale = 'ar' | 'en';

export const CATALOG_LOCALES: readonly CatalogLocale[] = ['ar', 'en'];

export class CatalogValidationError extends Error {
  readonly code = 'invalid_catalog';

  constructor(message: string) {
    super(message);
    this.name = 'CatalogValidationError';
  }
}

export const MUSCLE_GROUP_CODES = [
  'Chest',
  'Lats',
  'Upper Back',
  'Traps',
  'Front Delts',
  'Side Delts',
  'Rear Delts',
  'Biceps',
  'Triceps',
  'Forearms',
  'Abs',
  'Spinal Erectors',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Adductors',
  'Abductors',
  'Calves',
] as const;

export const EQUIPMENT_CODES = [
  'Barbell',
  'Dumbbell',
  'Cable',
  'Machine',
  'Smith Machine',
  'Bodyweight',
  'Kettlebell',
  'Resistance Band',
  'Suspension Trainer',
  'Other',
] as const;

export type MuscleGroupCode = (typeof MUSCLE_GROUP_CODES)[number];
export type EquipmentCode = (typeof EQUIPMENT_CODES)[number];

export type CatalogLifecycleState = 'active' | 'removed' | 'superseded';

export const CATALOG_LIFECYCLE_STATES: readonly CatalogLifecycleState[] = [
  'active',
  'removed',
  'superseded',
];

export type FoodBasis = 'g' | 'ml';

export type WeighingState = 'raw' | 'cooked' | 'not_applicable';

export type ExerciseReps =
  | { kind: 'fixed'; value: number }
  | { kind: 'range'; min: number; max: number };

export type ExerciseDefaults = {
  warmupSets?: number;
  workingSets?: number;
  reps?: ExerciseReps;
  restSeconds?: number;
  rir?: number | null;
  alternativeExerciseIds?: string[];
};

export type ExerciseInput = {
  names: Partial<Record<CatalogLocale, string>>;
  primaryMuscle: string;
  secondaryMuscles?: string[];
  equipment: string;
  defaults?: ExerciseDefaults;
  notes?: Partial<Record<CatalogLocale, string>>;
  lifecycleState?: CatalogLifecycleState;
};

export type NormalizedExercise = {
  names: Record<CatalogLocale, string>;
  primaryMuscle: MuscleGroupCode;
  secondaryMuscles: MuscleGroupCode[];
  equipment: EquipmentCode;
  defaults?: ExerciseDefaults;
  notes?: Partial<Record<CatalogLocale, string>>;
  lifecycleState: CatalogLifecycleState;
};

export type ServingInput = {
  labels: Partial<Record<CatalogLocale, string>>;
  basisQuantity: number;
};

export type NormalizedServing = {
  labels: Record<CatalogLocale, string>;
  basisQuantity: number;
};

export type FoodAlternativeInput = {
  alternativeFoodId: string;
  portionQuantity: number;
  portionUnit?: string;
};

export type NormalizedFoodAlternative = {
  alternativeFoodId: string;
  portionQuantity: number;
  portionUnit?: string;
};

export const MAX_FOOD_ALTERNATIVES = 3;

export type FoodInput = {
  names: Partial<Record<CatalogLocale, string>>;
  basis: FoodBasis;
  productIdentity: string;
  preparationIdentity: string;
  weighingState: WeighingState;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  servings: ServingInput[];
  alternatives?: FoodAlternativeInput[];
  lifecycleState?: CatalogLifecycleState;
};

export type NormalizedFood = {
  names: Partial<Record<CatalogLocale, string>>;
  basis: FoodBasis;
  productIdentity: string;
  preparationIdentity: string;
  weighingState: WeighingState;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  servings: NormalizedServing[];
  alternatives: NormalizedFoodAlternative[];
  lifecycleState: CatalogLifecycleState;
};

export type WorkspaceScope = {
  workspaceId: string;
};

export type CatalogSearchFilters = {
  muscleGroup?: string;
  equipment?: string;
  basis?: FoodBasis;
};

export type CatalogSearchInput = {
  kind: 'exercise' | 'food' | 'workspace_exercise' | 'variation';
  query?: string;
  filters?: CatalogSearchFilters;
  cursor?: string | null;
  limit?: number;
  workspaceScope?: WorkspaceScope | null;
};

export type NormalizedCatalogSearch = {
  kind: CatalogSearchInput['kind'];
  query: string;
  filters: CatalogSearchFilters;
  cursor: string | null;
  limit: number;
  workspaceScope: WorkspaceScope | null;
};

export const MAX_SEARCH_PAGE_SIZE = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeLocalizedText(
  value: unknown,
  label: string,
  options: { required?: boolean } = {},
): Partial<Record<CatalogLocale, string>> {
  if (!isRecord(value)) {
    throw new CatalogValidationError(`${label} must be an object`);
  }

  for (const key of Object.keys(value)) {
    if (key !== 'ar' && key !== 'en') {
      throw new CatalogValidationError(`${label} has an unsupported locale`);
    }
  }

  const result: Partial<Record<CatalogLocale, string>> = {};
  for (const locale of CATALOG_LOCALES) {
    const text = value[locale];
    if (text === undefined || text === null) continue;
    if (typeof text !== 'string') {
      throw new CatalogValidationError(`${label} values must be text`);
    }
    const normalized = text.trim();
    if (normalized) result[locale] = normalized;
  }

  if (options.required && !result.ar && !result.en) {
    throw new CatalogValidationError(
      `At least one ${label} locale is required`,
    );
  }
  return result;
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new CatalogValidationError(
      `${label} must be one of: ${allowed.join(', ')}`,
    );
  }
  return value as T;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CatalogValidationError(`${label} is required`);
  }
  return value.trim();
}

function requireFiniteNonNegative(value: unknown, label: string): number {
  if (!isFiniteNumber(value) || value < 0) {
    throw new CatalogValidationError(
      `${label} must be a non-negative finite number`,
    );
  }
  return value;
}

function requirePositiveFinite(value: unknown, label: string): number {
  if (!isFiniteNumber(value) || value <= 0) {
    throw new CatalogValidationError(
      `${label} must be a positive finite number`,
    );
  }
  return value;
}

function requireInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new CatalogValidationError(
      `${label} must be an integer between ${min} and ${max}`,
    );
  }
  return value;
}

function normalizeReps(value: unknown): ExerciseReps | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) {
    throw new CatalogValidationError('Exercise reps must be an object');
  }
  const kind = value.kind;
  if (kind === 'fixed') {
    return {
      kind: 'fixed',
      value: requirePositiveFinite(value.value, 'Exercise reps value'),
    };
  }
  if (kind === 'range') {
    const min = requirePositiveFinite(value.min, 'Exercise reps min');
    const max = requirePositiveFinite(value.max, 'Exercise reps max');
    if (min > max) {
      throw new CatalogValidationError('Exercise reps min must not exceed max');
    }
    return { kind: 'range', min, max };
  }
  throw new CatalogValidationError('Exercise reps kind must be fixed or range');
}

function normalizeExerciseDefaults(
  value: unknown,
): ExerciseDefaults | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) {
    throw new CatalogValidationError('Exercise defaults must be an object');
  }
  const result: ExerciseDefaults = {};
  if (value.warmupSets !== undefined) {
    result.warmupSets = requireInteger(
      value.warmupSets,
      'Warm-up sets',
      0,
      100,
    );
  }
  if (value.workingSets !== undefined) {
    result.workingSets = requireInteger(
      value.workingSets,
      'Working sets',
      0,
      100,
    );
  }
  const reps = normalizeReps(value.reps);
  if (reps) result.reps = reps;
  if (value.restSeconds !== undefined) {
    result.restSeconds = requireInteger(
      value.restSeconds,
      'Rest seconds',
      0,
      100000,
    );
  }
  if (value.rir !== undefined && value.rir !== null) {
    result.rir = requireInteger(value.rir, 'RIR', 0, 10);
  } else if (value.rir === null) {
    result.rir = null;
  }
  if (value.alternativeExerciseIds !== undefined) {
    if (!Array.isArray(value.alternativeExerciseIds)) {
      throw new CatalogValidationError(
        'Alternative exercise ids must be an array',
      );
    }
    result.alternativeExerciseIds = value.alternativeExerciseIds.map(
      (item, index) =>
        requireNonEmptyString(item, `Alternative exercise id ${index + 1}`),
    );
  }
  return Object.keys(result).length ? result : undefined;
}

function normalizeSecondaryMuscles(value: unknown): MuscleGroupCode[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new CatalogValidationError('Secondary muscles must be an array');
  }
  return value.map((item, index) => {
    const code = requireNonEmptyString(item, `Secondary muscle ${index + 1}`);
    if (!MUSCLE_GROUP_CODES.includes(code as MuscleGroupCode)) {
      throw new CatalogValidationError(`Unsupported muscle group: ${code}`);
    }
    return code as MuscleGroupCode;
  });
}

export function normalizeExerciseInput(input: unknown): NormalizedExercise {
  if (!isRecord(input)) {
    throw new CatalogValidationError('Exercise input must be an object');
  }

  const names = normalizeLocalizedText(input.names, 'name', { required: true });
  if (!names.ar || !names.en) {
    throw new CatalogValidationError(
      'Both ar and en exercise names are required',
    );
  }

  const primaryMuscle = requireNonEmptyString(
    input.primaryMuscle,
    'Primary muscle',
  );
  if (!MUSCLE_GROUP_CODES.includes(primaryMuscle as MuscleGroupCode)) {
    throw new CatalogValidationError(
      `Unsupported muscle group: ${primaryMuscle}`,
    );
  }

  const equipment = requireNonEmptyString(input.equipment, 'Equipment');
  if (!EQUIPMENT_CODES.includes(equipment as EquipmentCode)) {
    throw new CatalogValidationError(`Unsupported equipment: ${equipment}`);
  }

  const secondaryMuscles = normalizeSecondaryMuscles(input.secondaryMuscles);

  const notes =
    input.notes === undefined
      ? undefined
      : normalizeLocalizedText(input.notes, 'note');

  const defaults = normalizeExerciseDefaults(input.defaults);

  const lifecycleState =
    input.lifecycleState === undefined
      ? 'active'
      : requireEnum(
          input.lifecycleState,
          CATALOG_LIFECYCLE_STATES,
          'Lifecycle state',
        );

  return {
    names: { ar: names.ar, en: names.en },
    primaryMuscle: primaryMuscle as MuscleGroupCode,
    secondaryMuscles,
    equipment: equipment as EquipmentCode,
    ...(defaults ? { defaults } : {}),
    ...(notes && Object.keys(notes).length ? { notes } : {}),
    lifecycleState,
  };
}

export function normalizeServingInput(input: unknown): NormalizedServing {
  if (!isRecord(input)) {
    throw new CatalogValidationError('Serving input must be an object');
  }

  const labels = normalizeLocalizedText(input.labels, 'serving label', {
    required: true,
  });
  if (!labels.ar && !labels.en) {
    throw new CatalogValidationError(
      'At least one serving label locale is required',
    );
  }

  const basisQuantity = requirePositiveFinite(
    input.basisQuantity,
    'Serving basis quantity',
  );

  return {
    labels: labels as Record<CatalogLocale, string>,
    basisQuantity,
  };
}

function normalizeAlternative(
  input: unknown,
  index: number,
): NormalizedFoodAlternative {
  if (!isRecord(input)) {
    throw new CatalogValidationError(
      `Alternative ${index + 1} must be an object`,
    );
  }
  const alternativeFoodId = requireNonEmptyString(
    input.alternativeFoodId,
    `Alternative ${index + 1} food id`,
  );
  const portionQuantity = requirePositiveFinite(
    input.portionQuantity,
    `Alternative ${index + 1} portion quantity`,
  );
  const portionUnit =
    input.portionUnit === undefined || input.portionUnit === null
      ? undefined
      : requireNonEmptyString(
          input.portionUnit,
          `Alternative ${index + 1} portion unit`,
        );

  return {
    alternativeFoodId,
    portionQuantity,
    ...(portionUnit ? { portionUnit } : {}),
  };
}

export function normalizeFoodInput(input: unknown): NormalizedFood {
  if (!isRecord(input)) {
    throw new CatalogValidationError('Food input must be an object');
  }

  const names = normalizeLocalizedText(input.names, 'name', { required: true });
  if (!names.ar && !names.en) {
    throw new CatalogValidationError(
      'At least one food name locale is required',
    );
  }

  const basis = requireEnum(input.basis, ['g', 'ml'] as const, 'Food basis');

  const productIdentity = requireNonEmptyString(
    input.productIdentity,
    'Product identity',
  );
  const preparationIdentity = requireNonEmptyString(
    input.preparationIdentity,
    'Preparation identity',
  );
  const weighingState = requireEnum(
    input.weighingState,
    ['raw', 'cooked', 'not_applicable'] as const,
    'Weighing state',
  );

  const kcal = requireFiniteNonNegative(input.kcal, 'Kcal');
  const protein = requireFiniteNonNegative(input.protein, 'Protein');
  const carbs = requireFiniteNonNegative(input.carbs, 'Carbohydrates');
  const fat = requireFiniteNonNegative(input.fat, 'Fat');

  if (protein + carbs + fat > 100) {
    throw new CatalogValidationError(
      'Protein, carbohydrates and fat must not exceed 100 per 100 basis units',
    );
  }

  let fiber: number | null = null;
  if (input.fiber !== undefined && input.fiber !== null) {
    fiber = requireFiniteNonNegative(input.fiber, 'Fiber');
  }

  if (!Array.isArray(input.servings) || input.servings.length === 0) {
    throw new CatalogValidationError('At least one serving is required');
  }
  const servings = input.servings.map((item, index) => {
    try {
      return normalizeServingInput(item);
    } catch (error) {
      throw new CatalogValidationError(
        `Serving ${index + 1}: ${error instanceof Error ? error.message : 'invalid'}`,
      );
    }
  });

  let alternatives: NormalizedFoodAlternative[] = [];
  if (input.alternatives !== undefined && input.alternatives !== null) {
    if (!Array.isArray(input.alternatives)) {
      throw new CatalogValidationError('Alternatives must be an array');
    }
    if (input.alternatives.length > MAX_FOOD_ALTERNATIVES) {
      throw new CatalogValidationError(
        'A food may have at most three alternatives',
      );
    }
    alternatives = input.alternatives.map((item, index) =>
      normalizeAlternative(item, index),
    );
  }

  const lifecycleState =
    input.lifecycleState === undefined
      ? 'active'
      : requireEnum(
          input.lifecycleState,
          CATALOG_LIFECYCLE_STATES,
          'Lifecycle state',
        );

  return {
    names,
    basis,
    productIdentity,
    preparationIdentity,
    weighingState,
    kcal,
    protein,
    carbs,
    fat,
    fiber,
    servings,
    alternatives,
    lifecycleState,
  };
}

export function normalizeWorkspaceScope(input: unknown): WorkspaceScope {
  if (!isRecord(input)) {
    throw new CatalogValidationError('Workspace scope must be an object');
  }
  const workspaceId = requireNonEmptyString(input.workspaceId, 'Workspace id');
  return { workspaceId };
}

export function normalizeCatalogSearchInput(
  input: unknown,
): NormalizedCatalogSearch {
  if (!isRecord(input)) {
    throw new CatalogValidationError('Search input must be an object');
  }

  const kind = requireEnum(
    input.kind,
    ['exercise', 'food', 'workspace_exercise', 'variation'] as const,
    'Search kind',
  );

  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const filters: CatalogSearchFilters = {};
  if (input.filters !== undefined && input.filters !== null) {
    if (!isRecord(input.filters)) {
      throw new CatalogValidationError('Search filters must be an object');
    }
    if (input.filters.muscleGroup !== undefined) {
      filters.muscleGroup = requireNonEmptyString(
        input.filters.muscleGroup,
        'Muscle group filter',
      );
    }
    if (input.filters.equipment !== undefined) {
      filters.equipment = requireNonEmptyString(
        input.filters.equipment,
        'Equipment filter',
      );
    }
    if (input.filters.basis !== undefined) {
      filters.basis = requireEnum(
        input.filters.basis,
        ['g', 'ml'] as const,
        'Basis filter',
      );
    }
  }

  const cursor =
    input.cursor === undefined || input.cursor === null
      ? null
      : requireNonEmptyString(input.cursor, 'Cursor');

  let limit = 20;
  if (input.limit !== undefined) {
    limit = requireInteger(input.limit, 'Limit', 1, MAX_SEARCH_PAGE_SIZE);
  }

  const workspaceScope =
    input.workspaceScope === undefined || input.workspaceScope === null
      ? null
      : normalizeWorkspaceScope(input.workspaceScope);

  if (
    (kind === 'workspace_exercise' || kind === 'variation') &&
    workspaceScope === null
  ) {
    throw new CatalogValidationError(
      'Workspace scope is required for workspace search',
    );
  }

  return {
    kind,
    query,
    filters,
    cursor,
    limit,
    workspaceScope,
  };
}

// Aliases for compatibility with common naming.
export const normalizeExercise = normalizeExerciseInput;
export const validateExercise = normalizeExerciseInput;
export const normalizeFood = normalizeFoodInput;
export const validateFood = normalizeFoodInput;
export const normalizeServing = normalizeServingInput;
export const validateServing = normalizeServingInput;
export const normalizeSearchInput = normalizeCatalogSearchInput;
export const validateSearchInput = normalizeCatalogSearchInput;
export const validateWorkspaceScope = normalizeWorkspaceScope;

export function isCatalogLifecycleState(
  value: unknown,
): value is CatalogLifecycleState {
  return CATALOG_LIFECYCLE_STATES.includes(value as CatalogLifecycleState);
}

export function normalizeLifecycleState(value: unknown): CatalogLifecycleState {
  return requireEnum(value, CATALOG_LIFECYCLE_STATES, 'Lifecycle state');
}
