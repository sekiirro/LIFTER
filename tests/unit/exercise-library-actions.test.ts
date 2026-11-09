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
const validExerciseId = '55555555-5555-4555-8555-555555555555';
const validWorkspaceId = '22222222-2222-4222-8222-222222222222';
const foreignWorkspaceId = '33333333-3333-4333-8333-333333333333';

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
        activeWorkspaceIds: [validWorkspaceId],
      });
      expect(
        await saveExerciseAction({
          draft,
          scope: 'workspace',
          workspaceId: validWorkspaceId,
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
      activeWorkspaceIds: [validWorkspaceId],
    });
    const result = await saveExerciseAction({
      draft,
      scope: 'workspace',
      workspaceId: validWorkspaceId,
      id: validExerciseId,
      expectedVersion: 2,
      operationKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.status).toBe('ok');
    expect(mocks.writeWorkspaceExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: validWorkspaceId,
        id: validExerciseId,
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
      id: validExerciseId,
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

  it('preserves every equipment code when creating a new version from a multi-equipment exercise', async () => {
    await saveExerciseAction({
      draft,
      scope: 'global',
      workspaceId: null,
      operationKey: '11111111-1111-4111-8111-111111111111',
      id: '55555555-5555-4555-8555-555555555555',
      expectedVersion: 2,
      equipmentCodes: ['barbell', 'cable'],
    } as Parameters<typeof saveExerciseAction>[0]);
    expect(mocks.versionExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          equipment_codes: ['barbell', 'cable'],
        }),
      }),
    );
  });

  it('uses the edited equipment selection when it differs from stored equipment codes', async () => {
    await saveExerciseAction({
      draft: { ...draft, equipment: 'dumbbell' },
      scope: 'global',
      workspaceId: null,
      operationKey: '11111111-1111-4111-8111-111111111111',
      id: '55555555-5555-4555-8555-555555555555',
      expectedVersion: 2,
      equipmentCodes: ['barbell', 'cable'],
    } as Parameters<typeof saveExerciseAction>[0]);
    expect(mocks.versionExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          equipment_codes: ['dumbbell'],
        }),
      }),
    );
  });

  it('returns invalid for malformed save and remove payloads without throwing or calling an RPC', async () => {
    for (const payload of [
      null,
      {},
      { draft: { names: { ar: 'x', en: 'y' } } },
    ])
      await expect(saveExerciseAction(payload as never)).resolves.toEqual({
        status: 'invalid',
      });
    for (const payload of [
      null,
      {},
      { scope: 'workspace', expectedRevision: 'bad' },
    ])
      await expect(removeExerciseAction(payload as never)).resolves.toEqual({
        status: 'invalid',
      });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.createExercise).not.toHaveBeenCalled();
    expect(mocks.versionExercise).not.toHaveBeenCalled();
    expect(mocks.transitionExercise).not.toHaveBeenCalled();
    expect(mocks.removeWorkspaceExercise).not.toHaveBeenCalled();
  });

  it('returns invalid for malformed exercise/workspace ids without calling an RPC', async () => {
    const base = {
      draft,
      scope: 'global' as const,
      workspaceId: null,
      operationKey: '11111111-1111-4111-8111-111111111111',
    };
    expect(
      await saveExerciseAction({ ...base, id: 'not-a-uuid' } as never),
    ).toEqual({ status: 'invalid' });
    expect(
      await saveExerciseAction({
        ...base,
        scope: 'workspace',
        workspaceId: 'not-a-uuid',
      } as never),
    ).toEqual({ status: 'invalid' });
    expect(
      await removeExerciseAction({
        scope: 'global',
        workspaceId: null,
        exerciseId: 'not-a-uuid',
        expectedRevision: 0,
        operationKey: '11111111-1111-4111-8111-111111111111',
      }),
    ).toEqual({ status: 'invalid' });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.createExercise).not.toHaveBeenCalled();
    expect(mocks.versionExercise).not.toHaveBeenCalled();
    expect(mocks.transitionExercise).not.toHaveBeenCalled();
    expect(mocks.removeWorkspaceExercise).not.toHaveBeenCalled();
  });

  it('revalidates library and edited detail paths only after successful exercise mutations', async () => {
    const { revalidatePath: revalidate } = await import('next/cache');
    vi.mocked(revalidate).mockClear();
    const id = '55555555-5555-4555-8555-555555555555';
    mocks.versionExercise.mockResolvedValueOnce({ status: 'conflict' });
    await saveExerciseAction({
      draft,
      scope: 'global',
      workspaceId: null,
      operationKey: '11111111-1111-4111-8111-111111111111',
      id,
      expectedVersion: 2,
    });
    expect(revalidate).not.toHaveBeenCalled();
    await saveExerciseAction({
      draft,
      scope: 'global',
      workspaceId: null,
      operationKey: '11111111-1111-4111-8111-111111111111',
      id,
      expectedVersion: 2,
    });
    expect(revalidate).toHaveBeenCalledWith('/exercise-library');
    expect(revalidate).toHaveBeenCalledWith(`/exercise-library/${id}`);
    vi.mocked(revalidate).mockClear();
    const removeInput = {
      scope: 'global' as const,
      workspaceId: null,
      exerciseId: id,
      expectedRevision: 0,
      operationKey: '11111111-1111-4111-8111-111111111111',
    };
    mocks.transitionExercise.mockResolvedValueOnce({ status: 'unavailable' });
    await removeExerciseAction(removeInput);
    expect(revalidate).not.toHaveBeenCalled();
    await removeExerciseAction(removeInput);
    expect(revalidate).toHaveBeenCalledWith('/exercise-library');
    expect(revalidate).toHaveBeenCalledWith(`/exercise-library/${id}`);
    vi.mocked(revalidate).mockClear();
    mocks.actor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [validWorkspaceId],
    });
    mocks.writeWorkspaceExercise.mockResolvedValueOnce({ status: 'conflict' });
    const workspaceEdit = {
      draft,
      scope: 'workspace' as const,
      workspaceId: validWorkspaceId,
      operationKey: '11111111-1111-4111-8111-111111111111',
      id: validExerciseId,
      expectedVersion: 2,
    };
    await saveExerciseAction(workspaceEdit);
    expect(revalidate).not.toHaveBeenCalled();
    await saveExerciseAction(workspaceEdit);
    expect(revalidate).toHaveBeenCalledWith('/exercise-library');
    expect(revalidate).toHaveBeenCalledWith(`/exercise-library/${id}`);
  });

  it('does not reveal or write to another workspace', async () => {
    mocks.actor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [validWorkspaceId],
    });
    expect(
      await saveExerciseAction({
        draft,
        scope: 'workspace',
        workspaceId: foreignWorkspaceId,
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
