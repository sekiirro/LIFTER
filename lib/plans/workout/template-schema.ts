// F17 T008 — Template document validation.
// Templates use the same workout schema v1 minus client-specific fields (FR-006).
// Schema v1 defines no client-specific fields, and schema.ts already rejects
// unknown keys at every level via rejectUnknownKeys, so the template schema is
// exactly strict v1.
import { normalizeWorkoutDocument, type WorkoutDocument } from './schema';

export type WorkoutTemplateDocument = WorkoutDocument;

export function normalizeWorkoutTemplateDocument(
  input: unknown,
): WorkoutTemplateDocument {
  return normalizeWorkoutDocument(input);
}
