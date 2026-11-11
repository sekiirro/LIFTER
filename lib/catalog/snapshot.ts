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

/** Frozen planner-entry values for an exercise at publication time. */
export type ExerciseSnapshotV2 = {
  schemaVersion: 2;
  source: 'global' | 'workspace_private';
  exerciseId?: string;
  canonicalVersion?: number;
  workspaceExerciseId?: string;
  workspaceExerciseVersion?: number;
  overrideVersion: number | null;
  name: { ar?: string; en: string };
  description?: string;
  notes?: string;
  alternatives: (
    { globalExerciseId: string } | { workspaceExerciseId: string }
  )[];
  defaults: {
    restSeconds?: number;
    rir?: number | null;
    reps?: ExerciseDefaults['reps'];
  };
};

export type ExerciseSnapshotV2Input = {
  source: 'global' | 'workspace_private';
  exerciseId?: unknown;
  canonicalVersion?: unknown;
  workspaceExerciseId?: unknown;
  workspaceExerciseVersion?: unknown;
  overrideVersion?: unknown;
  plannerEntry: {
    name: unknown;
    description?: unknown;
    notes?: unknown;
    alternatives?: unknown;
    defaults?: unknown;
    /** Accepted as input only to make its deliberate live treatment explicit. */
    videoUrl?: unknown;
    [key: string]: unknown;
  };
  /** Library values are intentionally ignored; published values come from plannerEntry. */
  currentLibrary?: unknown;
};

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

