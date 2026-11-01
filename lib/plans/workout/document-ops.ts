// F17 pure workout document operations (T041).
// Reorder and move preserve every coach-authored parameter and every id.

import type { WorkoutItemLocation } from './id-continuity';
import type { WorkoutDay, WorkoutDocument } from './schema';

export class WorkoutDocumentOpsError extends Error {
  readonly code = 'invalid_workout_document_operation';

  constructor(message: string) {
    super(message);
    this.name = 'WorkoutDocumentOpsError';
  }
}

function requireDay(document: WorkoutDocument, dayId: string): WorkoutDay {
  const day = document.days.find((candidate) => candidate.id === dayId);
  if (day === undefined) {
    throw new WorkoutDocumentOpsError(`Day ${dayId} was not found`);
  }
  return day;
}

function requireSessionDay(
  document: WorkoutDocument,
  dayId: string,
): WorkoutDay {
  const day = requireDay(document, dayId);
  if (day.kind !== 'session') {
    throw new WorkoutDocumentOpsError(`Day ${dayId} is not a session day`);
  }
  return day;
}

function requirePermutation(
  ids: readonly string[],
  expectedIds: readonly string[],
  label: string,
): void {
  if (ids.length !== expectedIds.length) {
    throw new WorkoutDocumentOpsError(
      `${label} must name ${expectedIds.length} ids, received ${ids.length}`,
    );
  }
  const allowed = new Set(expectedIds);
  const seen = new Set<string>();
  for (const id of ids) {
    if (!allowed.has(id)) {
      throw new WorkoutDocumentOpsError(`${label} contains unknown id: ${id}`);
    }
    if (seen.has(id)) {
      throw new WorkoutDocumentOpsError(`${label} repeats id: ${id}`);
    }
    seen.add(id);
  }
}

export function reorderWorkoutDays(
  document: WorkoutDocument,
  dayIds: readonly string[],
): WorkoutDocument {
  requirePermutation(
    dayIds,
    document.days.map((day) => day.id),
    'Day order',
  );
  const daysById = new Map(document.days.map((day) => [day.id, day]));
  if (daysById.size !== document.days.length) {
    throw new WorkoutDocumentOpsError('Workout day ids must be unique');
  }

  return {
    ...document,
    days: dayIds.map((dayId) => daysById.get(dayId)!),
  };
}

export function reorderWorkoutItems(
  document: WorkoutDocument,
  dayId: string,
  itemIds: readonly string[],
): WorkoutDocument {
  const day = requireSessionDay(document, dayId);
  const items = day.items ?? [];
  requirePermutation(
    itemIds,
    items.map((item) => item.id),
    'Item order',
  );
  const itemsById = new Map(items.map((item) => [item.id, item]));
  if (itemsById.size !== items.length) {
    throw new WorkoutDocumentOpsError('Workout item ids must be unique');
  }

  return {
    ...document,
    days: document.days.map((candidate) =>
      candidate.id === day.id
        ? {
            ...candidate,
            items: itemIds.map((itemId) => itemsById.get(itemId)!),
          }
        : candidate,
    ),
  };
}

export function moveWorkoutItem(
  document: WorkoutDocument,
  source: WorkoutItemLocation,
  targetDayId: string,
  targetIndex: number,
): WorkoutDocument {
  const sourceDay = requireSessionDay(document, source.dayId);
  const targetDay = requireSessionDay(document, targetDayId);
  const sourceItems = sourceDay.items ?? [];
  const sourceIndex = sourceItems.findIndex(
    (item) => item.id === source.itemId,
  );
  if (sourceIndex === -1) {
    throw new WorkoutDocumentOpsError(
      `Item ${source.itemId} was not found in day ${source.dayId}`,
    );
  }
  if (!Number.isSafeInteger(targetIndex) || targetIndex < 0) {
    throw new WorkoutDocumentOpsError(
      `Target index must be a non-negative integer, received ${targetIndex}`,
    );
  }

  const targetItems =
    sourceDay.id === targetDay.id ? sourceItems : targetDay.items;
  const targetLength =
    (targetItems === undefined ? 0 : targetItems.length) -
    (sourceDay.id === targetDay.id ? 1 : 0);
  if (targetIndex > targetLength) {
    throw new WorkoutDocumentOpsError(
      `Target index ${targetIndex} exceeds ${targetLength}`,
    );
  }

  if (sourceDay.id === targetDay.id) {
    const items = [...sourceItems];
    const [moved] = items.splice(sourceIndex, 1);
    items.splice(targetIndex, 0, moved!);
    return {
      ...document,
      days: document.days.map((day) =>
        day.id === sourceDay.id ? { ...day, items } : day,
      ),
    };
  }

  const remainingSourceItems = [...sourceItems];
  const [moved] = remainingSourceItems.splice(sourceIndex, 1);
  const nextTargetItems = [...(targetDay.items ?? [])];
  nextTargetItems.splice(targetIndex, 0, moved!);

  return {
    ...document,
    days: document.days.map((day) => {
      if (day.id === sourceDay.id)
        return { ...day, items: remainingSourceItems };
      if (day.id === targetDay.id) return { ...day, items: nextTargetItems };
      return day;
    }),
  };
}
