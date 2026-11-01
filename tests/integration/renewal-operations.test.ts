import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import {
  bought,
  activate,
  sql,
  sqlPay,
} from './registration-approval-payment-fixture';
import {
  clientContext,
  probe,
} from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());

async function packageOfferId(
  tx: TransactionSql | ReturnType<typeof sql>,
  linkId: string,
) {
  const [row] = await tx`
    select v.offer_id from public.registration_links l
    join public.package_versions v on v.workspace_id=l.workspace_id and v.id=l.package_version_id
    where l.id=${linkId}
  `;
  if (!row) throw new Error('Fixture package offer missing');
  return row.offer_id as string;
}

async function renewal(
  tx: TransactionSql,
  userId: string,
  request: Record<string, unknown>,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] =
      await tx`select public.record_renewal(${tx.json(request as JSONValue)}) as result`;
    return row!.result as Record<string, unknown>;
  } finally {
    await tx`reset role`;
  }
}

async function freeze(
  tx: TransactionSql,
  userId: string,
  request: Record<string, unknown>,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] =
      await tx`select public.subscription_freeze_operation(${tx.json(request as JSONValue)}) as result`;
    return row!.result as Record<string, unknown>;
  } finally {
    await tx`reset role`;
  }
}

async function fixture() {
  const f = await clientContext();
  const purchase = await bought(f);
  const offerId = await packageOfferId(db, purchase.t.link);
  return { f, purchase, offerId };
}

