'use server';

import { authorize } from '../../../lib/auth/authorize';
import { revalidatePath } from 'next/cache';
import { requireActor } from '../../../lib/auth/actor';
import {
  createExercise,
  removeWorkspaceExercise,
  transitionExercise,
  versionExercise,
  writeWorkspaceExercise,
  type CatalogMutation,
  type CatalogResult,
} from '../../../lib/catalog/server';
import {
  buildExerciseInput,
  type ExerciseEditorDraft,
} from '../../../lib/catalog/exercise-editor';
import { EQUIPMENT_CODES } from '../../../lib/catalog/schemas';
import { isUuidV4 } from '../../../lib/catalog/uuid';

export type SaveExerciseInput = {
  draft: ExerciseEditorDraft;
  scope: 'global' | 'workspace';
  workspaceId: string | null;
  operationKey: string;
  id?: string;
  expectedVersion?: number;
  instructions?: Partial<Record<'ar' | 'en', string>>;
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
    'warmupSets',
    'workingSets',
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
        value.equipmentCodes.every((code) => typeof code === 'string'))) &&
    (value.instructions === undefined ||
      (isRecord(value.instructions) &&
        Object.values(value.instructions).every(
          (text) => typeof text === 'string',
        )))
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

function requestFor(
  draft: ExerciseEditorDraft,
  instructions?: Partial<Record<'ar' | 'en', string>>,
  equipmentCodes?: string[],
): Record<string, unknown> | null {
  const exercise = buildExerciseInput(draft);
  if (!exercise) return null;
  const defaults = exercise.defaults;
  return {
    name_ar: exercise.names.ar,
    name_en: exercise.names.en,
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
    ...(instructions?.ar === undefined
      ? {}
      : { instructions_ar: instructions.ar }),
    ...(instructions?.en === undefined
      ? {}
      : { instructions_en: instructions.en }),
    defaults: {
      ...(defaults?.warmupSets === undefined
        ? {}
        : { warmup_sets: defaults.warmupSets }),
      ...(defaults?.workingSets === undefined
        ? {}
        : { working_sets: defaults.workingSets }),
      ...(defaults?.reps?.kind === 'fixed'
        ? { reps: { value: defaults.reps.value } }
        : defaults?.reps?.kind === 'range'
          ? { reps: { min: defaults.reps.min, max: defaults.reps.max } }
          : {}),
      ...(defaults?.restSeconds === undefined
        ? {}
        : { rest_seconds: defaults.restSeconds }),
      ...(defaults?.rir === undefined ? {} : { rir: defaults.rir }),
      ...(defaults?.alternativeExerciseIds?.length
        ? { alternative_exercise_ids: defaults.alternativeExerciseIds }
        : {}),
    },
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
      input.instructions,
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
  const request = requestFor(input.draft, input.instructions);
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
