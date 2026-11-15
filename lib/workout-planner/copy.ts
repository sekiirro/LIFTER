// Source-preserving plan/template load and copy (T005; FR-006/013/014).
import { parseWorkoutDocumentV1, type WorkoutDocumentV1 } from './document';

/** Deep copy a validated document with fresh structural ids and no catalog reads. */
export function copyWorkoutDocument(
  document: WorkoutDocumentV1,
  newId: () => string = () => crypto.randomUUID(),
): WorkoutDocumentV1 {
  const copy = structuredClone(document);
  for (const day of copy.days) {
    day.id = newId();
    for (const item of day.items) {
      item.id = newId();
      for (const set of item.sets) set.id = newId();
    }
  }
  return parseWorkoutDocumentV1(copy);
}
