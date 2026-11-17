// F17 alternatives helpers (T034; FR-002, FR-003, SC-011).
//
// Up to three unique catalog targets per item, editable per plan. An
// alternative whose catalog exercise is removed/merged is shown unavailable
// and is NEVER replaced by another exercise. All ref validation reuses
// parseWorkoutReference from document.ts; this module adds no new rules.
import {
  parseWorkoutReference,
  type WorkoutExerciseReference,
} from './document';

export type { WorkoutExerciseReference };

/** Mirrors the three-alternative cap enforced by parseWorkoutDocumentV1. */
export const MAX_WORKOUT_ALTERNATIVES = 3;

export type AlternativeAvailability = 'active' | 'removed' | 'merged';

/** Lookup key for availability/name maps; identical to the document dedupe. */
export function alternativeKey(ref: WorkoutExerciseReference): string {
  const parsed = parseWorkoutReference(ref);
  return `${parsed.source}:${parsed.workspace_id ?? ''}:${parsed.identity_id}`;
}

/** Removed/merged catalog targets are unavailable; nothing is substituted. */
export function isAlternativeUnavailable(
  status: AlternativeAvailability,
): boolean {
  return status === 'removed' || status === 'merged';
}

function fail(): never {
  throw new Error('invalid_document');
}

/**
 * Appends a validated unique target; rejects the fourth add, duplicates and
 * invalid refs with `invalid_document` and leaves the input untouched.
 */
export function addWorkoutAlternative(
  alternatives: WorkoutExerciseReference[],
  candidate: WorkoutExerciseReference,
): WorkoutExerciseReference[] {
  const parsed = parseWorkoutReference(candidate);
  if (alternatives.length >= MAX_WORKOUT_ALTERNATIVES) fail();
  const key = alternativeKey(parsed);
  if (alternatives.some((entry) => alternativeKey(entry) === key)) fail();
  return [...alternatives.map((entry) => parseWorkoutReference(entry)), parsed];
}

/** Drops exactly the indexed row; rejects out-of-range removal. */
export function removeWorkoutAlternative(
  alternatives: WorkoutExerciseReference[],
  index: number,
): WorkoutExerciseReference[] {
  if (!Number.isInteger(index) || index < 0 || index >= alternatives.length)
    fail();
  return alternatives
    .filter((_, position) => position !== index)
    .map((entry) => parseWorkoutReference(entry));
}
