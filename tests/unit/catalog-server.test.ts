import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCatalogServer,
  type CatalogDependencies,
} from '../../lib/catalog/server';
import type { Actor } from '../../lib/auth/authorize';

vi.mock('server-only', () => ({}));
const key = '11111111-1111-4111-8111-111111111111';
const ws = '22222222-2222-4222-8222-222222222222';
const rpc = vi.fn();
const from = vi.fn();
let currentActor: Actor | null;
const client = { rpc, auth: {}, from } as never;
const deps: CatalogDependencies = {
  session: async () => client,
  actor: async () => currentActor,
};
const catalog = () => createCatalogServer(deps);

beforeEach(() => {
  vi.clearAllMocks();
  currentActor = {
    userId: '33333333-3333-4333-8333-333333333333',
    role: 'platform_owner',
    activeWorkspaceIds: [],
  };
  rpc.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('catalog server authorization and RPC boundary', () => {
  it('authorizes duplicate candidate lookups through the catalog wall and forwards only identity inputs', async () => {
    const input = {
      name: 'Rice',
      language: 'en' as const,
      basis: 'g' as const,
      productIdentity: 'rice',
      preparationIdentity: 'boiled',
      weighingState: 'cooked' as const,
      kcal: 130,
    };
    currentActor = {
      userId: 'actor',
      role: 'trainer',
      activeWorkspaceIds: [ws],
    };
    expect(await catalog().foodDuplicateCandidates(input)).toEqual({
      status: 'ok',
      data: { ok: true },
    });
    expect(rpc).toHaveBeenCalledWith('catalog_food_duplicate_candidates', {
      p_name: 'Rice',
      p_language: 'en',
      p_basis: 'g',
      p_product_identity: 'rice',
      p_preparation_identity: 'boiled',
      p_weighing_state: 'cooked',
      p_kcal: 130,
    });
    currentActor = { userId: 'actor', role: 'sales', activeWorkspaceIds: [ws] };
    rpc.mockClear();
    expect(await catalog().foodDuplicateCandidates(input)).toEqual({
      status: 'not_permitted',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('lists only coaching-authorized workspaces for staff and all visible workspaces for PO', async () => {
    const otherWorkspace = '44444444-4444-4444-8444-444444444444';
    const order = vi.fn().mockResolvedValue({
      data: [
        { id: ws, name: 'Authorized' },
        { id: otherWorkspace, name: 'Foreign' },
      ],
      error: null,
    });
    const select = vi.fn(() => ({ order }));
    from.mockReturnValue({ select });
    currentActor = {
      userId: 'actor',
      role: 'trainer',
      activeWorkspaceIds: [ws],
    };
    expect(await catalog().authoringWorkspaces()).toEqual({
      status: 'ok',
      data: [{ id: ws, name: 'Authorized' }],
    });
    expect(select).toHaveBeenCalledWith('id,name');
    expect(order).toHaveBeenCalledWith('name');
    currentActor = {
      userId: 'actor',
      role: 'platform_owner',
      activeWorkspaceIds: [],
    };
    expect(await catalog().authoringWorkspaces()).toEqual({
      status: 'ok',
      data: [
        { id: ws, name: 'Authorized' },
        { id: otherWorkspace, name: 'Foreign' },
      ],
    });
  });

  it('binds variation writes to current staff membership and permits PO selection', async () => {
    const input = {
      operationKey: key,
      workspaceId: ws,
      id: '55555555-5555-4555-8555-555555555555',
      request: { video_url: 'https://youtu.be/abcdefghijk' },
    };
    currentActor = { userId: 'actor', role: 'trainer', activeWorkspaceIds: [] };
    rpc.mockClear();
    expect(await catalog().writeVariation(input)).toEqual({
      status: 'not_permitted',
    });
    expect(rpc).not.toHaveBeenCalled();
    currentActor = {
      userId: 'owner',
      role: 'platform_owner',
      activeWorkspaceIds: [],
    };
    expect(await catalog().writeVariation(input)).toMatchObject({
      status: 'ok',
    });
    expect(rpc).toHaveBeenCalledWith('catalog_write_variation', {
      p_workspace_id: ws,
      p_exercise_id: input.id,
      p_expected_version: null,
      p_operation_key: key,
      p_request: input.request,
    });
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['whitespace-only', '   '],
  ])(
    'requires an explicit non-empty workspace for PO variation writes (%s)',
    async (_kind, workspaceId) => {
      currentActor = {
        userId: 'owner',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      };
      const result = await catalog().writeVariation({
        operationKey: key,
        workspaceId,
        id: ws,
        request: { video_url: 'https://youtu.be/abcdefghijk' },
      });
      expect(result).toEqual({ status: 'not_permitted' });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it('forwards canonical exercise filter keys and value shapes to the session RPC', async () => {
    const filters = {
      primary_muscle_code: 'chest',
      equipment_codes: ['barbell', 'cable'],
    };
    await catalog().search({ kind: 'exercise', query: '', filters });
    expect(rpc).toHaveBeenCalledWith('catalog_search', {
      kind: 'exercise',
      query: '',
      filters,
      cursor: null,
      workspace_id: null,
    });
  });

  it('applies the role parity fixture to search and writes before calling RPC', async () => {
    const cases = [
      ['platform_owner', true],
      ['workspace_owner', true],
      ['trainer', true],
      ['sales', false],
      [null, false],
    ] as const;
    for (const [role, allowed] of cases) {
      currentActor = {
        userId: 'actor',
        role,
        activeWorkspaceIds: role === 'platform_owner' ? [] : [ws],
      };
      rpc.mockClear();
      const result = await catalog().search({ kind: 'exercise', query: '' });
      expect(rpc).toHaveBeenCalledTimes(allowed ? 1 : 0);
      expect(result.status).toBe(allowed ? 'ok' : 'not_permitted');
    }
    currentActor = {
      userId: 'actor',
      role: 'platform_owner',
      activeWorkspaceIds: [],
    };
    rpc.mockClear();
    const writes = [
      catalog().createExercise({ operationKey: key, request: {} }),
      catalog().versionExercise({
        operationKey: key,
        id: ws,
        expectedVersion: 1,
        request: {},
      }),
      catalog().transitionExercise({
        operationKey: key,
        id: ws,
        expectedVersion: 0,
        transition: 'remove',
      }),
      catalog().mergeExercise({
        operationKey: key,
        id: ws,
        targetId: ws,
        expectedVersion: 0,
      }),
      catalog().writeWorkspaceExercise({
        operationKey: key,
        workspaceId: ws,
        request: {},
      }),
      catalog().writeVariation({
        operationKey: key,
        workspaceId: ws,
        id: ws,
        request: {},
      }),
      catalog().transitionVariation({
        operationKey: key,
        workspaceId: ws,
        id: ws,
        expectedVersion: 1,
        transition: 'remove',
      }),
      catalog().createFood({ operationKey: key, workspaceId: ws, request: {} }),
      catalog().versionFood({
        operationKey: key,
        id: ws,
        expectedVersion: 1,
        request: {},
      }),
      catalog().transitionFood({
        operationKey: key,
        id: ws,
        expectedVersion: 0,
        transition: 'remove',
      }),
      catalog().mergeFood({
        operationKey: key,
        id: ws,
        targetId: ws,
        expectedVersion: 0,
      }),
    ];
    await Promise.all(writes);
    expect(rpc).toHaveBeenCalledTimes(11);
  });

  it('denies non-PO roles before every PO-only mutation RPC', async () => {
    const deniedRoles = ['workspace_owner', 'trainer', 'sales', null] as const;
    for (const role of deniedRoles) {
      currentActor = { userId: 'actor', role, activeWorkspaceIds: [ws] };
      rpc.mockClear();
      const actions = catalog();
      const results = await Promise.all([
        actions.createExercise({ operationKey: key, request: {} }),
        actions.versionExercise({
          operationKey: key,
          id: ws,
          expectedVersion: 1,
          request: {},
        }),
        actions.transitionExercise({
          operationKey: key,
          id: ws,
          expectedVersion: 0,
          transition: 'remove',
        }),
        actions.mergeExercise({
          operationKey: key,
          id: ws,
          targetId: 'target',
          expectedVersion: 0,
        }),
        actions.transitionFood({
          operationKey: key,
          id: ws,
          expectedVersion: 0,
          transition: 'remove',
        }),
        actions.mergeFood({
          operationKey: key,
          id: ws,
          targetId: 'target',
          expectedVersion: 0,
        }),
      ]);
      expect(results).toEqual(
        Array.from({ length: 6 }, () => ({ status: 'not_permitted' })),
      );
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it('authorizes and explicitly scopes workspace exercise detail and removal', async () => {
    const exerciseId = '55555555-5555-4555-8555-555555555555';
    currentActor = {
      userId: 'po',
      role: 'platform_owner',
      activeWorkspaceIds: [],
    };
    await catalog().exerciseDetail({
      exerciseId,
      scope: 'workspace',
      workspaceId: ws,
    });
    expect(rpc).toHaveBeenLastCalledWith('catalog_workspace_exercise_detail', {
      p_exercise_id: exerciseId,
      p_workspace_id: ws,
    });
    await catalog().removeWorkspaceExercise({
      operationKey: key,
      workspaceId: ws,
      id: exerciseId,
      expectedVersion: 3,
    });
    expect(rpc).toHaveBeenLastCalledWith('catalog_remove_workspace_exercise', {
      p_workspace_id: ws,
      p_exercise_id: exerciseId,
      p_expected_revision: 3,
      p_operation_key: key,
    });

    currentActor = {
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [ws],
    };
    await catalog().exerciseDetail({
      exerciseId,
      scope: 'workspace',
      workspaceId: ws,
    });
    await catalog().removeWorkspaceExercise({
      operationKey: key,
      workspaceId: ws,
      id: exerciseId,
      expectedVersion: 0,
    });
    currentActor = {
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [ws],
    };
    rpc.mockClear();
    expect(
      await catalog().exerciseDetail({
        exerciseId,
        scope: 'workspace',
        workspaceId: 'foreign',
      }),
    ).toEqual({ status: 'not_permitted' });
    expect(
      await catalog().removeWorkspaceExercise({
        operationKey: key,
        workspaceId: 'foreign',
        id: exerciseId,
        expectedVersion: 0,
      }),
    ).toEqual({ status: 'not_permitted' });
    currentActor = { userId: 'sales', role: 'sales', activeWorkspaceIds: [ws] };
    expect(
      await catalog().removeWorkspaceExercise({
        operationKey: key,
        workspaceId: ws,
        id: exerciseId,
        expectedVersion: 0,
      }),
    ).toEqual({ status: 'not_permitted' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks an unassigned workspace and a revoked membership before RPC', async () => {
    currentActor = {
      userId: 'actor',
      role: 'trainer',
      activeWorkspaceIds: [ws],
    };
    const result = await catalog().writeVariation({
      operationKey: key,
      workspaceId: 'foreign',
      id: ws,
      request: {},
    });
    expect(result).toEqual({ status: 'not_permitted' });
    expect(rpc).not.toHaveBeenCalled();
    currentActor = { ...currentActor, activeWorkspaceIds: [] };
    expect(await catalog().search({ kind: 'exercise', query: '' })).toEqual({
      status: 'not_permitted',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '   '])(
    'requires an explicit non-empty workspace for PO workspace exercise removal (%s)',
    async (workspaceId) => {
      rpc.mockClear();
      const result = await catalog().removeWorkspaceExercise({
        operationKey: key,
        workspaceId,
        id: '55555555-5555-4555-8555-555555555555',
        expectedVersion: 0,
      });
      expect(result).toEqual({ status: 'not_permitted' });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it('checks food creator authorization through a boolean, non-disclosing session RPC', async () => {
    currentActor = {
      userId: 'actor',
      role: 'trainer',
      activeWorkspaceIds: [ws],
    };
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(
      await catalog().versionFood({
        operationKey: key,
        id: ws,
        expectedVersion: 1,
        request: {},
      }),
    ).toEqual({ status: 'not_permitted' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('catalog_can_version_food', {
      p_food_id: ws,
    });
    rpc.mockResolvedValueOnce({ data: true, error: null });
    rpc.mockResolvedValueOnce({ data: { id: ws }, error: null });
    expect(
      await catalog().versionFood({
        operationKey: key,
        id: ws,
        expectedVersion: 1,
        request: {},
      }),
    ).toEqual({ status: 'ok', data: { id: ws } });
    expect(rpc).toHaveBeenLastCalledWith('catalog_version_food', {
      p_food_id: ws,
      p_expected_version: 1,
      p_operation_key: key,
      p_request: {},
      p_alternatives: [],
    });
  });

  it('requires a caller supplied UUIDv4 and forwards it to every mutation RPC', async () => {
    const calls = [
      catalog().createExercise({ operationKey: key, request: {} }),
      catalog().versionExercise({
        operationKey: key,
        id: ws,
        expectedVersion: 1,
        request: {},
      }),
      catalog().transitionExercise({
        operationKey: key,
        id: ws,
        expectedVersion: 0,
        transition: 'remove',
      }),
      catalog().mergeExercise({
        operationKey: key,
        id: ws,
        targetId: 'target',
        expectedVersion: 0,
      }),
      catalog().writeWorkspaceExercise({
        operationKey: key,
        workspaceId: ws,
        request: {},
      }),
      catalog().writeVariation({
        operationKey: key,
        workspaceId: ws,
        id: ws,
        request: {},
      }),
      catalog().transitionVariation({
        operationKey: key,
        workspaceId: ws,
        id: ws,
        expectedVersion: 1,
        transition: 'remove',
      }),
      catalog().createFood({ operationKey: key, request: {} }),
      catalog().versionFood({
        operationKey: key,
        id: ws,
        expectedVersion: 1,
        request: {},
      }),
      catalog().transitionFood({
        operationKey: key,
        id: ws,
        expectedVersion: 0,
        transition: 'remove',
      }),
      catalog().mergeFood({
        operationKey: key,
        id: ws,
        targetId: 'target',
        expectedVersion: 0,
      }),
    ];
    await Promise.all(calls);
    expect(rpc).toHaveBeenCalledTimes(11);
    for (const [, args] of rpc.mock.calls)
      expect(args.p_operation_key).toBe(key);
    rpc.mockClear();
    expect(
      await catalog().createExercise({
        operationKey: 'not-a-uuid',
        request: {},
      }),
    ).toEqual({ status: 'invalid' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('forwards merge revision names and returns a successful PO merge', async () => {
    rpc.mockResolvedValueOnce({
      data: { exercise_id: ws, superseded_by: 'target' },
      error: null,
    });
    await expect(
      catalog().mergeExercise({
        operationKey: key,
        id: ws,
        targetId: 'target',
        expectedVersion: 2,
      }),
    ).resolves.toEqual({
      status: 'ok',
      data: { exercise_id: ws, superseded_by: 'target' },
    });
    expect(rpc).toHaveBeenCalledWith('catalog_merge_exercise', {
      p_source_id: ws,
      p_target_id: 'target',
      p_expected_source_revision: 2,
      p_operation_key: key,
    });
  });

  it('forwards typed food alternatives through create and version RPCs', async () => {
    const food = {
      operationKey: key,
      id: ws,
      expectedVersion: 1,
      request: { name_en: 'source' },
      alternatives: [
        {
          foodId: '44444444-4444-4444-8444-444444444444',
          version: 2,
          sourcePortion: 100,
          alternativePortion: 150,
        },
      ],
    };
    await catalog().createFood({ ...food, workspaceId: ws });
    expect(rpc).toHaveBeenLastCalledWith('catalog_create_food', {
      p_operation_key: key,
      p_origin_workspace_id: ws,
      p_request: food.request,
      p_alternatives: [
        {
          alternative_food_id: '44444444-4444-4444-8444-444444444444',
          alternative_version: 2,
          source_portion: 100,
          alternative_portion: 150,
        },
      ],
    });
    await catalog().versionFood(food);
    expect(rpc).toHaveBeenLastCalledWith('catalog_version_food', {
      p_food_id: ws,
      p_expected_version: 1,
      p_operation_key: key,
      p_request: food.request,
      p_alternatives: [
        {
          alternative_food_id: '44444444-4444-4444-8444-444444444444',
          alternative_version: 2,
          source_portion: 100,
          alternative_portion: 150,
        },
      ],
    });
  });

  it('maps authorization and missing rows identically and never returns raw database messages', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'secret foreign row' },
    });
    expect(await catalog().search({ kind: 'exercise', query: '' })).toEqual({
      status: 'not_permitted',
    });
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0002', message: 'secret missing row' },
    });
    expect(await catalog().search({ kind: 'exercise', query: '' })).toEqual({
      status: 'not_permitted',
    });
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'raw confidential detail' },
    });
    const result = await catalog().createExercise({
      operationKey: key,
      request: {},
    });
    expect(result).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(result)).not.toContain('raw confidential detail');
  });

  it('maps quota 23514 before generic conflicts while preserving other conflicts', async () => {
    for (const message of [
      'catalog_food_creator_limit',
      'catalog_food_platform_limit',
      'catalog_food_active_limit',
    ]) {
      for (const code of ['23514', 'P0001']) {
        rpc.mockResolvedValueOnce({ data: null, error: { code, message } });
        expect(
          await catalog().createFood({ operationKey: key, request: {} }),
        ).toEqual({ status: 'limit' });
      }
    }
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: '23514',
        message: 'catalog_food_near_match_confirmation_required',
      },
    });
    expect(
      await catalog().createFood({ operationKey: key, request: {} }),
    ).toEqual({ status: 'conflict' });
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'catalog_food_creator_limit' },
    });
    expect(
      await catalog().createFood({ operationKey: key, request: {} }),
    ).toEqual({ status: 'conflict' });
  });
});
