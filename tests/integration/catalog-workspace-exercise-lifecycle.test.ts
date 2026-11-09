import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { createStaff, sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
let client: Awaited<ReturnType<typeof createStaff>>;

beforeAll(async () => {
  f = await twoWorkspaceFixture();
  client = await createStaff(null, 'workspace-exercise-lifecycle-client');
});
afterAll(async () => db.end());

const payload = {
  name_ar: 'تمرين إزالة',
  name_en: 'Lifecycle workspace exercise',
  primary_muscle_code: 'chest',
  secondary_muscle_codes: ['triceps'],
  equipment_codes: ['barbell'],
  defaults: { working_sets: 3 },
};
async function asActor<T>(tx: Tx, id: string, body: () => Promise<T>) {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id, role: 'authenticated' })}, true)`;
  return body();
}
async function withExercise<T>(body: (tx: Tx, id: string) => Promise<T>) {
  const id = randomUUID();
  let result!: T;
  try {
    await db.begin(async (tx) => {
      await tx`insert into public.workspace_exercises(workspace_id,id,created_by,current_version)
        values (${f.wsA.id},${id},${f.trainerA.userId},1)`;
      await tx`insert into public.workspace_exercise_versions(workspace_id,workspace_exercise_id,version,payload,created_by)
        values (${f.wsA.id},${id},1,${tx.json(payload)},${f.trainerA.userId})`;
      result = await body(tx, id);
      throw new Error('rollback_workspace_exercise_fixture');
    });
  } catch (error) {
    if ((error as Error).message !== 'rollback_workspace_exercise_fixture')
      throw error;
  }
  return result;
}
async function remove(
  tx: Tx,
  actorId: string,
  workspaceId: string,
  id: string,
  revision = 0,
  key = randomUUID(),
) {
  return asActor(
    tx,
    actorId,
    () =>
      tx`select public.catalog_remove_workspace_exercise(${workspaceId},${id},${revision},${key})`,
  );
}

describe('workspace exercise lifecycle removal', () => {
  it('keeps removal limited to append-only lifecycle and audit writes', async () => {
    const routine = await db`select pg_catalog.pg_get_functiondef(
      'public.catalog_remove_workspace_exercise(uuid,uuid,integer,uuid)'::regprocedure
    ) as definition`;
    expect(routine[0]?.definition).toContain('SECURITY DEFINER');
    expect(routine[0]?.definition).toContain(
      'insert into public.workspace_exercise_lifecycle_events',
    );
    expect(routine[0]?.definition).toContain('catalog_write_audit');
    expect(routine[0]?.definition).toMatch(
      /update public\.workspace_exercises[\s\S]*where workspace_id = p_workspace_id and id = p_exercise_id/i,
    );
    expect(routine[0]?.definition).not.toMatch(
      /delete\s+from|update public\.workspace_exercise_versions|plan_|snapshot_/i,
    );
    const privileges =
      await db`select c.relrowsecurity as rls, c.relforcerowsecurity as forced,
      has_table_privilege('authenticated', c.oid, 'select') as can_select,
      has_table_privilege('authenticated', c.oid, 'insert') as can_insert,
      has_table_privilege('authenticated', c.oid, 'update') as can_update,
      has_table_privilege('authenticated', c.oid, 'delete') as can_delete
      from pg_catalog.pg_class c where c.oid='public.workspace_exercise_lifecycle_events'::regclass`;
    expect(privileges).toEqual([
      {
        rls: true,
        forced: true,
        can_select: true,
        can_insert: false,
        can_update: false,
        can_delete: false,
      },
    ]);
  });

  it('returns detail with the current revision only in the explicitly authorized workspace', async () => {
    await withExercise(async (tx, id) => {
      const own = await asActor(
        tx,
        f.trainerA.userId,
        () =>
          tx`select exercise_id,payload,lifecycle_revision from public.catalog_workspace_exercise_detail(${f.wsA.id},${id})`,
      );
      expect(own).toEqual([
        { exercise_id: id, payload, lifecycle_revision: 0 },
      ]);
      const poRead = await asActor(
        tx,
        f.po.userId,
        () =>
          tx`select exercise_id,lifecycle_revision from public.catalog_workspace_exercise_detail(${f.wsA.id},${id})`,
      );
      expect(poRead).toEqual([{ exercise_id: id, lifecycle_revision: 0 }]);
      await expect(
        tx.savepoint((sp) =>
          asActor(
            sp,
            f.trainerB.userId,
            () =>
              sp`select * from public.catalog_workspace_exercise_detail(${f.wsA.id},${id})`,
          ),
        ),
      ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
    });
  });

  it('allows PO explicit scope and own-workspace WO/Trainer; denies foreign scope, Sales, Client and revoked membership', async () => {
    for (const actor of [f.po, f.woA, f.trainerA]) {
      await withExercise(async (tx, id) => {
        const result = await remove(tx, actor.userId, f.wsA.id, id);
        expect(result[0]?.catalog_remove_workspace_exercise).toMatchObject({
          workspace_id: f.wsA.id,
          exercise_id: id,
          lifecycle_revision: 1,
          lifecycle_state: 'removed',
        });
      });
    }
    await withExercise(async (tx, id) => {
      for (const actorId of [f.trainerB.userId, f.salesA.userId, client.userId])
        await expect(
          tx.savepoint((sp) => remove(sp, actorId, f.wsA.id, id)),
        ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
      await expect(
        tx.savepoint((sp) => remove(sp, f.trainerA.userId, f.wsB.id, id)),
      ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
      await tx`update public.workspace_memberships set revoked_at=now(), revoked_by=${f.po.userId}
        where workspace_id=${f.wsA.id} and user_id=${f.trainerA.userId} and revoked_at is null`;
      await expect(
        tx.savepoint((sp) => remove(sp, f.trainerA.userId, f.wsA.id, id)),
      ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
    });
  });

  it('rejects stale revisions and preserves tenant identity, content, replay and audit', async () => {
    await withExercise(async (tx, id) => {
      await expect(
        tx.savepoint((sp) => remove(sp, f.trainerA.userId, f.wsA.id, id, 1)),
      ).rejects.toMatchObject({
        code: '40001',
        message: 'catalog_exercise_lifecycle_conflict',
      });
      const key = randomUUID();
      const before =
        await tx`select workspace_id,workspace_exercise_id,version,payload from public.workspace_exercise_versions where workspace_id=${f.wsA.id} and workspace_exercise_id=${id}`;
      const first = await remove(tx, f.trainerA.userId, f.wsA.id, id, 0, key);
      await expect(
        remove(tx, f.trainerA.userId, f.wsA.id, id, 0, key),
      ).resolves.toEqual(first);
      await expect(
        tx`select lifecycle_state,lifecycle_revision from public.workspace_exercises where workspace_id=${f.wsA.id} and id=${id}`,
      ).resolves.toEqual([
        { lifecycle_state: 'removed', lifecycle_revision: 1 },
      ]);
      await expect(
        tx`select count(*)::int as events from public.workspace_exercise_lifecycle_events where workspace_id=${f.wsA.id} and workspace_exercise_id=${id}`,
      ).resolves.toEqual([{ events: 1 }]);
      await expect(
        tx`select workspace_id,workspace_exercise_id,version,payload from public.workspace_exercise_versions where workspace_id=${f.wsA.id} and workspace_exercise_id=${id}`,
      ).resolves.toEqual(before);
      await tx`select set_config('role','postgres',true)`;
      await expect(
        tx`select count(*)::int as events from public.audit_events where action='catalog.workspace_exercise_removed' and workspace_id=${f.wsA.id} and target_id=${id}`,
      ).resolves.toEqual([{ events: 1 }]);
      await tx`select set_config('role','authenticated',true)`;
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
      await expect(
        tx`select count(*)::int as matches from public.catalog_search('workspace_exercise',${payload.name_en},'{}'::jsonb,null,${f.wsA.id}) where result_id=${id}`,
      ).resolves.toEqual([{ matches: 0 }]);
    });
  });

  it('does not confuse identical exercise ids across workspace tenants', async () => {
    const id = randomUUID();
    const marker = 'rollback_same_id_workspace_exercise_fixture';
    try {
      await db.begin(async (tx) => {
        for (const workspaceId of [f.wsA.id, f.wsB.id]) {
          const ownerId =
            workspaceId === f.wsA.id ? f.trainerA.userId : f.trainerB.userId;
          await tx`insert into public.workspace_exercises(workspace_id,id,created_by,current_version) values (${workspaceId},${id},${ownerId},1)`;
          await tx`insert into public.workspace_exercise_versions(workspace_id,workspace_exercise_id,version,payload,created_by) values (${workspaceId},${id},1,${tx.json(payload)},${ownerId})`;
        }
        await remove(tx, f.trainerA.userId, f.wsA.id, id);
        await tx`select set_config('role','postgres',true)`;
        await expect(
          tx`select lifecycle_state,lifecycle_revision from public.workspace_exercises where workspace_id=${f.wsB.id} and id=${id}`,
        ).resolves.toEqual([
          { lifecycle_state: 'active', lifecycle_revision: 0 },
        ]);
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker) throw error;
    }
  });
});
