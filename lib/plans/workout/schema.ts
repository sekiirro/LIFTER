export type WorkoutExerciseSource = 'global' | 'workspace';
export type WorkoutDayKind = 'session' | 'rest';
export type WorkoutSetType = 'warmup' | 'working';
export type WorkoutLoadUnit = 'kg' | 'lb';

export type WorkoutVariationReference = {
  id: string;
  version: number;
};

export type WorkoutExerciseReference = {
  source: WorkoutExerciseSource;
  id: string;
  version: number;
  variation?: WorkoutVariationReference;
};

export type WorkoutReps = { min: number; max: number } | { value: number };
export type WorkoutLoad =
  | { mode: 'bodyweight' }
  | { mode: 'added_weight'; value: string; unit: WorkoutLoadUnit }
  | { mode: 'assisted'; value: string; unit: WorkoutLoadUnit };

export type WorkoutSet = {
  id: string;
  type: WorkoutSetType;
  reps: WorkoutReps;
  load: WorkoutLoad;
  restSec?: number;
  rir?: number;
  notes?: string;
};

export type WorkoutItem = {
  id: string;
  exercise: WorkoutExerciseReference;
  notes?: string;
  alternatives?: WorkoutExerciseReference[];
  sets: WorkoutSet[];
};

export type WorkoutDay = {
  id: string;
  kind: WorkoutDayKind;
  title?: string;
  notes?: string;
  items?: WorkoutItem[];
};

export type WorkoutDocument = {
  days: WorkoutDay[];
  notes?: string;
};

export class WorkoutValidationError extends Error {
  readonly code = 'invalid_workout_document';

  constructor(message: string) {
    super(message);
    this.name = 'WorkoutValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new WorkoutValidationError(`${label} has unknown key: ${key}`);
    }
  }
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value))
    throw new WorkoutValidationError(`${label} must be an object`);
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value))
    throw new WorkoutValidationError(`${label} must be an array`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new WorkoutValidationError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireOptionalString(
  value: unknown,
  parent: Record<string, unknown>,
  key: string,
  label: string,
): string | undefined {
  if (!(key in parent)) return undefined;
  if (typeof value !== 'string')
    throw new WorkoutValidationError(`${label} must be a string`);
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new WorkoutValidationError(`${label} must be a positive integer`);
  }
  return value;
}

function requireNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new WorkoutValidationError(
      `${label} must be a non-negative finite number`,
    );
  }
  return value;
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new WorkoutValidationError(
      `${label} must be one of: ${allowed.join(', ')}`,
    );
  }
  return value as T;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: unknown, label: string, ids: Set<string>): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new WorkoutValidationError(`${label} must be a UUID`);
  }
  const canonical = value.toLowerCase();
  if (ids.has(canonical))
    throw new WorkoutValidationError(`${label} must be unique`);
  ids.add(canonical);
  return value;
}

function normalizeReference(
  input: unknown,
  label: string,
): WorkoutExerciseReference {
  const value = requireObject(input, label);
  rejectUnknownKeys(value, ['source', 'id', 'version', 'variation'], label);
  const reference: WorkoutExerciseReference = {
    source: requireEnum(
      value.source,
      ['global', 'workspace'],
      `${label}.source`,
    ),
    id: requireString(value.id, `${label}.id`),
    version: requirePositiveInteger(value.version, `${label}.version`),
  };
  if ('variation' in value) {
    const variation = requireObject(value.variation, `${label}.variation`);
    rejectUnknownKeys(variation, ['id', 'version'], `${label}.variation`);
    reference.variation = {
      id: requireString(variation.id, `${label}.variation.id`),
      version: requirePositiveInteger(
        variation.version,
        `${label}.variation.version`,
      ),
    };
  }
  return reference;
}

function normalizeReps(input: unknown, label: string): WorkoutReps {
  const value = requireObject(input, label);
  if ('value' in value) {
    rejectUnknownKeys(value, ['value'], label);
    return { value: requirePositiveInteger(value.value, `${label}.value`) };
  }
  rejectUnknownKeys(value, ['min', 'max'], label);
  const min = requirePositiveInteger(value.min, `${label}.min`);
  const max = requirePositiveInteger(value.max, `${label}.max`);
  if (min > max)
    throw new WorkoutValidationError(`${label}.min must not exceed max`);
  return { min, max };
}

