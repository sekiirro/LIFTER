import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import { anonClient, checked } from './harness';
import {
  asUser,
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

// Spec 028 T001/T002: DB-level access and audit clauses. All principals and
// records are synthetic to this run.
let p: PortalFixture;
let subject: PortalClient;
let other: PortalClient;
let recipientCount: number;

beforeAll(async () => {
  p = await portalFixture();
  subject = await p.makeClient({ activate: true, label: '028 access subject' });
  other = await p.makeClient({ activate: true, label: '028 access other' });
  const moveToTwoDays = async (client: PortalClient) => {
    const [target] = await p.db`
      select ((clock_timestamp() at time zone 'Africa/Cairo')::date + 2)::date as day`;
    await p.db.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.subscription_activations a
        set activated_at = app_private.f23_cairo_date_start(${target!.day}::date - 30)
        where a.workspace_id = ${p.fixture.wsA.id}::uuid
          and a.subscription_id = ${client.subscriptionId}::uuid`;
      await tx`insert into public.subscription_manual_date_adjustments(
        workspace_id, client_id, subscription_id, new_service_start_date,
        new_service_end_exclusive, request_key, actor_user_id)
        values (${p.fixture.wsA.id}::uuid, ${client.clientId}::uuid,
          ${client.subscriptionId}::uuid, ${target!.day}::date - 30,
          ${target!.day}::date, ${randomUUID()}::uuid, ${p.fixture.po.userId}::uuid)`;
      await tx`set local session_replication_role = origin`;
    });
  };
  await moveToTwoDays(subject);
  await moveToTwoDays(other);
  await evaluate(
    new Date((await expiryAt(subject)).getTime() - 72 * 60 * 60 * 1000),
  );
  await evaluate(
    new Date((await expiryAt(other)).getTime() - 72 * 60 * 60 * 1000),
  );
  const [row] = await p.db`
    select count(*)::integer as n from (
      select user_id from public.staff_profiles
        where role = 'platform_owner'::public.staff_role
      union
      select m.user_id from public.workspace_memberships m
        join public.staff_profiles s on s.user_id = m.user_id
      where m.workspace_id = ${p.fixture.wsA.id}::uuid and m.revoked_at is null
        and s.role in ('workspace_owner', 'trainer')
        and app_private.role_has_capability(s.role, 'coaching_work')
    ) recipients`;
  recipientCount = Number(row!.n);
});
afterAll(async () => p?.close());

async function expiryAt(client: PortalClient) {
  const [core] = await p.db`
    select app_private.f22_subscription_core(${p.fixture.wsA.id}::uuid,
      ${client.clientId}::uuid) as value`;
  const day = (core!.value as { effective_end_exclusive: string })
    .effective_end_exclusive;
  const [row] = await p.db`
    select app_private.f23_cairo_date_start(${day}::date) as value`;
  return row!.value as Date;
}

async function evaluate(at: Date) {
  await p.db`select app_private.f23_subscription_expiry_notices_run(
    ${at.toISOString()}::timestamptz, 250)`;
}

async function asActor<T>(
  userId: string,
  body: (tx: TransactionSql) => Promise<T>,
) {
  return p.db.begin((tx) => asUser(tx, userId, body));
}

async function staffNotice(
  recipient: string,
  sourceKey = subject.subscriptionId,
) {
  const [row] = await p.db`
    select id, read_at from app_private.staff_inbox_notices
    where workspace_id = ${p.fixture.wsA.id}::uuid
      and source_key = ${sourceKey}::uuid and recipient_user_id = ${recipient}::uuid
      and notice_kind = 'subscription_expiring_t3'`;
  return row as { id: string; read_at: string | null } | undefined;
}

async function inRolledBackTx(body: (tx: TransactionSql) => Promise<void>) {
  const rollback = Symbol('rollback');
  try {
    await p.db.begin(async (tx) => {
      await body(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function expectDenied(run: () => Promise<unknown>) {
  let code: string | undefined;
  try {
    await run();
  } catch (error) {
    code = (error as { code?: string }).code;
  }
  expect(code, 'authorization denial must carry SQLSTATE 42501').toBe('42501');
}

describe('Spec 028 T001/T002 DB clauses', () => {
  it('T001 denies direct reader/list RPCs for foreign, revoked, Sales, Client, anonymous and unknown IDs without existence or count disclosure', async () => {
    const directoryArgs = {
      p_workspace_id: p.fixture.wsA.id,
      p_search: p.run,
      p_approval_state: null,
      p_subscription_status: 'expiring',
      p_limit: 100,
      p_offset: 0,
      p_assignment: null,
    };
    for (const client of [
      p.fixture.trainerB.client,
      p.fixture.salesA.client,
      anonClient(),
    ]) {
      const listed = await client.rpc('staff_client_directory', directoryArgs);
      expect(listed.error?.code).toBe('42501');
      expect(listed.data).toBeNull();
      const notices = await client.rpc('read_staff_notices', {
        p_limit: 100,
        p_before: null,
      });
      if (notices.error) {
        expect(notices.error.code).toBe('42501');
        expect(notices.data).toBeNull();
      } else {
        // Staff readers are recipient-scoped: an unauthorized actor receives
        // an empty page, never another recipient's row, id, name or count.
        expect(notices.data).toMatchObject({ status: 'ok', notices: [] });
      }
    }
    await expectDenied(() =>
      asActor(
        subject.authUserId,
        (tx) => tx`select public.read_staff_notices(100, null)`,
      ),
    );
    const salesRead = await asActor(p.fixture.salesA.userId, async (tx) => {
      const [row] =
        await tx`select public.read_staff_notices(100, null) as value`;
      return row!.value;
    });
    expect(salesRead).toMatchObject({ status: 'ok', notices: [] });
    for (const userId of [subject.authUserId, p.fixture.salesA.userId]) {
      await expectDenied(() =>
        asActor(
          userId,
          (tx) => tx`
          select public.staff_client_directory(${p.fixture.wsA.id}::uuid,
            ${p.run}, null, 'expiring', 100, 0, null)`,
        ),
      );
    }
    await expectDenied(() =>
      p.db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', '{"role":"anon"}', true)`;
        await tx`set local role anon`;
        try {
          await tx`select public.read_staff_notices(100, null)`;
        } finally {
          await tx`reset role`;
        }
      }),
    );
    // PO is platform-scoped: an unknown workspace is an empty page, never a
    // count or existence signal. Non-PO actors get the same denial as a
    // foreign workspace id.
    const poUnknown = await asActor(p.fixture.po.userId, async (tx) => {
      const [row] =
        await tx`select public.staff_client_directory(${randomUUID()}::uuid,
        null, null, 'expiring', 100, 0, null) as value`;
      return row!.value as { clients: unknown[]; has_more: boolean };
    });
    expect(poUnknown.clients).toEqual([]);
    expect(poUnknown.has_more).toBe(false);
    await expectDenied(() =>
      asActor(
        p.fixture.trainerB.userId,
        (tx) => tx`
        select public.staff_client_directory(${randomUUID()}::uuid,
          null, null, 'expiring', 100, 0, null)`,
      ),
    );
    await expectDenied(() =>
      asActor(
        subject.authUserId,
        (tx) => tx`
        select public.staff_client_directory(${randomUUID()}::uuid,
          null, null, 'expiring', 100, 0, null)`,
      ),
    );
    await expectDenied(() =>
      p.db.begin(async (tx) => {
        await tx`update public.workspace_memberships
          set revoked_at = clock_timestamp(), revoked_by = ${p.fixture.po.userId}::uuid
          where workspace_id = ${p.fixture.wsA.id}::uuid
            and user_id = ${p.fixture.trainerA.userId}::uuid`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({
          sub: p.fixture.trainerA.userId,
          role: 'authenticated',
        })}, true)`;
        await tx`set local role authenticated`;
        try {
          await tx`select public.staff_client_directory(${p.fixture.wsA.id}::uuid,
            ${p.run}, null, 'expiring', 100, 0, null)`;
        } finally {
          await tx`reset role`;
        }
      }),
    );
    await inRolledBackTx(async (tx) => {
      await tx`update public.workspace_memberships
        set revoked_at = clock_timestamp(), revoked_by = ${p.fixture.po.userId}::uuid
        where workspace_id = ${p.fixture.wsA.id}::uuid
          and user_id = ${p.fixture.trainerA.userId}::uuid`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({
        sub: p.fixture.trainerA.userId,
        role: 'authenticated',
      })}, true)`;
      await tx`set local role authenticated`;
      const [row] =
        await tx`select public.read_staff_notices(100, null) as value`;
      await tx`reset role`;
      expect((row!.value as { notices: unknown[] }).notices).toEqual([]);
    });
  });

  it('T002 applies the role matrix and excludes P7 audit rows from WO, Trainer, Sales and Client', async () => {
    for (const actor of [p.fixture.po, p.fixture.woA, p.fixture.trainerA]) {
      const notices = await actor.client.rpc('read_staff_notices', {
        p_limit: 100,
        p_before: null,
      });
      expect(notices.error).toBeNull();
      expect(
        (
          notices.data as { notices: Array<{ source_key: string }> }
        ).notices.some((row) => row.source_key === subject.subscriptionId),
      ).toBe(true);
      const list = await actor.client.rpc('staff_client_directory', {
        p_workspace_id: p.fixture.wsA.id,
        p_search: p.run,
        p_approval_state: null,
        p_subscription_status: 'expiring',
        p_limit: 100,
        p_offset: 0,
        p_assignment: null,
      });
      expect(list.error).toBeNull();
      expect(
        (list.data as { clients: Array<{ client_id: string }> }).clients.map(
          (row) => row.client_id,
        ),
      ).toContain(subject.clientId);
    }
    const [recipientRows] = await p.db`
      select count(distinct recipient_user_id)::integer as n
      from app_private.staff_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and source_key = ${subject.subscriptionId}::uuid
        and notice_kind = 'subscription_expiring_t3'`;
    expect(
      Number(recipientRows!.n),
      'every coaching-access recipient got a row',
    ).toBe(recipientCount);
    const ownClientNotices = await asActor(subject.authUserId, async (tx) => {
      const [row] =
        await tx`select public.read_client_notices(100, null) as value`;
      return row!.value as { notices: Array<{ notice_kind: string }> };
    });
    expect(ownClientNotices.notices.map((row) => row.notice_kind)).toContain(
      'subscription_expiring_t3',
    );
    for (const actor of [p.fixture.trainerB, p.fixture.salesA]) {
      const notices = await actor.client.rpc('read_staff_notices', {
        p_limit: 100,
        p_before: null,
      });
      expect(
        (
          notices.data as { notices: Array<{ source_key: string }> }
        ).notices.some((row) => row.source_key === subject.subscriptionId),
      ).toBe(false);
      const list = await actor.client.rpc('staff_client_directory', {
        p_workspace_id: p.fixture.wsA.id,
        p_search: p.run,
        p_approval_state: null,
        p_subscription_status: 'expiring',
        p_limit: 100,
        p_offset: 0,
        p_assignment: null,
      });
      expect(list.error?.code).toBe('42501');
      expect(list.data).toBeNull();
    }

    const ownerNotice = await staffNotice(p.fixture.woA.userId);
    expect(ownerNotice?.id).toBeTruthy();
    await asActor(
      p.fixture.woA.userId,
      (tx) =>
        tx`select public.mark_staff_notice_read(${ownerNotice!.id}::uuid)`,
    );
    const [allowListed] = await p.db`
      select id from public.audit_events
      where action = 'staff_notice.marked_read' and target_table = 'staff_inbox_notices'
        and target_id = ${ownerNotice!.id}::uuid order by id desc limit 1`;
    expect(allowListed?.id).toBeTruthy();
    const [p7Ledger] = await p.db`
      insert into public.audit_events(
        actor_user_id, action, target_table, target_id, workspace_id, details)
      values (${p.fixture.po.userId}::uuid, 'workforce.point_adjusted',
        'p7_ledger_entries', ${randomUUID()}::uuid, ${p.fixture.wsA.id}::uuid,
        ${p.db.json({ points: '-3.00', reason_code: 'synthetic_p7' })})
      returning id`;
    const [p7Notice] = await p.db`
      insert into public.audit_events(
        actor_user_id, action, target_table, target_id, workspace_id, details)
      values (${p.fixture.po.userId}::uuid, 'workforce.notice_detail',
        'staff_inbox_notices', ${randomUUID()}::uuid, ${p.fixture.wsA.id}::uuid,
        ${p.db.json({ reason_code: 'synthetic_p7' })})
      returning id`;
    const ids = [
      Number(allowListed!.id),
      Number(p7Ledger!.id),
      Number(p7Notice!.id),
    ];
    const poRows = checked(
      await p.fixture.po.client
        .from('audit_events')
        .select('id,details')
        .in('id', ids),
    );
    expect(poRows).not.toBeNull();
    expect(poRows!.map((row) => row.id).sort()).toEqual([...ids].sort());
    const woRows = checked(
      await p.fixture.woA.client
        .from('audit_events')
        .select('id,details')
        .in('id', ids),
    );
    expect(woRows).not.toBeNull();
    expect(woRows!.map((row) => row.id)).toEqual([Number(allowListed!.id)]);
    expect(JSON.stringify(woRows)).not.toContain('synthetic_p7');
    for (const actor of [p.fixture.trainerA, p.fixture.salesA]) {
      expect(
        checked(
          await actor.client.from('audit_events').select('id').in('id', ids),
        ),
      ).toEqual([]);
    }
    const clientRows = await asActor(
      subject.authUserId,
      (tx) => tx`
      select id from public.audit_events where id = any(${ids}::bigint[])`,
    );
    expect(clientRows).toEqual([]);
  });
});
