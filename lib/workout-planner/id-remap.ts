// F17 id continuity and duplicate remap (T003; FR-002, SC-012).
//
// Unchanged items keep their ids. Duplicating an exercise remaps the item id
// plus every descendant set id; duplicating a day remaps the day id plus all
// descendant item and set ids. Everything else is field-for-field identical.

export type WorkoutSet = {
  id: string;
  type: 'warmup' | 'working';
  load: unknown;
};

export type WorkoutItem = {
  id: string;
  sets: WorkoutSet[];
  [key: string]: unknown;
};

export type WorkoutDay = {
  id: string;
  kind: 'session' | 'rest';
  items: WorkoutItem[];
  [key: string]: unknown;
};

export type NewId = () => string;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function duplicateItem(item: WorkoutItem, newId: NewId): WorkoutItem {
  const copy = clone(item);
  copy.id = newId();
  copy.sets = copy.sets.map((set) => ({ ...set, id: newId() }));
  return copy;
}

export function duplicateDay(day: WorkoutDay, newId: NewId): WorkoutDay {
  const copy = clone(day);
  copy.id = newId();
  copy.items = copy.items.map((item) => duplicateItem(item, newId));
  return copy;
}

/** Depth-first id collection: day, then per item the item id and its sets. */
export function collectIds(day: WorkoutDay): string[] {
  const ids: string[] = [day.id];
  for (const item of day.items) {
    ids.push(item.id);
    for (const set of item.sets) ids.push(set.id);
  }
  return ids;
}
