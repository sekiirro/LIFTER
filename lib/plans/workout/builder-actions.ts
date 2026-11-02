import { moveWorkoutItem } from './document-ops';
import type { WorkoutDocument } from './schema';

export function moveBuilderItem(
  document: WorkoutDocument,
  sourceDayId: string,
  itemId: string,
  targetDayId: string,
): WorkoutDocument {
  const target = document.days.find((day) => day.id === targetDayId);
  if (target?.kind !== 'session') return document;
  return moveWorkoutItem(
    document,
    { dayId: sourceDayId, itemId },
    targetDayId,
    target.items?.length ?? 0,
  );
}

export function moveBuilderItemBy(
  document: WorkoutDocument,
  dayId: string,
  itemId: string,
  delta: -1 | 1,
): WorkoutDocument {
  const day = document.days.find((candidate) => candidate.id === dayId);
  if (day?.kind !== 'session') return document;
  const items = day.items ?? [];
  const index = items.findIndex((item) => item.id === itemId);
  const targetIndex = index + delta;
  if (index < 0 || targetIndex < 0 || targetIndex >= items.length)
    return document;
  return moveWorkoutItem(document, { dayId, itemId }, dayId, targetIndex);
}
