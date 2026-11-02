import type { ExerciseInput } from './schemas';

export function exerciseInput(
  row: Record<string, unknown>,
): ExerciseInput | null {
  const payload = row.payload as Record<string, unknown>;
  const equipment = Array.isArray(payload.equipment_codes)
    ? payload.equipment_codes[0]
    : null;
  const defaults =
    payload.defaults && typeof payload.defaults === 'object'
      ? (payload.defaults as Record<string, unknown>)
      : {};
  const reps =
    defaults.reps && typeof defaults.reps === 'object'
      ? (defaults.reps as Record<string, unknown>)
      : null;
  return {
    names: { ar: String(row.name_ar), en: String(row.name_en) },
    primaryMuscle: String(payload.primary_muscle_code),
    secondaryMuscles: Array.isArray(payload.secondary_muscle_codes)
      ? payload.secondary_muscle_codes.map(String)
      : [],
    equipment: String(equipment),
    lifecycleState: row.lifecycle_state === 'removed' ? 'removed' : 'active',
    defaults: {
      warmupSets:
        typeof defaults.warmup_sets === 'number'
          ? defaults.warmup_sets
          : undefined,
      workingSets:
        typeof defaults.working_sets === 'number'
          ? defaults.working_sets
          : undefined,
      reps:
        reps && typeof reps.min === 'number' && typeof reps.max === 'number'
          ? { kind: 'range', min: reps.min, max: reps.max }
          : reps && typeof reps.value === 'number'
            ? { kind: 'fixed', value: reps.value }
            : undefined,
      restSeconds:
        typeof defaults.rest_seconds === 'number'
          ? defaults.rest_seconds
          : undefined,
      rir:
        typeof defaults.rir === 'number' || defaults.rir === null
          ? defaults.rir
          : undefined,
      alternativeExerciseIds: Array.isArray(defaults.alternative_exercise_ids)
        ? defaults.alternative_exercise_ids.map(String)
        : [],
    },
  };
}
