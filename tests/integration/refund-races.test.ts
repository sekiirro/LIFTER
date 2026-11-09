import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import { clientContext, graph, sql } from './registration-approval-fixture';
import {
  activate,
  bought,
  paymentRequest,
  sqlPay,
} from './registration-approval-payment-fixture';
import {
  waitForLock,
  worker,
} from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());

it('backfills retention facts from matching historical refund operations', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  await db.begin((tx) => activate(tx, f, purchase));

  const migration = readFileSync(
    new URL(
      '../../supabase/migrations/20261109220000_f15_review16_followup.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const backfill = migration.match(
    /insert into app_private\.form_retention_windows\([\s\S]*?on conflict \(workspace_id,client_id,source_event_id\) do nothing;/i,
  )?.[0];
  expect(backfill).toBeTruthy();

  await db`alter table public.clients disable trigger f15_client_retention_fact`;
  try {
    const result = await f.po.client.rpc('record_refund', {
      request: {
        workspace_id: f.wsA.id,
        client_id: purchase.t.id,
        purchase_id: purchase.sid,
        request_key: randomUUID(),
        amount_minor: '400',
        external_confirmation: true,
      },
    });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ status: 'ok' });
  } finally {
    await db`alter table public.clients enable trigger f15_client_retention_fact`;
  }

  const [before] = await db`
    select c.deactivated_at,r.id as refund_id,
      count(w.id)::int as retention_count
    from public.clients c
    join public.refund_operations r
      on r.workspace_id=c.workspace_id and r.client_id=c.id and r.recorded_at=c.deactivated_at
    left join app_private.form_retention_windows w
      on w.workspace_id=c.workspace_id and w.client_id=c.id and w.source_event_id=r.id
    where c.workspace_id=${f.wsA.id} and c.id=${purchase.t.id}
    group by c.deactivated_at,r.id`;
  expect(before?.retention_count).toBe(0);
  await db.unsafe(backfill!);
  await db.unsafe(backfill!);
  const [after] = await db`
    select w.source_event_id,w.source_kind,w.ended_at,w.purge_after,
      c.deactivated_at,r.id as refund_id
    from app_private.form_retention_windows w
    join public.clients c on c.workspace_id=w.workspace_id and c.id=w.client_id
    join public.refund_operations r
      on r.workspace_id=c.workspace_id and r.client_id=c.id and r.recorded_at=c.deactivated_at
    where c.workspace_id=${f.wsA.id} and c.id=${purchase.t.id}`;
  expect(after).toMatchObject({
    source_event_id: before?.refund_id,
    source_kind: 'refund',
    ended_at: before?.deactivated_at,
    deactivated_at: before?.deactivated_at,
    refund_id: before?.refund_id,
  });
  expect(new Date(after!.purge_after as string).getTime()).toBe(
    new Date(before!.deactivated_at as string).getTime() +
      30 * 24 * 60 * 60 * 1000,
  );
});

async function seed() {
  const f = await clientContext();
  const ids = await db.begin((tx) => graph(tx, f));
  return { f, ids };
}

async function refund(
  f: Awaited<ReturnType<typeof clientContext>>,
  ids: Awaited<ReturnType<typeof graph>>,
  amount: string,
  requestKey = randomUUID(),
) {
  const result = await f.po.client.rpc('record_refund', {
    request: {
      workspace_id: f.wsA.id,
      client_id: ids.client,
      purchase_id: ids.subscription,
      request_key: requestKey,
      amount_minor: amount,
      external_confirmation: true,
    },
  });
  expect(result.error).toBeNull();
  return result.data as { status: string; receipt?: Record<string, unknown> };
}