export type Snapshot = ExerciseSnapshot | ExerciseSnapshotV2 | FoodSnapshot;

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
  if (!names.ar && !names.en)
    throw new Error('food snapshot requires at least one localized name');

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
  if (isExerciseSnapshotV2(snapshot)) {
    canonical = canonicalExerciseSnapshotV2(snapshot);
  } else if (isExerciseSnapshot(snapshot)) {
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
  if (typeof names.ar !== 'string' || !names.ar.trim())
    throw new Error('names.ar must be a non-empty string');
  if (typeof names.en !== 'string' || !names.en.trim())
    throw new Error('names.en must be a non-empty string');
  if (typeof snap.primaryMuscle !== 'string' || !snap.primaryMuscle.trim())
    throw new Error('primaryMuscle must be a non-empty string');
  if (!Array.isArray(snap.secondaryMuscles))
    throw new Error('secondaryMuscles must be an array');
  if (
    !snap.secondaryMuscles.every(
      (muscle) => typeof muscle === 'string' && muscle.trim().length > 0,
    )
  )
    throw new Error('secondaryMuscles must contain non-empty strings');
  if (typeof snap.equipment !== 'string' || !snap.equipment.trim())
    throw new Error('equipment must be a non-empty string');
  if (snap.defaults !== undefined) {
    if (typeof snap.defaults !== 'object' || Array.isArray(snap.defaults))
      throw new Error('defaults must be an object');
    const defaults = snap.defaults as Record<string, unknown>;
    assertNoUnknownKeys(
      defaults,
      [
        'warmupSets',
        'workingSets',
        'reps',
        'restSeconds',
        'rir',
        'alternativeExerciseIds',
      ],
      'defaults',
    );
    for (const key of ['warmupSets', 'workingSets', 'restSeconds'] as const) {
      if (
        defaults[key] !== undefined &&
        (typeof defaults[key] !== 'number' ||
          !Number.isFinite(defaults[key]) ||
          defaults[key] < 0)
      )
        throw new Error(`defaults.${key} must be a non-negative number`);
    }
    if (
      defaults.alternativeExerciseIds !== undefined &&
      (!Array.isArray(defaults.alternativeExerciseIds) ||
        !defaults.alternativeExerciseIds.every(
          (id) => typeof id === 'string' && id.trim(),
        ))
    )
      throw new Error('defaults.alternativeExerciseIds must be strings');
    if (
      defaults.rir !== undefined &&
      defaults.rir !== null &&
      (typeof defaults.rir !== 'number' ||
        !Number.isFinite(defaults.rir) ||
        defaults.rir < 0)
    )
      throw new Error('defaults.rir must be a non-negative number or null');
    if (defaults.reps !== undefined) {
      if (
        !defaults.reps ||
        typeof defaults.reps !== 'object' ||
        Array.isArray(defaults.reps)
      )
        throw new Error('defaults.reps must be an object');
      const reps = defaults.reps as Record<string, unknown>;
      if (reps.kind === 'fixed') {
        assertNoUnknownKeys(reps, ['kind', 'value'], 'defaults.reps');
        if (
          typeof reps.value !== 'number' ||
          !Number.isFinite(reps.value) ||
          reps.value <= 0
        )
          throw new Error('defaults.reps.value must be positive');
      } else if (reps.kind === 'range') {
        assertNoUnknownKeys(reps, ['kind', 'min', 'max'], 'defaults.reps');
        if (
          typeof reps.min !== 'number' ||
          !Number.isFinite(reps.min) ||
          reps.min <= 0 ||
          typeof reps.max !== 'number' ||
          !Number.isFinite(reps.max) ||
          reps.max < reps.min
        )
          throw new Error('defaults.reps range is invalid');
      } else throw new Error('defaults.reps.kind is invalid');
    }
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
  if (
    !(['ar', 'en'] as const).some(
      (locale) => typeof names[locale] === 'string' && names[locale].trim(),
    )
  )
    throw new Error('names must contain at least one non-empty locale');
  for (const locale of ['ar', 'en'] as const) {
    if (
      names[locale] !== undefined &&
      (typeof names[locale] !== 'string' || !names[locale].trim())
    )
      throw new Error(`names.${locale} must be a non-empty string`);
  }
  if (snap.basis !== 'g' && snap.basis !== 'ml')
    throw new Error('basis must be g or ml');
  if (typeof snap.productIdentity !== 'string' || !snap.productIdentity.trim())
    throw new Error('productIdentity must be a non-empty string');
  if (
    typeof snap.preparationIdentity !== 'string' ||
    !snap.preparationIdentity.trim()
  )
    throw new Error('preparationIdentity must be a non-empty string');
  if (
    snap.weighingState !== 'raw' &&
    snap.weighingState !== 'cooked' &&
    snap.weighingState !== 'not_applicable'
  )
    throw new Error('weighingState invalid');
  for (const f of ['kcal', 'protein', 'carbs', 'fat'] as const) {
    if (typeof snap[f] !== 'number' || !Number.isFinite(snap[f]) || snap[f] < 0)
      throw new Error(`${f} must be a non-negative finite number`);
  }
  if (
    snap.fiber !== null &&
    (typeof snap.fiber !== 'number' ||
      !Number.isFinite(snap.fiber) ||
      snap.fiber < 0)
  )
    throw new Error('fiber must be a non-negative finite number or null');
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
    !serving.labels ||
    typeof serving.labels !== 'object' ||
    Array.isArray(serving.labels)
  )
    throw new Error('labels must be an object');
  const labels = serving.labels as Record<string, unknown> | undefined;
  assertNoUnknownKeys(labels!, ['ar', 'en'], 'labels');
  if (
    Object.values(labels!).some(
      (label) => typeof label !== 'string' || !label.trim(),
    )
  )
    throw new Error('labels values must be non-empty strings');
  if (
    typeof serving.basisQuantity !== 'number' ||
    !Number.isFinite(serving.basisQuantity) ||
    serving.basisQuantity <= 0
  )
    throw new Error('basisQuantity must be a positive finite number');
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
  if (isExerciseSnapshotV2(obj)) return validateExerciseSnapshotV2Impl(obj);
  if (isExerciseSnapshot(obj)) return validateExerciseSnapshotImpl(obj);
  if (isFoodSnapshot(obj)) return validateFoodSnapshotImpl(obj);
  throw new Error('snapshot must be an exercise or food snapshot');
}

export const validateSnapshot = parseSnapshot;
export const validateExerciseSnapshot = parseExerciseSnapshot;
export const validateFoodSnapshot = parseFoodSnapshot;
export const deserializeSnapshot = parseSnapshot;

function isExerciseSnapshotV2(input: unknown): input is ExerciseSnapshotV2 {
  return Boolean(
    input &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    (input as Record<string, unknown>).schemaVersion === 2,
  );
}