it('T010 reuses F12 installment snapshots and anchors renewal dues to its recording date', async () => {
  const { f, purchase, offerId } = await fixture();
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    const result = await renewal(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: purchase.sid,
      package_offer_id: offerId,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: null,
    });
    expect(result.status).toBe('ok');
    const receipt = result.receipt as Record<string, unknown>;
    const rows = await tx`
      select s.kind,s.predecessor_subscription_id,s.package_version_id,s.price_minor::text,
        s.currency,s.duration_days,r.recording_date::text,r.service_start_date::text,
        r.service_end_exclusive::text,
        (select sum(i.amount_minor)::text from public.subscription_installments i
          where i.workspace_id=s.workspace_id and i.subscription_id=s.id) as installment_total,
        (select min(i.due_on)::text from public.subscription_installments i
          where i.workspace_id=s.workspace_id and i.subscription_id=s.id) as first_due_on
      from public.subscriptions s join public.subscription_renewals r
        on r.workspace_id=s.workspace_id and r.subscription_id=s.id
      where s.id=${receipt.subscription_id as string}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'renewal',
      predecessor_subscription_id: purchase.sid,
      package_version_id: receipt.package_version_id,
      price_minor: receipt.price_minor,
      currency: receipt.currency,
      duration_days: receipt.duration_days,
      recording_date: receipt.recording_date,
      service_start_date: receipt.service_start_date,
      service_end_exclusive: receipt.service_end_exclusive,
      installment_total: receipt.price_minor,
      first_due_on: receipt.recording_date,
    });
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    try {
      const [paymentStatus] = await tx`
        select public.subscription_payment_status(${f.wsA.id},${purchase.t.id},${receipt.subscription_id as string}) as result`;
      expect(paymentStatus!.result).toMatchObject({
        status: 'ok',
        obligations: [
          expect.objectContaining({ due_on: receipt.recording_date }),
        ],
      });
    } finally {
      await tx`reset role`;
    }
    const [projection] = await tx`
      select app_private.f13_project_entitlement(
        ${f.wsA.id},${purchase.sid},
        (${receipt.service_start_date as string}::date+1)
      ) as projection
    `;
    expect(projection!.projection).toMatchObject({
      status: 'active',
      effective_end_exclusive: expect.any(String),
      coverage_end_exclusive: receipt.service_end_exclusive,
    });
    const predecessorEnd = (projection!.projection as Record<string, string>)
      .effective_end_exclusive!;
    expect(predecessorEnd <= (receipt.service_start_date as string)).toBe(true);
    expect(predecessorEnd).toBe(receipt.service_start_date);
  });
});

it('Q2 Trainer may collect a renewal installment in its authorized workspace', async () => {
  const { f, purchase, offerId } = await fixture();
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    const renewed = await renewal(tx, f.po.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: purchase.sid,
      package_offer_id: offerId,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: [
        { amount_minor: '600', due_offset_days: 0 },
        { amount_minor: '600', due_offset_days: 30 },
      ],
    });
    expect(renewed.status).toBe('ok');
    const receipt = renewed.receipt as Record<string, unknown>;
    const renewalId = receipt.subscription_id as string;
    const obligations = await tx`
      select id,seq from public.subscription_installments
      where subscription_id=${renewalId} order by seq
    `;
    expect(obligations).toHaveLength(2);
    const collect = (seq: 1 | 2, previous: string | null) =>
      sqlPay(tx, f.trainerA.userId, 'collect', {
        workspace_id: f.wsA.id,
        client_id: purchase.t.id,
        request_key: randomUUID(),
        subscription_id: renewalId,
        obligation_id: obligations[seq - 1]!.id as string,
        expected_installment_seq: seq,
        expected_revision: 0,
        expected_previous_event_id: previous,
        expected_amount_minor: '600',
        currency: 'XTS',
        collected_on: '1900-01-01',
        payment_confirmed: true,
      });
    const first = await collect(1, null);
    expect(first.status).toBe('ok');
    const result = await collect(2, null);
    expect(result.status).toBe('ok');
    expect(result.receipt).toMatchObject({
      operation: 'collect',
      outcome: 'collected',
      installment_seq: 2,
      amount_minor: '600',
    });
  });
});

it('Q2 Trainer cannot configure a multi-installment renewal schedule', async () => {
  const { f, purchase, offerId } = await fixture();
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    const denied = await renewal(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: purchase.sid,
      package_offer_id: offerId,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: [
        { amount_minor: '600', due_offset_days: 0 },
        { amount_minor: '600', due_offset_days: 30 },
      ],
    });
    expect(denied.status).toBe('not_permitted');
  });
});

it('T010 rejects renewal before initial activation and a second unstarted successor', async () => {
  const { f, purchase, offerId } = await fixture();
  await probe(async (tx) => {
    const request = {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: purchase.sid,
      package_offer_id: offerId,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: null,
    };
    expect(await renewal(tx, f.po.userId, request)).toMatchObject({
      status: 'stale_state',
    });
    await activate(tx, f, purchase);
    expect((await renewal(tx, f.po.userId, request)).status).toBe('ok');
    expect(
      await renewal(tx, f.po.userId, {
        ...request,
        request_key: randomUUID(),
        expected_revision: 1,
      }),
    ).toMatchObject({ status: 'stale_state' });
  });
});

it('S22-PO-5 records renewal activation atomically and permits a renewal of that renewal', async () => {
  const { f, purchase, offerId } = await fixture();
  await probe(async (tx) => {
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${purchase.sid},clock_timestamp()-interval '62 days',${randomUUID()})`;
    const first = await renewal(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: purchase.sid,
      package_offer_id: offerId,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: null,
    });
    expect(first.status).toBe('ok');
    const firstReceipt = first.receipt as Record<string, unknown>;
    const firstId = firstReceipt.subscription_id as string;
    const [activation] = await tx`
      select a.activated_at,r.recorded_at,r.recording_date::text
      from public.subscription_activations a
      join public.subscription_renewals r on r.workspace_id=a.workspace_id and r.subscription_id=a.subscription_id
      where a.workspace_id=${f.wsA.id} and a.subscription_id=${firstId}
    `;
    expect(activation).toBeDefined();
    expect(
      Math.abs(
        new Date(activation!.activated_at as string).getTime() -
          new Date(activation!.recorded_at as string).getTime(),
      ),
    ).toBeLessThan(1000);
    expect(firstReceipt.recording_date).toBe(activation!.recording_date);

    const second = await renewal(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: firstId,
      package_offer_id: offerId,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: null,
    });
    expect(second.status).toBe('ok');
    const secondId = (second.receipt as Record<string, unknown>)
      .subscription_id as string;
    const activationCount = await tx`
      select count(*)::int as count from public.subscription_activations
      where workspace_id=${f.wsA.id} and subscription_id in (${firstId},${secondId})
    `;
    expect(activationCount[0]!.count).toBe(2);
  });
});

