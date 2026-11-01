import type { ExerciseDefaults } from './schemas';

export type ExerciseSnapshot = {
  exerciseId: string;
  version: number;
  names: { ar: string; en: string };
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  defaults?: ExerciseDefaults;
};

export type ExerciseSnapshotV1 = ExerciseSnapshot;

export type FoodSnapshotServing = {
  servingId: string;
  labels: { ar?: string; en?: string };
  basisQuantity: number;
};

export type FoodSnapshot = {
  foodId: string;
  version: number;
  names: { ar?: string; en?: string };
  basis: 'g' | 'ml';
  productIdentity: string;
  preparationIdentity: string;
  weighingState: 'raw' | 'cooked' | 'not_applicable';
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  serving: FoodSnapshotServing;
};

export type FoodSnapshotV1 = FoodSnapshot;

export type Snapshot = ExerciseSnapshot | FoodSnapshot;

type ExerciseVersionInput = {
  exerciseId?: unknown;
  id?: unknown;
  version: unknown;
  names?: unknown;
  primaryMuscle?: unknown;
  secondaryMuscles?: unknown;
  equipment?: unknown;
  defaults?: unknown;
  [key: string]: unknown;
};

type FoodServingInput = {
  id?: unknown;
  servingId?: unknown;
  labels?: unknown;
  basisQuantity?: unknown;
  [key: string]: unknown;
};

type FoodVersionInput = {
  foodId?: unknown;
  id?: unknown;
  version: unknown;
  names?: unknown;
  basis?: unknown;
  productIdentity?: unknown;
  preparationIdentity?: unknown;
  weighingState?: unknown;
  kcal?: unknown;
  protein?: unknown;
  carbs?: unknown;
  fat?: unknown;
  fiber?: unknown;
  servings?: unknown;
  [key: string]: unknown;
};

function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function asInt(value: unknown, label: string): number {
  const n = asNumber(value, label);
  if (!Number.isInteger(n)) {
    throw new Error(`${label} must be an integer`);
  }
  return n;
}

export function toExerciseSnapshot(
  version: ExerciseVersionInput,
): ExerciseSnapshot {
  const exerciseId = asString(version.exerciseId ?? version.id, 'exerciseId');
  const ver = asInt(version.version, 'version');

  const rawNames = (version.names ?? {}) as Record<string, unknown>;
  const names = {
    ar: asString(rawNames.ar, 'name ar'),
    en: asString(rawNames.en, 'name en'),
  };

  const primaryMuscle = asString(version.primaryMuscle, 'primaryMuscle');
  const secondaryMuscles = Array.isArray(version.secondaryMuscles)
    ? version.secondaryMuscles.map((m, i) =>
        asString(m, `secondaryMuscle ${i}`),
      )
    : [];
  const equipment = asString(version.equipment, 'equipment');

  const defaults =
    version.defaults && typeof version.defaults === 'object'
      ? (clone(version.defaults) as ExerciseDefaults)
      : undefined;

  const result: ExerciseSnapshot = {
    exerciseId,
    version: ver,
    names,
    primaryMuscle,
    secondaryMuscles,
    equipment,
  };
  if (defaults) result.defaults = defaults;
  return result;
}

function findServing(servings: unknown, servingId: unknown): FoodServingInput {
  if (!Array.isArray(servings) || servings.length === 0) {
    throw new Error('servings must be a non-empty array');
  }
  const list = servings as FoodServingInput[];

  const id =
    typeof servingId === 'string' && servingId.trim().length > 0
      ? servingId.trim()
      : '';
  if (!id) {
    throw new Error('servingId must be a non-empty string');
  }

  const byId = list.find((s) => s.id === id || s.servingId === id);
  if (!byId) {
    throw new Error('serving not found');
  }
  return byId;
}

