import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  asUser,
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

// Spec 028 T003/T006: per-recipient read state and F13 state fixtures. All
// principals and records are synthetic to this run.
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

async function clientNotice(client: PortalClient) {
  const [row] = await p.db`
    select id, read_at from app_private.client_inbox_notices
    where workspace_id = ${p.fixture.wsA.id}::uuid
      and client_id = ${client.clientId}::uuid
      and source_key = ${client.subscriptionId}::uuid
      and notice_kind = 'subscription_expiring_t3'`;
  return row as { id: string; read_at: string | null } | undefined;
}

describe('Spec 028 T003/T006 DB clauses', () => {
  it('T003 marks read per recipient, idempotently, never for foreign or unknown IDs', async () => {
    const trainerNotice = await staffNotice(p.fixture.trainerA.userId);
    const poNotice = await staffNotice(p.fixture.po.userId);
    const ownClientNotice = await clientNotice(subject);
    const foreignClientNotice = await clientNotice(other);
    expect(trainerNotice?.id && poNotice?.id).toBeTruthy();
    expect(ownClientNotice?.id && foreignClientNotice?.id).toBeTruthy();

    const markStaff = (userId: string, id: string) =>
      asActor(userId, async (tx) => {
        const [row] = await tx`
          select public.mark_staff_notice_read(${id}::uuid) as value`;
        return row!.value as { status: string };
      });
    const markClient = (client: PortalClient, id: string) =>
      asActor(client.authUserId, async (tx) => {
        const [row] = await tx`
          select public.mark_client_notice_read(${id}::uuid) as value`;
        return row!.value as { status: string };
      });

    expect(
      await markStaff(p.fixture.trainerA.userId, trainerNotice!.id),
    ).toEqual({
      status: 'read',
    });
    const afterFirst = await staffNotice(p.fixture.trainerA.userId);
    expect(afterFirst!.read_at).toBeTruthy();
    expect(
      await markStaff(p.fixture.trainerA.userId, trainerNotice!.id),
    ).toEqual({
      status: 'read',
    });
    const readMs = (value: string | null) => new Date(value!).getTime();
    expect(
      readMs((await staffNotice(p.fixture.trainerA.userId))!.read_at),
    ).toBe(readMs(afterFirst!.read_at));
    expect(await markStaff(p.fixture.trainerA.userId, poNotice!.id)).toEqual({
      status: 'not_found',
    });
    expect(await markStaff(p.fixture.trainerA.userId, randomUUID())).toEqual({
      status: 'not_found',
    });
    expect((await staffNotice(p.fixture.po.userId))!.read_at).toBeNull();

    expect(await markClient(subject, ownClientNotice!.id)).toEqual({
      status: 'read',
    });
    const clientAfterFirst = await clientNotice(subject);
    expect(clientAfterFirst!.read_at).toBeTruthy();
    expect(await markClient(subject, ownClientNotice!.id)).toEqual({
      status: 'read',
    });
    expect(readMs((await clientNotice(subject))!.read_at)).toBe(
      readMs(clientAfterFirst!.read_at),
    );
    expect(await markClient(subject, foreignClientNotice!.id)).toEqual({
      status: 'not_found',
    });
    expect(await markClient(subject, randomUUID())).toEqual({
      status: 'not_found',
    });
    expect((await clientNotice(other))!.read_at).toBeNull();
  });

  it('T006 covers every F13 state fixture and before/at/after effective expiry', async () => {
    const [days] = await p.db`
      select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today,
        ((clock_timestamp() at time zone 'Africa/Cairo')::date + 3)::text as end_day,
        ((clock_timestamp() at time zone 'Africa/Cairo')::date + 1)::text as future_start,
        ((clock_timestamp() at time zone 'Africa/Cairo')::date - 2)::text as active_start,
        ((clock_timestamp() at time zone 'Africa/Cairo')::date - 10)::text as frozen_start,
        ((clock_timestamp() at time zone 'Africa/Cairo')::date - 40)::text as expired_start,
        ((clock_timestamp() at time zone 'Africa/Cairo')::date - 2)::text as expired_end,
        (clock_timestamp() at time zone 'Africa/Cairo')::date::text as freeze_day,
        ((clock_timestamp() at time zone 'Africa/Cairo')::date + 2)::text as adjusted_end`;
    const setDates = async (
      client: PortalClient,
      startDay: string,
      endDay: string,
      freezeDay?: string,
    ) => {
      await p.db.begin(async (tx) => {
        await tx`set local session_replication_role = replica`;
        await tx`update public.subscription_activations
          set activated_at = app_private.f23_cairo_date_start(${startDay}::date)
          where workspace_id = ${p.fixture.wsA.id}::uuid
            and subscription_id = ${client.subscriptionId}::uuid`;
        await tx`insert into public.subscription_manual_date_adjustments(
          workspace_id, client_id, subscription_id, new_service_start_date,
          new_service_end_exclusive, request_key, actor_user_id)
          values (${p.fixture.wsA.id}::uuid, ${client.clientId}::uuid,
            ${client.subscriptionId}::uuid, ${startDay}::date, ${endDay}::date,
            ${randomUUID()}::uuid, ${p.fixture.po.userId}::uuid)`;
        if (freezeDay)
          await tx`insert into public.subscription_freezes(
            id, workspace_id, subscription_id, applied_on, duration_days, applied_by)
            values (${randomUUID()}::uuid, ${p.fixture.wsA.id}::uuid,
              ${client.subscriptionId}::uuid, ${freezeDay}::date, 1,
              ${p.fixture.po.userId}::uuid)`;
        await tx`set local session_replication_role = origin`;
      });
    };
    const states = [
      {
        label: 'awaiting_activation',
        status: 'awaiting_activation',
        t3: false,
        expiry: false,
      },
      { label: 'future', status: 'future', t3: true, expiry: true },
      { label: 'active', status: 'active', t3: true, expiry: true },
      { label: 'frozen', status: 'frozen', t3: true, expiry: true },
      { label: 'expired', status: 'expired', t3: false, expiry: true },
      { label: 'refunded', status: 'refunded', t3: false, expiry: false },
      { label: 'deactivated', status: 'active', t3: false, expiry: false },
      { label: 'closed', status: 'active', t3: false, expiry: false },
      { label: 'purged', status: null, t3: false, expiry: false },
    ] as const;
    for (const state of states) {
      const client = await p.makeClient({
        activate: state.label !== 'awaiting_activation',
        label: `028 state ${state.label}`,
      });
      let endDay = days!.end_day as string;
      if (state.label === 'awaiting_activation') {
        // No activation, no projection end: nothing may be enqueued.
      } else if (state.label === 'expired') {
        endDay = days!.expired_end as string;
        await setDates(client, days!.expired_start as string, endDay);
      } else if (state.label === 'frozen') {
        await setDates(
          client,
          days!.frozen_start as string,
          days!.adjusted_end as string,
          days!.freeze_day as string,
        );
      } else if (state.label === 'future') {
        await setDates(client, days!.future_start as string, endDay);
      } else {
        await setDates(client, days!.active_start as string, endDay);
      }
      if (state.label === 'refunded') {
        const refund = await p.fixture.po.client.rpc('record_refund', {
          request: {
            workspace_id: p.fixture.wsA.id,
            client_id: client.clientId,
            purchase_id: client.subscriptionId,
            request_key: randomUUID(),
            amount_minor: '1200',
            external_confirmation: true,
          },
        });
        expect(refund.error).toBeNull();
        expect(refund.data).toMatchObject({ status: 'ok' });
      }
      if (state.label === 'deactivated' || state.label === 'closed') {
        await p.db.begin(async (tx) => {
          await tx`set local session_replication_role = replica`;
          await tx`update public.clients
            set deactivated_at = clock_timestamp(),
              deactivation_reason = ${state.label === 'closed' ? 'closure' : 'refund'}
            where workspace_id = ${p.fixture.wsA.id}::uuid and id = ${client.clientId}::uuid`;
          await tx`set local session_replication_role = origin`;
        });
      }
      if (state.label === 'purged') {
        await p.db.begin(async (tx) => {
          await tx`set local session_replication_role = replica`;
          await tx`delete from public.clients
            where workspace_id = ${p.fixture.wsA.id}::uuid and id = ${client.clientId}::uuid`;
          await tx`set local session_replication_role = origin`;
        });
      }
      if (state.status) {
        const [projection] = await p.db`
          select app_private.f13_project_entitlement(${p.fixture.wsA.id}::uuid,
            ${client.subscriptionId}::uuid, ${days!.today}::date)->>'status' as status`;
        expect(projection!.status, state.label).toBe(state.status);
      }
      const [boundary] = await p.db`
        select app_private.f23_cairo_date_start(${endDay}::date) as value`;
      const expiryInstant = boundary!.value as Date;
      // An already-expired subscription is sampled at its boundary: sampling
      // 72h earlier would legitimately observe its earlier active term.
      const before =
        state.label === 'expired'
          ? expiryInstant
          : new Date(expiryInstant.getTime() - 72 * 60 * 60 * 1000);
      const after = new Date(expiryInstant.getTime() + 60 * 60 * 1000);
      const counts = await p.db.begin(async (tx) => {
        const stageCounts = async () => {
          const [row] = await tx`
            select count(*) filter (where notice_kind in (
              'subscription_expiring_t3', 'subscription_expiring_t3_short_lead'
            ))::integer as t3,
            count(*) filter (where notice_kind = 'subscription_expired')::integer as expiry
            from app_private.staff_inbox_notices
            where workspace_id = ${p.fixture.wsA.id}::uuid
              and source_key = ${client.subscriptionId}::uuid`;
          return { t3: Number(row!.t3), expiry: Number(row!.expiry) };
        };
        await tx`select app_private.f23_subscription_expiry_notices_run(
          ${before.toISOString()}::timestamptz, 250)`;
        const atBefore = await stageCounts();
        await tx`select app_private.f23_subscription_expiry_notices_run(
          ${before.toISOString()}::timestamptz, 250)`;
        const afterRepeat = await stageCounts();
        await tx`select app_private.f23_subscription_expiry_notices_run(
          ${expiryInstant.toISOString()}::timestamptz, 250)`;
        const atExpiry = await stageCounts();
        await tx`select app_private.f23_subscription_expiry_notices_run(
          ${after.toISOString()}::timestamptz, 250)`;
        const afterExpiry = await stageCounts();
        return { atBefore, afterRepeat, atExpiry, afterExpiry };
      });
      expect(counts.atBefore.t3, `${state.label} T-3`).toBe(
        state.t3 ? recipientCount : 0,
      );
      expect(counts.afterRepeat.t3, `${state.label} repeated T-3`).toBe(
        counts.atBefore.t3,
      );
      expect(counts.atExpiry.expiry, `${state.label} expiry`).toBe(
        state.expiry ? recipientCount : 0,
      );
      expect(counts.afterExpiry.expiry, `${state.label} after expiry`).toBe(
        counts.atExpiry.expiry,
      );
    }
  });
});