async function refundTx(
  tx: TransactionSql,
  userId: string,
  input: Record<string, unknown>,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select public.record_refund(${tx.json(input as JSONValue)}) as result`;
    return row!.result as { status: string; receipt?: Record<string, unknown> };
  } finally {
    await tx`reset role`;
  }
}

function refundInput(
  f: Awaited<ReturnType<typeof clientContext>>,
  clientId: string,
  subscriptionId: string,
  amount: string,
  expectedRevision?: number,
) {
  return {
    workspace_id: f.wsA.id,
    client_id: clientId,
    purchase_id: subscriptionId,
    request_key: randomUUID(),
    amount_minor: amount,
    external_confirmation: true,
    ...(expectedRevision === undefined
      ? {}
      : { expected_revision: expectedRevision }),
  };
}

async function renewalTx(
  tx: TransactionSql,
  userId: string,
  request: Record<string, unknown>,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select public.record_renewal(${tx.json(request as JSONValue)}) as result`;
    return row!.result as { status: string; receipt?: Record<string, unknown> };
  } finally {
    await tx`reset role`;
  }
}

it('R1 serializes distinct partial refunds and rejects the stale second refund before exceeding residual', async () => {
  const { f, ids } = await seed();
  const results = await Promise.all([
    refund(f, ids, '700'),
    refund(f, ids, '600'),
  ]);

  expect(results.map((result) => result.status).sort()).toEqual(
    ['invalid_input', 'ok'].sort(),
  );
  const [totals] = await db`
    select sum(-a.amount_minor)::int as principal,
      sum(-a.commission_minor)::int as commission,
      count(distinct a.refund_operation_id)::int as operations
    from public.refund_allocation_events a where a.subscription_id=${ids.subscription}`;
  const successful = results.find((result) => result.status === 'ok');
  const acceptedAmount = Number(successful?.receipt?.amount_minor);
  expect([600, 700]).toContain(acceptedAmount);
  expect(totals).toEqual({
    principal: acceptedAmount,
    commission: 1,
    operations: 1,
  });
});

it('R4 exact replay is byte-identical, changed intent conflicts, and revoked actor cannot replay the receipt', async () => {
  const { f, ids } = await seed();
  const requestKey = randomUUID();
  const results = await Promise.all([
    refund(f, ids, '500', requestKey),
    refund(f, ids, '500', requestKey),
  ]);

  expect(results[0]).toEqual(results[1]);
  expect(results[0]!.status).toBe('ok');
  const changedIntent = await refund(f, ids, '501', requestKey);
  expect(changedIntent.status).toBe('key_conflict');

  // Refunds are PO-only, so first demote the original PO to a scoped owner and
  // then revoke that workspace membership before asking for the old receipt.
  await db.begin(async (tx) => {
    await tx`update public.staff_profiles set role='workspace_owner'
      where user_id=${f.po.userId}`;
    await tx`insert into public.workspace_memberships
      (workspace_id,user_id,granted_by)
      values(${f.wsA.id},${f.po.userId},${f.po.userId})`;
    await tx`update public.workspace_memberships
      set revoked_at=now(),revoked_by=${f.po.userId}
      where workspace_id=${f.wsA.id} and user_id=${f.po.userId}`;
  });
  try {
    const revokedReplay = await refund(f, ids, '500', requestKey);
    expect(revokedReplay.status).toBe('not_permitted');
    const [membership] = await db`
      select revoked_at is not null as revoked from public.workspace_memberships
      where workspace_id=${f.wsA.id} and user_id=${f.po.userId}`;
    expect(membership).toEqual({ revoked: true });
    const [counts] = await db`
      select
        (select count(*)::int from public.refund_operations where subscription_id=${ids.subscription}) as refunds,
        (select count(*)::int from public.refund_allocation_events where subscription_id=${ids.subscription}) as allocations,
        (select count(*)::int from app_private.refund_auth_lockouts where client_id=${ids.client}) as lockouts`;
    expect(counts).toEqual({ refunds: 1, allocations: 1, lockouts: 1 });
  } finally {
    await db.begin(async (tx) => {
      await tx`update public.staff_profiles set role='platform_owner'
        where user_id=${f.po.userId}`;
    });
  }
});

