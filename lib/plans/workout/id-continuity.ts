import type {
  WorkoutDay,
  WorkoutDocument,
  WorkoutExerciseReference,
  WorkoutItem,
  WorkoutSet,
} from './schema';

export type WorkoutItemLocation = {
  readonly dayId: string;
  readonly itemId: string;
};

export type WorkoutItemIdAssignment = {
  readonly itemId: string;
  readonly setIds: readonly string[];
};

export type WorkoutDayIdAssignment = {
  readonly dayId: string;
  readonly items: readonly WorkoutItemIdAssignment[];
};

export class WorkoutIdContinuityError extends Error {
  readonly code = 'invalid_workout_id_continuity';

  constructor(message: string) {
    super(message);
    this.name = 'WorkoutIdContinuityError';
  }
}

type IndexedItem = {
  readonly item: WorkoutItem;
  readonly dayId: string;
};

type IndexedSet = {
  readonly set: WorkoutSet;
  readonly itemId: string;
};

type WorkoutDocumentIndex = {
  readonly allIds: Set<string>;
  readonly days: Map<string, WorkoutDay>;
  readonly items: Map<string, IndexedItem>;
  readonly sets: Map<string, IndexedSet>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new WorkoutIdContinuityError(`${label} must be a UUID`);
  }
  return value;
}

function indexDocument(
  document: WorkoutDocument,
  label: string,
): WorkoutDocumentIndex {
  const allIds = new Set<string>();
  const days = new Map<string, WorkoutDay>();
  const items = new Map<string, IndexedItem>();
  const sets = new Map<string, IndexedSet>();

  function claimId(value: unknown, idLabel: string): string {
    const id = requireUuid(value, idLabel);
    if (allIds.has(id)) {
      throw new WorkoutIdContinuityError(`${idLabel} must be unique`);
    }
    allIds.add(id);
    return id;
  }

  if (!Array.isArray(document.days)) {
    throw new WorkoutIdContinuityError(`${label}.days must be an array`);
  }

  document.days.forEach((day, dayIndex) => {
    const dayLabel = `${label}.days[${dayIndex}]`;
    const dayId = claimId(day.id, `${dayLabel}.id`);
    days.set(dayId, day);

    for (const [itemIndex, item] of (day.items ?? []).entries()) {
      const itemLabel = `${dayLabel}.items[${itemIndex}]`;
      const itemId = claimId(item.id, `${itemLabel}.id`);
      items.set(itemId, { item, dayId });

      for (const [setIndex, set] of item.sets.entries()) {
        const setId = claimId(set.id, `${itemLabel}.sets[${setIndex}].id`);
        sets.set(setId, { set, itemId });
      }
    }
  });

  return { allIds, days, items, sets };
}

function cloneExerciseReference(
  reference: WorkoutExerciseReference,
): WorkoutExerciseReference {
  return {
    ...reference,
    ...(reference.variation === undefined
      ? {}
      : { variation: { ...reference.variation } }),
  };
}

function cloneSet(set: WorkoutSet, id: string): WorkoutSet {
  return {
    ...set,
    id,
    reps: { ...set.reps },
    load: { ...set.load },
  };
}

function cloneItem(
  item: WorkoutItem,
  id: string,
  setIds: readonly string[],
): WorkoutItem {
  return {
    ...item,
    id,
    exercise: cloneExerciseReference(item.exercise),
    ...(item.alternatives === undefined
      ? {}
      : {
          alternatives: item.alternatives.map(cloneExerciseReference),
        }),
    sets: item.sets.map((set, index) => cloneSet(set, setIds[index]!)),
  };
}

function cloneDay(
  day: WorkoutDay,
  id: string,
  itemIds: readonly string[],
  setIdsByItemId: ReadonlyMap<string, readonly string[]>,
): WorkoutDay {
  return {
    ...day,
    id,
    ...(day.items === undefined
      ? {}
      : {
          items: day.items.map((item, index) =>
            cloneItem(item, itemIds[index]!, setIdsByItemId.get(item.id) ?? []),
          ),
        }),
  };
}

