import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCatalogServer } from '../../lib/catalog/server';
import { loadActorRows } from '../../lib/auth/actor';
import { admin, createStaff, sql, twoWorkspaceFixture } from './harness';

const db = sql();
vi.mock('server-only', () => ({}));
const fixtureKey = () => randomUUID();
const payload = {
  name_ar: '',
  name_en: '',
  primary_muscle_code: '',
  equipment_codes: [],
};
let actors: Awaited<ReturnType<typeof createStaff>>[] = [];
let workspaces: Awaited<ReturnType<typeof twoWorkspaceFixture>>;

beforeAll(async () => {
  workspaces = await twoWorkspaceFixture();
  actors = [
    workspaces.po,
    workspaces.woA,
    workspaces.trainerA,
    workspaces.salesA,
    await createStaff(null, 'catalog-unknown'),
    await createStaff(null, 'catalog-client-context'),
  ];
});

afterAll(async () => {
  await db.end();
  for (const actor of actors) await admin().auth.admin.deleteUser(actor.userId);
  if (workspaces) {
    for (const actor of [
      workspaces.po,
      workspaces.woA,
      workspaces.trainerA,
      workspaces.salesA,
      workspaces.trainerB,
    ])
      await admin().auth.admin.deleteUser(actor.userId);
  }
});

function server(actor: (typeof actors)[number]) {
  return createCatalogServer({
    session: async () => actor.client,
    actor: async (client) => loadActorRows(client as never, actor.userId),
  });
}

function trackedServer(actor: (typeof actors)[number]) {
  const calls: string[] = [];
  const client = {
    auth: actor.client.auth,
    from: actor.client.from.bind(actor.client),
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      return actor.client.rpc(name, args);
    },
  };
  const actions = createCatalogServer({
    session: async () => client as never,
    actor: async (session) => loadActorRows(session as never, actor.userId),
  });
  return { actions, calls };
}

