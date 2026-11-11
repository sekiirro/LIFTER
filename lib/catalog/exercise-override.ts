import {
  EXERCISE_REST_STEP_SECONDS,
  MAX_CATALOG_DESCRIPTION_LENGTH,
  MAX_CATALOG_NOTE_LENGTH,
  MAX_CATALOG_TEXT_LENGTH,
  MAX_EXERCISE_ALTERNATIVES,
  MAX_EXERCISE_REPS,
  MAX_EXERCISE_REST_SECONDS,
  MAX_EXERCISE_RIR,
  type NormalizedExercise,
} from './schemas';
import {
  alternativeRef,
  type ExerciseEditorErrorCode,
  type ExerciseRepsMode,
} from './exercise-editor';
import { isAllowedCatalogVideoUrl } from './video-variation';

/** The eight FR-003 fields, keyed as the staff read projection keys them. */
export type OverrideField =
  | 'name'
  | 'description'
  | 'notes'
  | 'video'
  | 'alternatives'
  | 'default_rest_time'
  | 'default_rir'
  | 'default_reps';

export const OVERRIDE_FIELDS: readonly OverrideField[] = [
  'name',
  'description',
  'notes',
  'video',
  'alternatives',
  'default_rest_time',
  'default_rir',
  'default_reps',
] as const;

export type OverrideFieldSource = 'override' | 'inherited';

export type OverrideDraft = {
  names: { ar: string; en: string };
  description: string;
  notes: string;
  videoUrl: string;
  alternativeExerciseIds: string[];
  repsMode: ExerciseRepsMode;
  repsValue: string;
  repsMin: string;
  repsMax: string;
  restSeconds: string;
  rir: string;
};

export type OverrideErrors = Partial<
  Record<OverrideField, ExerciseEditorErrorCode>
>;

export function overrideDraftFromExercise(
  exercise: NormalizedExercise,
): OverrideDraft {
  const defaults = exercise.defaults;
  const reps = defaults?.reps;
  return {
    names: { ar: exercise.names.ar, en: exercise.names.en },
    description: exercise.description ?? '',
    notes: exercise.notes ?? '',
    videoUrl: exercise.videoUrl ?? '',
    alternativeExerciseIds: [...(defaults?.alternativeExerciseIds ?? [])],
    repsMode: reps?.kind === 'range' ? 'range' : 'fixed',
    repsValue: reps?.kind === 'fixed' ? String(reps.value) : '',
    repsMin: reps?.kind === 'range' ? String(reps.min) : '',
    repsMax: reps?.kind === 'range' ? String(reps.max) : '',
    restSeconds:
      defaults?.restSeconds === undefined ? '' : String(defaults.restSeconds),
    rir:
      defaults?.rir === null || defaults?.rir === undefined
        ? ''
        : String(defaults.rir),
  };
}

/**
 * Reads the per-field source recorded by `catalog_exercise_detail`'s
 * `effective_fields`. Anything that is not an override is inherited.
 */
export function overrideSources(
  effective: Record<string, unknown> | null | undefined,
): Record<OverrideField, OverrideFieldSource> {
  const sourceFor = (field: OverrideField): OverrideFieldSource => {
    const entry =
      effective && typeof effective[field] === 'object'
        ? (effective[field] as Record<string, unknown>)
        : null;
    return entry?.source === 'override' ? 'override' : 'inherited';
  };
  return {
    name: sourceFor('name'),
    description: sourceFor('description'),
    notes: sourceFor('notes'),
    video: sourceFor('video'),
    alternatives: sourceFor('alternatives'),
    default_rest_time: sourceFor('default_rest_time'),
    default_rir: sourceFor('default_rir'),
    default_reps: sourceFor('default_reps'),
  };
}

function parseOptionalInteger(
  raw: string,
  min: number,
  max: number,
): { value?: number; error?: ExerciseEditorErrorCode } {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (!/^\d+$/.test(trimmed)) return { error: 'integer_range' };
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    return { error: 'integer_range' };
  return { value };
}

