import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
let poId: string;
let trainerA: string;
let trainerB: string;
let workspaceA: string;
let workspaceB: string;

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  poId = fixture.po.userId;
  trainerA = fixture.trainerA.userId;
  trainerB = fixture.trainerB.userId;
  workspaceA = fixture.wsA.id;
  workspaceB = fixture.wsB.id;
});

afterAll(async () => db.end());

async function asActor<T>(actorId: string, body: (tx: Tx) => Promise<T>) {
  return db.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
    return body(tx);
  });
}

async function createGlobal(name: string) {
  return asActor(poId, async (tx) => {
    const [row] = await tx`
      select public.catalog_create_exercise(${randomUUID()}, ${tx.json({
        name_en: name,
        name_ar: 'تمرين',
        primary_muscle_code: 'chest',
        equipment_codes: ['barbell'],
      })}) as result
    `;
    return row?.result as { exercise_id: string };
  });
}

async function createPrivate(workspaceId: string, actorId: string, name: string) {
  return asActor(actorId, async (tx) => {
    const [row] = await tx`
      select public.catalog_write_workspace_exercise(${workspaceId}, null, null, ${randomUUID()}, ${tx.json({
        name_en: name,
        name_ar: 'تمرين خاص',
        primary_muscle_code: 'chest',
        equipment_codes: ['barbell'],
      })}) as result
    `;
    return row?.result as { exercise_id: string; version: number };
  });
}

