import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetExerciseOverrideFieldAction,
  saveExerciseOverrideAction,
} from '../../app/(app)/exercise-library/actions';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  writeExerciseOverride: vi.fn(),
}));

vi.mock('../../lib/auth/actor', () => ({ requireActor: mocks.actor }));
vi.mock('../../lib/catalog/server', () => ({
  writeExerciseOverride: mocks.writeExerciseOverride,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const base = {
  workspaceId: '22222222-2222-4222-8222-222222222222',
  exerciseId: '55555555-5555-4555-8555-555555555555',
  expectedVersion: 3,
  operationKey: '11111111-1111-4111-8111-111111111111',
};

describe('workspace exercise override actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.actor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [base.workspaceId],
    });
    mocks.writeExerciseOverride.mockResolvedValue({ status: 'ok', data: {} });
  });

  it('writes the touched fields through the override RPC with CAS', async () => {
    await expect(
      saveExerciseOverrideAction({
        ...base,
        request: { description: 'Local description', default_rir: 3 },
      }),
    ).resolves.toEqual({ status: 'ok', data: {} });
    expect(mocks.writeExerciseOverride).toHaveBeenCalledWith({
      workspaceId: base.workspaceId,
      id: base.exerciseId,
      expectedVersion: 3,
      operationKey: base.operationKey,
      request: { description: 'Local description', default_rir: 3 },
    });
  });

  it.each([
    ['name', { name_en: null }],
    ['description', { description: null }],
    ['notes', { notes: null }],
    ['video', { video_url: null }],
    ['alternatives', { alternatives: null }],
    ['default_rest_time', { default_rest_time: null }],
    ['default_rir', { default_rir: null }],
    ['default_reps', { default_reps: null }],
  ] as const)('resets %s to Global by writing null', async (field, request) => {
    await expect(
      resetExerciseOverrideFieldAction({ ...base, field }),
    ).resolves.toEqual({ status: 'ok', data: {} });
    expect(mocks.writeExerciseOverride).toHaveBeenCalledWith(
      expect.objectContaining({ request }),
    );
  });

  it('rejects unknown request keys and malformed ids before the RPC', async () => {
    await expect(
      saveExerciseOverrideAction({
        ...base,
        request: { primary_muscle_code: 'chest' },
      }),
    ).resolves.toEqual({ status: 'invalid' });
    await expect(
      saveExerciseOverrideAction({
        ...base,
        exerciseId: 'not-a-uuid',
        request: { description: 'x' },
      }),
    ).resolves.toEqual({ status: 'invalid' });
    await expect(
      resetExerciseOverrideFieldAction({
        ...base,
        field: 'taxonomy',
      } as never),
    ).resolves.toEqual({ status: 'invalid' });
    expect(mocks.writeExerciseOverride).not.toHaveBeenCalled();
  });

  it('denies Sales and foreign workspaces', async () => {
    mocks.actor.mockResolvedValue({
      userId: 'sales',
      role: 'sales',
      activeWorkspaceIds: [base.workspaceId],
    });
    await expect(
      saveExerciseOverrideAction({
        ...base,
        request: { description: 'x' },
      }),
    ).resolves.toEqual({ status: 'not_permitted' });
    mocks.actor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: ['33333333-3333-4333-8333-333333333333'],
    });
    await expect(
      resetExerciseOverrideFieldAction({ ...base, field: 'notes' }),
    ).resolves.toEqual({ status: 'not_permitted' });
    expect(mocks.writeExerciseOverride).not.toHaveBeenCalled();
  });
});
