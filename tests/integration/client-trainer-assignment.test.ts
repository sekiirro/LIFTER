import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  graph,
  clientContext,
  sql,
  type Context,
} from './registration-approval-fixture';
import { pending } from './client-accounts-fixture';
import { admin, checked, createStaff, loadEnv } from './harness';
import { withCrashSafeFunctionMutant } from './function-drift-guard';
import { issue } from './registration-links-fixture';
import { FINANCIAL_RESOLUTION_ACKNOWLEDGEMENT } from '../../lib/client-accounts/deletion-policy';
import { drainAccountDeletions } from '../../workers/cron/src/account-deletion';

let db: ReturnType<typeof sql>;
beforeAll(() => {
  db = sql();
});
afterAll(async () => db?.end());

async function approvedClient(context: Context) {
  return db.begin((tx) => graph(tx, context));
}

async function waitForLockWait(queryText: string) {
  const observer = sql();
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      const [row] = await observer`
        select count(*)::int as count from pg_stat_activity
        where wait_event_type='Lock' and query ilike ${`%${queryText}%`}`;
      if ((row?.count as number) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Statement did not reach a lock wait: ${queryText}`);
  } finally {
    await observer.end();
  }
}

describe('F11 responsible-Trainer assignment T050', () => {
  it('installs the authoritative append-only assignment record and lookup/write contracts', async () => {
    const [catalog] = await db`
      select to_regclass('public.client_trainer_assignments') as assignments,
        to_regprocedure('public.assign_client_responsible_trainer(uuid,uuid,uuid)')::text as writer,
        to_regprocedure('public.client_responsible_trainer(uuid,uuid)')::text as reader,
        to_regprocedure('app_private.current_assigned_trainer(uuid,uuid)')::text as f19_reader`;
    expect(catalog).toEqual({
      assignments: 'client_trainer_assignments',
      writer: 'assign_client_responsible_trainer(uuid,uuid,uuid)',
      reader: 'client_responsible_trainer(uuid,uuid)',
      f19_reader: 'app_private.current_assigned_trainer(uuid,uuid)',
    });
  });

  it('lets only the PO assign an approved same-workspace active Trainer and retains replaced rows', async () => {
    const context = await clientContext();
    const clientId = (await approvedClient(context)).client;
    const trainerC = await createStaff('trainer', 'assignment-c');
    const granted = await admin().from('workspace_memberships').insert({
      workspace_id: context.wsA.id,
      user_id: trainerC.userId,
      granted_by: context.po.userId,
    });
    if (granted.error) throw new Error(granted.error.message);
    const first = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientId,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(first.data).toMatchObject({ status: 'ok' });
    const changed = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientId,
        p_trainer_user_id: trainerC.userId,
      },
    );
    expect(changed.data).toMatchObject({ status: 'ok' });
    const [rows] = await db`
      select count(*)::int as total,
        count(*) filter(where ended_at is null)::int as active,
        count(*) filter(where ended_at is not null)::int as ended
      from public.client_trainer_assignments
      where workspace_id=${context.wsA.id} and client_id=${clientId}`;
    expect(rows).toEqual({ total: 2, active: 1, ended: 1 });
    await expect(db`delete from public.client_trainer_assignments
      where workspace_id=${context.wsA.id} and client_id=${clientId}`).rejects.toThrow(
      /client_trainer_assignment_immutable/,
    );
    const [role] =
      await db`select role from public.staff_profiles where user_id=${context.trainerA.userId}`;
    const [membership] =
      await db`select count(*)::int as count from public.workspace_memberships
      where workspace_id=${context.wsA.id} and user_id=${context.trainerA.userId} and revoked_at is null`;
    expect(role!.role).toBe('trainer');
    expect(membership!.count).toBe(1);
    const lookup = await context.po.client.rpc('client_responsible_trainer', {
      p_workspace_id: context.wsA.id,
      p_client_id: clientId,
    });
    expect(lookup.data).toMatchObject({
      status: 'ok',
      trainer_user_id: trainerC.userId,
    });
  });

  it('rejects non-PO, cross-workspace and inactive trainer writes without rows', async () => {
    const context = await clientContext();
    const clientId = (await approvedClient(context)).client;
    const denied = await context.trainerA.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientId,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(denied.data).toMatchObject({ status: 'not_permitted' });
    const crossWorkspace = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientId,
        p_trainer_user_id: context.trainerB.userId,
      },
    );
    expect(crossWorkspace.data).toMatchObject({ status: 'not_permitted' });
    const [rows] = await db`
      select count(*)::int as count from public.client_trainer_assignments
      where workspace_id=${context.wsA.id} and client_id=${clientId}`;
    expect(rows!.count).toBe(0);
    const invalidBeforeAuthorization = await context.trainerA.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: null,
        p_client_id: null,
        p_trainer_user_id: null,
      },
    );
    expect(invalidBeforeAuthorization.data).toMatchObject({
      status: 'not_permitted',
    });
  });

  it('kills the T050 active same-workspace membership guard mutation', async () => {
    const context = await clientContext();
    const clientId = (await approvedClient(context)).client;
    let probeError: unknown = null;
    try {
      await withCrashSafeFunctionMutant(
        'public.assign_client_responsible_trainer(uuid, uuid, uuid)',
        (definition) =>
          definition.replace(
            /if membership_id is null then return jsonb_build_object\('status', 'not_permitted'\); end if;/,
            "if false then return jsonb_build_object('status', 'not_permitted'); end if;",
          ),
        async () => {
          const crossWorkspace = await context.po.client.rpc(
            'assign_client_responsible_trainer',
            {
              p_workspace_id: context.wsA.id,
              p_client_id: clientId,
              p_trainer_user_id: context.trainerB.userId,
            },
          );
          expect(crossWorkspace.error).toBeNull();
          expect(crossWorkspace.data).toMatchObject({
            status: 'not_permitted',
          });
        },
      );
    } catch (error) {
      probeError = error;
    }
    expect(
      probeError,
      'Mutant survived for T050 membership authorization',
    ).not.toBeNull();
    expect(String(probeError)).not.toContain('Mutation did not change');
    expect(String(probeError)).not.toContain('Missing function');
  });

  it('refuses assignment before approval and writes no row', async () => {
    const context = await clientContext();
    const client = await db.begin((tx) => pending(tx, context));
    const denied = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: client.id,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(denied.data).toMatchObject({ status: 'not_permitted' });
    const [rows] = await db`
      select count(*)::int as count from public.client_trainer_assignments
      where workspace_id=${context.wsA.id} and client_id=${client.id}`;
    expect(rows!.count).toBe(0);
  });

  it('returns unassigned after membership revocation and does not reactivate on restoration', async () => {
    const context = await clientContext();
    const clientId = (await approvedClient(context)).client;
    const assigned = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientId,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(assigned.data).toMatchObject({ status: 'ok' });
    await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: context.po.userId, role: 'authenticated' })},true)`;
      await tx`update public.workspace_memberships set revoked_at=statement_timestamp(), revoked_by=${context.po.userId}
        where workspace_id=${context.wsA.id} and user_id=${context.trainerA.userId} and revoked_at is null`;
    });
    const lookup = await context.po.client.rpc('client_responsible_trainer', {
      p_workspace_id: context.wsA.id,
      p_client_id: clientId,
    });
    expect(lookup.data).toMatchObject({ status: 'ok', trainer_user_id: null });
    const revokedTarget = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientId,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(revokedTarget.data).toMatchObject({ status: 'not_permitted' });
    const restore = await admin().from('workspace_memberships').insert({
      workspace_id: context.wsA.id,
      user_id: context.trainerA.userId,
      granted_by: context.po.userId,
    });
    if (restore.error) throw new Error(restore.error.message);
    const stillUnassigned = await context.po.client.rpc(
      'client_responsible_trainer',
      { p_workspace_id: context.wsA.id, p_client_id: clientId },
    );
    expect(stillUnassigned.data).toMatchObject({
      status: 'ok',
      trainer_user_id: null,
    });
  });

  it('ends the assignment on a global role change and keeps it ended after role restoration', async () => {
    const context = await clientContext();
    const clientId = (await approvedClient(context)).client;
    const assigned = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientId,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(assigned.data).toMatchObject({ status: 'ok' });
    await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: context.po.userId, role: 'authenticated' })},true)`;
      await tx`update public.staff_profiles set role='sales' where user_id=${context.trainerA.userId}`;
    });
    const afterChange = await context.po.client.rpc(
      'client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientId,
      },
    );
    expect(afterChange.data).toMatchObject({
      status: 'ok',
      trainer_user_id: null,
    });
    await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: context.po.userId, role: 'authenticated' })},true)`;
      await tx`update public.staff_profiles set role='trainer' where user_id=${context.trainerA.userId}`;
    });
    const afterRestore = await context.po.client.rpc(
      'client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientId,
      },
    );
    expect(afterRestore.data).toMatchObject({
      status: 'ok',
      trainer_user_id: null,
    });
  });

  it('refuses an assignment waiting behind a concurrent Trainer membership departure', async () => {
    const context = await clientContext();
    const clientId = (await approvedClient(context)).client;
    const revoker = sql();
    let assignment!: Promise<unknown>;
    try {
      await db.begin(async (tx) => {
        await tx`select id from public.clients where workspace_id=${context.wsA.id} and id=${clientId} for update`;
        await revoker.begin(async (revokeTx) => {
          await revokeTx`select set_config('request.jwt.claims',${JSON.stringify({ sub: context.po.userId, role: 'authenticated' })},true)`;
          await revokeTx`update public.workspace_memberships set revoked_at=statement_timestamp(), revoked_by=${context.po.userId}
            where workspace_id=${context.wsA.id} and user_id=${context.trainerA.userId} and revoked_at is null`;
        });
        assignment = Promise.resolve(
          context.po.client.rpc('assign_client_responsible_trainer', {
            p_workspace_id: context.wsA.id,
            p_client_id: clientId,
            p_trainer_user_id: context.trainerA.userId,
          }),
        );
        await waitForLockWait('assign_client_responsible_trainer');
      });
      const assigned = await assignment;
      expect(assigned).toMatchObject({ data: { status: 'not_permitted' } });
      const [rows] = await db`
        select count(*)::int as total, count(*) filter(where ended_at is null)::int as active
        from public.client_trainer_assignments where workspace_id=${context.wsA.id} and client_id=${clientId}`;
      expect(rows).toEqual({ total: 0, active: 0 });
    } finally {
      await revoker.end();
    }
  });

  it('allows a service-role Trainer departure by system-ending active assignments while keeping history', async () => {
    const context = await clientContext();
    const clientId = (await approvedClient(context)).client;
    const assigned = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientId,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(assigned.data).toMatchObject({ status: 'ok' });

    // S57-PO-1: the NULL-auth.uid service-role staff departure path atomically ends active assignments with ended_by_system = true.
    const departure = await admin()
      .from('staff_profiles')
      .update({ role: 'sales' })
      .eq('user_id', context.trainerA.userId);
    expect(departure.error).toBeNull();

    const [state] = await db`
      select p.role::text,
        count(a.id)::int as total,
        count(a.id) filter(where a.ended_at is null)::int as active,
        count(a.id) filter(where a.ended_at is not null and a.ended_by is null and a.ended_by_system)::int as system_ended
      from public.staff_profiles p
      left join public.client_trainer_assignments a
        on a.workspace_id=${context.wsA.id} and a.client_id=${clientId}
          and a.trainer_user_id=p.user_id
      where p.user_id=${context.trainerA.userId}
      group by p.role`;
    expect(state).toEqual({
      role: 'sales',
      total: 1,
      active: 0,
      system_ended: 1,
    });

    const lookup = await context.po.client.rpc('client_responsible_trainer', {
      p_workspace_id: context.wsA.id,
      p_client_id: clientId,
    });
    expect(lookup.data).toMatchObject({
      status: 'ok',
      trainer_user_id: null,
    });

    const unassignedDeparture = await admin()
      .from('staff_profiles')
      .update({ role: 'sales' })
      .eq('user_id', context.trainerB.userId);
    expect(unassignedDeparture.error).toBeNull();
    const [unassignedRole] = await db`
      select role from public.staff_profiles where user_id=${context.trainerB.userId}`;
    expect(unassignedRole?.role).toBe('sales');
  });

  it('serializes an in-flight assignment before a same-workspace membership revocation', async () => {
    const context = await clientContext();
    const clientId = (await approvedClient(context)).client;
    const initial = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientId,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(initial.data).toMatchObject({ status: 'ok' });
    const trainerC = await createStaff('trainer', 'assignment-race-membership');
    const granted = await admin().from('workspace_memberships').insert({
      workspace_id: context.wsA.id,
      user_id: trainerC.userId,
      granted_by: context.po.userId,
    });
    if (granted.error) throw new Error(granted.error.message);

    const blocker = sql();
    const departureDb = sql();
    let assignment: Promise<unknown> | undefined;
    let departure: Promise<unknown> | undefined;
    let departureWaited = false;
    try {
      await blocker.begin(async (tx) => {
        await tx`select id from public.client_trainer_assignments
          where workspace_id=${context.wsA.id} and client_id=${clientId}
            and trainer_user_id=${context.trainerA.userId} and ended_at is null
          for update`;
        assignment = Promise.resolve(
          context.po.client.rpc('assign_client_responsible_trainer', {
            p_workspace_id: context.wsA.id,
            p_client_id: clientId,
            p_trainer_user_id: trainerC.userId,
          }),
        );
        await waitForLockWait('assign_client_responsible_trainer');
        departure = departureDb.begin(async (departureTx) => {
          await departureTx`select set_config('request.jwt.claims',${JSON.stringify({ sub: context.po.userId, role: 'authenticated' })},true)`;
          await departureTx`update public.workspace_memberships
            set revoked_at=statement_timestamp(), revoked_by=${context.po.userId}
            where workspace_id=${context.wsA.id} and user_id=${trainerC.userId} and revoked_at is null`;
        });
        try {
          await waitForLockWait('update public.workspace_memberships');
          departureWaited = true;
        } catch {
          departureWaited = false;
        }
      });

      const assigned = await assignment;
      expect(assigned).toMatchObject({ data: { status: 'ok' } });
      await departure;
      const [history] = await db`
        select count(*)::int as total,
          count(*) filter(where ended_at is null)::int as active,
          count(*) filter(where ended_at is not null)::int as ended
        from public.client_trainer_assignments
        where workspace_id=${context.wsA.id} and client_id=${clientId}
          and trainer_user_id=${trainerC.userId}`;
      expect(history).toEqual({ total: 1, active: 0, ended: 1 });
      const lookup = await context.po.client.rpc('client_responsible_trainer', {
        p_workspace_id: context.wsA.id,
        p_client_id: clientId,
      });
      expect(lookup.data).toMatchObject({
        status: 'ok',
        trainer_user_id: null,
      });
      expect(departureWaited).toBe(true);
    } finally {
      await blocker.end();
      await assignment?.catch(() => undefined);
      await departure?.catch(() => undefined);
      await departureDb.end();
    }
  });

  it('serializes an in-flight assignment before global role departure and does not reactivate after restoration', async () => {
    const context = await clientContext();
    const clientId = (await approvedClient(context)).client;
    const initial = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientId,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(initial.data).toMatchObject({ status: 'ok' });
    const trainerC = await createStaff('trainer', 'assignment-race-role');
    const granted = await admin().from('workspace_memberships').insert({
      workspace_id: context.wsA.id,
      user_id: trainerC.userId,
      granted_by: context.po.userId,
    });
    if (granted.error) throw new Error(granted.error.message);

    const blocker = sql();
    const departureDb = sql();
    let assignment: Promise<unknown> | undefined;
    let departure: Promise<unknown> | undefined;
    let departureWaited = false;
    try {
      await blocker.begin(async (tx) => {
        await tx`select id from public.client_trainer_assignments
          where workspace_id=${context.wsA.id} and client_id=${clientId}
            and trainer_user_id=${context.trainerA.userId} and ended_at is null
          for update`;
        assignment = Promise.resolve(
          context.po.client.rpc('assign_client_responsible_trainer', {
            p_workspace_id: context.wsA.id,
            p_client_id: clientId,
            p_trainer_user_id: trainerC.userId,
          }),
        );
        await waitForLockWait('assign_client_responsible_trainer');
        departure = departureDb.begin(async (departureTx) => {
          await departureTx`select set_config('request.jwt.claims',${JSON.stringify({ sub: context.po.userId, role: 'authenticated' })},true)`;
          await departureTx`update public.staff_profiles set role='sales'
            where user_id=${trainerC.userId}`;
        });
        try {
          await waitForLockWait('update public.staff_profiles');
          departureWaited = true;
        } catch {
          departureWaited = false;
        }
      });

      const assigned = await assignment;
      expect(assigned).toMatchObject({ data: { status: 'ok' } });
      await departure;
      const [history] = await db`
        select count(*)::int as total,
          count(*) filter(where ended_at is null)::int as active,
          count(*) filter(where ended_at is not null)::int as ended
        from public.client_trainer_assignments
        where workspace_id=${context.wsA.id} and client_id=${clientId}
          and trainer_user_id=${trainerC.userId}`;
      expect(history).toEqual({ total: 1, active: 0, ended: 1 });

      await db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: context.po.userId, role: 'authenticated' })},true)`;
        await tx`update public.staff_profiles set role='trainer'
          where user_id=${trainerC.userId}`;
      });
      const lookup = await context.po.client.rpc('client_responsible_trainer', {
        p_workspace_id: context.wsA.id,
        p_client_id: clientId,
      });
      expect(lookup.data).toMatchObject({
        status: 'ok',
        trainer_user_id: null,
      });
      expect(departureWaited).toBe(true);
    } finally {
      await blocker.end();
      await assignment?.catch(() => undefined);
      await departure?.catch(() => undefined);
      await departureDb.end();
    }
  });

  it('S56-R12 refuses assignment for non-active clients and deletion-intended Trainers', async () => {
    const context = await clientContext();
    const createdAuth = await admin().auth.admin.createUser({
      email: `s56-r12-${randomUUID()}@example.test`,
      password: `F11-${randomUUID()}-aA1!`,
      email_confirm: true,
    });
    if (createdAuth.error || !createdAuth.data.user) {
      throw new Error(createdAuth.error?.message ?? 'Missing auth user');
    }
    const clientAAuthId = createdAuth.data.user.id;
    const clientA = (
      await db.begin((tx) => graph(tx, context, { authUserId: clientAAuthId }))
    ).client;
    const linkB = checked(await issue(context)) as string;
    const clientB = (
      await db.begin((tx) => graph(tx, { ...context, link: linkB }))
    ).client;

    // 1) deletion_pending via real request_account_deletion
    const clientRequest = await context.po.client.rpc(
      'request_account_deletion',
      {
        p_target_user_id: clientAAuthId,
        p_financial_confirmation: {
          category: 'other',
          acknowledgement: FINANCIAL_RESOLUTION_ACKNOWLEDGEMENT.en,
        },
      },
    );
    expect(clientRequest.data).toMatchObject({ status: 'deletion_pending' });
    const intentId = (clientRequest.data as { intent_id: string }).intent_id;

    const assignPending = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientA,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(assignPending.data).toMatchObject({ status: 'not_permitted' });

    // 2) release_pending via step A + step B
    await db`
      update auth.users
      set banned_until = '9999-12-31T23:59:59Z'::timestamptz
      where id = ${clientAAuthId}
    `;
    const claimed = await admin().rpc('claim_account_deletion_intents', {
      p_limit: 100,
    });
    const leased = (
      claimed.data as Array<{ id: string; lease_token: string }>
    ).find((item) => item.id === intentId)!;
    expect(
      (
        await admin().rpc('advance_deletion_step_a', {
          p_intent_id: intentId,
          p_lease_token: leased.lease_token,
        })
      ).data,
    ).toBe(true);
    expect(
      (
        await admin().rpc('execute_deletion_step_b', {
          p_intent_id: intentId,
          p_lease_token: leased.lease_token,
        })
      ).data,
    ).toBe(true);

    const assignReleasePending = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientA,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(assignReleasePending.data).toMatchObject({
      status: 'not_permitted',
    });

    // 3) released via restricted continuation (step C + step D)
    await db`
      update app_private.account_deletion_intents
      set lease_token = null, lease_expires_at = null
      where id = ${intentId}
    `;
    const env = loadEnv();
    await drainAccountDeletions(
      {
        SUPABASE_URL: env.apiUrl,
        SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
      },
      { limit: 100 },
    );
    const [releasedRow] = await db`
      select deletion_state from public.clients where id = ${clientA}
    `;
    expect(releasedRow?.deletion_state).toBe('released');

    const assignReleased = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientA,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(assignReleased.data).toMatchObject({ status: 'not_permitted' });

    const request = await context.po.client.rpc('request_account_deletion', {
      p_target_user_id: context.trainerB.userId,
    });
    expect(request.data).toMatchObject({ status: 'deletion_pending' });

    const assignTrainer = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientB,
        p_trainer_user_id: context.trainerB.userId,
      },
    );
    expect(assignTrainer.data).toMatchObject({ status: 'not_permitted' });

    const rows = await db`
      select id from public.client_trainer_assignments
      where client_id in (${clientA}, ${clientB})
    `;
    expect(rows).toEqual([]);
  });
});