it('allows a second capped partial refund after deactivation without re-enqueueing lockout', async () => {
  const { f, ids } = await seed();
  expect((await refund(f, ids, '500')).status).toBe('ok');
  expect((await refund(f, ids, '700')).status).toBe('ok');
  expect((await refund(f, ids, '1')).status).toBe('invalid_input');
  const [counts] = await db`
    select
      (select count(*)::int from public.refund_operations where subscription_id=${ids.subscription}) as refunds,
      (select sum(-amount_minor)::int from public.refund_allocation_events where subscription_id=${ids.subscription}) as principal,
      (select count(*)::int from app_private.client_deactivation_state where client_id=${ids.client}) as deactivation,
      (select count(*)::int from app_private.refund_auth_lockouts where client_id=${ids.client}) as lockouts`;
  expect(counts).toEqual({
    refunds: 2,
    principal: 1200,
    deactivation: 1,
    lockouts: 1,
  });
});

it('R2 collection first makes the refund preview stale without undoing the collection', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const label = `f13-r2-collect-first-${randomUUID()}`;
  const blocker = sql();
  const pending = worker(label);
  let flight: Promise<{ status: string }> | undefined;

  try {
    await blocker.begin(async (tx) => {
      await activate(tx, f, purchase);
      const collected = await sqlPay(
        tx,
        f.po.userId,
        'collect',
        paymentRequest(f, purchase),
      );
      expect(collected.status).toBe('ok');
      flight = pending.begin((workerTx) =>
        refundTx(
          workerTx,
          f.po.userId,
          refundInput(f, purchase.t.id, purchase.sid, '1200', 1),
        ),
      ) as unknown as Promise<{ status: string }>;
      void flight.catch(() => undefined);
      expect(await waitForLock(db, label)).toBe(true);
    });

    expect(await flight).toEqual({ status: 'stale_state' });
    const [facts] = await db`
      select
        (select count(*)::int from public.payment_events where subscription_id=${purchase.sid}) as events,
        (select count(*)::int from public.refund_operations where subscription_id=${purchase.sid}) as refunds,
        (select count(*)::int from public.refund_allocation_events where subscription_id=${purchase.sid}) as allocations`;
    expect(facts).toEqual({ events: 2, refunds: 0, allocations: 0 });
  } finally {
    if (flight) await flight.catch(() => undefined);
    await pending.end();
    await blocker.end();
  }
});

it('R2 refund first denies the waiting collection and preserves the original ledger', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const label = `f13-r2-refund-first-${randomUUID()}`;
  const blocker = sql();
  const pending = worker(label);
  let flight: Promise<{ status: string }> | undefined;

  try {
    await blocker.begin(async (tx) => {
      const result = await refundTx(
        tx,
        f.po.userId,
        refundInput(f, purchase.t.id, purchase.sid, '400', 1),
      );
      expect(result.status).toBe('ok');
      flight = pending.begin((workerTx) =>
        sqlPay(workerTx, f.po.userId, 'collect', paymentRequest(f, purchase)),
      ) as unknown as Promise<{ status: string }>;
      void flight.catch(() => undefined);
      expect(await waitForLock(db, label)).toBe(true);
    });

    expect((await flight)!.status).not.toBe('ok');
    const [facts] = await db`
      select
        (select count(*)::int from public.payment_events where subscription_id=${purchase.sid}) as events,
        (select count(*)::int from public.refund_operations where subscription_id=${purchase.sid}) as refunds,
        (select count(*)::int from public.refund_allocation_events where subscription_id=${purchase.sid}) as allocations`;
    expect(facts).toEqual({ events: 1, refunds: 1, allocations: 1 });
  } finally {
    if (flight) await flight.catch(() => undefined);
    await pending.end();
    await blocker.end();
  }
});