export function toFoodSnapshot(
  version: FoodVersionInput,
  servingId: unknown,
): FoodSnapshot {
  const foodId = asString(version.foodId ?? version.id, 'foodId');
  const ver = asInt(version.version, 'version');

  const rawNames = (version.names ?? {}) as Record<string, unknown>;
  const names: { ar?: string; en?: string } = {};
  if (rawNames.ar !== undefined && rawNames.ar !== null)
    names.ar = asString(rawNames.ar, 'name ar');
  if (rawNames.en !== undefined && rawNames.en !== null)
    names.en = asString(rawNames.en, 'name en');

  const basis = asString(version.basis, 'basis') as 'g' | 'ml';
  if (basis !== 'g' && basis !== 'ml') {
    throw new Error('basis must be g or ml');
  }
  const productIdentity = asString(version.productIdentity, 'productIdentity');
  const preparationIdentity = asString(
    version.preparationIdentity,
    'preparationIdentity',
  );
  const weighingState = asString(
    version.weighingState,
    'weighingState',
  ) as FoodSnapshot['weighingState'];
  if (
    weighingState !== 'raw' &&
    weighingState !== 'cooked' &&
    weighingState !== 'not_applicable'
  ) {
    throw new Error('weighingState must be raw, cooked or not_applicable');
  }

  const kcal = asNumber(version.kcal, 'kcal');
  const protein = asNumber(version.protein, 'protein');
  const carbs = asNumber(version.carbs, 'carbs');
  const fat = asNumber(version.fat, 'fat');
  const fiber =
    version.fiber === undefined || version.fiber === null
      ? null
      : asNumber(version.fiber, 'fiber');

  const serving = findServing(version.servings, servingId);
  const labelsRaw = (serving.labels ?? {}) as Record<string, unknown>;
  const labels: { ar?: string; en?: string } = {};
  if (labelsRaw.ar !== undefined && labelsRaw.ar !== null)
    labels.ar = asString(labelsRaw.ar, 'serving label ar');
  if (labelsRaw.en !== undefined && labelsRaw.en !== null)
    labels.en = asString(labelsRaw.en, 'serving label en');
  const basisQuantity = asNumber(serving.basisQuantity, 'basisQuantity');
  const selectedServingId = asString(
    serving.id ?? serving.servingId,
    'servingId',
  );

  return {
    foodId,
    version: ver,
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
    serving: {
      servingId: selectedServingId,
      labels,
      basisQuantity,
    },
  };
}

const EXERCISE_KEYS = [
  'exerciseId',
  'version',
  'names',
  'primaryMuscle',
  'secondaryMuscles',
  'equipment',
  'defaults',
] as const;

const FOOD_KEYS = [
  'foodId',
  'version',
  'names',
  'basis',
  'productIdentity',
  'preparationIdentity',
  'weighingState',
  'kcal',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'serving',
] as const;

function canonicalExercise(input: ExerciseSnapshot): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  out.exerciseId = input.exerciseId;
  out.version = input.version;
  out.names = {
    ar: input.names.ar,
    en: input.names.en,
  };
  out.primaryMuscle = input.primaryMuscle;
  out.secondaryMuscles = Array.isArray(input.secondaryMuscles)
    ? [...input.secondaryMuscles]
    : [];
  out.equipment = input.equipment;
  if (input.defaults !== undefined) {
    const d = input.defaults;
    const reps = d.reps;
    const repsOut =
      reps && typeof reps === 'object'
        ? reps.kind === 'fixed'
          ? { kind: 'fixed', value: reps.value }
          : { kind: 'range', min: reps.min, max: reps.max }
        : reps;
    const defaultsOut: Record<string, unknown> = {};
    if (d.warmupSets !== undefined) defaultsOut.warmupSets = d.warmupSets;
    if (d.workingSets !== undefined) defaultsOut.workingSets = d.workingSets;
    if (repsOut !== undefined) defaultsOut.reps = repsOut;
    if (d.restSeconds !== undefined) defaultsOut.restSeconds = d.restSeconds;
    if (d.rir !== undefined) defaultsOut.rir = d.rir;
    if (d.alternativeExerciseIds !== undefined)
      defaultsOut.alternativeExerciseIds = [...d.alternativeExerciseIds];
    out.defaults = defaultsOut;
  }
  return out;
}

