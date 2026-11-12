import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
let poId: string;
let workspaceId: string;

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  poId = fixture.po.userId;
  workspaceId = fixture.wsA.id;
});
afterAll(async () => db.end());

async function liveSet(tx: Tx) {
  const [exercises] = await tx`
    select coalesce(jsonb_agg(id order by id), '[]'::jsonb) as value
    from public.exercises`;
  const [workspaces] = await tx`
    select coalesce(
      jsonb_agg(jsonb_build_array(workspace_id, id) order by workspace_id, id),
      '[]'::jsonb
    ) as value
    from public.workspace_exercises`;
  const exerciseVersions = await tx`
    select exercise_id, version from public.exercise_versions
    order by exercise_id, version`;
  const privateVersions = await tx`
    select workspace_id, workspace_exercise_id, version
    from public.workspace_exercise_versions
    order by workspace_id, workspace_exercise_id, version`;
  return {
    exercises: exercises!.value,
    workspace_exercises: workspaces!.value,
    exercise_versions: exerciseVersions.map((row) => [
      row.exercise_id,
      row.version,
    ]),
    workspace_exercise_versions: privateVersions.map((row) => [
      row.workspace_id,
      row.workspace_exercise_id,
      row.version,
    ]),
  };
}

async function insertIdentity(tx: Tx) {
  const id = randomUUID();
  await tx`insert into public.exercises(id, created_by, current_version)
    values (${id}, ${poId}, 1)`;
  await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
    values (${id}, 1, ${tx.json({ name_en: `cutover guard ${id}` })}, ${poId})`;
  return id;
}

async function insertWorkspaceIdentity(tx: Tx) {
  const id = randomUUID();
  await tx`insert into public.workspace_exercises(workspace_id, id, created_by, current_version)
    values (${workspaceId}, ${id}, ${poId}, 1)`;
  await tx`insert into public.workspace_exercise_versions(workspace_id, workspace_exercise_id, version, payload, created_by)
    values (${workspaceId}, ${id}, 1, ${tx.json({ name_en: `cutover private ${id}` })}, ${poId})`;
  return id;
}

async function rollback(body: (tx: Tx) => Promise<void>) {
  const marker = `rollback_${randomUUID()}`;
  try {
    await db.begin(async (tx) => {
      await body(tx);
      throw new Error(marker);
    });
  } catch (error) {
    expect((error as Error).message).toBe(marker);
  }
}

describe('T068 cutover identity guard (S48-PO-17)', () => {
  it('accepts a locked set that equals the verified set', async () => {
    await rollback(async (tx) => {
      const verified = await liveSet(tx);
      await tx`select app_private.cutover_identity_guard(${JSON.stringify(verified)})`;
    });
  });

  it('refuses an identity added after verification with zero deletes', async () => {
    await rollback(async (tx) => {
      const verified = await liveSet(tx);
      const added = await insertIdentity(tx);
      await expect(
        tx.savepoint(
          async (sp) =>
            sp`select app_private.cutover_identity_guard(${JSON.stringify(verified)})`,
        ),
      ).rejects.toMatchObject({
        code: 'P0001',
        message: 'catalog_cutover_identity_set_changed',
      });
      const rows = await tx`
        select id from public.exercises where id = ${added}`;
      expect(rows).toHaveLength(1);
    });
  });

  it('refuses a new version added after verification with zero deletes', async () => {
    await rollback(async (tx) => {
      const exerciseId = await insertIdentity(tx);
      const verified = await liveSet(tx);
      await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
        values (${exerciseId}, 2, ${tx.json({ name_en: `cutover v2 ${exerciseId}` })}, ${poId})`;
      await tx`update public.exercises set current_version = 2 where id = ${exerciseId}`;

      await expect(
        tx.savepoint(
          async (sp) =>
            sp`select app_private.cutover_identity_guard(${JSON.stringify(verified)})`,
        ),
      ).rejects.toMatchObject({
        code: 'P0001',
        message: 'catalog_cutover_identity_set_changed',
      });
      const rows = await tx`
        select version from public.exercise_versions
        where exercise_id = ${exerciseId} order by version`;
      expect(rows.map((row) => row.version)).toEqual([1, 2]);
    });
  });

  it('fails closed when the verified set is missing', async () => {
    await rollback(async (tx) => {
      await insertIdentity(tx);
      await expect(
        tx.savepoint(
          async (sp) => sp`select app_private.cutover_identity_guard(null)`,
        ),
      ).rejects.toMatchObject({
        code: 'P0001',
        message: 'catalog_cutover_gate_missing',
      });
    });
  });

  it('fails closed on an invalid verified set', async () => {
    await rollback(async (tx) => {
      await insertIdentity(tx);
      await expect(
        tx.savepoint(
          async (sp) =>
            sp`select app_private.cutover_identity_guard('not-json')`,
        ),
      ).rejects.toMatchObject({
        code: 'P0001',
        message: 'catalog_cutover_gate_invalid',
      });
    });
  });

  it('accepts the refreshed set after the gate is repeated', async () => {
    await rollback(async (tx) => {
      await insertIdentity(tx);
      const refreshed = await liveSet(tx);
      await tx`select app_private.cutover_identity_guard(${JSON.stringify(refreshed)})`;
    });
  });

  it('T092 FR-031 installs the retired-field insert guard on both version tables', async () => {
    await rollback(async (tx) => {
      const globalId = await insertIdentity(tx);
      const privateId = await insertWorkspaceIdentity(tx);

      const triggers = await tx`
        select c.relname as table_name, t.tgname as trigger_name
        from pg_catalog.pg_trigger t
        join pg_catalog.pg_class c on c.oid = t.tgrelid
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not t.tgisinternal
          and t.tgname = 'exercise_version_retired_fields_guard'
        order by c.relname
      `;
      expect(triggers.map((row) => row.table_name)).toEqual([
        'exercise_versions',
        'workspace_exercise_versions',
      ]);

      await expect(
        tx.savepoint(
          async (
            sp,
          ) => sp`insert into public.exercise_versions(exercise_id, version, payload, created_by)
            values (${globalId}, 2, ${sp.json({ name_en: 'legacy', instructions_en: 'retired' })}, ${poId})`,
        ),
      ).rejects.toMatchObject({
        code: '22023',
        message: 'catalog_exercise_invalid',
      });
      await expect(
        tx.savepoint(
          async (
            sp,
          ) => sp`insert into public.workspace_exercise_versions(workspace_id, workspace_exercise_id, version, payload, created_by)
            values (${workspaceId}, ${privateId}, 2, ${sp.json({ name_en: 'legacy', instructions_ar: 'retired' })}, ${poId})`,
        ),
      ).rejects.toMatchObject({
        code: '22023',
        message: 'catalog_exercise_invalid',
      });
    });
  });
});