it('R3 correction first stales the old preview and refund uses only a recollected source', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const originalEventId = purchase.approved.receipt!.event_id as string;
  const label = `f13-r3-correct-first-${randomUUID()}`;
  const blocker = sql();
  const pending = worker(label);
  let flight: Promise<{ status: string }> | undefined;
  let correctionEventId = '';
  let recollectedEventId = '';

  try {
    await blocker.begin(async (tx) => {
      const corrected = await sqlPay(
        tx,
        f.po.userId,
        'correct',
        paymentRequest(f, purchase, 'correct'),
      );
      expect(corrected.status).toBe('ok');
      correctionEventId = corrected.receipt!.event_id as string;
      const recollected = await sqlPay(
        tx,
        f.po.userId,
        'collect',
        paymentRequest(f, purchase, 'collect', {
          obligation_id: purchase.rows[0]!.id,
          expected_installment_seq: 1,
          expected_revision: 2,
          expected_previous_event_id: correctionEventId,
        }),
      );
      expect(recollected.status).toBe('ok');
      recollectedEventId = recollected.receipt!.event_id as string;
      flight = pending.begin((workerTx) =>
        refundTx(
          workerTx,
          f.po.userId,
          refundInput(f, purchase.t.id, purchase.sid, '400', 1),
        ),
      ) as unknown as Promise<{ status: string }>;
      void flight.catch(() => undefined);
      expect(await waitForLock(db, label)).toBe(true);
    });

    expect(await flight).toEqual({ status: 'stale_state' });
    const current = await f.po.client.rpc('record_refund', {
      request: refundInput(f, purchase.t.id, purchase.sid, '400', 3),
    });
    expect(current.error).toBeNull();
    expect((current.data as { status: string }).status).toBe('ok');
    const [source] = await db`
      select source.id as source_id,original.amount_minor::text as original_amount,
        reversal.amount_minor::text as reversal_amount,
        allocation.source_collection_event_id as allocated_source
      from public.payment_events source
      join public.payment_events original on original.id=${originalEventId}
      join public.payment_events reversal on reversal.id=${correctionEventId}
      join public.refund_allocation_events allocation
        on allocation.source_collection_event_id=source.id
      where source.id=${recollectedEventId} and source.subscription_id=${purchase.sid}
        and source.kind='collection' and source.revision=3`;
    expect(source).toEqual({
      source_id: recollectedEventId,
      original_amount: '400',
      reversal_amount: '-400',
      allocated_source: recollectedEventId,
    });
  } finally {
    if (flight) await flight.catch(() => undefined);
    await pending.end();
    await blocker.end();
  }
});

it('R3 refund first denies a waiting correction and leaves the original collection unchanged', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const originalEventId = purchase.approved.receipt!.event_id as string;
  const label = `f13-r3-refund-first-${randomUUID()}`;
  const blocker = sql();
  const pending = worker(label);
  let flight: Promise<{ status: string }> | undefined;

  try {
    await blocker.begin(async (tx) => {
      const result = await refundTx(
        tx,
        f.po.userId,
        refundInput(f, purchase.t.id, purchase.sid, '400', 1),
      );
      expect(result.status).toBe('ok');
      flight = pending.begin((workerTx) =>
        sqlPay(
          workerTx,
          f.po.userId,
          'correct',
          paymentRequest(f, purchase, 'correct'),
        ),
      ) as unknown as Promise<{ status: string }>;
      void flight.catch(() => undefined);
      expect(await waitForLock(db, label)).toBe(true);
    });

    expect((await flight)!.status).not.toBe('ok');
    const [original] = await db`
      select kind,amount_minor::text,revision from public.payment_events where id=${originalEventId}`;
    expect(original).toEqual({
      kind: 'collection',
      amount_minor: '400',
      revision: 1,
    });
    const [counts] = await db`
      select count(*)::int as events from public.payment_events where subscription_id=${purchase.sid}`;
    expect(counts!.events).toBe(1);
  } finally {
    if (flight) await flight.catch(() => undefined);
    await pending.end();
    await blocker.end();
  }
});

