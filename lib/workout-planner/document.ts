// F17 immutable workout document schema v1 parser (T002; FR-002/003).
import type { WorkoutDay, WorkoutItem, WorkoutSet } from './id-remap';

export type WorkoutExerciseReference = {
  source: 'global' | 'workspace_private';
  identity_id: string;
  version: number;
  overrideVersion?: number | null;
  overrideWorkspaceId?: string;
  workspace_id?: string;
};

export type WorkoutDocumentV1 = {
  schema_version: 1;
  notes?: string;
  days: (WorkoutDay & { items: WorkoutItem[] })[];
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const fail = (): never => {
  throw new Error('invalid_document');
};
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail();
}
function id(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string';
}
function positiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function parseWorkoutReference(
  value: unknown,
): WorkoutExerciseReference {
  if (!obj(value)) return fail();
  keys(value, [
    'source',
    'identity_id',
    'version',
    'overrideVersion',
    'overrideWorkspaceId',
    'workspace_id',
  ]);
  if (
    (value.source !== 'global' && value.source !== 'workspace_private') ||
    !id(value.identity_id) ||
    !positiveInt(value.version)
  )
    return fail();
  if (value.source === 'global') {
    if (
      value.workspace_id !== undefined ||
      (value.overrideVersion !== undefined &&
        value.overrideVersion !== null &&
        !positiveInt(value.overrideVersion))
    )
      return fail();
    if (value.overrideVersion != null && !id(value.overrideWorkspaceId))
      return fail();
    if (
      value.overrideVersion == null &&
      value.overrideWorkspaceId !== undefined
    )
      return fail();
  } else if (
    value.overrideVersion !== undefined ||
    value.overrideWorkspaceId !== undefined ||
    !id(value.workspace_id)
  )
    return fail();
  return structuredClone(value) as WorkoutExerciseReference;
}

function parseSet(value: unknown): WorkoutSet {
  if (!obj(value)) return fail();
  keys(value, ['id', 'type', 'load']);
  if (
    !id(value.id) ||
    (value.type !== 'warmup' && value.type !== 'working') ||
    !obj(value.load)
  )
    return fail();
  const load = value.load;
  if (load.mode === 'bodyweight') {
    keys(load, ['mode']);
  } else if (load.mode === 'added_weight' || load.mode === 'assisted') {
    keys(load, ['mode', 'value', 'unit']);
    if (
      typeof load.value !== 'string' ||
      !DECIMAL.test(load.value) ||
      Number(load.value) <= 0 ||
      (load.unit !== 'kg' && load.unit !== 'lb')
    )
      return fail();
  } else return fail();
  return structuredClone(value) as WorkoutSet;
}

function parseReps(value: unknown): void {
  if (!obj(value)) fail();
  const reps = value as Record<string, unknown>;
  if (
    Object.keys(reps).length === 1 &&
    Number.isInteger(reps.value) &&
    (reps.value as number) >= 1 &&
    (reps.value as number) <= 100
  )
    return;
  if (
    Object.keys(reps).length === 2 &&
    Number.isInteger(reps.min) &&
    Number.isInteger(reps.max) &&
    (reps.min as number) >= 1 &&
    (reps.max as number) <= 100 &&
    (reps.min as number) <= (reps.max as number)
  )
    return;
  fail();
}

function refKey(ref: WorkoutExerciseReference): string {
  return `${ref.source}:${ref.workspace_id ?? ''}:${ref.identity_id}`;
}