describe('catalog server authorization uses the signed-in user RPC path', () => {
  it('serves an empty filtered search through the session catalog wall', async () => {
    const result = await server(workspaces.trainerA).search({
      kind: 'exercise',
      query: `s27-empty-${randomUUID()}`,
      filters: {
        primary_muscle_code: 'chest',
        equipment_codes: ['barbell'],
        page_size: 21,
      },
    });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.data).toEqual([]);
  });

  it('matches the six role states for catalog search and the principal mutation classes', async () => {
    const expectedRead = [true, true, true, false, false, false];
    const expectedGlobalWrite = [true, false, false, false, false, false];
    const expectedFoodCreate = [true, true, true, false, false, false];
    for (let index = 0; index < actors.length; index++) {
      const actor = actors[index]!;
      const actions = server(actor);
      const directSearch = await actor.client.rpc('catalog_search', {
        kind: 'exercise',
        query: '',
        filters: {},
        cursor: null,
        workspace_id: null,
      });
      expect(directSearch.error?.code ?? 'none', `rpc code role ${index}`).toBe(
        expectedRead[index] ? 'none' : '42501',
      );
      const read = await actions.search({ kind: 'exercise', query: '' });
      expect(read.status === 'ok', `role row ${index}: ${read.status}`).toBe(
        expectedRead[index],
      );
      const globalWrite = await actions.createExercise({
        operationKey: fixtureKey(),
        request: payload,
      });
      expect(globalWrite.status === 'invalid').toBe(expectedGlobalWrite[index]);
      if (!expectedGlobalWrite[index])
        expect(globalWrite).toEqual({ status: 'not_permitted' });
      const foodCreate = await actions.createFood({
        operationKey: fixtureKey(),
        workspaceId: workspaces.wsA.id,
        request: {},
      });
      expect(
        foodCreate.status === 'invalid' || foodCreate.status === 'ok',
      ).toBe(expectedFoodCreate[index]);
      if (!expectedFoodCreate[index])
        expect(foodCreate).toEqual({ status: 'not_permitted' });
    }
  });

  it('masks cross-workspace and revoked-membership access before RPC execution', async () => {
    const trainer = workspaces.trainerA;
    const actions = server(trainer);
    expect(
      await actions.writeVariation({
        operationKey: fixtureKey(),
        workspaceId: workspaces.wsB.id,
        id: randomUUID(),
        request: { video_url: 'https://youtube.com/watch?v=abc' },
      }),
    ).toEqual({ status: 'not_permitted' });
    const revoked = await admin()
      .from('workspace_memberships')
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: workspaces.po.userId,
      })
      .eq('workspace_id', workspaces.wsA.id)
      .eq('user_id', trainer.userId)
      .select('revoked_at')
      .single();
    expect(revoked.error).toBeNull();
    expect(revoked.data?.revoked_at).toBeTruthy();
    expect(await actions.search({ kind: 'exercise', query: '' })).toEqual({
      status: 'not_permitted',
    });
    expect(
      await actions.createFood({
        operationKey: fixtureKey(),
        workspaceId: workspaces.wsA.id,
        request: {},
      }),
    ).toEqual({ status: 'not_permitted' });
    const restored = await admin().from('workspace_memberships').insert({
      workspace_id: workspaces.wsA.id,
      user_id: trainer.userId,
      granted_by: workspaces.po.userId,
    });
    expect(restored.error).toBeNull();
  });

  it('routes a workspace variation through the F16 override RPC with version zero', async () => {
    const action = server(workspaces.po);
    const exercise = await action.createExercise({
      operationKey: fixtureKey(),
      request: {
        name_ar: `Hidden revision ${randomUUID()}`,
        name_en: `Variation create ${randomUUID()}`,
        primary_muscle_code: 'chest',
        secondary_muscle_codes: [],
        equipment_codes: ['dumbbell'],
        default_rest_time: 90,
        default_rir: 2,
        default_reps: 8,
      },
    });
    expect(exercise.status).toBe('ok');
    if (exercise.status !== 'ok') return;
    const result = await action.writeVariation({
      operationKey: fixtureKey(),
      workspaceId: workspaces.wsA.id,
      id: (exercise.data as { exercise_id: string }).exercise_id,
      request: { video_url: 'https://youtu.be/abcdefghijk' },
    });
    expect(result.status).toBe('ok');
  });

  it('reads the current revision when a non-video override is hidden from the variation projection', async () => {
    const owner = server(workspaces.po);
    const trainer = server(workspaces.trainerA);
    const created = await owner.createExercise({
      operationKey: fixtureKey(),
      request: {
        name_ar: `اختبار ${randomUUID()}`,
        name_en: `Hidden variation revision ${randomUUID()}`,
        primary_muscle_code: 'chest',
        secondary_muscle_codes: [],
        equipment_codes: ['dumbbell'],
        default_rest_time: 90,
        default_rir: 2,
        default_reps: 8,
      },
    });
    expect(created.status).toBe('ok');
    if (created.status !== 'ok') return;
    const exerciseId = (created.data as { exercise_id: string }).exercise_id;
    const saved = await trainer.writeExerciseOverride({
      operationKey: fixtureKey(),
      workspaceId: workspaces.wsA.id,
      id: exerciseId,
      expectedVersion: null,
      request: { description: 'Description only' },
    });
    expect(saved.status).toBe('ok');

    const projection = await trainer.search({
      kind: 'variation',
      query: '',
      workspaceId: workspaces.wsA.id,
      filters: { page_size: 50 },
    });
    expect(projection.status).toBe('ok');
    if (projection.status !== 'ok') return;
    expect(Array.isArray(projection.data)).toBe(true);
    if (!Array.isArray(projection.data)) return;
    expect(
      projection.data.some(
        (row: unknown) =>
          (row as { result_id?: string }).result_id === exerciseId,
      ),
    ).toBe(false);

    expect(
      await trainer.exerciseOverrideVersion({
        workspaceId: workspaces.wsA.id,
        exerciseId,
      }),
    ).toEqual({ status: 'ok', data: { version: 1 } });
  });

  it('searches exercises created through the session wall by stored taxonomy payload keys', async () => {
    const action = server(workspaces.po);
    const exerciseName = `Filter payload ${randomUUID()}`;
    const created = await action.createExercise({
      operationKey: fixtureKey(),
      request: {
        name_ar: `Ø§Ø®ØªØ¨Ø§Ø± ${randomUUID()}`,
        name_en: exerciseName,
        primary_muscle_code: 'chest',
        secondary_muscle_codes: [],
        equipment_codes: ['barbell'],
        default_rest_time: 90,
        default_rir: 2,
        default_reps: 8,
      },
    });
    expect(created.status).toBe('ok');
    if (created.status !== 'ok') return;
    const exerciseId = (created.data as { exercise_id: string }).exercise_id;
    const muscle = await action.search({
      kind: 'exercise',
      query: exerciseName,
      filters: { primary_muscle_code: 'chest' },
    });
    const equipment = await action.search({
      kind: 'exercise',
      query: exerciseName,
      filters: { equipment_codes: ['barbell'] },
    });
    const muscleMismatch = await action.search({
      kind: 'exercise',
      query: exerciseName,
      filters: { primary_muscle_code: 'back' },
    });
    const equipmentMismatch = await action.search({
      kind: 'exercise',
      query: exerciseName,
      filters: { equipment_codes: ['dumbbell'] },
    });
    expect(muscle.status).toBe('ok');
    expect(equipment.status).toBe('ok');
    expect(muscleMismatch.status).toBe('ok');
    expect(equipmentMismatch.status).toBe('ok');
    if (muscle.status === 'ok' && equipment.status === 'ok') {
      expect(
        (muscle.data as Array<{ result_id: string }>).some(
          (row) => row.result_id === exerciseId,
        ),
      ).toBe(true);
      expect(
        (equipment.data as Array<{ result_id: string }>).some(
          (row) => row.result_id === exerciseId,
        ),
      ).toBe(true);
    }
    if (muscleMismatch.status === 'ok')
      expect(
        (muscleMismatch.data as Array<{ result_id: string }>).some(
          (row) => row.result_id === exerciseId,
        ),
      ).toBe(false);
    if (equipmentMismatch.status === 'ok')
      expect(
        (equipmentMismatch.data as Array<{ result_id: string }>).some(
          (row) => row.result_id === exerciseId,
        ),
      ).toBe(false);

    const workspaceAction = server(workspaces.trainerA);
    const workspaceName = `Workspace filter payload ${randomUUID()}`;
    const workspaceCreated = await workspaceAction.writeWorkspaceExercise({
      operationKey: fixtureKey(),
      workspaceId: workspaces.wsA.id,
      request: {
        name_ar: `Ø§Ø®ØªØ¨Ø§Ø± ${randomUUID()}`,
        name_en: workspaceName,
        primary_muscle_code: 'chest',
        secondary_muscle_codes: [],
        equipment_codes: ['barbell'],
        default_rest_time: 90,
        default_rir: 2,
        default_reps: 8,
      },
    });
    expect(workspaceCreated.status).toBe('ok');
    if (workspaceCreated.status === 'ok') {
      const workspaceExerciseId = (
        workspaceCreated.data as { exercise_id: string }
      ).exercise_id;
      const workspaceResult = await workspaceAction.search({
        kind: 'workspace_exercise',
        query: workspaceName,
        workspaceId: workspaces.wsA.id,
        filters: {
          primary_muscle_code: 'chest',
          equipment_codes: ['barbell'],
        },
      });
      expect(workspaceResult.status).toBe('ok');
      if (workspaceResult.status === 'ok')
        expect(
          (workspaceResult.data as Array<{ result_id: string }>).some(
            (row) => row.result_id === workspaceExerciseId,
          ),
        ).toBe(true);

      const workspaceFilteredResult = await workspaceAction.search({
        kind: 'workspace_exercise',
        query: '',
        workspaceId: workspaces.wsA.id,
        filters: {
          primary_muscle_code: 'chest',
          equipment_codes: ['barbell'],
        },
      });
      expect(workspaceFilteredResult.status).toBe('ok');
      if (workspaceFilteredResult.status === 'ok')
        expect(
          (workspaceFilteredResult.data as Array<{ result_id: string }>).some(
            (row) => row.result_id === workspaceExerciseId,
          ),
        ).toBe(true);
    }
  });

  it('evaluates creator preflight through authenticated session RPCs for all six role states', async () => {
    const trainer = workspaces.trainerA;
    const food = await server(trainer).createFood({
      operationKey: fixtureKey(),
      workspaceId: workspaces.wsA.id,
      request: {
        name_ar: `Ù„Ø­Ù…${randomUUID()}`,
        name_en: `Catalog server ${randomUUID()}`,
        basis: 'g',
        product_identity_norm: `catalog-server-${randomUUID()}`,
        preparation_identity_norm: 'plain',
        weighing_state: 'not_applicable',
        kcal: 130,
        protein_g: 5,
        carbohydrate_g: 20,
        fat_g: 2,
        fiber_g: null,
        servings: [
          { unit_key: 'reference', label_en: '100 g', basis_qty: 100 },
        ],
      },
    });
    expect(food.status).toBe('ok');
    const foodId = (food as { status: 'ok'; data: { food_id: string } }).data
      .food_id;
    const eligible = [true, false, true, false, false, false];
    for (let index = 0; index < actors.length; index++) {
      const result = await actors[index]!.client.rpc(
        'catalog_can_version_food',
        {
          p_food_id: foodId,
        },
      );
      expect(result.error).toBeNull();
      expect(result.data).toBe(eligible[index]);
    }
  });

  it('applies app-wall role rules to every mutation RPC for all six roles', async () => {
    const creator = server(workspaces.trainerA);
    const food = await creator.createFood({
      operationKey: fixtureKey(),
      workspaceId: workspaces.wsA.id,
      request: {
        name_ar: `Ù„Ø­Ù…${randomUUID()}`,
        name_en: `Catalog mutation matrix ${randomUUID()}`,
        basis: 'g',
        product_identity_norm: `catalog-matrix-${randomUUID()}`,
        preparation_identity_norm: 'plain',
        weighing_state: 'not_applicable',
        kcal: 130,
        protein_g: 5,
        carbohydrate_g: 20,
        fat_g: 2,
        fiber_g: null,
        servings: [
          { unit_key: 'reference', label_en: '100 g', basis_qty: 100 },
        ],
      },
    });
    expect(food.status).toBe('ok');
    const foodId = (food as { status: 'ok'; data: { food_id: string } }).data
      .food_id;
    const canCoach = [true, true, true, false, false, false];
    const canGovern = [true, false, false, false, false, false];
    const scoped = workspaces.wsA.id;
    for (let index = 0; index < actors.length; index++) {
      const { actions, calls } = trackedServer(actors[index]!);
      const check = async (
        expected: string[],
        operation: () => Promise<unknown>,
      ) => {
        calls.length = 0;
        await operation();
        expect(calls).toEqual(expected);
      };
      const key = fixtureKey;
      await check(canCoach[index] ? ['catalog_search'] : [], () =>
        actions.search({ kind: 'exercise', query: '' }),
      );
      await check(canGovern[index] ? ['catalog_create_exercise'] : [], () =>
        actions.createExercise({ operationKey: key(), request: payload }),
      );
      await check(canGovern[index] ? ['catalog_version_exercise'] : [], () =>
        actions.versionExercise({
          operationKey: key(),
          id: randomUUID(),
          expectedVersion: 1,
          request: payload,
        }),
      );
      await check(canGovern[index] ? ['catalog_transition_exercise'] : [], () =>
        actions.transitionExercise({
          operationKey: key(),
          id: randomUUID(),
          expectedVersion: 0,
          transition: 'remove',
        }),
      );
      await check(canGovern[index] ? ['catalog_merge_exercise'] : [], () =>
        actions.mergeExercise({
          operationKey: key(),
          id: randomUUID(),
          targetId: randomUUID(),
          expectedVersion: 0,
        }),
      );
      await check(
        canCoach[index] ? ['catalog_write_workspace_exercise'] : [],
        () =>
          actions.writeWorkspaceExercise({
            operationKey: key(),
            workspaceId: scoped,
            request: {},
          }),
      );
      await check(
        canCoach[index] ? ['catalog_write_exercise_override'] : [],
        () =>
          actions.writeVariation({
            operationKey: key(),
            workspaceId: scoped,
            id: randomUUID(),
            request: {},
          }),
      );
      await check(
        canCoach[index] ? ['catalog_write_exercise_override'] : [],
        () =>
          actions.transitionVariation({
            operationKey: key(),
            workspaceId: scoped,
            id: randomUUID(),
            expectedVersion: 1,
            transition: 'remove',
          }),
      );
      await check(canCoach[index] ? ['catalog_create_food'] : [], () =>
        actions.createFood({
          operationKey: key(),
          workspaceId: scoped,
          request: {},
        }),
      );
      const versionCalls =
        index === 0
          ? ['catalog_version_food']
          : index === 2
            ? ['catalog_can_version_food', 'catalog_version_food']
            : index === 1
              ? ['catalog_can_version_food']
              : [];
      await check(versionCalls, () =>
        actions.versionFood({
          operationKey: key(),
          id: foodId,
          expectedVersion: 1,
          request: {},
        }),
      );
      await check(canGovern[index] ? ['catalog_transition_food'] : [], () =>
        actions.transitionFood({
          operationKey: key(),
          id: randomUUID(),
          expectedVersion: 0,
          transition: 'remove',
        }),
      );
      await check(canGovern[index] ? ['catalog_merge_food'] : [], () =>
        actions.mergeFood({
          operationKey: key(),
          id: randomUUID(),
          targetId: randomUUID(),
          expectedVersion: 0,
        }),
      );
    }
  });
});
