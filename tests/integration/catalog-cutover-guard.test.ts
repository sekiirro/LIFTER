import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
let poId: string;

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  poId = fixture.po.userId;
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
  return {
    exercises: exercises!.value,
    workspace_exercises: workspaces!.value,
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

  it('fails closed when the verified set is missing', async () => {
    await rollback(async (tx) => {
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
});
