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
      p_expected_version: undefined,
      p_operation_key: key,
      p_request: input.request,
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
});
