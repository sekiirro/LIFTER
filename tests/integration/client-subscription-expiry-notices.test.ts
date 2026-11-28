import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  asUser,
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

let p: PortalFixture;
let client: PortalClient;
let other: PortalClient;

beforeAll(async () => {
  p = await portalFixture();
  client = await p.makeClient({ activate: true, label: 'expiry inbox owner' });
  other = await p.makeClient({ activate: true, label: 'expiry inbox other' });
});
afterAll(async () => p?.close());

async function moveActivationToDays(
  subject: PortalClient,
  remainingDays: number,
) {
  const [target] = await p.db`
    select ((clock_timestamp() at time zone 'Africa/Cairo')::date + ${remainingDays}::integer)::date as end_day`;
  const endDay = target!.end_day as string;
  await p.db.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await tx`update public.subscription_activations a
      set activated_at = app_private.f23_cairo_date_start(
        ${endDay}::date - ${remainingDays}::integer)
      where a.workspace_id = ${p.fixture.wsA.id}::uuid
        and a.subscription_id = ${subject.subscriptionId}::uuid`;
    await tx`insert into public.subscription_manual_date_adjustments(
      workspace_id, client_id, subscription_id,
      new_service_start_date, new_service_end_exclusive,
      request_key, actor_user_id
    ) values (
      ${p.fixture.wsA.id}::uuid, ${subject.clientId}::uuid,
      ${subject.subscriptionId}::uuid,
      ${endDay}::date - ${remainingDays}::integer, ${endDay}::date,
      ${randomUUID()}::uuid, ${p.fixture.po.userId}::uuid
    )`;
    await tx`set local session_replication_role = origin`;
  });
}

const moveActivationToTwoDays = (subject: PortalClient) =>
  moveActivationToDays(subject, 2);

async function moveExpiryToDays(subject: PortalClient, remainingDays: number) {
  const [target] = await p.db`
    select s.duration_days,
      ((clock_timestamp() at time zone 'Africa/Cairo')::date + ${remainingDays}::integer)::date as end_day
    from public.subscriptions s
    where s.workspace_id = ${p.fixture.wsA.id}::uuid
      and s.id = ${subject.subscriptionId}::uuid`;
  const durationDays = Number(target!.duration_days);
  const endDay = target!.end_day as string;
  await p.db.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    // Keep first eligibility before T-3; move only F13's effective dates.
    await tx`update public.subscription_activations a
      set activated_at = least(a.activated_at, app_private.f23_cairo_date_start(
        ${endDay}::date - ${durationDays}::integer - 4))
      where a.workspace_id = ${p.fixture.wsA.id}::uuid
        and a.subscription_id = ${subject.subscriptionId}::uuid`;
    await tx`insert into public.subscription_manual_date_adjustments(
      workspace_id, client_id, subscription_id,
      new_service_start_date, new_service_end_exclusive,
      request_key, actor_user_id
    ) values (
      ${p.fixture.wsA.id}::uuid, ${subject.clientId}::uuid,
      ${subject.subscriptionId}::uuid,
      ${endDay}::date - ${durationDays}::integer, ${endDay}::date,
      ${randomUUID()}::uuid, ${p.fixture.po.userId}::uuid
    )`;
    await tx`set local session_replication_role = origin`;
  });
}

const moveExpiryToTwoDays = (subject: PortalClient) =>
  moveExpiryToDays(subject, 2);

async function expiryAt(subject: PortalClient): Promise<Date> {
  const [core] = await p.db`
    select app_private.f22_subscription_core(${p.fixture.wsA.id}::uuid,
      ${subject.clientId}::uuid) as value`;
  const endDay = (core!.value as { effective_end_exclusive: string })
    .effective_end_exclusive;
  const [row] = await p.db`
    select app_private.f23_cairo_date_start(${endDay}::date) as value`;
  return row!.value as Date;
}

async function evaluate(at: Date) {
  await p.db`select app_private.f23_subscription_expiry_notices_run(
    ${at.toISOString()}::timestamptz, 250)`;
}

async function readAs(subject: PortalClient): Promise<Record<string, unknown>> {
  return p.db.begin((tx) =>
    asUser(tx, subject.authUserId, async (inner) => {
      const [row] =
        await inner`select public.read_client_notices(100, null) as value`;
      return row!.value as Record<string, unknown>;
    }),
  );
}

