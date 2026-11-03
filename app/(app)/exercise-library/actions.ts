'use server';

import { authorize } from '../../../lib/auth/authorize';
import { requireActor } from '../../../lib/auth/actor';
import {
  createExercise,
  versionExercise,
  writeWorkspaceExercise,
  type CatalogMutation,
  type CatalogResult,
} from '../../../lib/catalog/server';
import {
  buildExerciseInput,
  type ExerciseEditorDraft,
} from '../../../lib/catalog/exercise-editor';

export type SaveExerciseInput = {
  draft: ExerciseEditorDraft;
  scope: 'global' | 'workspace';
  workspaceId: string | null;
  operationKey: string;
  id?: string;
  expectedVersion?: number;
  instructions?: Partial<Record<'ar' | 'en', string>>;
};

function requestFor(
  draft: ExerciseEditorDraft,
  instructions?: Partial<Record<'ar' | 'en', string>>,
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
    equipment_codes: [exercise.equipment],
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
  const actor = await requireActor();
  const isPlatformOwner = actor.role === 'platform_owner';
  const workspaceRole =
    actor.role === 'workspace_owner' || actor.role === 'trainer';
  if (input.scope === 'global') {
    if (!isPlatformOwner) return { status: 'not_permitted' };
    const request = requestFor(input.draft, input.instructions);
    if (!request) return { status: 'invalid' };
    const mutation: CatalogMutation = {
      operationKey: input.operationKey,
      id: input.id,
      expectedVersion: input.expectedVersion,
      request,
    };
    return input.id
      ? versionExercise(mutation)
      : createExercise({ operationKey: input.operationKey, request });
  }

  if (
    input.scope !== 'workspace' ||
    !input.workspaceId ||
    (!isPlatformOwner && !workspaceRole) ||
    !authorize(actor, 'coaching_work', input.workspaceId)
  )
    return { status: 'not_permitted' };
  const request = requestFor(input.draft, input.instructions);
  if (!request) return { status: 'invalid' };
  return writeWorkspaceExercise({
    operationKey: input.operationKey,
    workspaceId: input.workspaceId,
    id: input.id,
    expectedVersion: input.expectedVersion,
    request,
  });
}