it('R5 rechecks a revoked actor after waiting for the client financial lock', async () => {
  const { f, ids } = await seed();
  const input = refundInput(f, ids.client, ids.subscription, '600');
  const label = `f13-r5-revoked-${randomUUID()}`;
  const blocker = sql();
  const pending = worker(label);
  let flight:
    Promise<{ status: string; receipt?: Record<string, unknown> }> | undefined;

  try {
    await blocker.begin(async (tx) => {
      await tx`select id from public.clients where id=${ids.client} for update`;
      flight = pending.begin((workerTx) =>
        refundTx(workerTx, f.po.userId, input),
      ) as unknown as Promise<{
        status: string;
        receipt?: Record<string, unknown>;
      }>;
      void flight.catch(() => undefined);
      expect(await waitForLock(db, label)).toBe(true);
      await db`update public.staff_profiles set role='trainer' where user_id=${f.po.userId}`;
    });

    expect(await flight).toEqual({ status: 'not_permitted' });
    const [counts] = await db`
      select
        (select count(*)::int from public.refund_operations where client_id=${ids.client}) as refunds,
        (select count(*)::int from public.refund_allocation_events where subscription_id=${ids.subscription}) as allocations,
        (select count(*)::int from app_private.registration_operations where request_key=${input.request_key}) as receipts,
        (select count(*)::int from app_private.client_deactivation_state where client_id=${ids.client}) as deactivation,
        (select count(*)::int from app_private.refund_auth_lockouts where client_id=${ids.client}) as lockouts,
        (select deactivated_at is not null from public.clients where id=${ids.client}) as inactive`;
    expect(counts).toEqual({
      refunds: 0,
      allocations: 0,
      receipts: 0,
      deactivation: 0,
      lockouts: 0,
      inactive: false,
    });
  } finally {
    if (flight) await flight.catch(() => undefined);
    await pending.end();
    await blocker.end();
  }
});

it('R8 refunds one selected purchase and leaves another purchase for manual resolution', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const [offer] = await db`
    select v.offer_id from public.registration_links l
    join public.package_versions v on v.workspace_id=l.workspace_id and v.id=l.package_version_id
    where l.id=${purchase.t.link}`;
  await db.begin((tx) => activate(tx, f, purchase));
  const renewal = await db.begin((tx) =>
    renewalTx(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: purchase.sid,
      package_offer_id: offer!.offer_id as string,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: null,
    }),
  );
  expect(renewal.status).toBe('ok');
  const renewalSubscriptionId = renewal.receipt!.subscription_id as string;
  const [before] = await db`
    select r.service_start_date::text,r.service_end_exclusive::text,
      (select count(*)::int from public.payment_events e where e.subscription_id=s.id) as events
    from public.subscriptions s join public.subscription_renewals r
      on r.workspace_id=s.workspace_id and r.subscription_id=s.id
    where s.id=${renewalSubscriptionId}`;

  const missingPurchase = await f.po.client.rpc('record_refund', {
    request: {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      request_key: randomUUID(),
      amount_minor: '600',
      external_confirmation: true,
    },
  });
  expect(missingPurchase.error).toBeNull();
  expect(missingPurchase.data).toEqual({ status: 'invalid_input' });
  const refundResult = await f.po.client.rpc('record_refund', {
    request: {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      purchase_id: purchase.sid,
      request_key: randomUUID(),
      amount_minor: '400',
      external_confirmation: true,
    },
  });
  expect(refundResult.error).toBeNull();
  expect(refundResult.data).toMatchObject({ status: 'ok' });

  const [after] = await db`
    select r.service_start_date::text,r.service_end_exclusive::text,
      (select count(*)::int from public.payment_events e where e.subscription_id=s.id) as events,
      (select count(*)::int from public.refund_operations ro where ro.subscription_id=s.id) as refunds,
      (select count(*)::int from public.subscription_obligation_cancellations c where c.subscription_id=s.id) as cancellations
    from public.subscriptions s join public.subscription_renewals r
      on r.workspace_id=s.workspace_id and r.subscription_id=s.id
    where s.id=${renewalSubscriptionId}`;
  expect(after).toEqual({
    ...before,
    refunds: 0,
    cancellations: 0,
  });
  const [deactivated] = await db`
    select c.deactivated_at is not null as inactive,
      (select count(*)::int from app_private.client_deactivation_state d where d.client_id=c.id) as markers
    from public.clients c where c.id=${purchase.t.id}`;
  expect(deactivated).toEqual({ inactive: true, markers: 1 });
});