function exerciseKey(reference: WorkoutExerciseReference): string {
  return JSON.stringify([
    reference.source,
    reference.id,
    reference.version,
    reference.variation?.id ?? null,
    reference.variation?.version ?? null,
  ]);
}

function setKey(set: WorkoutSet): string {
  return JSON.stringify([
    set.type,
    'value' in set.reps
      ? ['value', set.reps.value]
      : ['range', set.reps.min, set.reps.max],
    set.load.mode,
    set.load.mode === 'bodyweight' ? null : [set.load.value, set.load.unit],
    set.restSec ?? null,
    set.rir ?? null,
    set.notes ?? null,
  ]);
}

function itemKey(item: WorkoutItem): string {
  return JSON.stringify([
    exerciseKey(item.exercise),
    item.notes ?? null,
    (item.alternatives ?? []).map(exerciseKey),
    item.sets.map(setKey),
  ]);
}

function dayMetadataKey(day: WorkoutDay): string {
  return JSON.stringify([day.kind, day.title ?? null, day.notes ?? null]);
}

function fullDayKey(day: WorkoutDay): string {
  return JSON.stringify([dayMetadataKey(day), (day.items ?? []).map(itemKey)]);
}

function findUniqueMatch<T>(
  values: readonly T[],
  isMatch: (value: T) => boolean,
): T | undefined {
  const matches = values.filter(isMatch);
  return matches.length === 1 ? matches[0] : undefined;
}

function assertCandidateIdType(
  id: string,
  previous: WorkoutDocumentIndex,
  expectedType: 'day' | 'item' | 'set',
): void {
  if (!previous.allIds.has(id)) return;

  const hasExpectedType =
    expectedType === 'day'
      ? previous.days.has(id)
      : expectedType === 'item'
        ? previous.items.has(id)
        : previous.sets.has(id);
  if (!hasExpectedType) {
    const conflictingTypes =
      expectedType === 'day'
        ? 'item or set'
        : expectedType === 'item'
          ? 'day or set'
          : 'day or item';
    throw new WorkoutIdContinuityError(
      `Revision id ${id} conflicts with a previous ${conflictingTypes} id`,
    );
  }
}

function matchDays(
  previous: WorkoutDocumentIndex,
  candidate: WorkoutDocumentIndex,
): Map<string, string> {
  const matches = new Map<string, string>();
  const usedPreviousIds = new Set<string>();

  for (const day of candidate.days.values()) {
    assertCandidateIdType(day.id, previous, 'day');
    if (previous.days.has(day.id)) {
      matches.set(day.id, day.id);
      usedPreviousIds.add(day.id);
    }
  }

  for (const day of candidate.days.values()) {
    if (matches.has(day.id)) continue;

    const fullMatch = findUniqueMatch(
      [...previous.days.values()],
      (previousDay) =>
        !usedPreviousIds.has(previousDay.id) &&
        fullDayKey(previousDay) === fullDayKey(day),
    );
    if (fullMatch !== undefined) {
      matches.set(day.id, fullMatch.id);
      usedPreviousIds.add(fullMatch.id);
      continue;
    }

    const metadataMatch = findUniqueMatch(
      [...previous.days.values()],
      (previousDay) =>
        !usedPreviousIds.has(previousDay.id) &&
        dayMetadataKey(previousDay) === dayMetadataKey(day),
    );
    if (metadataMatch !== undefined) {
      matches.set(day.id, metadataMatch.id);
      usedPreviousIds.add(metadataMatch.id);
    }
  }

  return matches;
}

