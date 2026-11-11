import {
  EQUIPMENT_CODES,
  EXERCISE_REST_STEP_SECONDS,
  MAX_CATALOG_DESCRIPTION_LENGTH,
  MAX_CATALOG_TEXT_LENGTH,
  MAX_EXERCISE_ALTERNATIVES,
  MAX_EXERCISE_REPS,
  MAX_EXERCISE_REST_SECONDS,
  MAX_EXERCISE_RIR,
  MUSCLE_GROUP_CODES,
  type CatalogLocale,
  type EquipmentCode,
  type ExerciseDefaults,
  type ExerciseInput,
  type ExerciseReps,
  type MuscleGroupCode,
  type NormalizedExercise,
} from './schemas';
import { isAllowedCatalogVideoUrl } from './video-variation';

/**
 * Mocked UI role for the presentational catalog editor. Real authorization is
 * enforced server-side; this prop only decides which controls are rendered.
 */
export const CATALOG_STAFF_ROLES = [
  'po',
  'workspace_owner',
  'trainer',
  'sales',
  'client',
] as const;

export type CatalogStaffRole = (typeof CATALOG_STAFF_ROLES)[number];

export type ExerciseScope = 'global' | 'workspace';

export const EXERCISE_SCOPES: readonly ExerciseScope[] = [
  'global',
  'workspace',
] as const;

export const EXERCISE_REPS_MODES = ['fixed', 'range'] as const;

export type ExerciseRepsMode = (typeof EXERCISE_REPS_MODES)[number];

export type ExerciseAlternativeKind = 'global' | 'private';

export type ExerciseAlternativeOption = {
  id: string;
  kind?: ExerciseAlternativeKind;
  names: Partial<Record<CatalogLocale, string>>;
};

export type ExerciseAlternativeRef = {
  kind: ExerciseAlternativeKind;
  id: string;
};

/**
 * Alternatives are stored as typed references so one draft can carry both
 * Global and workspace-private targets (FR-025). A bare id means Global.
 */
export function alternativeRef(value: string): ExerciseAlternativeRef | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('w:')) {
    const id = trimmed.slice(2).trim();
    return id ? { kind: 'private', id } : null;
  }
  const id = trimmed.startsWith('g:') ? trimmed.slice(2).trim() : trimmed;
  return id ? { kind: 'global', id } : null;
}

export function alternativeOptionValue(option: ExerciseAlternativeOption) {
  return option.kind === 'private' ? `w:${option.id}` : `g:${option.id}`;
}

export type ExerciseEditorDraft = {
  names: Record<CatalogLocale, string>;
  description: string;
  notes: string;
  videoUrl: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  repsMode: ExerciseRepsMode;
  repsValue: string;
  repsMin: string;
  repsMax: string;
  restSeconds: string;
  rir: string;
  alternativeExerciseIds: string[];
};

export type ExerciseEditorField =
  | 'nameAr'
  | 'nameEn'
  | 'description'
  | 'notes'
  | 'videoUrl'
  | 'primaryMuscle'
  | 'equipment'
  | 'repsMode'
  | 'repsValue'
  | 'repsMin'
  | 'repsMax'
  | 'restSeconds'
  | 'rir'
  | 'alternatives';

export type ExerciseEditorErrorCode =
  | 'required'
  | 'positive_integer'
  | 'integer_range'
  | 'range_order'
  | 'invalid_choice'
  | 'too_many_alternatives'
  | 'text_too_long'
  | 'description_too_long'
  | 'invalid_video_url'
  | 'duplicate_alternative'
  | 'self_alternative';

export type ExerciseEditorErrors = Partial<
  Record<ExerciseEditorField, ExerciseEditorErrorCode>
>;

const EMPTY_VALUE = '—';

