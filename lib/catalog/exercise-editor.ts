import {
  EQUIPMENT_CODES,
  MUSCLE_GROUP_CODES,
  type CatalogLocale,
  type EquipmentCode,
  type ExerciseDefaults,
  type ExerciseInput,
  type ExerciseReps,
  type MuscleGroupCode,
  type NormalizedExercise,
} from './schemas';

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

export const EXERCISE_REPS_MODES = ['fixed', 'range'] as const;

export type ExerciseRepsMode = (typeof EXERCISE_REPS_MODES)[number];

export type ExerciseAlternativeOption = {
  id: string;
  names: Partial<Record<CatalogLocale, string>>;
};

export type ExerciseEditorDraft = {
  names: Record<CatalogLocale, string>;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  warmupSets: string;
  workingSets: string;
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
  | 'primaryMuscle'
  | 'equipment'
  | 'warmupSets'
  | 'workingSets'
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
  | 'too_many_alternatives';

export type ExerciseEditorErrors = Partial<
  Record<ExerciseEditorField, ExerciseEditorErrorCode>
>;

const EMPTY_VALUE = '—';

export function canGovernGlobalExercise(role: CatalogStaffRole): boolean {
  return role === 'po';
}

export function alternativeName(
  option: ExerciseAlternativeOption,
  locale: CatalogLocale,
): string {
  const fallback: CatalogLocale = locale === 'ar' ? 'en' : 'ar';
  return option.names[locale] ?? option.names[fallback] ?? option.id;
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
    primaryMuscle: exercise.primaryMuscle,
    secondaryMuscles: [...exercise.secondaryMuscles],
    equipment: exercise.equipment,
    warmupSets:
      defaults?.warmupSets === undefined ? '' : String(defaults.warmupSets),
    workingSets:
      defaults?.workingSets === undefined ? '' : String(defaults.workingSets),
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
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000) {
    return { error: 'positive_integer' };
  }
  return { value };
}

function parseRangeReps(raw: string): ParsedInteger {
  const trimmed = raw.trim();
  if (!trimmed) return { error: 'required' };
  return parseOptionalInteger(trimmed, 1, 1000);
}

export function validateExerciseEditorDraft(
  draft: ExerciseEditorDraft,
): ExerciseEditorErrors {
  const errors: ExerciseEditorErrors = {};

  if (!draft.names.ar.trim()) errors.nameAr = 'required';
  if (!draft.names.en.trim()) errors.nameEn = 'required';

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

  const warmup = parseOptionalInteger(draft.warmupSets, 0, 100);
  if (warmup.error) errors.warmupSets = warmup.error;

  const working = parseOptionalInteger(draft.workingSets, 0, 100);
  if (working.error) errors.workingSets = working.error;

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

  const rest = parseOptionalInteger(draft.restSeconds, 0, 100000);
  if (rest.error) errors.restSeconds = rest.error;

  const rir = parseOptionalInteger(draft.rir, 0, 10);
  if (rir.error) errors.rir = rir.error;

  const alternatives = draft.alternativeExerciseIds.map((id) => id.trim());
  if (alternatives.length > 3) {
    errors.alternatives = 'too_many_alternatives';
  } else if (alternatives.some((id) => !id)) {
    errors.alternatives = 'required';
  }

  return errors;
}

export function hasExerciseEditorErrors(errors: ExerciseEditorErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function buildExerciseInput(
  draft: ExerciseEditorDraft,
): ExerciseInput | null {
  if (hasExerciseEditorErrors(validateExerciseEditorDraft(draft))) {
    return null;
  }

  const defaults: ExerciseDefaults = {};
  if (draft.warmupSets.trim()) {
    defaults.warmupSets = Number(draft.warmupSets.trim());
  }
  if (draft.workingSets.trim()) {
    defaults.workingSets = Number(draft.workingSets.trim());
  }
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

  return {
    names: {
      ar: draft.names.ar.trim(),
      en: draft.names.en.trim(),
    },
    primaryMuscle: draft.primaryMuscle.trim(),
    ...(secondaryMuscles.length ? { secondaryMuscles } : {}),
    equipment: draft.equipment.trim(),
    defaults,
  };
}
