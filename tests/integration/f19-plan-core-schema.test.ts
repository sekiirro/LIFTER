import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clientNotesFixture,
  type ClientNotesFixture,
} from './client-notes-fixture';

let fixture: ClientNotesFixture;
const db = () => fixture.db;
const workoutDocument = (notes = '') => ({
  schema_version: 1,
  days: [],
  notes,
});

beforeAll(async () => {
  fixture = await clientNotesFixture();
});
afterAll(async () => fixture?.close());

async function seedPlan(operationKey = randomUUID()) {
  const result = await fixture.context.trainerA.client.rpc(
    'create_plan_draft',
    {
      p_workspace_id: fixture.workspaceId,
      p_client_id: fixture.clientId,
      p_plan_kind: 'workout',
      p_content: workoutDocument(),
      p_operation_key: operationKey,
    },
  );
  if (result.error || typeof result.data !== 'string')
    throw new Error(
      `Plan create failed (${result.error?.code ?? 'missing id'})`,
    );
  return result.data;
}

describe('F19 T010 plan lifecycle schema', () => {
  it('installs tenant-scoped plan roots, private drafts, and published revisions', async () => {
    const [relations] = await db()`
      select
        to_regclass('public.plan_roots') as roots,
        to_regclass('public.plan_drafts') as drafts,
        to_regclass('public.plan_revisions') as revisions
    `;

    expect(relations).toEqual({
      roots: 'plan_roots',
      drafts: 'plan_drafts',
      revisions: 'plan_revisions',
    });

    const security = await db()`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c
      where c.oid in (
        'public.plan_roots'::regclass,
        'public.plan_drafts'::regclass,
        'public.plan_revisions'::regclass,
        'public.plan_audit_events'::regclass
      )
      order by c.relname
    `;
    expect(security).toHaveLength(4);
    expect(
      security.every((row) => row.relrowsecurity && row.relforcerowsecurity),
    ).toBe(true);
    const authors = await db()`
      select conname, confdeltype
      from pg_constraint
      where contype = 'f'
        and conrelid in (
          'public.plan_roots'::regclass,
          'public.plan_drafts'::regclass,
          'public.plan_revisions'::regclass,
          'public.plan_audit_events'::regclass
        )
        and confrelid = 'public.staff_profiles'::regclass
      order by conname
    `;
    expect(authors).toHaveLength(5);
    expect(authors.every((row) => row.confdeltype === 'r')).toBe(true);
    for (const role of ['authenticated', 'service_role']) {
      const [writes] = await db()`
        select
          has_table_privilege(${role}, 'public.plan_revisions', 'UPDATE') as can_update,
          has_table_privilege(${role}, 'public.plan_revisions', 'DELETE') as can_delete,
          has_table_privilege(${role}, 'public.plan_revisions', 'TRUNCATE') as can_truncate
      `;
      expect(writes).toEqual({
        can_update: false,
        can_delete: false,
        can_truncate: false,
      });
    }
  });

  it('persists a tenant-bound root and draft, applies version CAS, and appends content-free audit events', async () => {
    const key = randomUUID();
    const before = await db()`
      select count(*)::int as count from public.plan_roots
      where workspace_id = ${fixture.workspaceId} and client_id = ${fixture.clientId}
    `;
    const id = await seedPlan(key);
    expect(await seedPlan(key)).toBe(id);
    const afterCreate = await db()`
      select count(*)::int as count from public.plan_roots
      where workspace_id = ${fixture.workspaceId} and client_id = ${fixture.clientId}
    `;
    expect(afterCreate[0]?.count).toBe(before[0]!.count + 1);
    const saveKey = randomUUID();
    const updated = await fixture.context.trainerA.client.rpc(
      'save_plan_draft',
      {
        p_plan_id: id,
        p_expected_draft_version: 1,
        p_content: workoutDocument('x1'),
        p_operation_key: saveKey,
      },
    );
    expect(updated.error).toBeNull();
    expect(updated.data).toBe(2);
    const replay = await fixture.context.trainerA.client.rpc(
      'save_plan_draft',
      {
        p_plan_id: id,
        p_expected_draft_version: 1,
        p_content: workoutDocument('x1'),
        p_operation_key: saveKey,
      },
    );
    expect(replay.error).toBeNull();
    expect(replay.data).toBe(2);
    const changedReplay = await fixture.context.trainerA.client.rpc(
      'save_plan_draft',
      {
        p_plan_id: id,
        p_expected_draft_version: 1,
        p_content: workoutDocument('x2'),
        p_operation_key: saveKey,
      },
    );
    expect(changedReplay.error?.message).toContain('key_conflict');
    const stale = await fixture.context.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: id,
      p_expected_draft_version: 1,
      p_content: workoutDocument('x2'),
      p_operation_key: randomUUID(),
    });
    expect(stale.error?.code).toBe('40001');
    const audit = await db()`
      select action, draft_version from public.plan_audit_events
      where workspace_id = ${fixture.workspaceId} and plan_id = ${id}
      order by recorded_at, action
    `;
    expect(audit.map((row) => [row.action, row.draft_version])).toEqual([
      ['plan.created', null],
      ['plan.draft_created', '1'],
      ['plan.draft_updated', '2'],
    ]);
  });

  it('serializes concurrent writes against the same expected draft version', async () => {
    const id = await seedPlan();
    const save = (value: number) =>
      fixture.context.trainerA.client.rpc('save_plan_draft', {
        p_plan_id: id,
        p_expected_draft_version: 1,
        p_content: workoutDocument(String(value)),
        p_operation_key: randomUUID(),
      });
    const results = await Promise.all([save(1), save(2)]);
    expect(results.filter((result) => result.error === null)).toHaveLength(1);
    expect(
      results.filter((result) => result.error?.code === '40001'),
    ).toHaveLength(1);
    const [draft] = await db()`
      select draft_version from public.plan_drafts
      where workspace_id = ${fixture.workspaceId} and plan_id = ${id}
    `;
    expect(draft?.draft_version).toBe('2');
    const updates = await db()`
      select count(*)::int as count from public.plan_audit_events
      where workspace_id = ${fixture.workspaceId} and plan_id = ${id}
        and action = 'plan.draft_updated'
    `;
    expect(updates[0]?.count).toBe(1);
  });

  it('rejects revision mutation and deletion for direct DML roles and retains prior published revisions', async () => {
    const id = await seedPlan();
    await expect(db()`
      update public.plan_drafts set draft_version = 3, updated_at = now() + interval '1 second'
      where workspace_id = ${fixture.workspaceId} and plan_id = ${id}
    `).rejects.toBeDefined();
    await expect(db()`
      delete from public.plan_roots where workspace_id = ${fixture.workspaceId} and id = ${id}
    `).rejects.toBeDefined();
    const [revision] = await db()`
      insert into public.plan_revisions (
        workspace_id, plan_id, revision_number, source_draft_version, plan_kind, content, authored_by
      ) values (
        ${fixture.workspaceId}, ${id}, 1, 1, 'workout', '{"schema_version":1,"days":[]}'::jsonb,
        ${fixture.context.trainerA.userId}
      ) returning id
      `;
    const [newerRevision] = await db()`
      insert into public.plan_revisions (
        workspace_id, plan_id, revision_number, source_draft_version, plan_kind, content, authored_by
      ) values (
        ${fixture.workspaceId}, ${id}, 2, 2, 'workout', '{"schema_version":1,"days":[]}'::jsonb,
        ${fixture.context.trainerA.userId}
      ) returning id
    `;
    await expect(db()`
      update public.plan_revisions set content = '{"changed":true}'::jsonb
      where workspace_id = ${fixture.workspaceId} and id = ${revision!.id}
    `).rejects.toBeDefined();
    await expect(db()`
      delete from public.plan_revisions where workspace_id = ${fixture.workspaceId} and id = ${revision!.id}
    `).rejects.toBeDefined();
    for (const role of ['authenticated', 'service_role']) {
      await expect(
        db().begin(async (tx) => {
          await tx.unsafe(`set local role ${role}`);
          await tx`update public.plan_revisions set content = '{"changed":true}'::jsonb where id = ${revision!.id}`;
        }),
      ).rejects.toBeDefined();
      await expect(
        db().begin(async (tx) => {
          await tx.unsafe(`set local role ${role}`);
          await tx`delete from public.plan_revisions where id = ${revision!.id}`;
        }),
      ).rejects.toBeDefined();
    }
    const retained = await db()`
      select revision_number from public.plan_revisions
      where workspace_id = ${fixture.workspaceId} and plan_id = ${id}
      order by revision_number
    `;
    expect(retained.map((row) => row.revision_number)).toEqual(['1', '2']);
    expect(newerRevision).toBeDefined();
  });

  it('limits reads to coaching staff in the workspace and gives Sales and foreign staff no rows', async () => {
    const id = await seedPlan();
    const readAs = async (userId: string) =>
      db().begin(async (tx) => {
        await tx`set local role authenticated`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
        return tx`select id from public.plan_roots where workspace_id = ${fixture.workspaceId} and id = ${id}`;
      });
    expect(await readAs(fixture.context.trainerA.userId)).toHaveLength(1);
    expect(await readAs(fixture.context.woA.userId)).toHaveLength(1);
    expect(await readAs(fixture.context.po.userId)).toHaveLength(1);
    expect(await readAs(fixture.context.salesA.userId)).toHaveLength(0);
    expect(await readAs(fixture.context.trainerB.userId)).toHaveLength(0);
    expect(await readAs(fixture.context.actors.client.userId)).toHaveLength(0);
  });

  it('rechecks authorization before create replay and denies Sales and foreign staff writes', async () => {
    const before = await db()`
      select count(*)::int as count from public.plan_roots
      where workspace_id = ${fixture.workspaceId} and client_id = ${fixture.clientId}
    `;
    const replayKey = randomUUID();
    const created = await fixture.context.trainerA.client.rpc(
      'create_plan_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_client_id: fixture.clientId,
        p_plan_kind: 'workout',
        p_content: workoutDocument(),
        p_operation_key: replayKey,
      },
    );
    expect(created.error).toBeNull();
    const sales = await fixture.context.salesA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.workspaceId,
      p_client_id: fixture.clientId,
      p_plan_kind: 'workout',
      p_content: workoutDocument(),
      p_operation_key: replayKey,
    });
    const foreign = await fixture.context.trainerB.client.rpc(
      'create_plan_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_client_id: fixture.clientId,
        p_plan_kind: 'workout',
        p_content: workoutDocument(),
        p_operation_key: randomUUID(),
      },
    );
    expect(sales.error).not.toBeNull();
    expect(String(sales.error?.message)).toContain('not_permitted');
    expect(foreign.error).not.toBeNull();
    expect(String(foreign.error?.message)).toContain('not_permitted');
    const unauthorizedSave = await fixture.context.salesA.client.rpc(
      'save_plan_draft',
      {
        p_plan_id: created.data,
        p_expected_draft_version: 1,
        p_content: workoutDocument('denied'),
        p_operation_key: randomUUID(),
      },
    );
    expect(unauthorizedSave.error).not.toBeNull();
    expect(String(unauthorizedSave.error?.message)).toContain('not_permitted');
    const after = await db()`
      select count(*)::int as count from public.plan_roots
      where workspace_id = ${fixture.workspaceId} and client_id = ${fixture.clientId}
    `;
    expect(after[0]?.count).toBe(before[0]!.count + 1);
  });
});