export function canEditExercise(
  scope: ExerciseScope,
  role: CatalogStaffRole,
  hasCoachingWork: boolean,
): boolean {
  if (scope === 'global') {
    // Global rule unchanged: only the platform owner may create or edit
    // global exercises; remove/merge governance stays PO-only.
    return role === 'po';
  }
  // Workspace scope: PO, WO and Trainer with coaching_work may create/edit
  // the workspace-only exercise; Sales and Client are read-only.
  // catalog-api.md:14 exposes only read/write for workspace-only exercises
  // (PO, WO, Trainer in own workspace); remove/merge are not exposed for
  // workspace scope.
  return (
    role === 'po' ||
    role === 'workspace_owner' ||
    (role === 'trainer' && hasCoachingWork)
  );
}

export function alternativeName(
  option: ExerciseAlternativeOption,
  locale: CatalogLocale,
): string {
  const fallback: CatalogLocale = locale === 'ar' ? 'en' : 'ar';
  const preferred = option.names[locale]?.trim();
  if (preferred) return preferred;
  return option.names[fallback]?.trim() || option.id;
}

export function formatExerciseReps(reps: ExerciseReps | undefined): string {
  if (!reps) return '';
  return reps.kind === 'fixed' ? String(reps.value) : `${reps.min}–${reps.max}`;
}

export function formatExerciseRir(rir: number | null | undefined): string {
  return rir === null || rir === undefined ? EMPTY_VALUE : String(rir);
}

export function formatExerciseRest(seconds: number | undefined): string {
  return seconds === undefined ? '' : String(seconds);
}

export function draftFromExercise(
  exercise: NormalizedExercise,
): ExerciseEditorDraft {
  const defaults = exercise.defaults;
  const reps = defaults?.reps;
  return {
    names: { ar: exercise.names.ar, en: exercise.names.en },
    description: exercise.description ?? '',
    notes: exercise.notes ?? '',
    videoUrl: exercise.videoUrl ?? '',
    primaryMuscle: exercise.primaryMuscle,
    secondaryMuscles: [...exercise.secondaryMuscles],
    equipment: exercise.equipment,
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
    alternativeExerciseIds: [...(defaults?.alternativeExerciseIds ?? [])],
  };
}

type ParsedInteger =
  | { value?: undefined; error?: ExerciseEditorErrorCode }
  | { value: number; error?: undefined };

function parseOptionalInteger(
  raw: string,
  min: number,
  max: number,
): ParsedInteger {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (!/^\d+$/.test(trimmed)) return { error: 'integer_range' };
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    return { error: 'integer_range' };
  }
  return { value };
}

function parseFixedReps(raw: string): ParsedInteger {
  const trimmed = raw.trim();
  if (!trimmed) return { error: 'required' };
  if (!/^\d+$/.test(trimmed)) return { error: 'positive_integer' };
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_EXERCISE_REPS) {
    return { error: 'positive_integer' };
  }
  return { value };
}

function parseRangeReps(raw: string): ParsedInteger {
  const trimmed = raw.trim();
  if (!trimmed) return { error: 'required' };
  return parseOptionalInteger(trimmed, 1, MAX_EXERCISE_REPS);
}