function canonicalExerciseSnapshotV2(
  input: ExerciseSnapshotV2,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    schemaVersion: 2,
    source: input.source,
  };
  if (input.source === 'global') {
    out.exerciseId = input.exerciseId;
    out.canonicalVersion = input.canonicalVersion;
    out.overrideVersion = input.overrideVersion;
  } else {
    out.workspaceExerciseId = input.workspaceExerciseId;
    out.workspaceExerciseVersion = input.workspaceExerciseVersion;
  }
  out.name = { ...input.name };
  if (input.description !== undefined) out.description = input.description;
  if (input.notes !== undefined) out.notes = input.notes;
  out.alternatives = input.alternatives.map((alternative) => ({
    ...alternative,
  }));
  out.defaults = { ...input.defaults };
  return out;
}

function validateExerciseSnapshotV2Impl(input: unknown): ExerciseSnapshotV2 {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('snapshot must be an object');
  const obj = input as Record<string, unknown>;
  if (obj.schemaVersion !== 2) throw new Error('schemaVersion must be 2');
  if (obj.source !== 'global' && obj.source !== 'workspace_private')
    throw new Error('source is invalid');
  const keys =
    obj.source === 'global'
      ? [
          'schemaVersion',
          'source',
          'exerciseId',
          'canonicalVersion',
          'overrideVersion',
          'name',
          'description',
          'notes',
          'alternatives',
          'defaults',
        ]
      : [
          'schemaVersion',
          'source',
          'workspaceExerciseId',
          'workspaceExerciseVersion',
          'name',
          'description',
          'notes',
          'alternatives',
          'defaults',
        ];
  assertNoUnknownKeys(obj, keys, 'ExerciseSnapshotV2');
  if (obj.source === 'global') {
    asString(obj.exerciseId, 'exerciseId');
    asInt(obj.canonicalVersion, 'canonicalVersion');
    if (obj.overrideVersion !== null)
      asInt(obj.overrideVersion, 'overrideVersion');
  } else {
    asString(obj.workspaceExerciseId, 'workspaceExerciseId');
    asInt(obj.workspaceExerciseVersion, 'workspaceExerciseVersion');
  }
  if (!obj.name || typeof obj.name !== 'object' || Array.isArray(obj.name))
    throw new Error('name must be an object');
  const name = obj.name as Record<string, unknown>;
  assertNoUnknownKeys(name, ['ar', 'en'], 'name');
  asString(name.en, 'name.en');
  if (name.ar !== undefined) asString(name.ar, 'name.ar');
  for (const field of ['description', 'notes'] as const) {
    if (obj[field] !== undefined && typeof obj[field] !== 'string')
      throw new Error(`${field} must be a string`);
  }
  if (!Array.isArray(obj.alternatives) || obj.alternatives.length > 3)
    throw new Error('alternatives must contain at most three targets');
  const alternativeKeys = new Set<string>();
  for (const value of obj.alternatives) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('alternative must be a target object');
    const target = value as Record<string, unknown>;
    const hasGlobalTarget = Object.hasOwn(target, 'globalExerciseId');
    const hasWorkspaceTarget = Object.hasOwn(target, 'workspaceExerciseId');
    if (hasGlobalTarget === hasWorkspaceTarget)
      throw new Error('alternative must contain exactly one target');
    const allowedTargetKey = hasGlobalTarget
      ? 'globalExerciseId'
      : 'workspaceExerciseId';
    assertNoUnknownKeys(target, [allowedTargetKey], 'alternative');
    if (obj.source === 'global' && hasWorkspaceTarget)
      throw new Error('Global snapshots require Global alternatives');
    const targetId = asString(target[allowedTargetKey], allowedTargetKey);
    const uniqueKey = `${allowedTargetKey}:${targetId}`;
    if (alternativeKeys.has(uniqueKey))
      throw new Error('alternatives must be unique');
    alternativeKeys.add(uniqueKey);
  }
  if (
    !obj.defaults ||
    typeof obj.defaults !== 'object' ||
    Array.isArray(obj.defaults)
  )
    throw new Error('defaults must be an object');
  const defaults = obj.defaults as Record<string, unknown>;
  assertNoUnknownKeys(defaults, ['restSeconds', 'rir', 'reps'], 'defaults');
  if (
    defaults.restSeconds !== undefined &&
    (typeof defaults.restSeconds !== 'number' ||
      !Number.isFinite(defaults.restSeconds) ||
      defaults.restSeconds < 0)
  )
    throw new Error('defaults.restSeconds must be a non-negative number');
  if (
    defaults.rir !== undefined &&
    defaults.rir !== null &&
    (typeof defaults.rir !== 'number' ||
      !Number.isFinite(defaults.rir) ||
      defaults.rir < 0)
  )
    throw new Error('defaults.rir must be a non-negative number or null');
  if (defaults.reps !== undefined) {
    const reps = defaults.reps as Record<string, unknown>;
    if (!reps || typeof reps !== 'object' || Array.isArray(reps))
      throw new Error('defaults.reps must be an object');
    if (reps.kind === 'fixed') {
      assertNoUnknownKeys(reps, ['kind', 'value'], 'defaults.reps');
      if (
        typeof reps.value !== 'number' ||
        !Number.isFinite(reps.value) ||
        reps.value <= 0
      )
        throw new Error('defaults.reps.value must be positive');
    } else if (reps.kind === 'range') {
      assertNoUnknownKeys(reps, ['kind', 'min', 'max'], 'defaults.reps');
      if (
        typeof reps.min !== 'number' ||
        !Number.isFinite(reps.min) ||
        reps.min <= 0 ||
        typeof reps.max !== 'number' ||
        !Number.isFinite(reps.max) ||
        reps.max < reps.min
      )
        throw new Error('defaults.reps range is invalid');
    } else throw new Error('defaults.reps.kind is invalid');
  }
  const alternatives = obj.alternatives.map((value) => ({
    ...(value as Record<string, unknown>),
  })) as ExerciseSnapshotV2['alternatives'];
  obj.alternatives = alternatives;
  return input as ExerciseSnapshotV2;
}