async function dismissAs(subject: PortalClient, noticeId: string) {
  return p.db.begin((tx) =>
    asUser(tx, subject.authUserId, async (inner) => {
      const [row] = await inner`
        select public.dismiss_client_notice(${noticeId}::uuid) as value`;
      return row!.value as { status: string };
    }),
  );
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

async function readDefinition(tx: TransactionSql) {
  const [row] = await tx`
    select pg_catalog.pg_get_functiondef(
      'public.read_client_notices(integer,timestamptz)'::regprocedure) as definition`;
  return row!.definition as string;
}

const kinds = (value: Record<string, unknown>) =>
  (value.notices as Array<{ notice_kind: string }>).map(
    (row) => row.notice_kind,
  );

describe('Spec 028 FR-001 client expiry notices through the existing F22 inbox', () => {
  it('delivers only to the client account, with staff and another client unable to read it', async () => {
    await moveExpiryToTwoDays(client);
    const expiry = await expiryAt(client);
    const t3 = new Date(expiry.getTime() - 72 * 60 * 60 * 1000);
    await evaluate(t3);

    const own = await readAs(client);
    expect(own.status).toBe('ok');
    expect(kinds(own)).toContain('subscription_expiring_t3');
    expect(kinds(await readAs(other))).not.toContain(
      'subscription_expiring_t3',
    );
    for (const actor of [p.fixture.trainerA, p.fixture.woA, p.fixture.po]) {
      const result = await actor.client.rpc('read_client_notices', {
        p_limit: 100,
        p_before: null,
      });
      expect(result.data).toEqual({ status: 'invalid' });
    }
  });

  it('deduplicates client T-3 under concurrent evaluator retries', async () => {
    await moveExpiryToTwoDays(other);
    const expiry = await expiryAt(other);
    const t3 = new Date(expiry.getTime() - 72 * 60 * 60 * 1000);
    await Promise.all(Array.from({ length: 20 }, () => evaluate(t3)));

    const [row] = await p.db`
      select count(*)::integer as n
      from app_private.client_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and client_id = ${other.clientId}::uuid
        and source_key = ${other.subscriptionId}::uuid
        and notice_kind = 'subscription_expiring_t3'`;
    expect(Number(row!.n)).toBe(1);
  });

  it('creates one new stage identity when F13 changes the effective-expiry revision', async () => {
    const revised = await p.makeClient({
      activate: true,
      label: 'expiry revision',
    });
    await moveExpiryToDays(revised, 2);
    const originalExpiry = await expiryAt(revised);
    await evaluate(new Date(originalExpiry.getTime() - 72 * 60 * 60 * 1000));

    await moveExpiryToDays(revised, 5);
    const changedExpiry = await expiryAt(revised);
    await evaluate(new Date(changedExpiry.getTime() - 72 * 60 * 60 * 1000));

    const [rows] = await p.db`
      select count(*)::integer as n, count(distinct source_revision)::integer as revisions
      from app_private.client_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and client_id = ${revised.clientId}::uuid
        and source_key = ${revised.subscriptionId}::uuid and source_stage = 't3'`;
    expect(Number(rows!.n)).toBe(2);
    expect(Number(rows!.revisions)).toBe(2);
  });

  it.each([
    { delay: '1 minute', minutes: 1 },
    { delay: '2 hours', minutes: 120 },
  ])(
    'keeps the standard client T-3 kind when a normally eligible subscription is evaluated $delay late',
    async ({ minutes }) => {
      const subject = await p.makeClient({
        activate: true,
        label: `late standard client ${minutes}`,
      });
      const expiry = await expiryAt(subject);
      await evaluate(
        new Date(expiry.getTime() - 72 * 60 * 60 * 1000 + minutes * 60 * 1000),
      );

      const [stored] = await p.db`
        select count(*)::integer as count,
          count(*) filter (where notice_kind = 'subscription_expiring_t3')::integer as standard,
          count(*) filter (where notice_kind = 'subscription_expiring_t3_short_lead')::integer as short_lead
        from app_private.client_inbox_notices
        where workspace_id = ${p.fixture.wsA.id}::uuid
          and client_id = ${subject.clientId}::uuid
          and source_key = ${subject.subscriptionId}::uuid
          and source_stage = 't3'`;
      expect(Number(stored!.count)).toBe(1);
      expect(Number(stored!.standard)).toBe(1);
      expect(Number(stored!.short_lead)).toBe(0);
      const own = kinds(await readAs(subject));
      expect(own).toContain('subscription_expiring_t3');
      expect(own).not.toContain('subscription_expiring_t3_short_lead');
    },
  );

  it('catches up T-3 once when first eligible under 72 hours and sends T-1 only at its instant', async () => {
    const late = await p.makeClient({
      activate: true,
      label: 'expiry short lead',
    });
    await moveActivationToTwoDays(late);
    const expiry = await expiryAt(late);

    await evaluate(new Date(expiry.getTime() - 48 * 60 * 60 * 1000));
    expect(kinds(await readAs(late))).toContain(
      'subscription_expiring_t3_short_lead',
    );
    expect(kinds(await readAs(late))).not.toContain('subscription_expiring_t1');

    await evaluate(new Date(expiry.getTime() - 24 * 60 * 60 * 1000 - 1));
    expect(kinds(await readAs(late))).not.toContain('subscription_expiring_t1');
    await evaluate(new Date(expiry.getTime() - 24 * 60 * 60 * 1000));
    expect(kinds(await readAs(late))).toContain('subscription_expiring_t1');
  });

  it('suppresses obsolete client stages after renewal, freeze, or full refund', async () => {
    const renewed = await p.makeClient({
      activate: true,
      label: 'expiry renewal',
    });
    await moveExpiryToTwoDays(renewed);
    const renewalExpiry = await expiryAt(renewed);
    await evaluate(new Date(renewalExpiry.getTime() - 48 * 60 * 60 * 1000));
    const [offer] = await p.db`
      select o.id from public.subscriptions s
      join public.package_offers o on o.current_version_id = s.package_version_id
        and o.available is true
      where s.workspace_id = ${p.fixture.wsA.id}::uuid
        and s.id = ${renewed.subscriptionId}::uuid`;
    expect(offer?.id).toBeTruthy();
    const renewal = await p.fixture.po.client.rpc('record_renewal', {
      request: {
        workspace_id: p.fixture.wsA.id,
        client_id: renewed.clientId,
        predecessor_subscription_id: renewed.subscriptionId,
        package_offer_id: offer!.id,
        request_key: randomUUID(),
        expected_revision: 0,
        renewal_confirmed: true,
        installments: null,
      },
    });
    expect(renewal.error).toBeNull();
    expect(renewal.data).toMatchObject({ status: 'ok' });
    await evaluate(new Date(renewalExpiry.getTime() - 24 * 60 * 60 * 1000));
    const [renewalRows] = await p.db`
      select count(*) filter (where notice_kind = 'subscription_expiring_t1')::integer as t1,
        count(*) filter (where notice_kind in (
          'subscription_expiring_t3', 'subscription_expiring_t3_short_lead'))::integer as t3
      from app_private.client_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and client_id = ${renewed.clientId}::uuid
        and source_key = ${renewed.subscriptionId}::uuid
        and (notice_kind in ('subscription_expiring_t1',
          'subscription_expiring_t3', 'subscription_expiring_t3_short_lead'))`;
    expect(Number(renewalRows!.t1)).toBe(0);
    expect(Number(renewalRows!.t3)).toBe(1);

    const frozen = await p.makeClient({
      activate: true,
      label: 'expiry freeze',
    });
    await moveExpiryToTwoDays(frozen);
    const freezeExpiry = await expiryAt(frozen);
    await evaluate(new Date(freezeExpiry.getTime() - 48 * 60 * 60 * 1000));
    const freeze = await p.fixture.trainerA.client.rpc(
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
    expect(freeze.error).toBeNull();
    expect(freeze.data).toMatchObject({ status: 'applied', revision: 1 });
    await evaluate(new Date(freezeExpiry.getTime() - 24 * 60 * 60 * 1000));
    const [freezeRows] = await p.db`
      select count(*) filter (where notice_kind = 'subscription_expiring_t1')::integer as t1,
        count(*) filter (where notice_kind in (
          'subscription_expiring_t3', 'subscription_expiring_t3_short_lead'))::integer as t3
      from app_private.client_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and client_id = ${frozen.clientId}::uuid
        and source_key = ${frozen.subscriptionId}::uuid
        and notice_kind in ('subscription_expiring_t1',
          'subscription_expiring_t3', 'subscription_expiring_t3_short_lead')`;
    expect(Number(freezeRows!.t1)).toBe(0);
    expect(Number(freezeRows!.t3)).toBe(1);

    const refunded = await p.makeClient({
      activate: true,
      label: 'expiry refund',
    });
    await moveExpiryToTwoDays(refunded);
    const refundExpiry = await expiryAt(refunded);
    await evaluate(new Date(refundExpiry.getTime() - 48 * 60 * 60 * 1000));
    const refund = await p.fixture.po.client.rpc('record_refund', {
      request: {
        workspace_id: p.fixture.wsA.id,
        client_id: refunded.clientId,
        purchase_id: refunded.subscriptionId,
        request_key: randomUUID(),
        amount_minor: '1200',
        external_confirmation: true,
      },
    });
    expect(refund.error).toBeNull();
    expect(refund.data).toMatchObject({ status: 'ok' });
    await evaluate(new Date(refundExpiry.getTime() - 24 * 60 * 60 * 1000));
    const [refundRows] = await p.db`
      select count(*) filter (where notice_kind = 'subscription_expiring_t1')::integer as t1,
        count(*) filter (where notice_kind in (
          'subscription_expiring_t3', 'subscription_expiring_t3_short_lead'))::integer as t3
      from app_private.client_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and client_id = ${refunded.clientId}::uuid
        and source_key = ${refunded.subscriptionId}::uuid
        and notice_kind in ('subscription_expiring_t1',
          'subscription_expiring_t3', 'subscription_expiring_t3_short_lead')`;
    expect(Number(refundRows!.t1)).toBe(0);
    expect(Number(refundRows!.t3)).toBe(1);
  });

  it('uses the F13 Cairo first-existing expiry instant for T-3, T-1 and expiry stages', async () => {
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

    await moveExpiryToTwoDays(client);
    const expiry = await expiryAt(client);
    await evaluate(new Date(expiry.getTime() - 72 * 60 * 60 * 1000));
    expect(kinds(await readAs(client))).toContain('subscription_expiring_t3');
    await evaluate(new Date(expiry.getTime() - 24 * 60 * 60 * 1000));
    expect(kinds(await readAs(client))).toContain('subscription_expiring_t1');
    await evaluate(expiry);
    expect(kinds(await readAs(client))).toContain('subscription_expired');
  });

  it('returns date-only expiry data and dismisses only the acting client row idempotently', async () => {
    const subject = await p.makeClient({
      activate: true,
      label: 'expiry dismiss owner',
    });
    await moveExpiryToTwoDays(subject);
    const expiry = await expiryAt(subject);
    await evaluate(new Date(expiry.getTime() - 72 * 60 * 60 * 1000));
    const [core] = await p.db`
      select app_private.f22_subscription_core(${p.fixture.wsA.id}::uuid,
        ${subject.clientId}::uuid) as value`;
    const expiryDate = (core!.value as { effective_end_exclusive: string })
      .effective_end_exclusive;

    const own = await readAs(subject);
    const notice = (own.notices as Array<Record<string, unknown>>).find(
      (row) => row.notice_kind === 'subscription_expiring_t3',
    );
    expect(notice).toMatchObject({
      expiry_date: expiryDate,
      dismissed_at: null,
    });
    const noticeId = notice!.notice_id as string;
    await expect(dismissAs(subject, noticeId)).resolves.toEqual({
      status: 'dismissed',
    });
    await expect(dismissAs(subject, noticeId)).resolves.toEqual({
      status: 'dismissed',
    });
    await expect(dismissAs(other, noticeId)).resolves.toEqual({
      status: 'not_found',
    });
    await expect(dismissAs(subject, randomUUID())).resolves.toEqual({
      status: 'not_found',
    });
    expect(kinds(await readAs(subject))).not.toContain(
      'subscription_expiring_t3',
    );
  });

  it('kills a client-scope mutation in the existing F22 reader', async () => {
    await p.db`select app_private.f22_enqueue_client_notice(
      ${p.fixture.wsA.id}::uuid, ${client.clientId}::uuid,
      'subscription_activated', ${randomUUID()}::uuid)`;

    await inRolledBackTx(async (tx) => {
      const original = await readDefinition(tx);
      const mutant = original.replace(
        'and n.client_id = client_row.client_id',
        'and n.client_id is not null',
      );
      expect(mutant).not.toBe(original);
      await tx.unsafe(mutant);
      let killed = false;
      try {
        await asUser(tx, other.authUserId, async (inner) => {
          const [row] =
            await inner`select public.read_client_notices(100, null) as value`;
          expect(kinds(row!.value as Record<string, unknown>)).not.toContain(
            'subscription_activated',
          );
        });
      } catch {
        killed = true;
      }
      await tx.unsafe(original);
      expect(killed, 'Removing the F22 client scope must be detected').toBe(
        true,
      );
    });
  });
});