export function validateExerciseEditorDraft(
  draft: ExerciseEditorDraft,
  currentExerciseId?: string | null,
): ExerciseEditorErrors {
  const errors: ExerciseEditorErrors = {};

  // English is required and Arabic is optional (S37-PO-10, FR-001/FR-003).
  if (draft.names.ar.trim()) {
    if (Array.from(draft.names.ar.trim()).length > MAX_CATALOG_TEXT_LENGTH)
      errors.nameAr = 'text_too_long';
  }
  if (!draft.names.en.trim()) errors.nameEn = 'required';
  else if (Array.from(draft.names.en.trim()).length > MAX_CATALOG_TEXT_LENGTH)
    errors.nameEn = 'text_too_long';

  if (
    Array.from(draft.description.trim()).length > MAX_CATALOG_DESCRIPTION_LENGTH
  )
    errors.description = 'description_too_long';
  if (draft.videoUrl.trim() && !isAllowedCatalogVideoUrl(draft.videoUrl))
    errors.videoUrl = 'invalid_video_url';

  const primaryMuscle = draft.primaryMuscle.trim();
  if (!primaryMuscle) errors.primaryMuscle = 'required';
  else if (!MUSCLE_GROUP_CODES.includes(primaryMuscle as MuscleGroupCode)) {
    errors.primaryMuscle = 'invalid_choice';
  }

  const equipment = draft.equipment.trim();
  if (!equipment) errors.equipment = 'required';
  else if (!EQUIPMENT_CODES.includes(equipment as EquipmentCode)) {
    errors.equipment = 'invalid_choice';
  }

  if (draft.repsMode === 'fixed') {
    const fixed = parseFixedReps(draft.repsValue);
    if (fixed.error) errors.repsValue = fixed.error;
  } else if (draft.repsMode === 'range') {
    const min = parseRangeReps(draft.repsMin);
    const max = parseRangeReps(draft.repsMax);
    if (min.error) errors.repsMin = min.error;
    if (max.error) errors.repsMax = max.error;
    if (
      min.value !== undefined &&
      max.value !== undefined &&
      min.value > max.value
    ) {
      errors.repsMin = 'range_order';
      errors.repsMax = 'range_order';
    }
  } else {
    errors.repsMode = 'invalid_choice';
  }

  const rest = parseOptionalInteger(
    draft.restSeconds,
    0,
    MAX_EXERCISE_REST_SECONDS,
  );
  if (rest.error) errors.restSeconds = rest.error;
  else if (
    rest.value !== undefined &&
    rest.value % EXERCISE_REST_STEP_SECONDS !== 0
  )
    errors.restSeconds = 'integer_range';

  const rir = parseOptionalInteger(draft.rir, 0, MAX_EXERCISE_RIR);
  if (rir.error) errors.rir = rir.error;

  const alternatives = draft.alternativeExerciseIds.map(alternativeRef);
  const alternativeRefs = alternatives.filter(
    (value): value is ExerciseAlternativeRef => value !== null,
  );
  const alternativeKeys = alternativeRefs.map(
    (value) => `${value.kind}:${value.id}`,
  );
  if (draft.alternativeExerciseIds.length > MAX_EXERCISE_ALTERNATIVES) {
    errors.alternatives = 'too_many_alternatives';
  } else if (alternatives.some((value) => value === null)) {
    errors.alternatives = 'required';
  } else if (new Set(alternativeKeys).size !== alternativeKeys.length) {
    errors.alternatives = 'duplicate_alternative';
  } else if (
    !!currentExerciseId &&
    alternativeRefs.some((value) => value.id === currentExerciseId)
  ) {
    errors.alternatives = 'self_alternative';
  }

  return errors;
}

export function hasExerciseEditorErrors(errors: ExerciseEditorErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function buildExerciseInput(
  draft: ExerciseEditorDraft,
  currentExerciseId?: string | null,
): ExerciseInput | null {
  if (
    hasExerciseEditorErrors(
      validateExerciseEditorDraft(draft, currentExerciseId),
    )
  ) {
    return null;
  }

  const defaults: ExerciseDefaults = {};
  defaults.reps =
    draft.repsMode === 'fixed'
      ? { kind: 'fixed', value: Number(draft.repsValue.trim()) }
      : {
          kind: 'range',
          min: Number(draft.repsMin.trim()),
          max: Number(draft.repsMax.trim()),
        };
  if (draft.restSeconds.trim()) {
    defaults.restSeconds = Number(draft.restSeconds.trim());
  }
  defaults.rir = draft.rir.trim() ? Number(draft.rir.trim()) : null;
  if (draft.alternativeExerciseIds.length) {
    defaults.alternativeExerciseIds = [...draft.alternativeExerciseIds];
  }

  const secondaryMuscles = draft.secondaryMuscles
    .map((code) => code.trim())
    .filter(Boolean);

  const description = draft.description.trim();
  const notes = draft.notes.trim();
  const videoUrl = draft.videoUrl.trim();

  return {
    names: {
      ar: draft.names.ar.trim(),
      en: draft.names.en.trim(),
    },
    primaryMuscle: draft.primaryMuscle.trim(),
    ...(secondaryMuscles.length ? { secondaryMuscles } : {}),
    equipment: draft.equipment.trim(),
    ...(description ? { description } : {}),
    ...(notes ? { notes } : {}),
    ...(videoUrl ? { videoUrl } : {}),
    defaults,
  };
}