function matchItems(
  previous: WorkoutDocumentIndex,
  candidate: WorkoutDocumentIndex,
): Map<string, string> {
  const matches = new Map<string, string>();
  const usedPreviousIds = new Set<string>();

  for (const indexedItem of candidate.items.values()) {
    assertCandidateIdType(indexedItem.item.id, previous, 'item');
    if (previous.items.has(indexedItem.item.id)) {
      matches.set(indexedItem.item.id, indexedItem.item.id);
      usedPreviousIds.add(indexedItem.item.id);
    }
  }

  for (const indexedItem of candidate.items.values()) {
    if (matches.has(indexedItem.item.id)) continue;

    const exactMatch = findUniqueMatch(
      [...previous.items.values()],
      (previousItem) =>
        !usedPreviousIds.has(previousItem.item.id) &&
        itemKey(previousItem.item) === itemKey(indexedItem.item),
    );
    if (exactMatch !== undefined) {
      matches.set(indexedItem.item.id, exactMatch.item.id);
      usedPreviousIds.add(exactMatch.item.id);
      continue;
    }

    const exerciseMatch = findUniqueMatch(
      [...previous.items.values()],
      (previousItem) =>
        !usedPreviousIds.has(previousItem.item.id) &&
        exerciseKey(previousItem.item.exercise) ===
          exerciseKey(indexedItem.item.exercise),
    );
    if (exerciseMatch !== undefined) {
      matches.set(indexedItem.item.id, exerciseMatch.item.id);
      usedPreviousIds.add(exerciseMatch.item.id);
    }
  }

  return matches;
}

function matchSets(
  previous: WorkoutDocumentIndex,
  candidate: WorkoutDocumentIndex,
  itemMatches: ReadonlyMap<string, string>,
): Map<string, string> {
  const matches = new Map<string, string>();
  const usedPreviousIds = new Set<string>();

  for (const indexedItem of candidate.items.values()) {
    const previousItemId = itemMatches.get(indexedItem.item.id);
    if (previousItemId === undefined) continue;

    const previousItem = previous.items.get(previousItemId)!.item;
    for (const set of indexedItem.item.sets) {
      assertCandidateIdType(set.id, previous, 'set');
      const previousSet = previous.sets.get(set.id);
      if (previousSet !== undefined) {
        if (previousSet.itemId !== previousItemId) {
          throw new WorkoutIdContinuityError(
            `Revision set id ${set.id} belongs to a different item`,
          );
        }
        matches.set(set.id, set.id);
        usedPreviousIds.add(set.id);
      }
    }

    for (const set of indexedItem.item.sets) {
      if (matches.has(set.id)) continue;

      const exactMatch = findUniqueMatch(
        previousItem.sets,
        (previousSet) =>
          !usedPreviousIds.has(previousSet.id) &&
          setKey(previousSet) === setKey(set),
      );
      if (exactMatch !== undefined) {
        matches.set(set.id, exactMatch.id);
        usedPreviousIds.add(exactMatch.id);
      }
    }
  }

  for (const indexedSet of candidate.sets.values()) {
    if (matches.has(indexedSet.set.id)) continue;
    assertCandidateIdType(indexedSet.set.id, previous, 'set');
  }

  return matches;
}

export function retainWorkoutDocumentIds(
  previous: WorkoutDocument,
  candidate: WorkoutDocument,
): WorkoutDocument {
  const previousIndex = indexDocument(previous, 'Previous revision');
  const candidateIndex = indexDocument(candidate, 'Candidate revision');
  const dayMatches = matchDays(previousIndex, candidateIndex);
  const itemMatches = matchItems(previousIndex, candidateIndex);
  const setMatches = matchSets(previousIndex, candidateIndex, itemMatches);

  const retainedDays = candidate.days.map((day) => {
    const retainedDayId = dayMatches.get(day.id) ?? day.id;
    const retainedItemIds = (day.items ?? []).map(
      (item) => itemMatches.get(item.id) ?? item.id,
    );
    const retainedSetIds = new Map<string, readonly string[]>();
    for (const item of day.items ?? []) {
      retainedSetIds.set(
        item.id,
        item.sets.map((set) => setMatches.get(set.id) ?? set.id),
      );
    }
    return cloneDay(day, retainedDayId, retainedItemIds, retainedSetIds);
  });

  const retained: WorkoutDocument = {
    ...candidate,
    days: retainedDays,
  };
  indexDocument(retained, 'Retained revision');
  return retained;
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
      throw new WorkoutIdContinuityError(`${label}[${index}] must not collide`);
    }
    assignedIds.add(value);
  }
}

