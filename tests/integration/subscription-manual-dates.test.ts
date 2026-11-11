import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import {
  clientContext,
  graph,
  probe,
  sql,
} from './registration-approval-fixture';

const db = sql();
afterAll(() => db.end());

type AdjustmentInput = {
  workspace_id: string;
  client_id: string;
  subscription_id: string;
  new_service_start_date: string;
  new_service_end_exclusive: string;
  request_key: string;
};

function adjustmentInput(
  f: Awaited<ReturnType<typeof clientContext>>,
  ids: Awaited<ReturnType<typeof graph>>,
  patch: Partial<AdjustmentInput> = {},
): AdjustmentInput {
  return {
    workspace_id: f.wsA.id,
    client_id: ids.client,
    subscription_id: ids.subscription,
    new_service_start_date: '2026-09-01',
    new_service_end_exclusive: '2026-12-01',
    request_key: randomUUID(),
    ...patch,
  };
}

async function adjustTx(
  tx: TransactionSql,
  userId: string,
  input: AdjustmentInput,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select public.record_subscription_date_adjustment(${tx.json(input as JSONValue)}) as result`;
    return row!.result as { status: string; receipt?: Record<string, unknown> };
  } finally {
    await tx`reset role`;
  }
}

it('T043 PO commits a date adjustment with immutable audit and zero revenue', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${ids.subscription},clock_timestamp(),${randomUUID()})`;
    const [before] = await tx`
      select (select count(*)::int from public.payment_events where subscription_id=${ids.subscription}) as payments,
        (select count(*)::int from public.subscription_installments where subscription_id=${ids.subscription}) as installments,
        (select count(*)::int from public.refund_operations where subscription_id=${ids.subscription}) as refunds`;
    const result = await adjustTx(tx, f.po.userId, adjustmentInput(f, ids));
    expect(result.status).toBe('ok');
    expect(result.receipt).toMatchObject({
      workspace_id: f.wsA.id,
      client_id: ids.client,
      subscription_id: ids.subscription,
      new_service_start_date: '2026-09-01',
      new_service_end_exclusive: '2026-12-01',
    });
    const [fact] = await tx`
      select new_service_start_date::text as start_on, new_service_end_exclusive::text as end_on,
        actor_user_id from public.subscription_manual_date_adjustments
      where workspace_id=${f.wsA.id} and subscription_id=${ids.subscription}`;
    expect(fact).toMatchObject({
      start_on: '2026-09-01',
      end_on: '2026-12-01',
      actor_user_id: f.po.userId,
    });
    const audits = await tx`
      select action, details from public.audit_events
      where target_table='subscription_manual_date_adjustments'`;
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'subscription.manual_date_adjusted',
    });
    expect(audits[0]!.details).toMatchObject({
      subscription_id: ids.subscription,
      new_service_start_date: '2026-09-01',
      new_service_end_exclusive: '2026-12-01',
    });
    const [after] = await tx`
      select (select count(*)::int from public.payment_events where subscription_id=${ids.subscription}) as payments,
        (select count(*)::int from public.subscription_installments where subscription_id=${ids.subscription}) as installments,
        (select count(*)::int from public.refund_operations where subscription_id=${ids.subscription}) as refunds`;
    expect(after).toEqual(before);
    expect(after).toMatchObject({ refunds: 0 });
  });
});

it('T043 PO adjustment commits after expiry with no expiry gate', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${ids.subscription},clock_timestamp()-interval '100 days',${randomUUID()})`;
    const [term] = await tx`
      select (((clock_timestamp()-interval '100 days') at time zone 'Africa/Cairo')::date+61
        < (clock_timestamp() at time zone 'Africa/Cairo')::date) as ended`;
    expect(term!.ended).toBe(true);
    const result = await adjustTx(tx, f.po.userId, adjustmentInput(f, ids));
    expect(result.status).toBe('ok');
    const [counts] = await tx`
      select (select count(*)::int from public.subscription_manual_date_adjustments where subscription_id=${ids.subscription}) as facts,
        (select count(*)::int from public.audit_events where target_table='subscription_manual_date_adjustments') as audits,
        (select count(*)::int from public.payment_events where subscription_id=${ids.subscription} and id<>${ids.event}) as new_payments`;
    expect(counts).toEqual({ facts: 1, audits: 1, new_payments: 0 });
  });
});

it('T043 non-PO attempts are refused before any write', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${ids.subscription},clock_timestamp(),${randomUUID()})`;
    const result = await adjustTx(
      tx,
      f.trainerA.userId,
      adjustmentInput(f, ids),
    );
    expect(result).toEqual({ status: 'not_permitted' });
    const [counts] = await tx`
      select (select count(*)::int from public.subscription_manual_date_adjustments where subscription_id=${ids.subscription}) as facts,
        (select count(*)::int from public.audit_events where target_table='subscription_manual_date_adjustments') as audits`;
    expect(counts).toEqual({ facts: 0, audits: 0 });
  });
});