export function toExerciseSnapshotV2(
  input: ExerciseSnapshotV2Input,
): ExerciseSnapshotV2 {
  const entry = input.plannerEntry;
  const defaultsRaw = (entry.defaults ?? {}) as Record<string, unknown>;
  const defaults: ExerciseSnapshotV2['defaults'] = {};
  if (defaultsRaw.restSeconds !== undefined)
    defaults.restSeconds = defaultsRaw.restSeconds as number;
  if (defaultsRaw.rir !== undefined)
    defaults.rir = defaultsRaw.rir as number | null;
  if (defaultsRaw.reps !== undefined)
    defaults.reps = clone(defaultsRaw.reps) as ExerciseDefaults['reps'];
  const snapshot: Record<string, unknown> = {
    schemaVersion: 2,
    source: input.source,
    name: clone(entry.name),
    alternatives: clone(entry.alternatives ?? []),
    defaults,
  };
  if (entry.description !== undefined) snapshot.description = entry.description;
  if (entry.notes !== undefined) snapshot.notes = entry.notes;
  if (input.source === 'global') {
    snapshot.exerciseId = asString(input.exerciseId, 'exerciseId');
    snapshot.canonicalVersion = asInt(
      input.canonicalVersion,
      'canonicalVersion',
    );
    snapshot.overrideVersion =
      input.overrideVersion === undefined || input.overrideVersion === null
        ? null
        : asInt(input.overrideVersion, 'overrideVersion');
  } else {
    snapshot.workspaceExerciseId = asString(
      input.workspaceExerciseId,
      'workspaceExerciseId',
    );
    snapshot.workspaceExerciseVersion = asInt(
      input.workspaceExerciseVersion,
      'workspaceExerciseVersion',
    );
  }
  return validateExerciseSnapshotV2Impl(snapshot);
}

export function serializeExerciseSnapshotV2(
  snapshot: ExerciseSnapshotV2,
): string {
  return JSON.stringify(canonicalExerciseSnapshotV2(snapshot), null, 2);
}

export function parseExerciseSnapshotV2(input: unknown): ExerciseSnapshotV2 {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  return validateExerciseSnapshotV2Impl(obj);
}