export function validateOverrideDraft(
  draft: OverrideDraft,
  dirty: ReadonlySet<OverrideField>,
  currentExerciseId: string,
): OverrideErrors {
  const errors: OverrideErrors = {};

  if (dirty.has('name')) {
    if (!draft.names.en.trim()) errors.name = 'required';
    else if (Array.from(draft.names.en.trim()).length > MAX_CATALOG_TEXT_LENGTH)
      errors.name = 'text_too_long';
    else if (
      draft.names.ar.trim() &&
      Array.from(draft.names.ar.trim()).length > MAX_CATALOG_TEXT_LENGTH
    )
      errors.name = 'text_too_long';
  }

  if (dirty.has('description')) {
    if (
      Array.from(draft.description.trim()).length >
      MAX_CATALOG_DESCRIPTION_LENGTH
    )
      errors.description = 'description_too_long';
  }

  if (dirty.has('notes')) {
    if (Array.from(draft.notes.trim()).length > MAX_CATALOG_NOTE_LENGTH)
      errors.notes = 'notes_too_long';
  }

  if (dirty.has('video')) {
    if (draft.videoUrl.trim() && !isAllowedCatalogVideoUrl(draft.videoUrl))
      errors.video = 'invalid_video_url';
  }

  if (dirty.has('alternatives')) {
    const refs = draft.alternativeExerciseIds.map(alternativeRef);
    const keys = refs.flatMap((ref) => (ref ? [`${ref.kind}:${ref.id}`] : []));
    if (draft.alternativeExerciseIds.length > MAX_EXERCISE_ALTERNATIVES)
      errors.alternatives = 'too_many_alternatives';
    else if (refs.some((ref) => ref === null)) errors.alternatives = 'required';
    else if (new Set(keys).size !== keys.length)
      errors.alternatives = 'duplicate_alternative';
    else if (refs.some((ref) => ref?.id === currentExerciseId))
      errors.alternatives = 'self_alternative';
  }

  if (dirty.has('default_reps')) {
    if (draft.repsMode === 'fixed') {
      if (draft.repsValue.trim()) {
        const value = parseOptionalInteger(
          draft.repsValue,
          1,
          MAX_EXERCISE_REPS,
        );
        if (value.error) errors.default_reps = 'positive_integer';
      }
    } else {
      const hasMin = !!draft.repsMin.trim();
      const hasMax = !!draft.repsMax.trim();
      if (hasMin !== hasMax) {
        errors.default_reps = 'required';
      } else {
        const min = parseOptionalInteger(draft.repsMin, 1, MAX_EXERCISE_REPS);
        const max = parseOptionalInteger(draft.repsMax, 1, MAX_EXERCISE_REPS);
        if (min.error || max.error) errors.default_reps = 'integer_range';
        else if (
          min.value !== undefined &&
          max.value !== undefined &&
          min.value > max.value
        )
          errors.default_reps = 'range_order';
      }
    }
  }

  if (dirty.has('default_rest_time') && draft.restSeconds.trim()) {
    const rest = parseOptionalInteger(
      draft.restSeconds,
      0,
      MAX_EXERCISE_REST_SECONDS,
    );
    if (rest.error) errors.default_rest_time = 'integer_range';
    else if (
      rest.value !== undefined &&
      rest.value % EXERCISE_REST_STEP_SECONDS !== 0
    )
      errors.default_rest_time = 'integer_range';
  }

  if (dirty.has('default_rir') && draft.rir.trim()) {
    const rir = parseOptionalInteger(draft.rir, 0, MAX_EXERCISE_RIR);
    if (rir.error) errors.default_rir = 'integer_range';
  }

  return errors;
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildOverrideRequest(
  draft: OverrideDraft,
  dirty: ReadonlySet<OverrideField>,
): Record<string, unknown> | null {
  const request: Record<string, unknown> = {};

  if (dirty.has('name')) {
    request.name_en = draft.names.en.trim();
    request.name_ar = textOrNull(draft.names.ar);
  }
  if (dirty.has('description'))
    request.description = textOrNull(draft.description);
  if (dirty.has('notes')) request.notes = textOrNull(draft.notes);
  if (dirty.has('video')) request.video_url = textOrNull(draft.videoUrl);

  if (dirty.has('alternatives')) {
    request.alternatives = draft.alternativeExerciseIds.flatMap((value) => {
      const ref = alternativeRef(value);
      if (!ref) return [];
      return [
        ref.kind === 'private'
          ? { workspace_exercise_id: ref.id }
          : { global_exercise_id: ref.id },
      ];
    });
  }

  if (dirty.has('default_reps')) {
    if (draft.repsMode === 'fixed') {
      request.default_reps = draft.repsValue.trim()
        ? Number(draft.repsValue.trim())
        : null;
    } else {
      const min = draft.repsMin.trim();
      const max = draft.repsMax.trim();
      request.default_reps =
        min && max ? { min: Number(min), max: Number(max) } : null;
    }
  }
  if (dirty.has('default_rest_time'))
    request.default_rest_time = draft.restSeconds.trim()
      ? Number(draft.restSeconds.trim())
      : null;
  if (dirty.has('default_rir'))
    request.default_rir = draft.rir.trim() ? Number(draft.rir.trim()) : null;

  return Object.keys(request).length ? request : null;
}
