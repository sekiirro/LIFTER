import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  removeExerciseAction,
  saveExerciseAction,
} from '../../app/(app)/exercise-library/actions';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  createExercise: vi.fn(),
  versionExercise: vi.fn(),
  writeWorkspaceExercise: vi.fn(),
  transitionExercise: vi.fn(),
  removeWorkspaceExercise: vi.fn(),
}));

vi.mock('../../lib/auth/actor', () => ({ requireActor: mocks.actor }));
vi.mock('../../lib/catalog/server', () => ({
  createExercise: mocks.createExercise,
  versionExercise: mocks.versionExercise,
  writeWorkspaceExercise: mocks.writeWorkspaceExercise,
  transitionExercise: mocks.transitionExercise,
  removeWorkspaceExercise: mocks.removeWorkspaceExercise,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const draft = {
  names: { ar: 'تمرين جديد', en: 'New exercise' },
  primaryMuscle: 'chest',
  secondaryMuscles: ['triceps'],
  equipment: 'barbell',
  warmupSets: '1',
  workingSets: '3',
  repsMode: 'range' as const,
  repsValue: '',
  repsMin: '8',
  repsMax: '12',
  restSeconds: '90',
  rir: '2',
  alternativeExerciseIds: [],
};

describe('production exercise authoring actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.actor.mockResolvedValue({
      userId: 'po',
      role: 'platform_owner',
      activeWorkspaceIds: [],
    });
    mocks.createExercise.mockResolvedValue({ status: 'ok', data: {} });
    mocks.versionExercise.mockResolvedValue({ status: 'ok', data: {} });
    mocks.writeWorkspaceExercise.mockResolvedValue({ status: 'ok', data: {} });
    mocks.transitionExercise.mockResolvedValue({ status: 'ok', data: {} });
    mocks.removeWorkspaceExercise.mockResolvedValue({ status: 'ok', data: {} });
  });

  it('writes a global exercise only through the PO create RPC with exact defaults', async () => {
    const result = await saveExerciseAction({
      draft,
      scope: 'global',
      workspaceId: null,
      operationKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(result).toEqual({ status: 'ok', data: {} });
    expect(mocks.createExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: '11111111-1111-4111-8111-111111111111',
        request: expect.objectContaining({
          name_ar: 'تمرين جديد',
          name_en: 'New exercise',
          primary_muscle_code: 'chest',
          equipment_codes: ['barbell'],
          defaults: {
            warmup_sets: 1,
            working_sets: 3,
            reps: { min: 8, max: 12 },
            rest_seconds: 90,
            rir: 2,
          },
        }),
      }),
    );
  });

  it('does not permit a Trainer to request global scope', async () => {
    mocks.actor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: ['ws'],
    });
    expect(
      await saveExerciseAction({
        draft,
        scope: 'global',
        workspaceId: null,
        operationKey: '11111111-1111-4111-8111-111111111111',
      }),
    ).toEqual({ status: 'not_permitted' });
    expect(mocks.createExercise).not.toHaveBeenCalled();
    expect(mocks.writeWorkspaceExercise).not.toHaveBeenCalled();
  });

  it('rejects text over the schema bound before calling a write RPC', async () => {
    const result = await saveExerciseAction({
      draft: { ...draft, names: { ar: draft.names.ar, en: 'X'.repeat(121) } },
      scope: 'global',
      workspaceId: null,
      operationKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(result).toEqual({ status: 'invalid' });
    expect(mocks.createExercise).not.toHaveBeenCalled();
  });

  it.each(['sales', 'client', null] as const)(
    'does not permit %s to author exercises',
    async (role) => {
      mocks.actor.mockResolvedValue({
        userId: 'reader',
        role,
        activeWorkspaceIds: ['ws'],
      });
      expect(
        await saveExerciseAction({
          draft,
          scope: 'workspace',
          workspaceId: 'ws',
          operationKey: '11111111-1111-4111-8111-111111111111',
        }),
      ).toEqual({ status: 'not_permitted' });
      expect(mocks.writeWorkspaceExercise).not.toHaveBeenCalled();
    },
  );

  it('binds workspace writes to authorized workspace and versions immutable entries', async () => {
    mocks.actor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: ['ws-a'],
    });
    const result = await saveExerciseAction({
      draft,
      scope: 'workspace',
      workspaceId: 'ws-a',
      id: 'exercise-a',
      expectedVersion: 2,
      operationKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.status).toBe('ok');
    expect(mocks.writeWorkspaceExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-a',
        id: 'exercise-a',
        expectedVersion: 2,
        operationKey: '11111111-1111-4111-8111-111111111111',
      }),
    );
  });

  it('carries current bilingual instructions into a new version when unchanged', async () => {
    await saveExerciseAction({
      draft,
      scope: 'global',
      workspaceId: null,
      operationKey: '11111111-1111-4111-8111-111111111111',
      id: 'exercise-a',
      expectedVersion: 2,
      instructions: { ar: 'تعليمات قائمة', en: 'Existing instructions' },
    } as Parameters<typeof saveExerciseAction>[0]);

    expect(mocks.versionExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          instructions_ar: 'تعليمات قائمة',
          instructions_en: 'Existing instructions',
        }),
      }),
    );
  });

  it('does not reveal or write to another workspace', async () => {
    mocks.actor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: ['ws-a'],
    });
    expect(
      await saveExerciseAction({
        draft,
        scope: 'workspace',
        workspaceId: 'ws-b',
        operationKey: '11111111-1111-4111-8111-111111111111',
      }),
    ).toEqual({ status: 'not_permitted' });
    expect(mocks.writeWorkspaceExercise).not.toHaveBeenCalled();
  });
});