it('T043 exact replay is identical and changed intent conflicts without extra rows', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${ids.subscription},clock_timestamp(),${randomUUID()})`;
    const key = randomUUID();
    const first = await adjustTx(
      tx,
      f.po.userId,
      adjustmentInput(f, ids, { request_key: key }),
    );
    expect(first.status).toBe('ok');
    const replay = await adjustTx(
      tx,
      f.po.userId,
      adjustmentInput(f, ids, { request_key: key }),
    );
    expect(replay).toEqual(first);
    const conflict = await adjustTx(
      tx,
      f.po.userId,
      adjustmentInput(f, ids, {
        request_key: key,
        new_service_end_exclusive: '2026-12-15',
      }),
    );
    expect(conflict).toEqual({ status: 'key_conflict' });
    const [counts] = await tx`
      select (select count(*)::int from public.subscription_manual_date_adjustments where subscription_id=${ids.subscription}) as facts,
        (select count(*)::int from public.audit_events where target_table='subscription_manual_date_adjustments') as audits`;
    expect(counts).toEqual({ facts: 1, audits: 1 });
  });
});

async function freezeForT043(
  tx: TransactionSql,
  userId: string,
  input: Record<string, unknown>,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select public.subscription_freeze_operation(${tx.json(input as JSONValue)}) as receipt`;
    return row!.receipt as { status: string };
  } finally {
    await tx`reset role`;
  }
}

async function refundForT043(
  tx: TransactionSql,
  userId: string,
  input: Record<string, unknown>,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] =
      await tx`select public.record_refund(${tx.json(input as JSONValue)}) as result`;
    return row!.result as { status: string };
  } finally {
    await tx`reset role`;
  }
}

it('T043 projected entitlement uses the latest PO-adjusted effective dates', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${ids.subscription},clock_timestamp(),${randomUUID()})`;
    const result = await adjustTx(
      tx,
      f.po.userId,
      adjustmentInput(f, ids, {
        new_service_start_date: '2026-12-01',
        new_service_end_exclusive: '2027-01-01',
      }),
    );
    expect(result.status).toBe('ok');
    const [beforeStart] = await tx`
      select app_private.f13_project_entitlement(${f.wsA.id},${ids.subscription},'2026-11-15'::date) as projection`;
    expect(beforeStart!.projection).toMatchObject({ status: 'future' });
    const [withinAdjustedDates] = await tx`
      select app_private.f13_project_entitlement(${f.wsA.id},${ids.subscription},'2026-12-15'::date) as projection`;
    expect(withinAdjustedDates!.projection).toMatchObject({
      status: 'active',
      effective_end_exclusive: '2027-01-01',
      coverage_end_exclusive: '2027-01-01',
    });
  });
});

it.each(['frozen', 'deactivated'] as const)(
  'T043 refuses a %s subscription with zero date/audit writes',
  async (state) => {
    const f = await clientContext();
    await probe(async (tx) => {
      const ids = await graph(tx, f);
      await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
        values(${f.wsA.id},${ids.subscription},clock_timestamp(),${randomUUID()})`;
      if (state === 'frozen') {
        const freeze = await freezeForT043(tx, f.trainerA.userId, {
          action: 'apply',
          workspace_id: f.wsA.id,
          client_id: ids.client,
          subscription_id: ids.subscription,
          duration_days: 3,
          expected_revision: 0,
          request_key: randomUUID(),
        });
        expect(freeze.status).toBe('applied');
      } else {
        const refunded = await refundForT043(tx, f.po.userId, {
          workspace_id: f.wsA.id,
          client_id: ids.client,
          purchase_id: ids.subscription,
          request_key: randomUUID(),
          amount_minor: '1200',
          external_confirmation: true,
        });
        expect(refunded.status).toBe('ok');
      }
      const result = await adjustTx(tx, f.po.userId, adjustmentInput(f, ids));
      expect(result).toEqual({ status: 'stale_state' });
      const [counts] = await tx`
        select (select count(*)::int from public.subscription_manual_date_adjustments where subscription_id=${ids.subscription}) as facts,
          (select count(*)::int from public.audit_events where target_table='subscription_manual_date_adjustments'
            and details->>'subscription_id'=${ids.subscription}) as audits`;
      expect(counts).toEqual({ facts: 0, audits: 0 });
    });
  },
);