it('rejects chaining from an unstarted renewal without writing lifecycle or audit side effects', async () => {
  const { f, purchase, offerId } = await fixture();
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    const first = await renewal(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: purchase.sid,
      package_offer_id: offerId,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: null,
    });
    expect(first.status).toBe('ok');
    const firstId = (first.receipt as Record<string, unknown>)
      .subscription_id as string;
    const [dates] = await tx`
      select coalesce((
        select d.service_start_date
        from public.subscription_renewal_date_revisions d
        where d.workspace_id=r.workspace_id and d.subscription_id=r.subscription_id
        order by d.revision desc limit 1
      ),r.service_start_date)::text as service_start_date,
      (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today
      from public.subscription_renewals r where r.subscription_id=${firstId}
    `;
    expect(dates!.service_start_date > dates!.today).toBe(true);
    const [before] = await tx`
      select
        (select count(*)::int from app_private.subscription_renewal_operations where client_id=${purchase.t.id}) as operations,
        (select count(*)::int from public.subscription_renewals where workspace_id=${f.wsA.id} and client_id=${purchase.t.id}) as renewals,
        (select count(*)::int from public.subscription_activations a join public.subscriptions s
          on s.workspace_id=a.workspace_id and s.id=a.subscription_id where s.client_id=${purchase.t.id}) as activations,
        (select count(*)::int from public.subscription_installments i join public.subscriptions s
          on s.workspace_id=i.workspace_id and s.id=i.subscription_id where s.client_id=${purchase.t.id}) as installments,
        (select count(*)::int from public.payment_events e join public.subscriptions s
          on s.workspace_id=e.workspace_id and s.id=e.subscription_id where s.client_id=${purchase.t.id}) as payment_events,
        (select count(*)::int from public.audit_events where workspace_id=${f.wsA.id}) as audit_events
    `;
    const chained = await renewal(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: firstId,
      package_offer_id: offerId,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: null,
    });
    expect(chained).toMatchObject({ status: 'stale_state' });
    const [after] = await tx`
      select
        (select count(*)::int from app_private.subscription_renewal_operations where client_id=${purchase.t.id}) as operations,
        (select count(*)::int from public.subscription_renewals where workspace_id=${f.wsA.id} and client_id=${purchase.t.id}) as renewals,
        (select count(*)::int from public.subscription_activations a join public.subscriptions s
          on s.workspace_id=a.workspace_id and s.id=a.subscription_id where s.client_id=${purchase.t.id}) as activations,
        (select count(*)::int from public.subscription_installments i join public.subscriptions s
          on s.workspace_id=i.workspace_id and s.id=i.subscription_id where s.client_id=${purchase.t.id}) as installments,
        (select count(*)::int from public.payment_events e join public.subscriptions s
          on s.workspace_id=e.workspace_id and s.id=e.subscription_id where s.client_id=${purchase.t.id}) as payment_events,
        (select count(*)::int from public.audit_events where workspace_id=${f.wsA.id}) as audit_events
    `;
    expect(after).toEqual(before);
  });
});

it('serializes concurrent renewals of one predecessor so only one unstarted successor is recorded', async () => {
  const { f, purchase, offerId } = await fixture();
  await db.begin((tx) => activate(tx, f, purchase));
  const request = () => ({
    workspace_id: f.wsA.id,
    client_id: purchase.t.id,
    predecessor_subscription_id: purchase.sid,
    package_offer_id: offerId,
    request_key: randomUUID(),
    expected_revision: 0,
    renewal_confirmed: true,
    installments: null,
  });
  const leftDb = sql();
  const rightDb = sql();
  let left: Record<string, unknown>;
  let right: Record<string, unknown>;
  try {
    [left, right] = await Promise.all([
      leftDb.begin((tx) => renewal(tx, f.trainerA.userId, request())),
      rightDb.begin((tx) => renewal(tx, f.trainerA.userId, request())),
    ]);
  } finally {
    await Promise.all([leftDb.end(), rightDb.end()]);
  }
  expect([left.status, right.status].sort()).toEqual(['ok', 'stale_state']);
  const [count] = await db`
    select count(*)::int as count from public.subscription_renewals
    where workspace_id=${f.wsA.id} and client_id=${purchase.t.id}
      and predecessor_subscription_id=${purchase.sid}
  `;
  expect(count!.count).toBe(1);
});