describe('Exercise Detail Remove action authorization', () => {
  const input = {
    scope: 'global' as const,
    workspaceId: null,
    exerciseId: '55555555-5555-4555-8555-555555555555',
    expectedRevision: 0,
    operationKey: '11111111-1111-4111-8111-111111111111',
  };
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.actor.mockResolvedValue({
      userId: 'po',
      role: 'platform_owner',
      activeWorkspaceIds: [],
    });
    mocks.transitionExercise.mockResolvedValue({ status: 'ok', data: {} });
    mocks.removeWorkspaceExercise.mockResolvedValue({ status: 'ok', data: {} });
  });

  it('allows only the PO to remove a global exercise and forwards its exact revision', async () => {
    await expect(removeExerciseAction(input)).resolves.toMatchObject({
      status: 'ok',
    });
    expect(mocks.transitionExercise).toHaveBeenCalledWith({
      id: input.exerciseId,
      expectedVersion: 0,
      transition: 'remove',
      operationKey: input.operationKey,
    });
    mocks.actor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: ['ws'],
    });
    mocks.transitionExercise.mockClear();
    await expect(removeExerciseAction(input)).resolves.toEqual({
      status: 'not_permitted',
    });
    expect(mocks.transitionExercise).not.toHaveBeenCalled();
  });

  it('allows PO and own-workspace WO/Trainer, and denies foreign/Sales workspace removal', async () => {
    const workspaceInput = {
      ...input,
      scope: 'workspace' as const,
      workspaceId: '22222222-2222-4222-8222-222222222222',
    };
    await removeExerciseAction(workspaceInput);
    expect(mocks.removeWorkspaceExercise).toHaveBeenCalledWith({
      id: input.exerciseId,
      workspaceId: workspaceInput.workspaceId,
      expectedVersion: 0,
      operationKey: input.operationKey,
    });
    for (const role of ['workspace_owner', 'trainer'] as const) {
      mocks.actor.mockResolvedValue({
        userId: role,
        role,
        activeWorkspaceIds: [workspaceInput.workspaceId],
      });
      await expect(removeExerciseAction(workspaceInput)).resolves.toMatchObject(
        { status: 'ok' },
      );
    }
    mocks.actor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: ['33333333-3333-4333-8333-333333333333'],
    });
    await expect(removeExerciseAction(workspaceInput)).resolves.toEqual({
      status: 'not_permitted',
    });
    mocks.actor.mockResolvedValue({
      userId: 'sales',
      role: 'sales',
      activeWorkspaceIds: [workspaceInput.workspaceId],
    });
    await expect(removeExerciseAction(workspaceInput)).resolves.toEqual({
      status: 'not_permitted',
    });
  });
});
