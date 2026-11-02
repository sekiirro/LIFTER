import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, anonClient, checked, createStaff, sql } from './harness';
import { authorize } from '../../lib/auth/authorize';
import { loadActorRows } from '../../lib/auth/actor';
import {
  clientContext,
  createRecoveryClientTarget,
  installedRecoveryTargetDefinition,
  PendingRlsAccessDenied,
  pendingHttpAccess,
  pendingRlsAccess,
  probe,
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
let poRecoverySession: {
  client: ReturnType<typeof anonClient>;
  claims: object;
} | null = null;

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

  it('PO can reset a pending client password without changing approval or access', async () => {
    const actor = po;
    const [before] = await db`
        select c.id, to_jsonb(c) as client_row
        from public.clients c where c.auth_user_id=${targetA.userId}`;
    expect(before).toBeDefined();
    expect(
      (
        await actor.client.rpc('recovery_link_authorize', {
          target: targetA.userId,
        })
      ).error,
    ).toBeNull();
    const record = await actor.client.rpc('recovery_link_record', {
      target: targetA.userId,
    });
    expect(record.error).toBeNull();
    expect(record.data).toBeTruthy();

    const link = await admin().auth.admin.generateLink({
      type: 'recovery',
      email: targetA.email,
    });
    const tokenHash = link.data.properties?.hashed_token;
    expect(link.error).toBeNull();
    expect(tokenHash).toBeTruthy();
    const recoveryClient = anonClient();
    expect(
      (
        await recoveryClient.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash!,
        })
      ).error,
    ).toBeNull();
    const newPassword = `Pending-Recovery-${randomUUID()}-Aa1!`;
    expect(
      (await recoveryClient.auth.updateUser({ password: newPassword })).error,
    ).toBeNull();

    const [after] = await db`
        select c.id, to_jsonb(c) as client_row
        from public.clients c where c.auth_user_id=${targetA.userId}`;
    expect(after?.client_row).toEqual(before!.client_row);
    expect(after?.client_row.approval_state).toBe('pending-approval');
    expect(
      await db`select id from public.audit_events where target_table='clients' and target_id=${before!.id} and action ilike '%update%'`,
    ).toHaveLength(0);

    const oldPassword = await anonClient().auth.signInWithPassword({
      email: targetA.email,
      password: targetA.password,
    });
    expect(oldPassword.error).not.toBeNull();
    const signedIn = anonClient();
    const signIn = await signedIn.auth.signInWithPassword({
      email: targetA.email,
      password: newPassword,
    });
    expect(signIn.error).toBeNull();
    expect(signIn.data.user?.id).toBe(targetA.userId);

    const claims = await signedIn.auth.getClaims();
    expect(claims.error).toBeNull();
    expect(claims.data?.claims.sub).toBe(targetA.userId);
    const actorRows = await loadActorRows(signedIn, targetA.userId);
    expect(actorRows).toMatchObject({
      userId: targetA.userId,
      role: null,
      activeWorkspaceIds: [],
    });
    const appActor = actorRows ?? {
      userId: targetA.userId,
      role: null,
      activeWorkspaceIds: [],
    };
    expect(authorize(appActor, 'coaching_work', targetA.workspaceId)).toBe(
      false,
    );
    expect(authorize(appActor, 'coaching_work', contextB.wsA.id)).toBe(false);
    poRecoverySession = { client: signedIn, claims: claims.data!.claims };
  });

  it('PO recovery remains denied by safe-column RLS probes in both workspaces', async () => {
    const session = poRecoverySession;
    if (!session) throw new Error('PO recovery session setup did not complete');
    const rlsProbeResults: boolean[] = [];
    for (const context of [contextA, contextB]) {
      try {
        await probe((tx) => pendingRlsAccess(tx, context, session.claims));
        rlsProbeResults.push(true);
      } catch (error) {
        if (!(error instanceof PendingRlsAccessDenied)) throw error;
        rlsProbeResults.push(false);
      }
    }
    expect(
      rlsProbeResults,
      'safe-column RLS probes for both workspaces',
    ).toEqual([true, true]);
  });

  it('PO recovery remains denied by HTTP access probes in both workspaces', async () => {
    const session = poRecoverySession;
    if (!session) throw new Error('PO recovery session setup did not complete');
    await pendingHttpAccess(session.client, contextA);
    await pendingHttpAccess(session.client, contextB);
  });

  it('WO can reset a pending client password without changing approval or access', async () => {
    // This recovery flow changes the account password. Keep its target isolated
    // from the PO recovery case so a prior reset/session cannot contaminate it.
    const isolatedTarget = await createRecoveryClientTarget(contextA);
    const actor = await createStaff(
      'workspace_owner',
      'client-recovery-reset-wo',
    );
    checked(
      await admin().from('workspace_memberships').insert({
        workspace_id: isolatedTarget.workspaceId,
        user_id: actor.userId,
        granted_by: po.userId,
      }),
    );
    const [before] = await db`
      select c.id, to_jsonb(c) as client_row
      from public.clients c where c.auth_user_id=${isolatedTarget.userId}`;
    expect(before).toBeDefined();
    expect(
      (
        await actor.client.rpc('recovery_link_authorize', {
          target: isolatedTarget.userId,
        })
      ).error,
    ).toBeNull();
    const record = await actor.client.rpc('recovery_link_record', {
      target: isolatedTarget.userId,
    });
    expect(record.error).toBeNull();
    expect(record.data).toBeTruthy();

    const link = await admin().auth.admin.generateLink({
      type: 'recovery',
      email: isolatedTarget.email,
    });
    const tokenHash = link.data.properties?.hashed_token;
    expect(link.error).toBeNull();
    expect(tokenHash).toBeTruthy();
    const recoveryClient = anonClient();
    expect(
      (
        await recoveryClient.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash!,
        })
      ).error,
    ).toBeNull();
    const newPassword = `Pending-Recovery-${randomUUID()}-Aa1!`;
    expect(
      (await recoveryClient.auth.updateUser({ password: newPassword })).error,
    ).toBeNull();

    const [after] = await db`
      select c.id, to_jsonb(c) as client_row
      from public.clients c where c.auth_user_id=${isolatedTarget.userId}`;
    expect(after?.client_row).toEqual(before!.client_row);
    expect(after?.client_row.approval_state).toBe('pending-approval');
    expect(
      await db`select id from public.audit_events where target_table='clients' and target_id=${before!.id} and action ilike '%update%'`,
    ).toHaveLength(0);

    const oldPassword = await anonClient().auth.signInWithPassword({
      email: isolatedTarget.email,
      password: isolatedTarget.password,
    });
    expect(oldPassword.error).not.toBeNull();
    const signedIn = anonClient();
    const signIn = await signedIn.auth.signInWithPassword({
      email: isolatedTarget.email,
      password: newPassword,
    });
    expect(signIn.error).toBeNull();
    expect(signIn.data.user?.id).toBe(isolatedTarget.userId);

    const claims = await signedIn.auth.getClaims();
    expect(claims.error).toBeNull();
    expect(claims.data?.claims.sub).toBe(isolatedTarget.userId);
    const actorRows = await loadActorRows(signedIn, isolatedTarget.userId);
    expect(actorRows).toMatchObject({
      userId: isolatedTarget.userId,
      role: null,
      activeWorkspaceIds: [],
    });
    const appActor = actorRows ?? {
      userId: isolatedTarget.userId,
      role: null,
      activeWorkspaceIds: [],
    };
    expect(
      authorize(appActor, 'coaching_work', isolatedTarget.workspaceId),
    ).toBe(false);
    expect(authorize(appActor, 'coaching_work', contextB.wsA.id)).toBe(false);
    const rlsProbeResults: boolean[] = [];
    for (const context of [contextA, contextB]) {
      try {
        await probe((tx) => pendingRlsAccess(tx, context, claims.data!.claims));
        rlsProbeResults.push(true);
      } catch (error) {
        if (!(error instanceof PendingRlsAccessDenied)) throw error;
        rlsProbeResults.push(false);
      }
    }
    expect(
      rlsProbeResults,
      'safe-column RLS probes for both workspaces',
    ).toEqual([true, true]);
    await pendingHttpAccess(signedIn, contextA);
    await pendingHttpAccess(signedIn, contextB);
  }, 90_000);

  it('recovery code and F4 RPC definitions never update public.clients', async () => {
    const source = await readFile('app/auth/recovery/actions.ts', 'utf8');
    expect(source).not.toMatch(/update\s+(?:public\.)?clients\b/i);
    const definitions = await db`
      select pg_catalog.pg_get_functiondef(p.oid) as definition
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where (n.nspname='public' and p.proname like 'recovery_link_%')
        or (n.nspname='app_private' and p.proname in ('recovery_link_guard','recovery_target_workspace'))
    `;
    expect(definitions.length).toBeGreaterThanOrEqual(2);
    for (const { definition } of definitions)
      expect(definition).not.toMatch(/update\s+(?:public\.)?clients\b/i);
  });

  it('negative control: the full clients-row equality catches an approval mutation', async () => {
    await probe(async (tx) => {
      const [before] = await tx`
        select to_jsonb(c) as client_row from public.clients c
        where c.auth_user_id=${targetA.userId}`;
      const [after] = await tx`
        select jsonb_set(${tx.json(before!.client_row)},'{approval_state}','"active"') as client_row`;
      expect(after?.client_row.approval_state).toBe('active');
      expect(() =>
        expect(after?.client_row).toEqual(before!.client_row),
      ).toThrow();
    });
  });
});