function canonicalFood(input: FoodSnapshot): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  out.foodId = input.foodId;
  out.version = input.version;
  const names: { ar?: string; en?: string } = {};
  if (input.names.ar !== undefined) names.ar = input.names.ar;
  if (input.names.en !== undefined) names.en = input.names.en;
  out.names = names;
  out.basis = input.basis;
  out.productIdentity = input.productIdentity;
  out.preparationIdentity = input.preparationIdentity;
  out.weighingState = input.weighingState;
  out.kcal = input.kcal;
  out.protein = input.protein;
  out.carbs = input.carbs;
  out.fat = input.fat;
  out.fiber = input.fiber;
  const serving: FoodSnapshotServing = {
    servingId: input.serving.servingId,
    labels: {},
    basisQuantity: input.serving.basisQuantity,
  };
  if (input.serving.labels.ar !== undefined)
    serving.labels.ar = input.serving.labels.ar;
  if (input.serving.labels.en !== undefined)
    serving.labels.en = input.serving.labels.en;
  out.serving = serving;
  return out;
}

function isExerciseSnapshot(input: unknown): input is ExerciseSnapshot {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const snap = input as ExerciseSnapshot;
  return typeof snap.exerciseId === 'string';
}

function isFoodSnapshot(input: unknown): input is FoodSnapshot {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const snap = input as FoodSnapshot;
  return typeof snap.foodId === 'string';
}

const URL_PATTERNS = ['http:', 'https:', 'www.', 'youtube', 'drive.google'];

function containsUrl(value: unknown): boolean {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return URL_PATTERNS.some((p) => lower.includes(p));
  }
  if (Array.isArray(value)) return value.some(containsUrl);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return (
      Object.keys(record).some((k) =>
        URL_PATTERNS.some((p) => k.toLowerCase().includes(p)),
      ) || Object.values(record).some(containsUrl)
    );
  }
  return false;
}

function assertNoUnknownKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new Error(`${label}: unknown key '${key}'`);
    }
  }
}

export function serializeSnapshot(snapshot: unknown): string {
  let canonical: unknown;
  if (isExerciseSnapshot(snapshot)) {
    canonical = canonicalExercise(snapshot);
  } else if (isFoodSnapshot(snapshot)) {
    canonical = canonicalFood(snapshot);
  } else {
    canonical = snapshot;
  }
  return JSON.stringify(canonical, null, 2);
}

// Validation helpers
function validateExerciseSnapshotImpl(obj: unknown): ExerciseSnapshot {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('snapshot must be an object');
  }
  const snap = obj as Record<string, unknown>;
  assertNoUnknownKeys(snap, EXERCISE_KEYS, 'ExerciseSnapshot');
  if (containsUrl(snap)) throw new Error('snapshot contains a URL-like field');
  if (typeof snap.exerciseId !== 'string' || !snap.exerciseId.trim())
    throw new Error('exerciseId must be a non-empty string');
  if (typeof snap.version !== 'number' || !Number.isInteger(snap.version))
    throw new Error('version must be an integer');
  if (
    !snap.names ||
    typeof snap.names !== 'object' ||
    Array.isArray(snap.names)
  )
    throw new Error('names must be an object');
  const names = snap.names as Record<string, unknown>;
  assertNoUnknownKeys(names, ['ar', 'en'], 'names');
  if (names.ar !== undefined && typeof names.ar !== 'string')
    throw new Error('names.ar must be a string');
  if (names.en !== undefined && typeof names.en !== 'string')
    throw new Error('names.en must be a string');
  if (typeof snap.primaryMuscle !== 'string')
    throw new Error('primaryMuscle must be a string');
  if (!Array.isArray(snap.secondaryMuscles))
    throw new Error('secondaryMuscles must be an array');
  if (typeof snap.equipment !== 'string')
    throw new Error('equipment must be a string');
  if (snap.defaults !== undefined) {
    if (typeof snap.defaults !== 'object' || Array.isArray(snap.defaults))
      throw new Error('defaults must be an object');
    // basic check; nested keys validated loosely
  }
  return obj as ExerciseSnapshot;
}