function normalizeLoad(input: unknown, label: string): WorkoutLoad {
  const value = requireObject(input, label);
  const mode = requireEnum(
    value.mode,
    ['bodyweight', 'added_weight', 'assisted'],
    `${label}.mode`,
  );
  if (mode === 'bodyweight') {
    rejectUnknownKeys(value, ['mode'], label);
    return { mode };
  }
  rejectUnknownKeys(value, ['mode', 'value', 'unit'], label);
  if (
    typeof value.value !== 'string' ||
    !/^\d+(?:\.\d+)?$/.test(value.value) ||
    !/[1-9]/.test(value.value)
  ) {
    throw new WorkoutValidationError(
      `${label}.value must be a positive exact decimal string`,
    );
  }
  return {
    mode,
    value: value.value,
    unit: requireEnum(value.unit, ['kg', 'lb'], `${label}.unit`),
  };
}

function normalizeSet(
  input: unknown,
  label: string,
  ids: Set<string>,
): WorkoutSet {
  const value = requireObject(input, label);
  rejectUnknownKeys(
    value,
    ['id', 'type', 'reps', 'load', 'restSec', 'rir', 'notes'],
    label,
  );
  const result: WorkoutSet = {
    id: requireUuid(value.id, `${label}.id`, ids),
    type: requireEnum(value.type, ['warmup', 'working'], `${label}.type`),
    reps: normalizeReps(value.reps, `${label}.reps`),
    load: normalizeLoad(value.load, `${label}.load`),
  };
  if ('restSec' in value)
    result.restSec = requireNonNegativeNumber(
      value.restSec,
      `${label}.restSec`,
    );
  if ('rir' in value)
    result.rir = requireNonNegativeNumber(value.rir, `${label}.rir`);
  const notes = requireOptionalString(
    value.notes,
    value,
    'notes',
    `${label}.notes`,
  );
  if (notes !== undefined) result.notes = notes;
  return result;
}

function normalizeItem(
  input: unknown,
  label: string,
  ids: Set<string>,
): WorkoutItem {
  const value = requireObject(input, label);
  rejectUnknownKeys(
    value,
    ['id', 'exercise', 'notes', 'alternatives', 'sets'],
    label,
  );
  const result: WorkoutItem = {
    id: requireUuid(value.id, `${label}.id`, ids),
    exercise: normalizeReference(value.exercise, `${label}.exercise`),
    sets: requireArray(value.sets, `${label}.sets`).map((set, index) =>
      normalizeSet(set, `${label}.sets[${index}]`, ids),
    ),
  };
  const notes = requireOptionalString(
    value.notes,
    value,
    'notes',
    `${label}.notes`,
  );
  if (notes !== undefined) result.notes = notes;
  if ('alternatives' in value) {
    result.alternatives = requireArray(
      value.alternatives,
      `${label}.alternatives`,
    ).map((reference, index) =>
      normalizeReference(reference, `${label}.alternatives[${index}]`),
    );
  }
  return result;
}

function normalizeDay(
  input: unknown,
  index: number,
  ids: Set<string>,
): WorkoutDay {
  const label = `days[${index}]`;
  const value = requireObject(input, label);
  rejectUnknownKeys(value, ['id', 'kind', 'title', 'notes', 'items'], label);
  const kind = requireEnum(value.kind, ['session', 'rest'], `${label}.kind`);
  const result: WorkoutDay = {
    id: requireUuid(value.id, `${label}.id`, ids),
    kind,
  };
  const title = requireOptionalString(
    value.title,
    value,
    'title',
    `${label}.title`,
  );
  const notes = requireOptionalString(
    value.notes,
    value,
    'notes',
    `${label}.notes`,
  );
  if (title !== undefined) result.title = title;
  if (notes !== undefined) result.notes = notes;
  if (kind === 'session') {
    result.items = requireArray(value.items, `${label}.items`).map(
      (item, itemIndex) =>
        normalizeItem(item, `${label}.items[${itemIndex}]`, ids),
    );
  } else if ('items' in value) {
    throw new WorkoutValidationError(
      `${label}.items is not allowed for a rest day`,
    );
  }
  return result;
}

export function normalizeWorkoutDocument(input: unknown): WorkoutDocument {
  const value = requireObject(input, 'Workout document');
  rejectUnknownKeys(value, ['days', 'notes'], 'Workout document');
  const ids = new Set<string>();
  const result: WorkoutDocument = {
    days: requireArray(value.days, 'days').map((day, index) =>
      normalizeDay(day, index, ids),
    ),
  };
  const notes = requireOptionalString(value.notes, value, 'notes', 'notes');
  if (notes !== undefined) result.notes = notes;
  return result;
}