function parseItem(value: unknown, allIds: Set<string>): WorkoutItem {
  if (!obj(value)) return fail();
  keys(value, [
    'id',
    'exercise',
    'name',
    'description',
    'reps',
    'restSec',
    'rir',
    'notes',
    'alternatives',
    'sets',
  ]);
  if (
    !id(value.id) ||
    allIds.has(value.id) ||
    !text(value.name) ||
    !Array.isArray(value.alternatives) ||
    !Array.isArray(value.sets)
  )
    return fail();
  allIds.add(value.id);
  parseWorkoutReference(value.exercise);
  if (value.description !== undefined && !text(value.description))
    return fail();
  if (value.notes !== undefined && !text(value.notes)) return fail();
  if (value.reps !== undefined) parseReps(value.reps);
  if (
    value.restSec !== undefined &&
    (!Number.isInteger(value.restSec) ||
      (value.restSec as number) < 0 ||
      (value.restSec as number) > 600 ||
      (value.restSec as number) % 15 !== 0)
  )
    return fail();
  if (
    value.rir !== undefined &&
    (!Number.isInteger(value.rir) ||
      (value.rir as number) < 0 ||
      (value.rir as number) > 5)
  )
    return fail();
  if (value.alternatives.length > 3) return fail();
  const alternativeKeys = new Set<string>();
  for (const alternative of value.alternatives) {
    const ref = parseWorkoutReference(alternative);
    const key = refKey(ref);
    if (alternativeKeys.has(key)) return fail();
    alternativeKeys.add(key);
  }
  const sets = value.sets.map(parseSet);
  for (const set of sets) {
    if (allIds.has(set.id)) return fail();
    allIds.add(set.id);
  }
  return {
    ...structuredClone(value),
    id: value.id,
    exercise: parseWorkoutReference(value.exercise),
    alternatives: value.alternatives.map(parseWorkoutReference),
    sets,
  } as WorkoutItem;
}

export function parseWorkoutDocumentV1(value: unknown): WorkoutDocumentV1 {
  if (!obj(value)) return fail();
  keys(value, ['schema_version', 'notes', 'days']);
  if (
    value.schema_version !== 1 ||
    !Array.isArray(value.days) ||
    (value.notes !== undefined && !text(value.notes))
  )
    return fail();
  const ids = new Set<string>();
  const days = value.days.map((raw): WorkoutDay & { items: WorkoutItem[] } => {
    if (!obj(raw)) return fail();
    keys(raw, ['id', 'kind', 'title', 'notes', 'items']);
    if (
      !id(raw.id) ||
      ids.has(raw.id) ||
      (raw.kind !== 'session' && raw.kind !== 'rest') ||
      !Array.isArray(raw.items)
    )
      return fail();
    ids.add(raw.id);
    if (
      (raw.title !== undefined && !text(raw.title)) ||
      (raw.notes !== undefined && !text(raw.notes))
    )
      return fail();
    if (raw.kind === 'rest' && raw.items.length !== 0) return fail();
    const items = raw.items.map((item) => parseItem(item, ids));
    return { ...structuredClone(raw), items } as WorkoutDay & {
      items: WorkoutItem[];
    };
  });
  return { ...structuredClone(value), days } as WorkoutDocumentV1;
}

/** Rejects an add to a rest day before creating a changed document. */
export function addWorkoutItem(
  document: WorkoutDocumentV1,
  dayId: string,
  item: WorkoutItem,
): WorkoutDocumentV1 {
  const current = parseWorkoutDocumentV1(document);
  const target = current.days.find((day) => day.id === dayId);
  if (!target || target.kind !== 'session') return fail();
  target.items.push(structuredClone(item));
  return parseWorkoutDocumentV1(current);
}

/** A rejected move leaves the input document and its source day untouched. */
export function moveWorkoutItem(
  document: WorkoutDocumentV1,
  itemId: string,
  targetDayId: string,
): WorkoutDocumentV1 {
  const current = parseWorkoutDocumentV1(document);
  const target = current.days.find((day) => day.id === targetDayId);
  const source = current.days.find((day) =>
    day.items.some((item) => item.id === itemId),
  );
  if (!target || target.kind !== 'session' || !source) return fail();
  if (source.id === target.id) return current;
  const index = source.items.findIndex((item) => item.id === itemId);
  const [item] = source.items.splice(index, 1);
  if (!item) return fail();
  target.items.push(item);
  return parseWorkoutDocumentV1(current);
}
