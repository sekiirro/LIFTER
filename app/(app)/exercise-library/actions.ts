'use server';

import { authorize } from '../../../lib/auth/authorize';
import { revalidatePath } from 'next/cache';
import { requireActor } from '../../../lib/auth/actor';
import {
  createExercise,
  removeWorkspaceExercise,
  transitionExercise,
  versionExercise,
  writeExerciseOverride,
  writeWorkspaceExercise,
  type CatalogMutation,
  type CatalogResult,
} from '../../../lib/catalog/server';
import {
  alternativeRef,
  buildExerciseInput,
  type ExerciseEditorDraft,
} from '../../../lib/catalog/exercise-editor';
import {
  OVERRIDE_FIELDS,
  type OverrideField,
} from '../../../lib/catalog/exercise-override';
import { EQUIPMENT_CODES } from '../../../lib/catalog/schemas';
import { isUuidV4 } from '../../../lib/catalog/uuid';

export type SaveExerciseInput = {
  draft: ExerciseEditorDraft;
  scope: 'global' | 'workspace';
  workspaceId: string | null;
  operationKey: string;
  id?: string;
  expectedVersion?: number;
  equipmentCodes?: string[];
};

export type RemoveExerciseInput = {
  scope: 'global' | 'workspace';
  workspaceId: string | null;
  exerciseId: string;
  expectedRevision: number;
  operationKey: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validSavePayload(value: unknown): value is SaveExerciseInput {
  if (!isRecord(value)) return false;
  const rawDraft = value.draft;
  if (!isRecord(rawDraft)) return false;
  const names = rawDraft.names;
  if (!isRecord(names)) return false;
  const draft = rawDraft;
  const stringDraftFields = [
    'primaryMuscle',
    'equipment',
    'description',
    'notes',
    'videoUrl',
    'repsValue',
    'repsMin',
    'repsMax',
    'restSeconds',
    'rir',
    'repsMode',
  ];
  return (
    (value.scope === 'global' || value.scope === 'workspace') &&
    (value.workspaceId === null || typeof value.workspaceId === 'string') &&
    typeof value.operationKey === 'string' &&
    typeof names.ar === 'string' &&
    typeof names.en === 'string' &&
    stringDraftFields.every((field) => typeof draft[field] === 'string') &&
    Array.isArray(draft.secondaryMuscles) &&
    draft.secondaryMuscles.every((code) => typeof code === 'string') &&
    Array.isArray(draft.alternativeExerciseIds) &&
    draft.alternativeExerciseIds.every((id) => typeof id === 'string') &&
    isUuidV4(value.operationKey) &&
    (value.id === undefined || isUuidV4(value.id)) &&
    (value.workspaceId === null || isUuidV4(value.workspaceId)) &&
    (value.expectedVersion === undefined ||
      (Number.isInteger(value.expectedVersion) &&
        Number(value.expectedVersion) >= 0)) &&
    (value.equipmentCodes === undefined ||
      (Array.isArray(value.equipmentCodes) &&
        value.equipmentCodes.every((code) => typeof code === 'string')))
  );
}

function validRemovePayload(value: unknown): value is RemoveExerciseInput {
  return (
    isRecord(value) &&
    (value.scope === 'global' || value.scope === 'workspace') &&
    (value.workspaceId === null || isUuidV4(value.workspaceId)) &&
    isUuidV4(value.exerciseId) &&
    Number.isInteger(value.expectedRevision) &&
    Number(value.expectedRevision) >= 0 &&
    isUuidV4(value.operationKey)
  );
}

export async function removeExerciseAction(
  input: RemoveExerciseInput,
): Promise<CatalogResult> {
  if (!validRemovePayload(input)) return { status: 'invalid' };
  const actor = await requireActor();
  if (input.scope === 'global') {
    if (actor.role !== 'platform_owner') return { status: 'not_permitted' };
    const result = await transitionExercise({
      id: input.exerciseId,
      expectedVersion: input.expectedRevision,
      transition: 'remove',
      operationKey: input.operationKey,
    });
    if (result.status === 'ok') {
      revalidatePath('/exercise-library');
      revalidatePath(`/exercise-library/${input.exerciseId}`);
    }
    return result;
  }
  if (
    input.scope !== 'workspace' ||
    !input.workspaceId ||
    !(['platform_owner', 'workspace_owner', 'trainer'] as string[]).includes(
      actor.role ?? '',
    ) ||
    !authorize(actor, 'coaching_work', input.workspaceId)
  )
    return { status: 'not_permitted' };
  const result = await removeWorkspaceExercise({
    id: input.exerciseId,
    workspaceId: input.workspaceId,
    expectedVersion: input.expectedRevision,
    operationKey: input.operationKey,
  });
  if (result.status === 'ok') {
    revalidatePath('/exercise-library');
    revalidatePath(`/exercise-library/${input.exerciseId}`);
  }
  return result;
}

/**
 * Builds the approved eight-field payload (FR-003) for the create/version RPCs.
 * The database validator is authoritative; this conversion only shapes the
 * request and never sends the retired `instructions_*` or `defaults` keys.
 */
function alternativesFor(
  values: readonly string[],
  scope: 'global' | 'workspace',
): unknown[] {
  const alternatives: unknown[] = [];
  for (const value of values) {
    const ref = alternativeRef(value);
    if (!ref) continue;
    if (scope === 'global') {
      if (ref.kind === 'global') alternatives.push(ref.id);
    } else {
      alternatives.push(
        ref.kind === 'private'
          ? { workspace_exercise_id: ref.id }
          : { global_exercise_id: ref.id },
      );
    }
  }
  return alternatives;
}

function requestFor(
  draft: ExerciseEditorDraft,
  scope: 'global' | 'workspace',
  currentExerciseId?: string,
  equipmentCodes?: string[],
): Record<string, unknown> | null {
  const exercise = buildExerciseInput(draft, currentExerciseId);
  if (!exercise) return null;
  const defaults = exercise.defaults;
  const reps = defaults?.reps;
  return {
    name_en: exercise.names.en,
    ...(exercise.names.ar ? { name_ar: exercise.names.ar } : {}),
    primary_muscle_code: exercise.primaryMuscle,
    ...(exercise.secondaryMuscles?.length
      ? { secondary_muscle_codes: exercise.secondaryMuscles }
      : {}),
    equipment_codes:
      equipmentCodes?.length && equipmentCodes[0] === exercise.equipment
        ? equipmentCodes.filter((code) =>
            EQUIPMENT_CODES.includes(code as (typeof EQUIPMENT_CODES)[number]),
          )
        : [exercise.equipment],
    ...(exercise.description ? { description: exercise.description } : {}),
    ...(exercise.notes ? { notes: exercise.notes } : {}),
    ...(exercise.videoUrl ? { video_url: exercise.videoUrl } : {}),
    ...(reps?.kind === 'fixed'
      ? { default_reps: reps.value }
      : reps?.kind === 'range'
        ? { default_reps: { min: reps.min, max: reps.max } }
        : {}),
    ...(defaults?.restSeconds === undefined
      ? {}
      : { default_rest_time: defaults.restSeconds }),
    ...(defaults?.rir === undefined || defaults.rir === null
      ? {}
      : { default_rir: defaults.rir }),
    ...(defaults?.alternativeExerciseIds?.length
      ? {
          alternatives: alternativesFor(defaults.alternativeExerciseIds, scope),
        }
      : {}),
  };
}

export async function saveExerciseAction(
  input: SaveExerciseInput,
): Promise<CatalogResult> {
  if (!validSavePayload(input)) return { status: 'invalid' };
  const actor = await requireActor();
  const isPlatformOwner = actor.role === 'platform_owner';
  const workspaceRole =
    actor.role === 'workspace_owner' || actor.role === 'trainer';
  if (input.scope === 'global') {
    if (!isPlatformOwner) return { status: 'not_permitted' };
    if (
      input.equipmentCodes?.some(
        (code) =>
          !EQUIPMENT_CODES.includes(code as (typeof EQUIPMENT_CODES)[number]),
      )
    )
      return { status: 'invalid' };
    const request = requestFor(
      input.draft,
      'global',
      input.id,
      input.id ? input.equipmentCodes : undefined,
    );
    if (!request) return { status: 'invalid' };
    const mutation: CatalogMutation = {
      operationKey: input.operationKey,
      id: input.id,
      expectedVersion: input.expectedVersion,
      request,
    };
    const result = input.id
      ? versionExercise(mutation)
      : createExercise({ operationKey: input.operationKey, request });
    const completed = await result;
    if (completed.status === 'ok') {
      revalidatePath('/exercise-library');
      if (input.id) revalidatePath(`/exercise-library/${input.id}`);
    }
    return completed;
  }

  if (
    input.scope !== 'workspace' ||
    !input.workspaceId ||
    (!isPlatformOwner && !workspaceRole) ||
    !authorize(actor, 'coaching_work', input.workspaceId)
  )
    return { status: 'not_permitted' };
  if (
    input.equipmentCodes?.some(
      (code) =>
        !EQUIPMENT_CODES.includes(code as (typeof EQUIPMENT_CODES)[number]),
    )
  )
    return { status: 'invalid' };
  const request = requestFor(input.draft, 'workspace', input.id);
  if (!request) return { status: 'invalid' };
  const result = await writeWorkspaceExercise({
    operationKey: input.operationKey,
    workspaceId: input.workspaceId,
    id: input.id,
    expectedVersion: input.expectedVersion,
    request,
  });
  if (result.status === 'ok') {
    revalidatePath('/exercise-library');
    if (input.id) revalidatePath(`/exercise-library/${input.id}`);
  }
  return result;
}

const RESET_REQUESTS: Record<OverrideField, Record<string, null>> = {
  name: { name_en: null },
  description: { description: null },
  notes: { notes: null },
  video: { video_url: null },
  alternatives: { alternatives: null },
  default_rest_time: { default_rest_time: null },
  default_rir: { default_rir: null },
  default_reps: { default_reps: null },
};

export type SaveExerciseOverrideInput = {
  workspaceId: string;
  exerciseId: string;
  expectedVersion: number;
  operationKey: string;
  request: Record<string, unknown>;
};

export type ResetExerciseOverrideInput = {
  workspaceId: string;
  exerciseId: string;
  expectedVersion: number;
  operationKey: string;
  field: OverrideField;
};

function validOverrideMutation(value: unknown): boolean {
  return (
    isRecord(value) &&
    isUuidV4(value.workspaceId) &&
    isUuidV4(value.exerciseId) &&
    Number.isInteger(value.expectedVersion) &&
    Number(value.expectedVersion) >= 0 &&
    isUuidV4(value.operationKey)
  );
}

function validOverrideRequest(
  value: unknown,
): value is Record<string, unknown> {
  if (!isRecord(value) || !Object.keys(value).length) return false;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          'name_en',
          'name_ar',
          'description',
          'notes',
          'video_url',
          'alternatives',
          'default_rest_time',
          'default_rir',
          'default_reps',
        ].includes(key),
    )
  )
    return false;
  return Object.values(value).every(
    (item) =>
      item === null ||
      typeof item === 'string' ||
      (typeof item === 'number' && Number.isFinite(item)) ||
      (Array.isArray(item) &&
        item.every(
          (target) =>
            isRecord(target) &&
            (typeof target.global_exercise_id === 'string' ||
              typeof target.workspace_exercise_id === 'string'),
        )) ||
      (isRecord(item) &&
        Object.keys(item).every((key) => key === 'min' || key === 'max') &&
        Object.keys(item).length > 0 &&
        typeof item.min === 'number' &&
        Number.isInteger(item.min) &&
        typeof item.max === 'number' &&
        Number.isInteger(item.max)),
  );
}

