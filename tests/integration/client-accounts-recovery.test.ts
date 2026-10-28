import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, anonClient, checked, createStaff, sql } from './harness';
import {
  clientContext,
  createRecoveryClientTarget,
  installedRecoveryTargetDefinition,
  restoreRecoveryTargetFixture,
  type ClientContext,
  type RecoveryClientTarget,
} from './client-accounts-fixture';

const db = sql();
let contextA: ClientContext;
let contextB: ClientContext;
let targetA: RecoveryClientTarget;
let targetB: RecoveryClientTarget;
let po: Awaited<ReturnType<typeof createStaff>>;
let woA: Awaited<ReturnType<typeof createStaff>>;
let trainerA: Awaited<ReturnType<typeof createStaff>>;
let salesA: Awaited<ReturnType<typeof createStaff>>;

beforeAll(async () => {
  contextA = await clientContext();
  contextB = await clientContext();
  targetA = await createRecoveryClientTarget(contextA);
  targetB = await createRecoveryClientTarget(contextB);
  po = await createStaff('platform_owner', 'client-recovery-po');
  woA = await createStaff('workspace_owner', 'client-recovery-wo-a');
  trainerA = await createStaff('trainer', 'client-recovery-trainer-a');
  salesA = await createStaff('sales', 'client-recovery-sales-a');
  checked(
    await admin()
      .from('workspace_memberships')
      .insert(
        [woA, trainerA, salesA].map((actor) => ({
          workspace_id: targetA.workspaceId,
          user_id: actor.userId,
          granted_by: po.userId,
        })),
      ),
  );
});

afterAll(async () => {
  await db.end();
});

