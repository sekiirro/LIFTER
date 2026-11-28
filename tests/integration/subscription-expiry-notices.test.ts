import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

// Spec 028 backend slice 1: expiry rows use F13's projected boundary and the
// current F23 recipient wall. All records in this suite are synthetic.
let p: PortalFixture;
let client: PortalClient;

beforeAll(async () => {
  p = await portalFixture();
  client = await p.makeClient({ activate: true, label: 'expiry notices' });
});
afterAll(async () => p?.close());

async function projectedEnd() {
  const [row] = await p.db`
    select app_private.f22_subscription_core(${p.fixture.wsA.id}::uuid, ${client.clientId}::uuid) as value`;
  const endDate = (row!.value as { effective_end_exclusive: string })
    .effective_end_exclusive;
  const [boundary] = await p.db`
    select (${endDate}::date::timestamp at time zone 'Africa/Cairo') as value`;
  return boundary!.value as Date;
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

async function definition(tx: TransactionSql, identity: string) {
  const [row] =
    await tx`select pg_catalog.pg_get_functiondef(${identity}::regprocedure) as d`;
  return row!.d as string;
}

describe('Spec 028 F23 expiry evaluator', () => {
  it('uses F13 first-existing Cairo boundary instants for the spring gap and autumn fold dates', async () => {
    const [row] = await p.db`
      select
        to_char(app_private.f23_cairo_date_start(date '2026-04-24') at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"') as spring,
        to_char(app_private.f23_cairo_date_start(date '2026-10-30') at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"') as autumn`;
    expect(row).toEqual({
      spring: '2026-04-23T22:00:00Z',
      autumn: '2026-10-29T22:00:00Z',
    });
  });

  it('uses F13 expiry and sends one T-3 and expiry row to every authorized workspace recipient', async () => {
    const expiry = await projectedEnd();
    const t3 = new Date(expiry.getTime() - 72 * 60 * 60 * 1000);
    const [t3Result] = await p.db`
      select app_private.f23_subscription_expiry_notices_run(${t3.toISOString()}::timestamptz) as count`;
    expect(Number(t3Result!.count)).toBeGreaterThan(0);

    const [expected] = await p.db`
      select array_agg(distinct user_id order by user_id) as users from (
        select user_id from public.staff_profiles where role = 'platform_owner'::public.staff_role
        union
        select m.user_id from public.workspace_memberships m
          join public.staff_profiles p on p.user_id = m.user_id
          where m.workspace_id = ${p.fixture.wsA.id}::uuid and m.revoked_at is null
            and p.role = 'workspace_owner'::public.staff_role
        union
        select m.user_id from public.workspace_memberships m
          join public.staff_profiles p on p.user_id = m.user_id
          where m.workspace_id = ${p.fixture.wsA.id}::uuid and m.revoked_at is null
            and p.role = 'trainer'::public.staff_role
            and app_private.role_has_capability(p.role, 'coaching_work')
      ) recipients`;
    const [t3Rows] = await p.db`
      select array_agg(recipient_user_id order by recipient_user_id) as users,
        count(*)::integer as n
      from app_private.staff_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and source_key = ${client.subscriptionId}::uuid
        and notice_kind = 'subscription_expiring_t3'`;
    expect(t3Rows!.users).toEqual(expected!.users);
    expect(Number(t3Rows!.n)).toBe(expected!.users.length);

    // Repeated and concurrent scans must keep the same recipient-stage rows.
    await Promise.all(
      Array.from(
        { length: 8 },
        () => p.db`
      select app_private.f23_subscription_expiry_notices_run(${t3.toISOString()}::timestamptz)`,
      ),
    );
    const [afterRetry] = await p.db`
      select count(*)::integer as n from app_private.staff_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and source_key = ${client.subscriptionId}::uuid
        and notice_kind = 'subscription_expiring_t3'`;
    expect(Number(afterRetry!.n)).toBe(expected!.users.length);

    const [expiryResult] = await p.db`
      select app_private.f23_subscription_expiry_notices_run(${expiry.toISOString()}::timestamptz) as count`;
    expect(Number(expiryResult!.count)).toBeGreaterThan(0);
    const [expiredRows] = await p.db`
      select count(*)::integer as n from app_private.staff_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and source_key = ${client.subscriptionId}::uuid
        and notice_kind = 'subscription_expired'`;
    expect(Number(expiredRows!.n)).toBe(expected!.users.length);
    const [revision] = await p.db`
      select distinct source_revision from app_private.staff_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and source_key = ${client.subscriptionId}::uuid
        and notice_kind in ('subscription_expiring_t3', 'subscription_expired')`;
    const [currentEnd] = await p.db`
      select app_private.f22_subscription_core(${p.fixture.wsA.id}::uuid, ${client.clientId}::uuid)
        ->>'effective_end_exclusive' as day`;
    expect(revision!.source_revision).toBe(currentEnd!.day);
  });

  it.each([
    { delay: '1 minute', minutes: 1 },
    { delay: '2 hours', minutes: 120 },
  ])(
    'keeps the standard staff T-3 kind when a normally eligible subscription is evaluated $delay late',
    async ({ minutes }) => {
      const subject = await p.makeClient({
        activate: true,
        label: `late standard staff ${minutes}`,
      });
      const [core] = await p.db`
        select app_private.f22_subscription_core(${p.fixture.wsA.id}::uuid,
          ${subject.clientId}::uuid) as value`;
      const endDay = (core!.value as { effective_end_exclusive: string })
        .effective_end_exclusive;
      const [boundary] = await p.db`
        select app_private.f23_cairo_date_start(${endDay}::date) as value`;
      const sampledAt = new Date(
        (boundary!.value as Date).getTime() -
          72 * 60 * 60 * 1000 +
          minutes * 60 * 1000,
      );
      await p.db`select app_private.f23_subscription_expiry_notices_run(
        ${sampledAt.toISOString()}::timestamptz, 250)`;

      const [stored] = await p.db`
        select count(*)::integer as count,
          count(*) filter (where notice_kind = 'subscription_expiring_t3')::integer as standard,
          count(*) filter (where notice_kind = 'subscription_expiring_t3_short_lead')::integer as short_lead
        from app_private.staff_inbox_notices
        where workspace_id = ${p.fixture.wsA.id}::uuid
          and source_key = ${subject.subscriptionId}::uuid
          and source_revision = ${endDay} and source_stage = 't3'`;
      expect(Number(stored!.count)).toBeGreaterThan(0);
      expect(Number(stored!.standard)).toBe(Number(stored!.count));
      expect(Number(stored!.short_lead)).toBe(0);
    },
  );

  it('accepts expiring and expired filters through the existing scoped directory RPC', async () => {
    for (const status of ['expiring', 'expired']) {
      const result = await p.fixture.trainerA.client.rpc(
        'staff_client_directory',
        {
          p_workspace_id: p.fixture.wsA.id,
          p_search: p.run,
          p_approval_state: null,
          p_subscription_status: status,
          p_limit: 100,
          p_offset: 0,
          p_assignment: null,
        },
      );
      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({ status: 'ok' });
    }

    const nearExpiry = await p.makeClient({
      activate: true,
      label: 'directory expiring',
    });
    await p.db.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.subscription_activations a
        set activated_at = app_private.f23_cairo_date_start(
          (clock_timestamp() at time zone 'Africa/Cairo')::date + 2 - s.duration_days)
        from public.subscriptions s
        where a.workspace_id = s.workspace_id and a.subscription_id = s.id
          and s.workspace_id = ${p.fixture.wsA.id}::uuid
          and s.id = ${nearExpiry.subscriptionId}::uuid`;
      await tx`set local session_replication_role = origin`;
    });
    const expiring = await p.fixture.trainerA.client.rpc(
      'staff_client_directory',
      {
        p_workspace_id: p.fixture.wsA.id,
        p_search: p.run,
        p_approval_state: null,
        p_subscription_status: 'expiring',
        p_limit: 100,
        p_offset: 0,
        p_assignment: null,
      },
    );
    expect(expiring.error).toBeNull();
    expect(
      (expiring.data as { clients: Array<{ client_id: string }> }).clients.map(
        (row) => row.client_id,
      ),
    ).toContain(nearExpiry.clientId);
  });

  it('denies directory probing outside coaching access and denies the evaluator to authenticated staff', async () => {
    const foreign = await p.fixture.trainerB.client.rpc(
      'staff_client_directory',
      {
        p_workspace_id: p.fixture.wsA.id,
        p_search: p.run,
        p_approval_state: null,
        p_subscription_status: 'expiring',
        p_limit: 100,
        p_offset: 0,
        p_assignment: null,
      },
    );
    expect(foreign.error?.code).toBe('42501');
    const sales = await p.fixture.salesA.client.rpc('staff_client_directory', {
      p_workspace_id: p.fixture.wsA.id,
      p_search: p.run,
      p_approval_state: null,
      p_subscription_status: 'expired',
      p_limit: 100,
      p_offset: 0,
      p_assignment: null,
    });
    expect(sales.error?.code).toBe('42501');
    const worker = await p.fixture.trainerA.client.rpc(
      'run_subscription_expiry_notices',
      {},
    );
    expect(worker.error).not.toBeNull();
    await inRolledBackTx(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: 'service_role' })}, true)`;
      await tx`set local role service_role`;
      const [result] =
        await tx`select public.run_subscription_expiry_notices() as count`;
      await tx`reset role`;
      expect(Number(result!.count)).toBeGreaterThanOrEqual(0);
    });
  });

  it('kills a Trainer-recipient mutation and suppresses a stage after client deactivation', async () => {
    const expiring = await p.makeClient({
      activate: true,
      label: 'expiry mutation',
    });
    const [core] = await p.db`
      select app_private.f22_subscription_core(${p.fixture.wsA.id}::uuid, ${expiring.clientId}::uuid) as value`;
    const endDay = (core!.value as { effective_end_exclusive: string })
      .effective_end_exclusive;
    const [boundary] = await p.db`
      select (${endDay}::date::timestamp at time zone 'Africa/Cairo') as value`;
    const t3 = new Date(
      (boundary!.value as Date).getTime() - 72 * 60 * 60 * 1000,
    );

    await inRolledBackTx(async (tx) => {
      const identity =
        'app_private.f23_subscription_expiry_notices_run(timestamptz,integer)';
      const original = await definition(tx, identity);
      const mutant = original.replace(
        "p.role = 'trainer'::public.staff_role",
        "p.role = 'sales'::public.staff_role",
      );
      expect(mutant).not.toBe(original);
      await tx.unsafe(mutant);
      let killed = false;
      try {
        await tx`select app_private.f23_subscription_expiry_notices_run(${t3.toISOString()}::timestamptz, 250)`;
        const [row] = await tx`
          select count(*)::integer as n from app_private.staff_inbox_notices
          where workspace_id = ${p.fixture.wsA.id}::uuid
            and source_key = ${expiring.subscriptionId}::uuid
            and recipient_user_id = ${p.fixture.trainerA.userId}
            and notice_kind = 'subscription_expiring_t3'`;
        expect(Number(row!.n)).toBe(1);
      } catch {
        killed = true;
      }
      await tx.unsafe(original);
      expect(killed, 'Trainer recipient mutant must be detected').toBe(true);
    });

    await inRolledBackTx(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.clients set deactivated_at = ${t3.toISOString()}::timestamptz,
        deactivation_reason = 'closure'
        where workspace_id = ${p.fixture.wsA.id}::uuid and id = ${expiring.clientId}::uuid`;
      await tx`set local session_replication_role = origin`;
      await tx`select app_private.f23_subscription_expiry_notices_run(${boundary!.value as Date}::timestamptz, 250)`;
      const [row] = await tx`
        select count(*)::integer as n from app_private.staff_inbox_notices
        where workspace_id = ${p.fixture.wsA.id}::uuid
          and source_key = ${expiring.subscriptionId}::uuid
          and notice_kind = 'subscription_expired'`;
      expect(Number(row!.n)).toBe(0);
    });
  });

  it('reprojects after a freeze moves the effective expiry outside T-3 and retains the delivered revision', async () => {
    const frozen = await p.makeClient({
      activate: true,
      label: 'expiry freeze',
    });
    await p.db.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.subscription_activations a
        set activated_at = app_private.f23_cairo_date_start(
          (clock_timestamp() at time zone 'Africa/Cairo')::date + 2 - s.duration_days)
        from public.subscriptions s
        where a.workspace_id = s.workspace_id and a.subscription_id = s.id
          and s.workspace_id = ${p.fixture.wsA.id}::uuid
          and s.id = ${frozen.subscriptionId}::uuid`;
      await tx`set local session_replication_role = origin`;
    });
    const [sample] = await p.db`select clock_timestamp() as value`;
    const now = (sample!.value as Date).toISOString();
    await p.db`select app_private.f23_subscription_expiry_notices_run(${now}::timestamptz, 250)`;
    const [before] = await p.db`
      select distinct source_revision from app_private.staff_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and source_key = ${frozen.subscriptionId}::uuid
        and notice_kind in (
          'subscription_expiring_t3', 'subscription_expiring_t3_short_lead'
        ) and source_stage = 't3'`;
    expect(before?.source_revision).toBeTruthy();

    const changed = await p.fixture.trainerA.client.rpc(
      'subscription_freeze_operation',
      {
        request: {
          action: 'apply',
          workspace_id: p.fixture.wsA.id,
          client_id: frozen.clientId,
          subscription_id: frozen.subscriptionId,
          request_key: randomUUID(),
          expected_revision: 0,
          duration_days: 7,
        },
      },
    );
    expect(changed.error).toBeNull();
    expect(changed.data).toMatchObject({ status: 'applied', revision: 1 });

    await p.db`select app_private.f23_subscription_expiry_notices_run(${now}::timestamptz, 250)`;
    const [after] = await p.db`
      select array_agg(distinct source_revision order by source_revision) as revisions
      from app_private.staff_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and source_key = ${frozen.subscriptionId}::uuid
        and notice_kind in (
          'subscription_expiring_t3', 'subscription_expiring_t3_short_lead'
        ) and source_stage = 't3'`;
    expect(after!.revisions).toEqual([before!.source_revision]);
  });

  it('applies exact expiring bounds and the F13 expired filter to authorized readers only', async () => {
    // Anchor the projection to a Cairo midnight so the sampled instant and its
    // +72h bound coincide exactly with F13 boundaries. The mutant below pins
    // the directory RPC to that same instant; nothing here depends on wall time.
    const [days] = await p.db`
      with sampled as (
        select (clock_timestamp() at time zone 'Africa/Cairo')::date as day)
      select (day + 4)::text as at_now,
        (day + 7)::text as at_plus_72h,
        (day - 40)::text as expired from sampled`;
    const setEndDay = async (subscriptionId: string, endDay: string) => {
      await p.db.begin(async (tx) => {
        await tx`set local session_replication_role = replica`;
        await tx`update public.subscription_activations a
          set activated_at = app_private.f23_cairo_date_start(
            ${endDay}::date - s.duration_days)
          from public.subscriptions s
          where a.workspace_id = s.workspace_id and a.subscription_id = s.id
            and s.workspace_id = ${p.fixture.wsA.id}::uuid
            and s.id = ${subscriptionId}::uuid`;
        await tx`set local session_replication_role = origin`;
      });
    };
    const atNow = await p.makeClient({ activate: true, label: 'bounds-now' });
    const atPlus72h = await p.makeClient({
      activate: true,
      label: 'bounds-plus-72h',
    });
    const expiredClient = await p.makeClient({
      activate: true,
      label: 'bounds-expired',
    });
    await setEndDay(atNow.subscriptionId, days!.at_now as string);
    await setEndDay(atPlus72h.subscriptionId, days!.at_plus_72h as string);
    await setEndDay(expiredClient.subscriptionId, days!.expired as string);

    const projections = await p.db`
      select c.id,
        app_private.f22_subscription_core(c.workspace_id, c.id)->>'status' as status,
        app_private.f22_subscription_core(c.workspace_id, c.id)->>'effective_end_exclusive' as end_day
      from public.clients c
      where c.id in (${atNow.clientId}::uuid, ${atPlus72h.clientId}::uuid,
        ${expiredClient.clientId}::uuid)`;
    const byId = new Map(
      projections.map((row) => [
        row.id as string,
        { status: row.status as string, end_day: row.end_day as string },
      ]),
    );
    expect(byId.size).toBe(3);
    expect(byId.get(atNow.clientId)).toEqual({
      status: expect.stringMatching(/^(future|active|frozen)$/),
      end_day: days!.at_now,
    });
    expect(byId.get(atPlus72h.clientId)).toEqual({
      status: expect.stringMatching(/^(future|active|frozen)$/),
      end_day: days!.at_plus_72h,
    });
    expect(byId.get(expiredClient.clientId)).toEqual({
      status: 'expired',
      end_day: days!.expired,
    });

    const search = `${p.run} bounds-`;
    await inRolledBackTx(async (tx) => {
      const identity =
        'public.staff_client_directory(uuid, text, text, text, integer, integer, text)';
      const original = await definition(tx, identity);
      const [boundary] = await tx`
        select app_private.f23_cairo_date_start(${days!.at_now}::date)::text as value`;
      const mutant = original.replace(
        'statement_timestamp()',
        `'${boundary!.value}'::timestamptz`,
      );
      expect(mutant).not.toBe(original);
      await tx.unsafe(mutant);
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({
        sub: p.fixture.trainerA.userId,
        role: 'authenticated',
      })}, true)`;
      await tx`set local role authenticated`;
      const [expiring] = await tx`
        select public.staff_client_directory(${p.fixture.wsA.id}::uuid,
          ${search}, null, 'expiring', 100, 0, null) as value`;
      const [expired] = await tx`
        select public.staff_client_directory(${p.fixture.wsA.id}::uuid,
          ${search}, null, 'expired', 100, 0, null) as value`;
      await tx`reset role`;
      const ids = (result: unknown) =>
        (result as { clients: Array<{ client_id: string }> }).clients.map(
          (row) => row.client_id,
        );
      const rows = (result: unknown) =>
        (
          result as {
            clients: Array<{ client_id: string; expiry_bucket: string | null }>;
          }
        ).clients;
      // Inclusive at `now`, exclusive at `now + 72h`; the F13-expired client
      // appears only under `expired`.
      expect(ids(expiring!.value)).toEqual([atNow.clientId]);
      expect(ids(expired!.value)).toEqual([expiredClient.clientId]);
      expect(rows(expiring!.value)[0]?.expiry_bucket).toBe('expiring');
      expect(rows(expired!.value)[0]?.expiry_bucket).toBe('expired');
    });

    for (const status of ['expiring', 'expired'] as const) {
      const foreign = await p.fixture.trainerB.client.rpc(
        'staff_client_directory',
        {
          p_workspace_id: p.fixture.wsA.id,
          p_search: search,
          p_approval_state: null,
          p_subscription_status: status,
          p_limit: 100,
          p_offset: 0,
          p_assignment: null,
        },
      );
      expect(foreign.error?.code).toBe('42501');
      expect(foreign.data).toBeNull();
    }
  });

  it('uses one short-lead T-3 stage and hydrates and dismisses staff notices per recipient', async () => {
    const subject = await p.makeClient({
      activate: true,
      label: 'staff expiry hydration',
    });
    const [target] = await p.db`
      select ((clock_timestamp() at time zone 'Africa/Cairo')::date + 2)::date as end_day`;
    const shortLeadEndDay = target!.end_day as string;
    await p.db.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.subscription_activations a
        set activated_at = app_private.f23_cairo_date_start(
          ${shortLeadEndDay}::date - 2)
        where a.workspace_id = ${p.fixture.wsA.id}::uuid
          and a.subscription_id = ${subject.subscriptionId}::uuid`;
      await tx`insert into public.subscription_manual_date_adjustments(
        workspace_id, client_id, subscription_id,
        new_service_start_date, new_service_end_exclusive,
        request_key, actor_user_id
      ) values (
        ${p.fixture.wsA.id}::uuid, ${subject.clientId}::uuid,
        ${subject.subscriptionId}::uuid,
        ${shortLeadEndDay}::date - 2, ${shortLeadEndDay}::date,
        ${randomUUID()}::uuid, ${p.fixture.po.userId}::uuid
      )`;
      await tx`set local session_replication_role = origin`;
    });
    const [core] = await p.db`
      select app_private.f22_subscription_core(${p.fixture.wsA.id}::uuid,
        ${subject.clientId}::uuid) as value`;
    const endDay = (core!.value as { effective_end_exclusive: string })
      .effective_end_exclusive;
    const [boundary] = await p.db`
      select app_private.f23_cairo_date_start(${endDay}::date) as value`;
    await p.db`select app_private.f23_subscription_expiry_notices_run(
      ${new Date((boundary!.value as Date).getTime() - 48 * 60 * 60 * 1000).toISOString()}::timestamptz,
      250)`;

    const [stored] = await p.db`
      select count(*)::integer as count,
        count(*) filter (where notice_kind = 'subscription_expiring_t3_short_lead')::integer as short_lead
      from app_private.staff_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and source_key = ${subject.subscriptionId}::uuid and source_stage = 't3'`;
    expect(stored).toEqual({
      count: expect.any(Number),
      short_lead: expect.any(Number),
    });
    expect(Number(stored!.count)).toBeGreaterThan(0);
    expect(Number(stored!.short_lead)).toBe(Number(stored!.count));
    await Promise.all(
      Array.from(
        { length: 5 },
        () => p.db`
        select app_private.f23_subscription_expiry_notices_run(
          ${new Date((boundary!.value as Date).getTime() - 48 * 60 * 60 * 1000).toISOString()}::timestamptz,
          250)`,
      ),
    );
    const [afterRetry] = await p.db`
      select count(*)::integer as count from app_private.staff_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and source_key = ${subject.subscriptionId}::uuid and source_stage = 't3'`;
    expect(Number(afterRetry!.count)).toBe(Number(stored!.count));

    const staffRead = await p.fixture.trainerA.client.rpc(
      'read_staff_notices',
      {
        p_limit: 100,
        p_before: null,
      },
    );
    expect(staffRead.error).toBeNull();
    const rows = (staffRead.data as { notices: Array<Record<string, unknown>> })
      .notices;
    const notice = rows.find(
      (row) => row.source_key === subject.subscriptionId,
    );
    expect(notice).toMatchObject({
      notice_kind: 'subscription_expiring_t3_short_lead',
      client_name: subject.name,
      expiry_date: endDay,
      dismissed_at: null,
    });
    const foreignRead = await p.fixture.trainerB.client.rpc(
      'read_staff_notices',
      {
        p_limit: 100,
        p_before: null,
      },
    );
    expect(foreignRead.error).toBeNull();
    expect(
      (
        foreignRead.data as { notices: Array<Record<string, unknown>> }
      ).notices.some((row) => row.source_key === subject.subscriptionId),
    ).toBe(false);

    const otherRecipient = await p.fixture.woA.client.rpc(
      'read_staff_notices',
      {
        p_limit: 100,
        p_before: null,
      },
    );
    const ownerNotice = (
      otherRecipient.data as { notices: Array<Record<string, unknown>> }
    ).notices.find((row) => row.source_key === subject.subscriptionId);
    expect(ownerNotice?.notice_id).toBeTruthy();
    const dismissed = await p.fixture.trainerA.client.rpc(
      'dismiss_staff_notice',
      {
        p_notice_id: notice!.notice_id,
      },
    );
    expect(dismissed.data).toEqual({ status: 'dismissed' });
    const repeated = await p.fixture.trainerA.client.rpc(
      'dismiss_staff_notice',
      {
        p_notice_id: notice!.notice_id,
      },
    );
    expect(repeated.data).toEqual({ status: 'dismissed' });
    const stillVisible = await p.fixture.woA.client.rpc('read_staff_notices', {
      p_limit: 100,
      p_before: null,
    });
    expect(
      (
        stillVisible.data as { notices: Array<Record<string, unknown>> }
      ).notices.some((row) => row.notice_id === ownerNotice!.notice_id),
    ).toBe(true);
    const foreign = await p.fixture.trainerB.client.rpc(
      'dismiss_staff_notice',
      {
        p_notice_id: notice!.notice_id,
      },
    );
    expect(foreign.data).toEqual({ status: 'not_found' });
    const hidden = await p.fixture.trainerA.client.rpc('read_staff_notices', {
      p_limit: 100,
      p_before: null,
    });
    expect(
      (hidden.data as { notices: Array<Record<string, unknown>> }).notices.some(
        (row) => row.notice_id === notice!.notice_id,
      ),
    ).toBe(false);
  });

  it('kills removal of the staff recipient predicate from the expiry reader', async () => {
    const subject = await p.makeClient({
      activate: true,
      label: 'staff reader privacy mutation',
    });
    await p.db.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.subscription_activations a
        set activated_at = app_private.f23_cairo_date_start(
          (clock_timestamp() at time zone 'Africa/Cairo')::date + 2 - s.duration_days)
        from public.subscriptions s
        where a.workspace_id = s.workspace_id and a.subscription_id = s.id
          and s.workspace_id = ${p.fixture.wsA.id}::uuid
          and s.id = ${subject.subscriptionId}::uuid`;
      await tx`set local session_replication_role = origin`;
    });
    const [core] = await p.db`
      select app_private.f22_subscription_core(${p.fixture.wsA.id}::uuid,
        ${subject.clientId}::uuid) as value`;
    const endDay = (core!.value as { effective_end_exclusive: string })
      .effective_end_exclusive;
    const [boundary] = await p.db`
      select app_private.f23_cairo_date_start(${endDay}::date) as value`;
    await p.db`select app_private.f23_subscription_expiry_notices_run(
      ${new Date((boundary!.value as Date).getTime() - 48 * 60 * 60 * 1000).toISOString()}::timestamptz,
      250)`;
    const [foreignRecipient] = await p.db`
      select id from app_private.staff_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and source_key = ${subject.subscriptionId}::uuid
        and recipient_user_id = ${p.fixture.woA.userId}::uuid`;
    expect(foreignRecipient?.id).toBeTruthy();

    await inRolledBackTx(async (tx) => {
      const identity = 'public.read_staff_notices(integer,timestamptz)';
      const original = await definition(tx, identity);
      const mutated = original.replace(
        'where n.recipient_user_id = actor and n.dismissed_at is null',
        'where n.recipient_user_id is not null and n.dismissed_at is null',
      );
      expect(mutated).not.toBe(original);
      await tx.unsafe(mutated);
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({
        sub: p.fixture.trainerA.userId,
        role: 'authenticated',
      })}, true)`;
      await tx`set local role authenticated`;
      const [response] = await tx`
        select public.read_staff_notices(100, null) as value`;
      await tx`reset role`;
      const rows = (
        response!.value as { notices: Array<Record<string, unknown>> }
      ).notices;
      expect(rows.some((row) => row.notice_id === foreignRecipient!.id)).toBe(
        true,
      );
    });
  });

  it('re-resolves the subscription after the client lock and rejects stale-candidate routing', async () => {
    const [row] = await p.db`
      select pg_catalog.pg_get_functiondef(
        'app_private.f23_subscription_expiry_notices_run(timestamptz,integer)'::regprocedure
      ) as definition`;
    const definition = row!.definition as string;
    const satisfiesCanonicalRouting = (body: string) => {
      const clientSelect = body.indexOf('select c.* into client_row');
      const clientLock = body.indexOf('for update;', clientSelect);
      const resolve = body.indexOf(
        'canonical_subscription_id := app_private.f19_resolve_subscription_id',
        clientLock,
      );
      const subscriptionLock = body.indexOf(
        'select s.* into subscription',
        resolve,
      );
      const nextLoop = body.indexOf('end loop;', subscriptionLock);
      const postLockBody = body.slice(resolve, nextLoop);
      const candidateReferences =
        postLockBody.match(/candidate\.subscription_id/g) ?? [];
      return (
        clientLock > clientSelect &&
        resolve > clientLock &&
        subscriptionLock > resolve &&
        candidateReferences.length === 1
      );
    };
    expect(satisfiesCanonicalRouting(definition)).toBe(true);
    const staleCandidateMutant = definition.replace(
      'canonical_subscription_id := app_private.f19_resolve_subscription_id(\n      candidate.workspace_id, candidate.subscription_id);',
      'canonical_subscription_id := candidate.subscription_id;',
    );
    expect(staleCandidateMutant).not.toBe(definition);
    expect(satisfiesCanonicalRouting(staleCandidateMutant)).toBe(false);
  });
});
