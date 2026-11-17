// F17 immutable workout document schema v1 parser (T002; FR-002/003).
import {
  duplicateDay,
  duplicateItem,
  type WorkoutDay,
  type WorkoutItem,
  type WorkoutSet,
} from './id-remap';

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

/** Reorder an item within its session day. Unchanged items keep their ids. */
export function reorderWorkoutItem(
  document: WorkoutDocumentV1,
  itemId: string,
  direction: 'up' | 'down',
): WorkoutDocumentV1 {
  const current = parseWorkoutDocumentV1(document);
  const day = current.days.find((d) =>
    d.items.some((item) => item.id === itemId),
  );
  if (!day) return fail();
  const index = day.items.findIndex((item) => item.id === itemId);
  if (direction === 'up' && index > 0) {
    const item = day.items[index];
    const prev = day.items[index - 1];
    if (item && prev) {
      day.items[index - 1] = item;
      day.items[index] = prev;
    }
  } else if (direction === 'down' && index < day.items.length - 1) {
    const item = day.items[index];
    const next = day.items[index + 1];
    if (item && next) {
      day.items[index + 1] = item;
      day.items[index] = next;
    }
  }
  return parseWorkoutDocumentV1(current);
}

/** Duplicate an item within its session day, remapping item and set ids while preserving all existing ids. */
export function duplicateWorkoutItem(
  document: WorkoutDocumentV1,
  itemId: string,
  newId: () => string = () => crypto.randomUUID(),
): WorkoutDocumentV1 {
  const current = parseWorkoutDocumentV1(document);
  const day = current.days.find((d) =>
    d.items.some((item) => item.id === itemId),
  );
  if (!day || day.kind !== 'session') return fail();
  const index = day.items.findIndex((item) => item.id === itemId);
  const targetItem = day.items[index];
  if (!targetItem) return fail();
  const duplicate = duplicateItem(targetItem, newId);
  day.items.splice(index + 1, 0, duplicate);
  return parseWorkoutDocumentV1(current);
}

/** Remove an item from its session day. */
export function removeWorkoutItem(
  document: WorkoutDocumentV1,
  itemId: string,
): WorkoutDocumentV1 {
  const current = parseWorkoutDocumentV1(document);
  const day = current.days.find((d) =>
    d.items.some((item) => item.id === itemId),
  );
  if (!day) return fail();
  const index = day.items.findIndex((item) => item.id === itemId);
  day.items.splice(index, 1);
  return parseWorkoutDocumentV1(current);
}

/** Append a day to the plan. */
export function addWorkoutDay(
  document: WorkoutDocumentV1,
  day: WorkoutDay & { items: WorkoutItem[] },
): WorkoutDocumentV1 {
  const current = parseWorkoutDocumentV1(document);
  current.days.push(structuredClone(day));
  return parseWorkoutDocumentV1(current);
}

/** Reorder a day within the plan. All ids are preserved. */
export function reorderWorkoutDay(
  document: WorkoutDocumentV1,
  dayId: string,
  direction: 'up' | 'down',
): WorkoutDocumentV1 {
  const current = parseWorkoutDocumentV1(document);
  const index = current.days.findIndex((d) => d.id === dayId);
  if (index === -1) return fail();
  if (direction === 'up' && index > 0) {
    const day = current.days[index];
    const prev = current.days[index - 1];
    if (day && prev) {
      current.days[index - 1] = day;
      current.days[index] = prev;
    }
  } else if (direction === 'down' && index < current.days.length - 1) {
    const day = current.days[index];
    const next = current.days[index + 1];
    if (day && next) {
      current.days[index + 1] = day;
      current.days[index] = next;
    }
  }
  return parseWorkoutDocumentV1(current);
}

/** Duplicate a day in the plan, remapping day/item/set ids while preserving all existing ids. */
export function duplicateWorkoutDay(
  document: WorkoutDocumentV1,
  dayId: string,
  newId: () => string = () => crypto.randomUUID(),
): WorkoutDocumentV1 {
  const current = parseWorkoutDocumentV1(document);
  const index = current.days.findIndex((d) => d.id === dayId);
  if (index === -1) return fail();
  const targetDay = current.days[index];
  if (!targetDay) return fail();
  const duplicate = duplicateDay(targetDay, newId);
  current.days.splice(index + 1, 0, duplicate);
  return parseWorkoutDocumentV1(current);
}

/** Remove a day from the plan. */
export function removeWorkoutDay(
  document: WorkoutDocumentV1,
  dayId: string,
): WorkoutDocumentV1 {
  const current = parseWorkoutDocumentV1(document);
  const index = current.days.findIndex((d) => d.id === dayId);
  if (index === -1) return fail();
  current.days.splice(index, 1);
  return parseWorkoutDocumentV1(current);
}

