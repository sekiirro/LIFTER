// Pure adapter from F16's effective projection to pinned F17 plan-entry values.
import {
  parseWorkoutReference,
  type WorkoutExerciseReference,
} from './document';

type EffectiveField = { value?: unknown } | unknown;
type EffectiveFields = Partial<
  Record<
    | 'name'
    | 'description'
    | 'notes'
    | 'video'
    | 'alternatives'
    | 'default_rest_time'
    | 'default_rir'
    | 'default_reps',
    EffectiveField
  >
>;
type Authoring = 'workspace' | 'global_fresh' | 'promoted_global';
export type WorkoutEntryAtAdd = {
  name: string;
  description?: string;
  restSec?: number;
  rir?: number;
  reps?: { value: number } | { min: number; max: number };
  notes?: string;
  alternatives: WorkoutExerciseReference[];
  sets: [];
};

export type ResolveWorkoutExerciseInput = {
  reference: WorkoutExerciseReference;
  effectiveFields: EffectiveFields;
  overrideVersion?: number | null;
  resolutionWorkspaceId?: string;
  destinationWorkspaceId?: string;
  authoring: Authoring;
  resolutionScope: 'canonical' | 'workspace';
  resolved?: boolean;
  /** Immutable pinned source-version taxonomy, never taken from an effective override. */
  pinnedVersion: {
    identity_id: string;
    version: number;
    workspace_id?: string;
    primary_muscle_code: string;
    secondary_muscle_codes?: string[];
  };
};

export type FrozenWorkoutExercise = {
  reference: WorkoutExerciseReference;
  name: string;
  description?: string;
  restSec?: number;
  rir?: number;
  reps?: WorkoutEntryAtAdd['reps'];
  notes?: string;
  alternatives: WorkoutExerciseReference[];
};

function invalid(): never {
  throw new Error('invalid_document');
}
function field(fields: EffectiveFields, name: keyof EffectiveFields): unknown {
  const entry = fields[name];
  return entry !== null && typeof entry === 'object' && 'value' in entry
    ? (entry as { value: unknown }).value
    : entry;
}
function asText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
function copyDefaults(value: unknown): WorkoutEntryAtAdd['reps'] {
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 100
  )
    return { value };
  if (value && typeof value === 'object') {
    const reps = value as Record<string, unknown>;
    if (
      reps.kind === 'fixed' &&
      Number.isInteger(reps.value) &&
      (reps.value as number) >= 1 &&
      (reps.value as number) <= 100
    )
      return { value: reps.value as number };
    if (
      Number.isInteger(reps.min) &&
      Number.isInteger(reps.max) &&
      (reps.min as number) >= 1 &&
      (reps.max as number) <= 100 &&
      (reps.min as number) <= (reps.max as number)
    )
      return { min: reps.min as number, max: reps.max as number };
    if (
      reps.kind === 'range' &&
      Number.isInteger(reps.min) &&
      Number.isInteger(reps.max) &&
      (reps.min as number) >= 1 &&
      (reps.max as number) <= 100 &&
      (reps.min as number) <= (reps.max as number)
    )
      return { min: reps.min as number, max: reps.max as number };
  }
  return undefined;
}
function alternative(value: unknown): WorkoutExerciseReference {
  if (!value || typeof value !== 'object') return invalid();
  const v = value as Record<string, unknown>;
  if (v.source) return parseWorkoutReference(v);
  const identity = v.global_exercise_id ?? v.workspace_exercise_id;
  const source = v.global_exercise_id
    ? 'global'
    : v.workspace_exercise_id
      ? 'workspace_private'
      : undefined;
  const version = v.version ?? v.target_version;
  if (
    typeof identity !== 'string' ||
    !source ||
    !Number.isInteger(version) ||
    (version as number) < 1
  )
    return invalid();
  return parseWorkoutReference({
    source,
    identity_id: identity,
    version,
    ...(source === 'workspace_private' ? { workspace_id: v.workspace_id } : {}),
  });
}