function validateFoodSnapshotImpl(obj: unknown): FoodSnapshot {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('snapshot must be an object');
  }
  const snap = obj as Record<string, unknown>;
  assertNoUnknownKeys(snap, FOOD_KEYS, 'FoodSnapshot');
  if (containsUrl(snap)) throw new Error('snapshot contains a URL-like field');
  if (typeof snap.foodId !== 'string' || !snap.foodId.trim())
    throw new Error('foodId must be a non-empty string');
  if (typeof snap.version !== 'number' || !Number.isInteger(snap.version))
    throw new Error('version must be an integer');
  if (
    !snap.names ||
    typeof snap.names !== 'object' ||
    Array.isArray(snap.names)
  )
    throw new Error('names must be an object');
  const names = snap.names as Record<string, unknown>;
  assertNoUnknownKeys(names, ['ar', 'en'], 'names');
  if (snap.basis !== 'g' && snap.basis !== 'ml')
    throw new Error('basis must be g or ml');
  if (typeof snap.productIdentity !== 'string')
    throw new Error('productIdentity must be a string');
  if (typeof snap.preparationIdentity !== 'string')
    throw new Error('preparationIdentity must be a string');
  if (
    snap.weighingState !== 'raw' &&
    snap.weighingState !== 'cooked' &&
    snap.weighingState !== 'not_applicable'
  )
    throw new Error('weighingState invalid');
  for (const f of ['kcal', 'protein', 'carbs', 'fat'] as const) {
    if (typeof snap[f] !== 'number' || !Number.isFinite(snap[f]))
      throw new Error(`${f} must be a finite number`);
  }
  if (
    snap.fiber !== null &&
    (typeof snap.fiber !== 'number' || !Number.isFinite(snap.fiber))
  )
    throw new Error('fiber must be a finite number or null');
  if (
    !snap.serving ||
    typeof snap.serving !== 'object' ||
    Array.isArray(snap.serving)
  )
    throw new Error('serving must be an object');
  const serving = snap.serving as Record<string, unknown>;
  assertNoUnknownKeys(
    serving,
    ['servingId', 'labels', 'basisQuantity'],
    'serving',
  );
  if (containsUrl(serving))
    throw new Error('serving contains a URL-like field');
  if (typeof serving.servingId !== 'string' || !serving.servingId.trim())
    throw new Error('servingId must be a non-empty string');
  if (
    serving.labels &&
    (typeof serving.labels !== 'object' || Array.isArray(serving.labels))
  )
    throw new Error('labels must be an object');
  const labels = serving.labels as Record<string, unknown> | undefined;
  if (labels) assertNoUnknownKeys(labels, ['ar', 'en'], 'labels');
  if (
    typeof serving.basisQuantity !== 'number' ||
    !Number.isFinite(serving.basisQuantity)
  )
    throw new Error('basisQuantity must be a finite number');
  return obj as FoodSnapshot;
}

export function parseExerciseSnapshot(input: unknown): ExerciseSnapshot {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  return validateExerciseSnapshotImpl(obj);
}

export function parseFoodSnapshot(input: unknown): FoodSnapshot {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  return validateFoodSnapshotImpl(obj);
}

export function parseSnapshot(input: unknown): Snapshot {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  if (isExerciseSnapshot(obj)) return validateExerciseSnapshotImpl(obj);
  if (isFoodSnapshot(obj)) return validateFoodSnapshotImpl(obj);
  throw new Error('snapshot must be an exercise or food snapshot');
}

export const validateSnapshot = parseSnapshot;
export const validateExerciseSnapshot = parseExerciseSnapshot;
export const validateFoodSnapshot = parseFoodSnapshot;
export const deserializeSnapshot = parseSnapshot;