async function overrideAuthorized(
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; result: CatalogResult }> {
  const actor = await requireActor();
  const isPlatformOwner = actor.role === 'platform_owner';
  const workspaceRole =
    actor.role === 'workspace_owner' || actor.role === 'trainer';
  if (
    (!isPlatformOwner && !workspaceRole) ||
    !authorize(actor, 'coaching_work', workspaceId)
  )
    return { ok: false, result: { status: 'not_permitted' } };
  return { ok: true };
}

async function writeOverride(
  input: {
    workspaceId: string;
    exerciseId: string;
    expectedVersion: number;
    operationKey: string;
  },
  request: Record<string, unknown>,
): Promise<CatalogResult> {
  const authorized = await overrideAuthorized(input.workspaceId);
  if (!authorized.ok) return authorized.result;
  const result = await writeExerciseOverride({
    workspaceId: input.workspaceId,
    id: input.exerciseId,
    expectedVersion: input.expectedVersion,
    operationKey: input.operationKey,
    request,
  });
  if (result.status === 'ok') {
    revalidatePath('/exercise-library');
    revalidatePath(`/exercise-library/${input.exerciseId}`);
  }
  return result;
}

export async function saveExerciseOverrideAction(
  input: SaveExerciseOverrideInput,
): Promise<CatalogResult> {
  if (!validOverrideMutation(input) || !validOverrideRequest(input.request))
    return { status: 'invalid' };
  return writeOverride(input, input.request);
}

export async function resetExerciseOverrideFieldAction(
  input: ResetExerciseOverrideInput,
): Promise<CatalogResult> {
  if (!validOverrideMutation(input) || !OVERRIDE_FIELDS.includes(input.field))
    return { status: 'invalid' };
  return writeOverride(input, RESET_REQUESTS[input.field]);
}