describe('T090 canonical and workspace-private exercise version storage', () => {
  it('stores Notes and Defaults on both immutable version tables (T090)', async () => {
    const rows = await db`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('exercise_versions', 'workspace_exercise_versions')
        and column_name in ('notes', 'default_rest_time', 'default_rir', 'default_reps')
      order by table_name, column_name
    `;
    expect(rows).toEqual([
      { table_name: 'exercise_versions', column_name: 'default_reps' },
      { table_name: 'exercise_versions', column_name: 'default_rest_time' },
      { table_name: 'exercise_versions', column_name: 'default_rir' },
      { table_name: 'exercise_versions', column_name: 'notes' },
      { table_name: 'workspace_exercise_versions', column_name: 'default_reps' },
      { table_name: 'workspace_exercise_versions', column_name: 'default_rest_time' },
      { table_name: 'workspace_exercise_versions', column_name: 'default_rir' },
      { table_name: 'workspace_exercise_versions', column_name: 'notes' },
    ]);
  });

  it('bounds Global Alternatives to three unique active Global identities (T090)', async () => {
    const parent = await createGlobal('T090 Global parent');
    const targets = await Promise.all([
      createGlobal('T090 Global target 1'),
      createGlobal('T090 Global target 2'),
      createGlobal('T090 Global target 3'),
      createGlobal('T090 Global target 4'),
    ]);
    for (let i = 0; i < 3; i += 1) {
      await db`
        insert into public.exercise_version_alternatives
          (exercise_id, version, position, global_exercise_id)
        values (${parent.exercise_id}, 1, ${i + 1}, ${targets[i]!.exercise_id})
      `;
    }
    await expect(db`
      insert into public.exercise_version_alternatives
        (exercise_id, version, position, global_exercise_id)
      values (${parent.exercise_id}, 1, 4, ${targets[3]!.exercise_id})
    `).rejects.toBeDefined();
    await expect(db`
      insert into public.exercise_version_alternatives
        (exercise_id, version, position, global_exercise_id)
      values (${parent.exercise_id}, 1, 2, ${targets[0]!.exercise_id})
    `).rejects.toBeDefined();
  });

  it('enforces private Alternatives target shape and the composite workspace key (T090)', async () => {
    const [targetKey] = await db`
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conrelid = 'public.workspace_exercise_version_alternatives'::regclass
        and conname = 'workspace_exercise_version_alternatives_private_target_fk'
    `;
    expect(targetKey?.definition).toMatch(
      /FOREIGN KEY \(workspace_id, alternative_workspace_exercise_id\) REFERENCES workspace_exercises\(workspace_id, id\)/,
    );

    const parent = await createPrivate(workspaceA, trainerA, 'T090 private parent');
    const localTarget = await createPrivate(workspaceA, trainerA, 'T090 local target');
    const localTarget2 = await createPrivate(workspaceA, trainerA, 'T090 local target 2');
    const localTarget3 = await createPrivate(workspaceA, trainerA, 'T090 local target 3');
    const localTarget4 = await createPrivate(workspaceA, trainerA, 'T090 local target 4');
    const foreignTarget = await createPrivate(workspaceB, trainerB, 'T090 foreign target');
    const globalTarget = await createGlobal('T090 private global target');

    await expect(db`
      insert into public.workspace_exercise_version_alternatives
        (workspace_id, workspace_exercise_id, version, position, global_exercise_id, alternative_workspace_exercise_id)
      values (${workspaceA}, ${parent.exercise_id}, 1, 1, ${globalTarget.exercise_id}, ${localTarget.exercise_id})
    `).rejects.toBeDefined();
    await expect(db`
      insert into public.workspace_exercise_version_alternatives
        (workspace_id, workspace_exercise_id, version, position)
      values (${workspaceA}, ${parent.exercise_id}, 1, 1)
    `).rejects.toBeDefined();
    await expect(db`
      insert into public.workspace_exercise_version_alternatives
        (workspace_id, workspace_exercise_id, version, position, alternative_workspace_exercise_id)
      values (${workspaceA}, ${parent.exercise_id}, 1, 1, ${foreignTarget.exercise_id})
    `).rejects.toBeDefined();

    await db`
      insert into public.workspace_exercise_version_alternatives
        (workspace_id, workspace_exercise_id, version, position, alternative_workspace_exercise_id)
      values (${workspaceA}, ${parent.exercise_id}, 1, 1, ${localTarget.exercise_id})
    `;
    await db`
      insert into public.workspace_exercise_version_alternatives
        (workspace_id, workspace_exercise_id, version, position, alternative_workspace_exercise_id)
      values (${workspaceA}, ${parent.exercise_id}, 1, 2, ${localTarget2.exercise_id})
    `;
    await db`
      insert into public.workspace_exercise_version_alternatives
        (workspace_id, workspace_exercise_id, version, position, alternative_workspace_exercise_id)
      values (${workspaceA}, ${parent.exercise_id}, 1, 3, ${localTarget3.exercise_id})
    `;
    await expect(db`
      insert into public.workspace_exercise_version_alternatives
        (workspace_id, workspace_exercise_id, version, position, alternative_workspace_exercise_id)
      values (${workspaceA}, ${parent.exercise_id}, 1, 4, ${localTarget4.exercise_id})
    `).rejects.toBeDefined();
    await expect(db`
      insert into public.workspace_exercise_version_alternatives
        (workspace_id, workspace_exercise_id, version, position, alternative_workspace_exercise_id)
      values (${workspaceA}, ${parent.exercise_id}, 1, 3, ${localTarget.exercise_id})
    `).rejects.toBeDefined();
  });

  it('rejects an inactive target at child-row write time (T090)', async () => {
    const parent = await createGlobal('T090 parent with removed target');
    const target = await createGlobal('T090 inactive target');
    await db`update public.exercises set lifecycle_state = 'removed' where id = ${target.exercise_id}`;
    await expect(db`
      insert into public.exercise_version_alternatives
        (exercise_id, version, position, global_exercise_id)
      values (${parent.exercise_id}, 1, 1, ${target.exercise_id})
    `).rejects.toBeDefined();

    const privateParent = await createPrivate(workspaceA, trainerA, 'T090 private parent with removed target');
    const privateTarget = await createPrivate(workspaceA, trainerA, 'T090 inactive private target');
    await db`
      update public.workspace_exercises set lifecycle_state = 'removed'
      where workspace_id = ${workspaceA} and id = ${privateTarget.exercise_id}
    `;
    await expect(db`
      insert into public.workspace_exercise_version_alternatives
        (workspace_id, workspace_exercise_id, version, position, alternative_workspace_exercise_id)
      values (${workspaceA}, ${privateParent.exercise_id}, 1, 1, ${privateTarget.exercise_id})
    `).rejects.toBeDefined();
  });

  it('keeps storage forced-RLS, append-only and without direct DML grants (T090)', async () => {
    const rows = await db`
      select c.relname as table_name, c.relrowsecurity, c.relforcerowsecurity,
        has_table_privilege('authenticated', c.oid, 'INSERT') as can_insert,
        has_table_privilege('authenticated', c.oid, 'UPDATE') as can_update,
        has_table_privilege('authenticated', c.oid, 'DELETE') as can_delete,
        exists (select 1 from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal and t.tgname like '%append_only%') as append_only
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in (
        'exercise_version_alternatives', 'workspace_exercise_version_alternatives'
      ) order by c.relname
    `;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
        can_insert: false,
        can_update: false,
        can_delete: false,
        append_only: true,
      });
    }
  });
});