export function duplicateWorkoutItem(
  document: WorkoutDocument,
  source: WorkoutItemLocation,
  assignment: WorkoutItemIdAssignment,
): WorkoutDocument {
  const index = indexDocument(document, 'Workout document');
  const sourceDay = index.days.get(source.dayId);
  if (sourceDay === undefined) {
    throw new WorkoutIdContinuityError(
      `Source day ${source.dayId} was not found`,
    );
  }
  const sourceItem = (sourceDay.items ?? []).find(
    (item) => item.id === source.itemId,
  );
  if (sourceItem === undefined) {
    throw new WorkoutIdContinuityError(
      `Source item ${source.itemId} was not found in day ${source.dayId}`,
    );
  }
  if (assignment.setIds.length !== sourceItem.sets.length) {
    throw new WorkoutIdContinuityError(
      `Duplicate item requires ${sourceItem.sets.length} set ids`,
    );
  }

  validateNewIds(
    [assignment.itemId, ...assignment.setIds],
    index.allIds,
    'Duplicate item ids',
  );
  const duplicate = cloneItem(sourceItem, assignment.itemId, assignment.setIds);
  const days = document.days.map((day) => {
    if (day.id !== sourceDay.id) return day;
    const items = [...(day.items ?? [])];
    const sourceIndex = items.findIndex((item) => item.id === sourceItem.id);
    items.splice(sourceIndex + 1, 0, duplicate);
    return { ...day, items };
  });

  return { ...document, days };
}

export function duplicateWorkoutDay(
  document: WorkoutDocument,
  sourceDayId: string,
  assignment: WorkoutDayIdAssignment,
): WorkoutDocument {
  const index = indexDocument(document, 'Workout document');
  const sourceDay = index.days.get(sourceDayId);
  if (sourceDay === undefined) {
    throw new WorkoutIdContinuityError(
      `Source day ${sourceDayId} was not found`,
    );
  }
  const sourceItems = sourceDay.items ?? [];
  if (assignment.items.length !== sourceItems.length) {
    throw new WorkoutIdContinuityError(
      `Duplicate day requires ${sourceItems.length} item assignments`,
    );
  }

  const assignedIds = [assignment.dayId];
  for (const [itemIndex, itemAssignment] of assignment.items.entries()) {
    const sourceItem = sourceItems[itemIndex]!;
    if (itemAssignment.setIds.length !== sourceItem.sets.length) {
      throw new WorkoutIdContinuityError(
        `Duplicate item ${itemIndex} requires ${sourceItem.sets.length} set ids`,
      );
    }
    assignedIds.push(itemAssignment.itemId, ...itemAssignment.setIds);
  }
  validateNewIds(assignedIds, index.allIds, 'Duplicate day ids');

  const itemIds = assignment.items.map((item) => item.itemId);
  const setIdsByItemId = new Map<string, readonly string[]>();
  for (const [itemIndex, item] of sourceItems.entries()) {
    setIdsByItemId.set(item.id, assignment.items[itemIndex]!.setIds);
  }
  const duplicate = cloneDay(
    sourceDay,
    assignment.dayId,
    itemIds,
    setIdsByItemId,
  );
  const days = [...document.days];
  const sourceIndex = days.findIndex((day) => day.id === sourceDay.id);
  days.splice(sourceIndex + 1, 0, duplicate);

  return { ...document, days };
}