describe('F11 client recovery linkage', () => {
  it('restores the installed lookup after the preceding F4 helper override', async () => {
    const [before] = await db`
      select prosecdef, to_jsonb(proconfig) as proconfig,
        pg_catalog.pg_get_userbyid(proowner) as proowner,
        to_jsonb(proacl) as proacl, provolatile
      from pg_catalog.pg_proc
      where oid='app_private.recovery_target_workspace(uuid)'::regprocedure`;
    const [installed] =
      await db`select pg_catalog.pg_get_functiondef('app_private.recovery_target_workspace(uuid)'::regprocedure) as definition`;
    try {
      await db`create or replace function app_private.recovery_target_workspace(target uuid) returns uuid
        language sql stable security definer set search_path = '' as $$
          select null::uuid;
        $$`;
    } finally {
      await db.unsafe(installed!.definition as string);
    }
    const [after] = await db`
      select prosecdef, to_jsonb(proconfig) as proconfig,
        pg_catalog.pg_get_userbyid(proowner) as proowner,
        to_jsonb(proacl) as proacl, provolatile
      from pg_catalog.pg_proc
      where oid='app_private.recovery_target_workspace(uuid)'::regprocedure`;
    expect(after).toEqual(before);
    expect(after).toEqual({
      prosecdef: true,
      proconfig: ['search_path=""'],
      proowner: 'postgres',
      proacl: ['postgres=X/postgres'],
      provolatile: 's',
    });
    const [lookup] =
      await db`select app_private.recovery_target_workspace(${targetA.userId}) as workspace_id`;
    expect(lookup?.workspace_id).toBe(targetA.workspaceId);
  });

  it('maps committed signup Auth IDs to their workspaces, with no orphan mapping', async () => {
    const rows = await db`
      select c.auth_user_id, c.workspace_id,
        app_private.recovery_target_workspace(c.auth_user_id) as resolved_workspace
      from public.clients c
      where c.auth_user_id in (${targetA.userId}, ${targetB.userId})
      order by c.workspace_id`;
    expect(rows).toEqual(
      [
        {
          auth_user_id: targetA.userId,
          workspace_id: targetA.workspaceId,
          resolved_workspace: targetA.workspaceId,
        },
        {
          auth_user_id: targetB.userId,
          workspace_id: targetB.workspaceId,
          resolved_workspace: targetB.workspaceId,
        },
      ].sort((a, b) => a.workspace_id.localeCompare(b.workspace_id)),
    );
    const [orphan] =
      await db`select app_private.recovery_target_workspace(${randomUUID()}) as workspace_id`;
    expect(orphan?.workspace_id).toBeNull();
  });

  it('preserves the F4 helper catalog attributes from its placeholder', async () => {
    const [attributes] = await db`
      select prosecdef, to_jsonb(proconfig) as proconfig,
        pg_catalog.pg_get_userbyid(proowner) as proowner,
        to_jsonb(proacl) as proacl, provolatile
      from pg_catalog.pg_proc
      where oid='app_private.recovery_target_workspace(uuid)'::regprocedure`;
    expect(attributes).toEqual({
      prosecdef: true,
      proconfig: ['search_path=""'],
      proowner: 'postgres',
      proacl: ['postgres=X/postgres'],
      provolatile: 's',
    });
  });

  it('keeps existing PO and WO scope while denying foreign, role, self, staff and anonymous targets', async () => {
    for (const [caller, target, allowed, workspaceId] of [
      [po, targetA, true, targetA.workspaceId],
      [po, targetB, true, targetB.workspaceId],
      [woA, targetA, true, targetA.workspaceId],
      [woA, targetB, false, null],
      [trainerA, targetA, false, null],
      [salesA, targetA, false, null],
    ] as const) {
      const result = await caller.client.rpc('recovery_link_authorize', {
        target: target.userId,
      });
      if (allowed) {
        expect(result.error).toBeNull();
        expect(result.data).toBe(workspaceId);
      } else {
        expect(result.error).toMatchObject({
          code: '42501',
          message: 'not_permitted',
        });
      }
    }
    const anonymous = await anonClient().rpc('recovery_link_authorize', {
      target: targetA.userId,
    });
    expect(anonymous.error?.code).toBe('42501');
    expect(anonymous.data).toBeNull();
    const self = await targetA.client.rpc('recovery_link_authorize', {
      target: targetA.userId,
    });
    expect(self.error).toMatchObject({
      code: '42501',
      message: 'not_permitted',
    });
    const staff = await po.client.rpc('recovery_link_authorize', {
      target: woA.userId,
    });
    expect(staff.error).toMatchObject({
      code: '42501',
      message: 'not_permitted',
    });
  });

  it('repeats guard on record and writes one tenant-attributed audit event', async () => {
    expect(
      (
        await po.client.rpc('recovery_link_authorize', {
          target: targetA.userId,
        })
      ).error,
    ).toBeNull();
    const record = await po.client.rpc('recovery_link_record', {
      target: targetA.userId,
    });
    expect(record.error).toBeNull();
    const rows = await db`
      select actor_user_id,workspace_id,details
      from public.audit_events
      where target_table='recovery_link_issuances' and target_id=${record.data}
        and action='recovery_link.generated'`;
    expect(rows).toEqual([
      {
        actor_user_id: po.userId,
        workspace_id: targetA.workspaceId,
        details: { target_user_id: targetA.userId },
      },
    ]);
    expect(JSON.stringify(rows[0]?.details)).not.toContain('@');
  });

  it('denies a revoked workspace owner for the committed client target', async () => {
    checked(
      await admin()
        .from('workspace_memberships')
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: po.userId,
        })
        .eq('user_id', woA.userId)
        .eq('workspace_id', targetA.workspaceId),
    );
    const result = await woA.client.rpc('recovery_link_authorize', {
      target: targetA.userId,
    });
    expect(result.error).toMatchObject({
      code: '42501',
      message: 'not_permitted',
    });
  });

  it('restores the full installed lookup after a temporary F4 fixture override', async () => {
    const [before] = await db`
      select prosecdef, to_jsonb(proconfig) as proconfig,
        pg_catalog.pg_get_userbyid(proowner) as proowner,
        to_jsonb(proacl) as proacl, provolatile
      from pg_catalog.pg_proc
      where oid='app_private.recovery_target_workspace(uuid)'::regprocedure`;
    const installedDefinition = await installedRecoveryTargetDefinition(db);
    await db`create table if not exists public.test_recovery_targets(user_id uuid primary key, workspace_id uuid not null)`;
    try {
      await db`insert into public.test_recovery_targets(user_id,workspace_id) values (${targetA.userId},${targetA.workspaceId}) on conflict(user_id) do update set workspace_id=excluded.workspace_id`;
      await db`create or replace function app_private.recovery_target_workspace(target uuid) returns uuid
        language sql stable security definer set search_path = '' as $$
          select workspace_id from public.test_recovery_targets where user_id=target;
        $$`;
      await restoreRecoveryTargetFixture(db, installedDefinition);
    } finally {
      await db`drop table if exists public.test_recovery_targets`;
    }
    const [after] = await db`
      select prosecdef, to_jsonb(proconfig) as proconfig,
        pg_catalog.pg_get_userbyid(proowner) as proowner,
        to_jsonb(proacl) as proacl, provolatile
      from pg_catalog.pg_proc
      where oid='app_private.recovery_target_workspace(uuid)'::regprocedure`;
    expect(after).toEqual(before);
    expect(after).toEqual({
      prosecdef: true,
      proconfig: ['search_path=""'],
      proowner: 'postgres',
      proacl: ['postgres=X/postgres'],
      provolatile: 's',
    });
    const [lookup] =
      await db`select app_private.recovery_target_workspace(${targetA.userId}) as workspace_id`;
    expect(lookup?.workspace_id).toBe(targetA.workspaceId);
  });
});