export type WorkoutLoad =
  | { mode: 'bodyweight' }
  | { mode: 'added_weight' | 'assisted'; value: string; unit: 'kg' | 'lb' };

export type WorkoutReps = { value: number } | { min: number; max: number };

/** Update document-level plan notes. Reuses document validator (S60-D3). */
export function updatePlanNotes(
  document: WorkoutDocumentV1,
  notes?: string,
): WorkoutDocumentV1 {
  const current = parseWorkoutDocumentV1(document);
  if (notes !== undefined && notes !== '') {
    current.notes = notes;
  } else {
    delete current.notes;
  }
  return parseWorkoutDocumentV1(current);
}

/** Update day fields (title, notes, kind). Rejects switching to rest if day has items. Reuses document validator (S60-D3). */
export function updateWorkoutDay(
  document: WorkoutDocumentV1,
  dayId: string,
  patch: { title?: string; notes?: string; kind?: 'session' | 'rest' },
): WorkoutDocumentV1 {
  const current = parseWorkoutDocumentV1(document);
  const day = current.days.find((d) => d.id === dayId);
  if (!day) return fail();
  if (patch.title !== undefined) {
    if (patch.title !== '') day.title = patch.title;
    else delete day.title;
  }
  if (patch.notes !== undefined) {
    if (patch.notes !== '') day.notes = patch.notes;
    else delete day.notes;
  }
  if (patch.kind !== undefined) {
    day.kind = patch.kind;
  }
  return parseWorkoutDocumentV1(current);
}

/** Update exercise item fields (notes, reps, restSec, rir). Reuses document validator (S60-D3). */
export function updateWorkoutItem(
  document: WorkoutDocumentV1,
  itemId: string,
  patch: {
    name?: string;
    description?: string;
    notes?: string;
    reps?: WorkoutReps;
    restSec?: number;
    rir?: number;
  },
): WorkoutDocumentV1 {
  const current = parseWorkoutDocumentV1(document);
  const day = current.days.find((d) =>
    d.items.some((item) => item.id === itemId),
  );
  if (!day) return fail();
  const item = day.items.find((i) => i.id === itemId);
  if (!item) return fail();
  if (patch.name !== undefined) item.name = patch.name;
  if (patch.description !== undefined) {
    if (patch.description !== '') item.description = patch.description;
    else delete item.description;
  }
  if (patch.notes !== undefined) {
    if (patch.notes !== '') item.notes = patch.notes;
    else delete item.notes;
  }
  if ('reps' in patch) {
    if (patch.reps !== undefined) item.reps = patch.reps;
    else delete item.reps;
  }
  if ('restSec' in patch) {
    if (patch.restSec !== undefined) item.restSec = patch.restSec;
    else delete item.restSec;
  }
  if ('rir' in patch) {
    if (patch.rir !== undefined) item.rir = patch.rir;
    else delete item.rir;
  }
  return parseWorkoutDocumentV1(current);
}

/** Update set row fields (type, load). Reuses document validator (S60-D3). */
export function updateWorkoutSet(
  document: WorkoutDocumentV1,
  setId: string,
  patch: {
    type?: 'warmup' | 'working';
    load?: WorkoutLoad;
  },
): WorkoutDocumentV1 {
  const current = parseWorkoutDocumentV1(document);
  let foundSet: WorkoutSet | undefined;
  for (const day of current.days) {
    for (const item of day.items) {
      const s = item.sets.find((candidate) => candidate.id === setId);
      if (s) {
        foundSet = s;
        break;
      }
    }
    if (foundSet) break;
  }
  if (!foundSet) return fail();
  if (patch.type !== undefined) foundSet.type = patch.type;
  if (patch.load !== undefined) foundSet.load = patch.load;
  return parseWorkoutDocumentV1(current);
}

/** Remove an alternative from an item by index. */
export function removeWorkoutAlternative(
  document: WorkoutDocumentV1,
  itemId: string,
  alternativeIndex: number,
): WorkoutDocumentV1 {
  const current = parseWorkoutDocumentV1(document);
  const day = current.days.find((d) =>
    d.items.some((item) => item.id === itemId),
  );
  if (!day) return fail();
  const item = day.items.find((i) => i.id === itemId);
  if (!item || !Array.isArray(item.alternatives)) return fail();
  if (alternativeIndex < 0 || alternativeIndex >= item.alternatives.length)
    return fail();
  item.alternatives.splice(alternativeIndex, 1);
  return parseWorkoutDocumentV1(current);
}