/** Pin source versions and snapshot the eight F16 values at add time; Video stays live. */
export function resolveWorkoutExercise(input: ResolveWorkoutExerciseInput): {
  reference: WorkoutExerciseReference;
  entry: WorkoutEntryAtAdd;
  muscles: { primary: string; secondary: string[] };
  video: 'live';
} {
  let reference = parseWorkoutReference(input.reference);
  if (!input.pinnedVersion) return invalid();
  if (input.authoring === 'promoted_global' && input.resolved === false)
    return invalid();
  if (input.authoring === 'global_fresh' && reference.source !== 'global')
    return invalid();
  if (
    input.authoring === 'global_fresh' &&
    (input.resolutionScope !== 'canonical' ||
      input.resolutionWorkspaceId !== undefined ||
      input.overrideVersion != null)
  )
    return invalid();
  if (
    input.authoring !== 'global_fresh' &&
    input.resolutionScope !== 'workspace'
  )
    return invalid();
  if (
    input.authoring === 'global_fresh' &&
    reference.source === 'global' &&
    reference.overrideVersion != null
  )
    return invalid();
  if (reference.source === 'workspace_private') {
    if (
      input.authoring === 'global_fresh' ||
      !input.destinationWorkspaceId ||
      reference.workspace_id !== input.destinationWorkspaceId
    )
      return invalid();
  }
  if (
    input.pinnedVersion.identity_id !== reference.identity_id ||
    input.pinnedVersion.version !== reference.version ||
    (reference.source === 'workspace_private' &&
      input.pinnedVersion.workspace_id !== reference.workspace_id) ||
    (reference.source === 'global' &&
      input.pinnedVersion.workspace_id !== undefined)
  )
    return invalid();
  const overrideVersion =
    input.authoring === 'global_fresh'
      ? null
      : (input.overrideVersion ?? reference.overrideVersion ?? null);
  if (reference.source === 'global' && overrideVersion !== null) {
    if (
      !input.resolutionWorkspaceId ||
      (!input.overrideVersion && !reference.overrideWorkspaceId) ||
      (reference.overrideWorkspaceId &&
        input.resolutionWorkspaceId !== reference.overrideWorkspaceId)
    )
      return invalid();
    reference = parseWorkoutReference({
      ...reference,
      overrideVersion,
      overrideWorkspaceId: input.resolutionWorkspaceId,
    });
  }
  const nameRaw = field(input.effectiveFields, 'name');
  const nameObj =
    nameRaw && typeof nameRaw === 'object'
      ? (nameRaw as Record<string, unknown>)
      : {};
  const name = asText(nameObj.en ?? nameObj.name_en) ?? asText(nameRaw);
  if (!name) return invalid();
  if (
    !input.pinnedVersion ||
    typeof input.pinnedVersion.primary_muscle_code !== 'string' ||
    !input.pinnedVersion.primary_muscle_code ||
    (input.pinnedVersion.secondary_muscle_codes !== undefined &&
      (!Array.isArray(input.pinnedVersion.secondary_muscle_codes) ||
        input.pinnedVersion.secondary_muscle_codes.some(
          (m) => typeof m !== 'string',
        )))
  )
    return invalid();
  const restRaw = field(input.effectiveFields, 'default_rest_time');
  const rirRaw = field(input.effectiveFields, 'default_rir');
  if (
    restRaw !== null &&
    restRaw !== undefined &&
    (!Number.isInteger(restRaw) ||
      (restRaw as number) < 0 ||
      (restRaw as number) > 600 ||
      (restRaw as number) % 15)
  )
    return invalid();
  if (
    rirRaw !== null &&
    rirRaw !== undefined &&
    (!Number.isInteger(rirRaw) ||
      (rirRaw as number) < 0 ||
      (rirRaw as number) > 5)
  )
    return invalid();
  const alternativesRaw = field(input.effectiveFields, 'alternatives');
  const alternatives =
    alternativesRaw == null
      ? []
      : Array.isArray(alternativesRaw)
        ? alternativesRaw.map(alternative)
        : invalid();
  if (
    alternatives.length > 3 ||
    new Set(
      alternatives.map(
        (a) => `${a.source}:${a.workspace_id ?? ''}:${a.identity_id}`,
      ),
    ).size !== alternatives.length
  )
    return invalid();
  const description = asText(field(input.effectiveFields, 'description'));
  const notes = asText(field(input.effectiveFields, 'notes'));
  const reps = copyDefaults(field(input.effectiveFields, 'default_reps'));
  const entry: WorkoutEntryAtAdd = {
    name,
    ...(description === undefined ? {} : { description }),
    ...(typeof restRaw === 'number' ? { restSec: restRaw } : {}),
    ...(typeof rirRaw === 'number' ? { rir: rirRaw } : {}),
    ...(reps === undefined ? {} : { reps }),
    ...(notes === undefined ? {} : { notes }),
    alternatives,
    sets: [],
  };
  return {
    reference,
    entry: structuredClone(entry),
    muscles: {
      primary: input.pinnedVersion.primary_muscle_code,
      secondary: [...(input.pinnedVersion.secondary_muscle_codes ?? [])],
    },
    video: 'live',
  };
}

/** Freeze the current editable entry with its original add-time reference pins. */
export function freezeWorkoutExercise(
  reference: WorkoutExerciseReference,
  entry: WorkoutEntryAtAdd,
): FrozenWorkoutExercise {
  const pinned = parseWorkoutReference(reference);
  return structuredClone({
    reference: pinned,
    name: entry.name,
    ...(entry.description === undefined
      ? {}
      : { description: entry.description }),
    ...(entry.restSec === undefined ? {} : { restSec: entry.restSec }),
    ...(entry.rir === undefined ? {} : { rir: entry.rir }),
    ...(entry.reps === undefined ? {} : { reps: entry.reps }),
    ...(entry.notes === undefined ? {} : { notes: entry.notes }),
    alternatives: entry.alternatives,
  });
}