it('keeps one unstarted renewal across the full subscription chain', async () => {
  const { f, purchase, offerId } = await fixture();
  await probe(async (tx) => {
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${purchase.sid},clock_timestamp()-interval '62 days',${randomUUID()})`;
    const started = await renewal(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: purchase.sid,
      package_offer_id: offerId,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: null,
    });
    expect(started.status).toBe('ok');
    const startedId = (started.receipt as Record<string, unknown>)
      .subscription_id as string;
    const second = await renewal(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: startedId,
      package_offer_id: offerId,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: null,
    });
    expect(second.status).toBe('ok');
    const [counts] = await tx`
      select count(*)::int as renewals,
        (select count(*)::int from public.subscription_renewals r
          where r.client_id=${purchase.t.id}
            and coalesce((select d.service_start_date from public.subscription_renewal_date_revisions d
              where d.workspace_id=r.workspace_id and d.subscription_id=r.subscription_id
              order by d.revision desc limit 1),r.service_start_date)
              >(clock_timestamp() at time zone 'Africa/Cairo')::date) as unstarted
      from public.subscription_renewals where client_id=${purchase.t.id}
    `;
    expect(counts!.renewals).toBe(2);
    expect(counts!.unstarted).toBe(1);

    const branched = await renewal(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: purchase.sid,
      package_offer_id: offerId,
      request_key: randomUUID(),
      expected_revision: 1,
      renewal_confirmed: true,
      installments: null,
    });
    expect(branched).toMatchObject({ status: 'stale_state' });
  });
});

it('S22-PO-5 denies freezing a renewal before its Cairo service start', async () => {
  const { f, purchase, offerId } = await fixture();
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    const renewed = await renewal(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: purchase.sid,
      package_offer_id: offerId,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: null,
    });
    expect(renewed.status).toBe('ok');
    const renewalId = (renewed.receipt as Record<string, unknown>)
      .subscription_id as string;
    const [dates] = await tx`
      select r.service_start_date::text,(clock_timestamp() at time zone 'Africa/Cairo')::date::text as today
      from public.subscription_renewals r where r.subscription_id=${renewalId}
    `;
    expect(dates!.service_start_date > dates!.today).toBe(true);
    await expect(
      tx.savepoint(async (inner) => {
        await freeze(inner, f.trainerA.userId, {
          action: 'apply',
          workspace_id: f.wsA.id,
          client_id: purchase.t.id,
          subscription_id: renewalId,
          request_key: randomUUID(),
          expected_revision: 0,
          duration_days: 3,
        });
      }),
    ).rejects.toMatchObject({ code: '23514' });
    const [count] =
      await tx`select count(*)::int as count from public.subscription_freezes where subscription_id=${renewalId}`;
    expect(count!.count).toBe(0);
  });
});

it('S22-PO-5 freezes a started renewal and extends service without moving installment dues', async () => {
  const { f, purchase, offerId } = await fixture();
  await probe(async (tx) => {
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${purchase.sid},clock_timestamp()-interval '62 days',${randomUUID()})`;
    const renewed = await renewal(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: purchase.sid,
      package_offer_id: offerId,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: [{ amount_minor: '1200', due_offset_days: 7 }],
    });
    expect(renewed.status).toBe('ok');
    const renewalId = (renewed.receipt as Record<string, unknown>)
      .subscription_id as string;
    const [before] = await tx`
      select r.service_start_date::text,r.service_end_exclusive::text,i.due_on::text
      from public.subscription_renewals r join public.subscription_installments i
        on i.workspace_id=r.workspace_id and i.subscription_id=r.subscription_id
      where r.subscription_id=${renewalId}
    `;
    const [today] =
      await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as date`;
    expect(before!.service_start_date).toBe(today!.date);
    const applied = await freeze(tx, f.trainerA.userId, {
      action: 'apply',
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: renewalId,
      request_key: randomUUID(),
      expected_revision: 0,
      duration_days: 3,
    });
    expect(applied.status).toBe('applied');
    const [after] = await tx`
      select (app_private.f13_project_entitlement(${f.wsA.id},${renewalId},
        (clock_timestamp() at time zone 'Africa/Cairo')::date)->>'effective_end_exclusive') as service_end_exclusive,
        i.due_on::text
      from public.subscription_renewals r join public.subscription_installments i
        on i.workspace_id=r.workspace_id and i.subscription_id=r.subscription_id
      where r.subscription_id=${renewalId}
    `;
    const [expected] =
      await tx`select (${before!.service_end_exclusive}::date+3)::text as end_date`;
    expect(after!.service_end_exclusive).toBe(expected!.end_date);
    expect(after!.service_end_exclusive).not.toBe(
      before!.service_end_exclusive,
    );
    expect(after!.due_on).toBe(before!.due_on);
  });
});

it('S22-PO-5 exposes no standalone activation writer to anon or authenticated', async () => {
  await probe(async (tx) => {
    const privileges = await tx`
      select has_table_privilege('anon','public.subscription_activations','INSERT') as anon_insert,
        has_table_privilege('authenticated','public.subscription_activations','INSERT') as authenticated_insert,
        coalesce(bool_or(has_function_privilege('anon',p.oid,'EXECUTE')),false) as anon_activation_writer,
        coalesce(bool_or(has_function_privilege('authenticated',p.oid,'EXECUTE')),false) as authenticated_activation_writer
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','app_private') and p.proname ~* '(activation|activate)'
        and p.proname <> 'record_renewal'
    `;
    expect(privileges[0]).toEqual({
      anon_insert: false,
      authenticated_insert: false,
      anon_activation_writer: false,
      authenticated_activation_writer: false,
    });
  });
});

it('T010 shifts an unstarted renewal after predecessor Freeze without moving recording-date dues', async () => {
  const { f, purchase, offerId } = await fixture();
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    const [packageVersion] = await tx`
      select v.price_minor::text as price_minor from public.package_offers o
      join public.package_versions v on v.workspace_id=o.workspace_id and v.id=o.current_version_id
      where o.workspace_id=${f.wsA.id} and o.id=${offerId}
    `;
    const result = await renewal(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: purchase.sid,
      package_offer_id: offerId,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: [
        { amount_minor: packageVersion!.price_minor, due_offset_days: 5 },
      ],
    });
    expect(result.status).toBe('ok');
    const receipt = result.receipt as Record<string, unknown>;
    const successorId = receipt.subscription_id as string;
    const [before] = await tx`
      select service_start_date::text,service_end_exclusive::text from public.subscription_renewals
      where subscription_id=${successorId}
    `;
    const [dueBefore] = await tx`
      select due_on::text from public.subscription_installments where subscription_id=${successorId}
    `;
    const freezeResult = await freeze(tx, f.trainerA.userId, {
      action: 'apply',
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      request_key: randomUUID(),
      expected_revision: 0,
      duration_days: 3,
    });
    expect(freezeResult.status).toBe('applied');
    const [after] = await tx`
      select service_start_date::text,service_end_exclusive::text from public.subscription_renewal_date_revisions
      where subscription_id=${successorId} order by revision desc limit 1
    `;
    const [dueAfter] = await tx`
      select due_on::text from public.subscription_installments where subscription_id=${successorId}
    `;
    const [expectedDates] = await tx`
      select (${before!.service_start_date}::date+3)::text as shifted_start,
        (${receipt.recording_date as string}::date+5)::text as due_on
    `;
    expect(after!.service_start_date).toBe(expectedDates!.shifted_start);
    expect(after!.service_end_exclusive).not.toBe(
      before!.service_end_exclusive,
    );
    expect(dueAfter!.due_on).toBe(dueBefore!.due_on);
    expect(dueAfter!.due_on).toBe(expectedDates!.due_on);
  });
});

it('T010 rolls back a predecessor Freeze that would reflow an already-started renewal', async () => {
  const { f, purchase, offerId } = await fixture();
  await probe(async (tx) => {
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${purchase.sid},clock_timestamp()-interval '62 days',${randomUUID()})`;
    const renewed = await renewal(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      predecessor_subscription_id: purchase.sid,
      package_offer_id: offerId,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: null,
    });
    expect(renewed.status).toBe('ok');
    const renewalIdValue = (renewed.receipt as Record<string, unknown>)
      .subscription_id;
    if (typeof renewalIdValue !== 'string')
      throw new Error('Missing renewal subscription ID');
    const renewalId = renewalIdValue;
    const [before] =
      await tx`select service_start_date::text from public.subscription_renewals where subscription_id=${renewalId}`;
    const [today] =
      await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as date`;
    expect(before!.service_start_date).toBe(today!.date);
    const request = {
      action: 'apply',
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      request_key: randomUUID(),
      expected_revision: 0,
      duration_days: 2,
    };
    await expect(
      tx.savepoint(async (inner) => {
        await freeze(inner, f.trainerA.userId, request);
      }),
    ).rejects.toMatchObject({ code: '23514' });
    const [counts] = await tx`
      select (select count(*)::int from public.subscription_freezes where subscription_id=${purchase.sid}) as freezes,
        (select count(*)::int from public.subscription_renewal_date_revisions where subscription_id=${renewalId}) as revisions,
        (select count(*)::int from app_private.subscription_freeze_operations where request_key=${request.request_key}) as receipts`;
    expect(counts).toEqual({ freezes: 0, revisions: 0, receipts: 0 });
  });
});

it('T010 denies foreign workspace targets and ungranted actors without receipts', async () => {
  const { f, purchase, offerId } = await fixture();
  const foreign = await clientContext();
  const request = {
    workspace_id: f.wsA.id,
    client_id: purchase.t.id,
    predecessor_subscription_id: purchase.sid,
    package_offer_id: offerId,
    request_key: randomUUID(),
    expected_revision: 0,
    renewal_confirmed: true,
    installments: null,
  };
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    expect(await renewal(tx, foreign.woA.userId, request)).toMatchObject({
      status: 'not_permitted',
    });
    expect(await renewal(tx, f.actors.client.userId!, request)).toMatchObject({
      status: 'not_permitted',
    });
  });
});
