import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCatalogServer,
  type CatalogDependencies,
} from '../../lib/catalog/server';
import type { Actor } from '../../lib/auth/authorize';

vi.mock('server-only', () => ({}));
const key = '11111111-1111-4111-8111-111111111111';
const ws = '22222222-2222-4222-8222-222222222222';
const targetId = '44444444-4444-4444-8444-444444444444';
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
  from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  }));
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

  it('routes variation compatibility writes through F16 exercise overrides', async () => {
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
    expect(rpc).toHaveBeenCalledWith('catalog_write_exercise_override', {
      p_workspace_id: ws,
      p_exercise_id: input.id,
      p_expected_version: null,
      p_operation_key: key,
      p_request: input.request,
    });
  });

  it('preserves blank Notes and Video resets without clearing omitted fields on variation-only writes', async () => {
    currentActor = {
      userId: 'owner',
      role: 'platform_owner',
      activeWorkspaceIds: [],
    };
    await catalog().writeVariation({
      operationKey: key,
      workspaceId: ws,
      id: '55555555-5555-4555-8555-555555555555',
      request: { note: null, video_url: null },
    });
    expect(rpc).toHaveBeenCalledWith('catalog_write_exercise_override', {
      p_workspace_id: ws,
      p_exercise_id: '55555555-5555-4555-8555-555555555555',
      p_expected_version: null,
      p_operation_key: key,
      p_request: { video_url: null, notes: null },
    });

    rpc.mockClear();
    await catalog().writeVariation({
      operationKey: key,
      workspaceId: ws,
      id: '55555555-5555-4555-8555-555555555555',
      request: { note: '   ' },
    });
    expect(rpc).toHaveBeenCalledWith(
      'catalog_write_exercise_override',
      expect.objectContaining({ p_request: { notes: null } }),
    );
  });

  it('reads only an authorized workspace override version', async () => {
    currentActor = {
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [],
    };
    expect(
      await catalog().exerciseOverrideVersion({
        workspaceId: ws,
        exerciseId: targetId,
      }),
    ).toEqual({ status: 'not_permitted' });
    expect(from).not.toHaveBeenCalled();

    currentActor = {
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [ws],
    };
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { current_version: 4 },
              error: null,
            }),
          }),
        }),
      }),
    });
    expect(
      await catalog().exerciseOverrideVersion({
        workspaceId: ws,
        exerciseId: targetId,
      }),
    ).toEqual({ status: 'ok', data: { version: 4 } });
  });

  it('reads variation values and revision through one authorized workspace RPC', async () => {
    currentActor = {
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [],
    };
    expect(
      await catalog().exerciseVariationEditorState({
        workspaceId: ws,
        exerciseId: targetId,
      }),
    ).toEqual({ status: 'not_permitted' });
    expect(rpc).not.toHaveBeenCalled();

    currentActor = {
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [ws],
    };
    rpc.mockResolvedValue({
      data: [
        {
          version: 5,
          video_url: 'https://youtu.be/abcdefghijk',
          notes: 'Current workspace note',
        },
      ],
      error: null,
    });
    expect(
      await catalog().exerciseVariationEditorState({
        workspaceId: ws,
        exerciseId: targetId,
      }),
    ).toEqual({
      status: 'ok',
      data: {
        version: 5,
        videoUrl: 'https://youtu.be/abcdefghijk',
        note: 'Current workspace note',
      },
    });
    expect(rpc).toHaveBeenCalledWith(
      'catalog_workspace_variation_editor_state',
      { p_workspace_id: ws, p_exercise_id: targetId },
    );
  });

  it('keeps a null expected version stable for variation operation-key replays', async () => {
    currentActor = {
      userId: 'owner',
      role: 'platform_owner',
      activeWorkspaceIds: [],
    };
    await catalog().writeVariation({
      operationKey: key,
      workspaceId: ws,
      id: '55555555-5555-4555-8555-555555555555',
      request: { video_url: 'https://youtu.be/abcdefghijk' },
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      'catalog_write_exercise_override',
      expect.objectContaining({ p_expected_version: null }),
    );
  });

  it('rejects unsupported variation restore before writing', async () => {
    currentActor = {
      userId: 'actor',
      role: 'trainer',
      activeWorkspaceIds: [ws],
    };
    expect(
      await catalog().transitionVariation({
        operationKey: key,
        workspaceId: ws,
        id: '55555555-5555-4555-8555-555555555555',
        expectedVersion: 1,
        transition: 'restore',
      }),
    ).toEqual({ status: 'not_permitted' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects over-limit Notes and Video references in server normalization', async () => {
    currentActor = {
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [ws],
    };
    for (const request of [
      { notes: 'x'.repeat(2001) },
      { video_url: 'https://youtu.be/abcdefghijk?x='.padEnd(2001, 'a') },
    ]) {
      rpc.mockClear();
      await expect(
        catalog().writeExerciseOverride({
          operationKey: key,
          workspaceId: ws,
          id: targetId,
          expectedVersion: 0,
          request,
        }),
      ).resolves.toEqual({ status: 'invalid' });
      expect(rpc).not.toHaveBeenCalled();
    }
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

  it('forwards the merged workspace library request with one opaque cursor', async () => {
    await catalog().workspaceLibrary({
      workspaceId: ws,
      query: 'press',
      filters: { primary_muscle_code: 'chest' },
      cursor: 'abc123',
      limit: 21,
    });
    expect(rpc).toHaveBeenCalledWith('catalog_workspace_library', {
      p_workspace_id: ws,
      p_query: 'press',
      p_filters: { primary_muscle_code: 'chest' },
      p_cursor: 'abc123',
      p_page_size: 21,
    });
  });

  it('returns one bounded Alternative page with an opaque keyset cursor', async () => {
    currentActor = {
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [ws],
    };
    const row = (index: number) => ({
      result_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      result_payload: { name_en: `Option ${index}` },
    });
    rpc.mockResolvedValueOnce({
      data: Array.from({ length: 50 }, (_, index) => row(index + 1)),
      error: null,
    });
    const result = await catalog().alternativePickerOptions({
      workspaceId: ws,
      query: 'option',
      selectedIds: [],
    });
    expect(result).toMatchObject({
      status: 'ok',
      data: {
        options: expect.arrayContaining([
          { id: row(1).result_id, kind: 'global', names: { en: 'Option 1' } },
        ]),
        nextCursor: `g:${row(50).result_id}`,
      },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('uses authorized keyset search and explicitly fetches selected Alternative ids', async () => {
    currentActor = {
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [ws],
    };
    const candidateId = '55555555-5555-4555-8555-555555555555';
    rpc.mockImplementation(
      async (name: string, args: Record<string, unknown>) => {
        if (name === 'catalog_search') {
          if (args.kind === 'exercise')
            return {
              data: [
                {
                  result_id: candidateId,
                  result_payload: { name_en: 'Current result' },
                },
              ],
              error: null,
            };
          return { data: [], error: null };
        }
        if (name === 'catalog_exercise_detail')
          return {
            data: [
              {
                exercise_id: targetId,
                name_en: 'Selected outside this query',
                name_ar: null,
                payload: {},
              },
            ],
            error: null,
          };
        return { data: null, error: { code: '42501' } };
      },
    );

    const result = await catalog().alternativePickerOptions({
      workspaceId: ws,
      query: 'current',
      selectedIds: [`g:${targetId}`],
    });
    expect(result).toEqual({
      status: 'ok',
      data: {
        options: [
          {
            id: targetId,
            kind: 'global',
            names: { en: 'Selected outside this query' },
          },
          { id: candidateId, kind: 'global', names: { en: 'Current result' } },
        ],
        nextCursor: null,
      },
    });
    expect(rpc).toHaveBeenCalledWith(
      'catalog_search',
      expect.objectContaining({
        kind: 'exercise',
        query: 'current',
        filters: { page_size: 50 },
        cursor: null,
        workspace_id: ws,
      }),
    );
    expect(rpc).toHaveBeenCalledWith('catalog_exercise_detail', {
      p_exercise_id: targetId,
      p_workspace_id: ws,
    });
  });

  it('excludes the edited exercise from refreshed Alternative options', async () => {
    currentActor = {
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [ws],
    };
    const selfId = '55555555-5555-4555-8555-555555555555';
    const otherId = '66666666-6666-4666-8666-666666666666';
    rpc
      .mockResolvedValueOnce({
        data: [
          { result_id: selfId, result_payload: { name_en: 'Self' } },
          { result_id: otherId, result_payload: { name_en: 'Other' } },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await catalog().alternativePickerOptions({
      workspaceId: ws,
      query: '',
      selectedIds: [],
      excludeId: selfId,
    });

    expect(result).toMatchObject({
      status: 'ok',
      data: {
        options: [{ id: otherId, kind: 'global', names: { en: 'Other' } }],
      },
    });
  });

  it('authorizes Alternative search before querying any workspace data', async () => {
    currentActor = { userId: 'sales', role: 'sales', activeWorkspaceIds: [ws] };
    expect(
      await catalog().alternativePickerOptions({
        workspaceId: ws,
        query: 'press',
        selectedIds: [],
      }),
    ).toEqual({ status: 'not_permitted' });
    expect(rpc).not.toHaveBeenCalled();
    currentActor = {
      userId: 'foreign-trainer',
      role: 'trainer',
      activeWorkspaceIds: ['44444444-4444-4444-8444-444444444444'],
    };
    expect(
      await catalog().alternativePickerOptions({
        workspaceId: ws,
        query: 'press',
        selectedIds: [],
      }),
    ).toEqual({ status: 'not_permitted' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not restore canonical Arabic in an option when the resolved name clears it', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          result_id: '55555555-5555-4555-8555-555555555555',
          result_payload: {
            name_ar: 'اسم عالمي',
            name_en: 'English only',
            primary_muscle_code: 'chest',
            equipment_codes: ['barbell'],
            effective_fields: {
              name: {
                value: { name_en: 'English only', name_ar: null },
                source: 'override',
              },
            },
          },
        },
      ],
      error: null,
    });
    const result = await catalog().alternativePickerOptions({
      workspaceId: null,
      query: '',
      selectedIds: [],
    });
    expect(result).toEqual({
      status: 'ok',
      data: {
        options: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            kind: 'global',
            names: { en: 'English only' },
          },
        ],
        nextCursor: null,
      },
    });
  });

  it('requires an explicit workspace for the merged workspace library', async () => {
    await expect(
      catalog().workspaceLibrary({ workspaceId: null, query: '' }),
    ).resolves.toEqual({ status: 'invalid' });
    expect(rpc).not.toHaveBeenCalled();
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
          targetId: targetId,
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
          targetId: targetId,
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
        targetId: targetId,
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
        targetId: targetId,
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

  it('returns invalid for malformed id, targetId or workspaceId in mutate without calling RPC', async () => {
    currentActor = {
      userId: 'po',
      role: 'platform_owner',
      activeWorkspaceIds: [],
    };
    const cases = [
      catalog().versionExercise({
        operationKey: key,
        id: 'not-a-uuid',
        expectedVersion: 1,
        request: {},
      }),
      catalog().mergeExercise({
        operationKey: key,
        id: ws,
        targetId: 'not-a-uuid',
        expectedVersion: 0,
      }),
      catalog().writeWorkspaceExercise({
        operationKey: key,
        workspaceId: 'not-a-uuid',
        request: {},
      }),
      catalog().createFood({
        operationKey: key,
        workspaceId: 'not-a-uuid',
        request: {},
      }),
    ];
    const results = await Promise.all(cases);
    expect(results).toEqual(
      Array.from({ length: cases.length }, () => ({ status: 'invalid' })),
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('forwards merge revision names and returns a successful PO merge', async () => {
    rpc.mockResolvedValueOnce({
      data: { exercise_id: ws, superseded_by: targetId },
      error: null,
    });
    await expect(
      catalog().mergeExercise({
        operationKey: key,
        id: ws,
        targetId: targetId,
        expectedVersion: 2,
      }),
    ).resolves.toEqual({
      status: 'ok',
      data: { exercise_id: ws, superseded_by: targetId },
    });
    expect(rpc).toHaveBeenCalledWith('catalog_merge_exercise', {
      p_source_id: ws,
      p_target_id: targetId,
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
