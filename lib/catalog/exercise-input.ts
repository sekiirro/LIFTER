import type { ExerciseInput, ExerciseReps } from './schemas';
import { isUuidV4 } from './uuid';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

/**
 * Reads one resolved eight-field value from the staff read projection.
 * `catalog_exercise_detail` and the search reads attach `effective_fields`;
 * canonical payload keys remain the fallback for older projections.
 */
function effectiveValue(
  effective: JsonRecord | null,
  field: string,
  payload: JsonRecord,
  payloadKey: string,
): unknown {
  const entry = record(effective?.[field]);
  if (entry && 'value' in entry) return entry.value;
  return payload[payloadKey];
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value)
    ? value
    : undefined;
}

function repsFromValue(value: unknown): ExerciseReps | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return { kind: 'fixed', value };
  }
  const range = record(value);
  if (
    range &&
    typeof range.min === 'number' &&
    Number.isInteger(range.min) &&
    typeof range.max === 'number' &&
    Number.isInteger(range.max)
  ) {
    return { kind: 'range', min: range.min, max: range.max };
  }
  return undefined;
}

function alternativeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === 'string') return isUuidV4(item) ? [`g:${item}`] : [];
    const target = record(item);
    if (!target) return [];
    if (typeof target.workspace_exercise_id === 'string')
      return [`w:${target.workspace_exercise_id}`];
    if (typeof target.global_exercise_id === 'string')
      return [`g:${target.global_exercise_id}`];
    return [];
  });
}

export function exerciseInput(
  row: Record<string, unknown>,
): ExerciseInput | null {
  const payload = record(row.payload);
  if (!payload) return null;
  const effective = record(payload.effective_fields);
  const name = record(effective?.name);
  const nameValue = record(name?.value);

  const equipmentCodes = payload.equipment_codes;
  const secondaryMuscles = payload.secondary_muscle_codes;
  if (
    Array.isArray(secondaryMuscles) &&
    secondaryMuscles.some((value) => typeof value !== 'string')
  )
    return null;

  // A resolved name is authoritative, including an explicit null Arabic value
  // (a cleared workspace override must not fall back to the canonical name).
  const nameAr = nameValue
    ? optionalText(nameValue.name_ar)
    : (optionalText(payload.name_ar) ?? optionalText(row.name_ar));
  const nameEn = nameValue
    ? optionalText(nameValue.name_en)
    : (optionalText(payload.name_en) ?? optionalText(row.name_en));
  const names = {
    ...(nameAr ? { ar: nameAr } : {}),
    ...(nameEn ? { en: nameEn } : {}),
  };

  const restSeconds = optionalInteger(
    effectiveValue(
      effective,
      'default_rest_time',
      payload,
      'default_rest_time',
    ),
  );
  const rir = optionalInteger(
    effectiveValue(effective, 'default_rir', payload, 'default_rir'),
  );
  const reps = repsFromValue(
    effectiveValue(effective, 'default_reps', payload, 'default_reps'),
  );
  const alternatives = alternativeIds(
    effectiveValue(effective, 'alternatives', payload, 'alternatives'),
  );

  return {
    names,
    primaryMuscle:
      typeof payload.primary_muscle_code === 'string'
        ? payload.primary_muscle_code
        : '',
    secondaryMuscles: Array.isArray(secondaryMuscles) ? secondaryMuscles : [],
    equipment:
      Array.isArray(equipmentCodes) && typeof equipmentCodes[0] === 'string'
        ? equipmentCodes[0]
        : '',
    description: optionalText(
      effectiveValue(effective, 'description', payload, 'description'),
    ),
    notes: optionalText(effectiveValue(effective, 'notes', payload, 'notes')),
    videoUrl: optionalText(
      effectiveValue(effective, 'video', payload, 'video_url'),
    ),
    lifecycleState: row.lifecycle_state === 'removed' ? 'removed' : 'active',
    defaults: {
      ...(reps ? { reps } : {}),
      ...(restSeconds === undefined ? {} : { restSeconds }),
      ...(rir === undefined ? {} : { rir }),
      ...(alternatives.length ? { alternativeExerciseIds: alternatives } : {}),
    },
  };
}
