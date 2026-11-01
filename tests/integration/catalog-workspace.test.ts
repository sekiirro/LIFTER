import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, checked, sql } from './harness';

const db = sql();
type Actor = { userId: string };
let po: Actor;
let trainerA: Actor;
let trainerB: Actor;
let kendoId: string;
let tojiId: string;

async function createActor(role: 'platform_owner' | 'trainer'): Promise<Actor> {
  const email = `catalog-${role}-${randomUUID()}@example.test`;
  const created = await admin().auth.admin.createUser({
    email,
    password: `Catalog-${randomUUID()}-aA1!`,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error(created.error?.message ?? 'Catalog fixture user missing');
  checked(
    await admin().from('staff_profiles').insert({
      user_id: created.data.user.id,
      role,
    }),
  );
  return { userId: created.data.user.id };
}

beforeAll(async () => {
  po = await createActor('platform_owner');
  trainerA = await createActor('trainer');
  trainerB = await createActor('trainer');
  const createWorkspace = async (name: string, slug: string) => {
    const workspace = checked(
      await admin()
        .from('workspaces')
        .insert({
          name,
          slug: `${slug}-${randomUUID().slice(0, 8)}`,
          created_by: po.userId,
        })
        .select('id')
        .single(),
    );
    if (!workspace) throw new Error('Catalog tenant workspace missing');
    return workspace.id as string;
  };
  kendoId = await createWorkspace('KENDO', 'f3-kendo');
  tojiId = await createWorkspace('TOJI', 'f3-toji');
  checked(
    await admin()
      .from('workspace_memberships')
      .insert([
        {
          workspace_id: kendoId,
          user_id: trainerA.userId,
          granted_by: po.userId,
        },
        {
          workspace_id: tojiId,
          user_id: trainerB.userId,
          granted_by: po.userId,
        },
      ]),
  );
});

afterAll(async () => db.end());

describe('workspace exercise tenant keys', () => {
  it('enforces composite tenant keys and preserves one canonical exercise across workspace mappings', async () => {
    const exerciseId = randomUUID();
    const workspaceExerciseA = randomUUID();
    const workspaceExerciseB = randomUUID();
    const rollbackMarker = 'rollback_catalog_workspace_fixture';
    let scoped: Record<string, unknown> = {};
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.exercises (id, created_by, current_version) values (${exerciseId}, ${po.userId}, 1)`;
        await tx`insert into public.exercise_versions (exercise_id, version, payload, created_by) values (${exerciseId}, 1, '{}'::jsonb, ${po.userId})`;
        await tx`insert into public.workspace_exercises (workspace_id, id, created_by, current_version) values (${kendoId}, ${workspaceExerciseA}, ${trainerA.userId}, 1), (${tojiId}, ${workspaceExerciseB}, ${trainerB.userId}, 1)`;
        await tx`insert into public.workspace_exercise_versions (workspace_id, workspace_exercise_id, version, payload, created_by) values (${kendoId}, ${workspaceExerciseA}, 1, '{}'::jsonb, ${trainerA.userId}), (${tojiId}, ${workspaceExerciseB}, 1, '{}'::jsonb, ${trainerB.userId})`;
        await tx`insert into public.exercise_variations (workspace_id, exercise_id, created_by, current_version) values (${kendoId}, ${exerciseId}, ${trainerA.userId}, 1), (${tojiId}, ${exerciseId}, ${trainerB.userId}, 1)`;
        await tx`insert into public.exercise_variation_versions (workspace_id, exercise_id, version, payload, created_by) values (${kendoId}, ${exerciseId}, 1, '{}'::jsonb, ${trainerA.userId}), (${tojiId}, ${exerciseId}, 1, '{}'::jsonb, ${trainerB.userId})`;

        const mapped =
          await tx`select exercise_id, count(*)::int as mappings from public.exercise_variations where exercise_id = ${exerciseId} group by exercise_id`;
        expect(mapped).toEqual([{ exercise_id: exerciseId, mappings: 2 }]);

        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerA.userId, role: 'authenticated' })}, true)`;
        const rowsA =
          await tx`select workspace_id, id from public.workspace_exercises order by workspace_id`;
        const variationsA =
          await tx`select workspace_id, exercise_id from public.exercise_variations order by workspace_id`;
        expect(rowsA).toEqual([
          { workspace_id: kendoId, id: workspaceExerciseA },
        ]);
        expect(variationsA).toEqual([
          { workspace_id: kendoId, exercise_id: exerciseId },
        ]);

        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerB.userId, role: 'authenticated' })}, true)`;
        const rowsB =
          await tx`select workspace_id, id from public.workspace_exercises order by workspace_id`;
        const variationsB =
          await tx`select workspace_id, exercise_id from public.exercise_variations order by workspace_id`;
        expect(rowsB).toEqual([
          { workspace_id: tojiId, id: workspaceExerciseB },
        ]);
        expect(variationsB).toEqual([
          { workspace_id: tojiId, exercise_id: exerciseId },
        ]);

        scoped = { rowsA, rowsB, variationsA, variationsB };
        throw new Error(rollbackMarker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(rollbackMarker);
    }
    expect(scoped).toHaveProperty('rowsA');
  });

  it('includes composite owner foreign keys and forced row security on every workspace table', async () => {
    const fks = await db`
      select c.conrelid::regclass::text as table_name, pg_catalog.pg_get_constraintdef(c.oid) as definition
      from pg_catalog.pg_constraint c
      where c.contype = 'f'
        and c.conrelid in (
          'public.workspace_exercises'::regclass,
          'public.workspace_exercise_versions'::regclass,
          'public.exercise_variations'::regclass,
          'public.exercise_variation_versions'::regclass
        )
      order by table_name, definition
    `;
    expect(
      fks
        .filter((row) => row.table_name.endsWith('workspace_exercise_versions'))
        .some((row) =>
          /FOREIGN KEY \(workspace_id, workspace_exercise_id\).*REFERENCES .*workspace_exercises\(workspace_id, id\)/.test(
            row.definition,
          ),
        ),
    ).toBe(true);
    expect(
      fks
        .filter((row) => row.table_name.endsWith('exercise_variation_versions'))
        .some((row) =>
          /FOREIGN KEY \(workspace_id, exercise_id\).*REFERENCES .*exercise_variations\(workspace_id, exercise_id\)/.test(
            row.definition,
          ),
        ),
    ).toBe(true);
    const security = await db`
      select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as forced
      from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relname in ('workspace_exercises', 'workspace_exercise_versions', 'exercise_variations', 'exercise_variation_versions')
      order by c.relname
    `;
    expect(security).toHaveLength(4);
    expect(security.every((row) => row.rls && row.forced)).toBe(true);
  });

  it('rejects a workspace exercise version whose id belongs to another workspace', async () => {
    const id = randomUUID();
    await expect(
      db.begin(async (tx) => {
        await tx`insert into public.workspace_exercises (workspace_id, id, created_by, current_version)
        values (${tojiId}, ${id}, ${trainerB.userId}, 1)`;
        await tx`insert into public.workspace_exercise_versions (workspace_id, workspace_exercise_id, version, payload, created_by)
        values (${tojiId}, ${id}, 1, '{}'::jsonb, ${trainerB.userId})`;
        await tx`insert into public.workspace_exercise_versions (workspace_id, workspace_exercise_id, version, payload, created_by)
        values (${kendoId}, ${id}, 2, '{}'::jsonb, ${trainerA.userId})`;
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('scopes workspace search and counts, keeps global results workspace-free, and denies foreign scope generically', async () => {
    const canonicalId = randomUUID();
    const kendoExerciseId = randomUUID();
    const tojiExerciseId = randomUUID();
    const rollbackMarker = 'rollback_catalog_workspace_search_fixture';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.exercises (id, created_by, current_version)
          values (${canonicalId}, ${po.userId}, 1)`;
        await tx`insert into public.exercise_versions (exercise_id, version, payload, created_by)
          values (${canonicalId}, 1, '{"marker":"global-canonical"}'::jsonb, ${po.userId})`;
        await tx`insert into public.workspace_exercises (workspace_id, id, created_by, current_version)
          values (${kendoId}, ${kendoExerciseId}, ${trainerA.userId}, 1), (${tojiId}, ${tojiExerciseId}, ${trainerB.userId}, 1)`;
        await tx`insert into public.workspace_exercise_versions (workspace_id, workspace_exercise_id, version, payload, created_by)
          values (${kendoId}, ${kendoExerciseId}, 1, '{"marker":"KENDO exercise"}'::jsonb, ${trainerA.userId}),
            (${tojiId}, ${tojiExerciseId}, 1, '{"marker":"TOJI exercise"}'::jsonb, ${trainerB.userId})`;
        await tx`insert into public.exercise_variations (workspace_id, exercise_id, created_by, current_version)
          values (${kendoId}, ${canonicalId}, ${trainerA.userId}, 1), (${tojiId}, ${canonicalId}, ${trainerB.userId}, 1)`;
        await tx`insert into public.exercise_variation_versions (workspace_id, exercise_id, version, payload, created_by)
          values (${kendoId}, ${canonicalId}, 1, '{"marker":"KENDO variation"}'::jsonb, ${trainerA.userId}),
            (${tojiId}, ${canonicalId}, 1, '{"marker":"TOJI variation"}'::jsonb, ${trainerB.userId})`;

        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerA.userId, role: 'authenticated' })}, true)`;
        const globalRows =
          await tx`select result_id, result_workspace_id, result_payload
          from public.catalog_search('exercise', 'global-canonical', '{}'::jsonb, null, null)`;
        expect(globalRows).toEqual([
          {
            result_id: canonicalId,
            result_workspace_id: null,
            result_payload: { marker: 'global-canonical' },
          },
        ]);
        const kendoRows =
          await tx`select result_id, result_workspace_id, result_payload
          from public.catalog_search('workspace_exercise', 'KENDO', '{}'::jsonb, null, ${kendoId})`;
        expect(kendoRows).toEqual([
          {
            result_id: kendoExerciseId,
            result_workspace_id: kendoId,
            result_payload: { marker: 'KENDO exercise' },
          },
        ]);
        const kendoVariations =
          await tx`select result_id, result_workspace_id, result_payload
          from public.catalog_search('variation', 'KENDO', '{}'::jsonb, null, ${kendoId})`;
        expect(kendoVariations).toEqual([
          {
            result_id: canonicalId,
            result_workspace_id: kendoId,
            result_payload: { marker: 'KENDO variation' },
          },
        ]);
        const countsA = await tx`select
            (select count(*)::int from public.workspace_exercises) as exercises,
            (select count(*)::int from public.exercise_variations) as variations`;
        expect(countsA).toEqual([{ exercises: 1, variations: 1 }]);

        const denied = async (scope: string | null) => {
          try {
            await tx.savepoint(
              async (sp) =>
                sp`select * from public.catalog_search('workspace_exercise', null, '{}'::jsonb, null, ${scope})`,
            );
            throw new Error('expected generic workspace denial');
          } catch (error) {
            expect(error).toMatchObject({
              code: '42501',
              message: 'not_permitted',
            });
            return {
              code: (error as { code: string }).code,
              message: (error as { message: string }).message,
            };
          }
        };
        const foreignDenied = await denied(tojiId);
        const missingDenied = await denied(null);
        expect(foreignDenied).toEqual(missingDenied);

        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerB.userId, role: 'authenticated' })}, true)`;
        const tojiRows =
          await tx`select result_id, result_workspace_id, result_payload
          from public.catalog_search('workspace_exercise', 'TOJI', '{}'::jsonb, null, ${tojiId})`;
        expect(tojiRows).toEqual([
          {
            result_id: tojiExerciseId,
            result_workspace_id: tojiId,
            result_payload: { marker: 'TOJI exercise' },
          },
        ]);
        const countsB = await tx`select
            (select count(*)::int from public.workspace_exercises) as exercises,
            (select count(*)::int from public.exercise_variations) as variations`;
        expect(countsB).toEqual([{ exercises: 1, variations: 1 }]);
        throw new Error(rollbackMarker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(rollbackMarker);
    }
  });
});
