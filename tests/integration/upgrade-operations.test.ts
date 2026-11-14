import { randomUUID } from 'node:crypto';
import type { JSONValue, TransactionSql } from 'postgres';
import { afterAll, expect, it } from 'vitest';
import {
  bought,
  activate,
  paymentRequest,
  sqlPay,
  sql,
} from './registration-approval-payment-fixture';
import { graph } from './registration-approval-fixture';
import {
  call,
  clientContext,
  probe,
  registered,
  request,
} from './registration-approval-operations-fixture';
import { checked, publish } from './registration-links-fixture';
import {
  waitForLock,
  worker,
} from './registration-approval-operations-fixture';
import { withCrashSafeFunctionMutant } from './function-drift-guard';

const db = sql();
afterAll(() => db.end());

async function expectInvariantFailure(body: () => Promise<void>) {
  let failed = false;
  try {
    await body();
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
}

async function packageOfferId(linkId: string) {
  const [row] = await db`
    select v.offer_id from public.registration_links l
    join public.package_versions v on v.workspace_id=l.workspace_id and v.id=l.package_version_id
    where l.id=${linkId}
  `;
  if (!row) throw new Error('Fixture package offer missing');
  return row.offer_id as string;
}

async function targetOffer(
  f: Awaited<ReturnType<typeof clientContext>>,
  patch: Record<string, unknown>,
) {
  const versionId = checked(
    await publish(f, f.p.id, {
      tier_rank: 2,
      price_minor: '1600',
      currency: 'XTS',
      commission_rate_bp: 2500,
      ...patch,
    }),
  ) as string;
  const offer = checked(
    await f.po.client
      .from('package_offers')
      .select('id,current_version_id,tier_rank')
      .eq('current_version_id', versionId)
      .single(),
  );
  checked(
    await f.po.client.rpc('set_package_offer_available', {
      workspace_id: f.wsA.id,
      offer_id: offer.id,
      available: true,
    }),
  );
  return offer.id as string;
}

async function upgrade(
  tx: TransactionSql,
  userId: string,
  request: Record<string, unknown>,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] =
      await tx`select public.record_subscription_upgrade(${tx.json(request as JSONValue)}) as result`;
    return row!.result as Record<string, unknown>;
  } finally {
    await tx`reset role`;
  }
}

async function refund(
  tx: TransactionSql,
  userId: string,
  request: Record<string, unknown>,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] =
      await tx`select public.record_refund(${tx.json(request as JSONValue)}) as result`;
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

async function adjustDates(
  tx: TransactionSql,
  userId: string,
  request: Record<string, unknown>,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] =
      await tx`select public.record_subscription_date_adjustment(${tx.json(request as JSONValue)}) as result`;
    return row!.result as Record<string, unknown>;
  } finally {
    await tx`reset role`;
  }
}

async function fullyPayInitial(
  tx: TransactionSql,
  f: Awaited<ReturnType<typeof clientContext>>,
  purchase: Awaited<ReturnType<typeof bought>>,
) {
  const second = await sqlPay(
    tx,
    f.trainerA.userId,
    'collect',
    paymentRequest(f, purchase),
  );
  expect(second.status).toBe('ok');
  const third = await sqlPay(tx, f.trainerA.userId, 'collect', {
    ...paymentRequest(f, purchase),
    request_key: randomUUID(),
    obligation_id: purchase.rows[2]!.id,
    expected_installment_seq: 3,
  });
  expect(third.status).toBe('ok');
}

async function egp750Purchase() {
  const f0 = await clientContext();
  const versionId = checked(
    await publish(f0, f0.p.id, {
      tier_rank: 1,
      price_minor: '750',
      currency: 'EGP',
      commission_rate_bp: 1000,
    }),
  ) as string;
  const versionContext = { ...f0, p: { ...f0.p, versionId } };
  const offer = checked(
    await f0.po.client
      .from('package_offers')
      .select('id')
      .eq('current_version_id', versionId)
      .single(),
  );
  checked(
    await f0.po.client.rpc('set_package_offer_available', {
      workspace_id: f0.wsA.id,
      offer_id: offer.id,
      available: true,
    }),
  );
  const purchase = await boughtWithAmounts(versionContext, [
    '250',
    '250',
    '250',
  ]);
  return { f: versionContext, purchase };
}

async function boughtWithAmounts(
  f: Awaited<ReturnType<typeof clientContext>>,
  amounts: string[],
) {
  const rows = amounts.map((amount_minor, index) => ({
    seq: index + 1,
    amount_minor,
    due_offset_days: index * 30,
  }));
  const t = await registered(f, rows);
  const approved = await call(
    f.po.client,
    'approve',
    request(f, t, 'approve', { currency: 'EGP' }),
  );
  if (approved.status !== 'ok') throw new Error('EGP fixture approval failed');
  const db = sql();
  try {
    const installments =
      await db`select id,seq from public.subscription_installments
      where subscription_id=${approved.receipt!.subscription_id as string} order by seq`;
    return {
      t,
      approved,
      sid: approved.receipt!.subscription_id as string,
      rows: installments,
    };
  } finally {
    await db.end();
  }
}

it('T042 prices the FR-038 EGP 750 to EGP 1400 upgrade as EGP 650 revenue with the original commission rate', async () => {
  const { f, purchase } = await egp750Purchase();
  const target = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1400',
    currency: 'EGP',
    duration_days: 90,
    commission_rate_bp: 2000,
  });
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    await fullyPayAmounts(tx, f, purchase, '250');
    const result = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(result).toMatchObject({
      status: 'ok',
      receipt: {
        package_price_minor: '1400',
        credit_minor: '750',
        additional_payment_minor: '650',
        currency: 'EGP',
      },
    });
    const [ledger] = await tx`select count(*)::int as count,
      sum(additional_payment_minor)::text as new_revenue,
      sum(credit_minor)::text as credited from public.subscription_upgrades
      where subscription_id=${purchase.sid}`;
    expect(ledger).toEqual({ count: 1, new_revenue: '650', credited: '750' });
  });
});

it('T048 refuses an upgrade with an unsettled installment before any writes', async () => {
  const { f, purchase } = await egp750Purchase();
  const target = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1400',
    currency: 'EGP',
    duration_days: 90,
  });
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    const [before] = await tx`
      select
        (select to_jsonb(s) from public.subscriptions s where s.id=${purchase.sid}) as subscription,
        (select count(*)::int from public.subscription_upgrades where subscription_id=${purchase.sid}) as upgrades,
        (select count(*)::int from app_private.subscription_upgrade_operations where subscription_id=${purchase.sid}) as operations,
        (select count(*)::int from public.subscription_installments where subscription_id=${purchase.sid}) as installments,
        (select count(*)::int from public.payment_events where subscription_id=${purchase.sid}) as payment_events,
        (select count(*)::int from public.audit_events a where a.workspace_id=${f.wsA.id} and a.target_table='subscription_upgrades' and a.target_id in
        (select u.id from public.subscription_upgrades u where u.workspace_id=${f.wsA.id} and u.subscription_id=${purchase.sid})) as audits`;

    const result = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });

    expect(result.status).not.toBe('ok');
    const [after] = await tx`
      select
        (select to_jsonb(s) from public.subscriptions s where s.id=${purchase.sid}) as subscription,
        (select count(*)::int from public.subscription_upgrades where subscription_id=${purchase.sid}) as upgrades,
        (select count(*)::int from app_private.subscription_upgrade_operations where subscription_id=${purchase.sid}) as operations,
        (select count(*)::int from public.subscription_installments where subscription_id=${purchase.sid}) as installments,
        (select count(*)::int from public.payment_events where subscription_id=${purchase.sid}) as payment_events,
        (select count(*)::int from public.audit_events a where a.workspace_id=${f.wsA.id} and a.target_table='subscription_upgrades' and a.target_id in
        (select u.id from public.subscription_upgrades u where u.workspace_id=${f.wsA.id} and u.subscription_id=${purchase.sid})) as audits`;
    expect(after).toEqual(before);
  });
});

it('T048 revalidates after the shared locks and retains the pre-write over-balance guard', async () => {
  const [row] = await db`
    select pg_get_functiondef('public.record_subscription_upgrade(jsonb)'::regprocedure) as definition`;
  const definition = row!.definition as string;
  const clientLock = definition.indexOf('select * into c from public.clients');
  const subscriptionLock = definition.indexOf(
    'select * into s from public.subscriptions',
  );
  const installmentLocks = definition.indexOf(
    'perform i.id from public.subscription_installments',
  );
  const settlementGuard = definition.indexOf(
    'settled.collected_minor<>i.amount_minor',
  );
  const overBalanceGuard = definition.indexOf(
    'target_version.price_minor<credit',
  );

  expect(clientLock).toBeGreaterThanOrEqual(0);
  expect(subscriptionLock).toBeGreaterThan(clientLock);
  expect(installmentLocks).toBeGreaterThan(subscriptionLock);
  expect(settlementGuard).toBeGreaterThan(installmentLocks);
  expect(overBalanceGuard).toBeGreaterThan(settlementGuard);
});

async function fullyPayAmounts(
  tx: TransactionSql,
  f: Awaited<ReturnType<typeof clientContext>>,
  purchase: Awaited<ReturnType<typeof boughtWithAmounts>>,
  amount: string,
) {
  for (const installment of purchase.rows.slice(1)) {
    const result = await sqlPay(tx, f.trainerA.userId, 'collect', {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      request_key: randomUUID(),
      subscription_id: purchase.sid,
      obligation_id: installment.id as string,
      expected_installment_seq: installment.seq as number,
      expected_revision: 0,
      expected_previous_event_id: null,
      expected_amount_minor: amount,
      currency: 'EGP',
      collected_on: '1900-01-01',
      payment_confirmed: true,
    });
    expect(result.status).toBe('ok');
  }
}

it('T042 records additional-payment commission at the original subscription rate and keeps one subscription/activation', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const target = await targetOffer(f, { commission_rate_bp: 5000 });
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    await fullyPayInitial(tx, f, purchase);
    const [original] =
      await tx`select commission_rate_bp from public.subscriptions
      where workspace_id=${f.wsA.id} and id=${purchase.sid}`;
    expect(original).toBeDefined();
    const result = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(result).toMatchObject({
      status: 'ok',
      receipt: {
        subscription_id: purchase.sid,
        package_price_minor: '1600',
        credit_minor: '1200',
        additional_payment_minor: '400',
        currency: 'XTS',
      },
    });
    const receipt = result.receipt as Record<string, unknown>;
    expect(receipt).toMatchObject({
      operation_id: expect.any(String),
      upgrade_id: expect.any(String),
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      package_version_id: expect.any(String),
      tier_rank: 2,
      package_price_minor: '1600',
      credit_minor: '1200',
      additional_payment_minor: '400',
      currency: 'XTS',
      service_start_date: expect.any(String),
      service_end_exclusive: expect.any(String),
    });
    expect(Object.hasOwn(receipt, 'commission_rate_bp')).toBe(false);
    expect(Object.hasOwn(receipt, 'commission_minor')).toBe(false);
    const [counts] = await tx`
      select
        (select count(*)::int from public.subscriptions where workspace_id=${f.wsA.id} and client_id=${purchase.t.id}) as subscriptions,
        (select count(*)::int from public.subscription_activations a where a.workspace_id=${f.wsA.id} and a.subscription_id=${purchase.sid}) as activations,
        (select count(*)::int from public.subscription_upgrades u where u.workspace_id=${f.wsA.id} and u.subscription_id=${purchase.sid}) as upgrades,
        (select count(*)::int from public.subscription_installments i where i.workspace_id=${f.wsA.id} and i.subscription_id=${purchase.sid}) as installments,
        (select count(*)::int from public.payment_events e where e.workspace_id=${f.wsA.id} and e.subscription_id=${purchase.sid}) as payment_events,
        (select count(*)::int from public.audit_events a where a.target_table='subscription_upgrades'
          and a.target_id in (select u.id from public.subscription_upgrades u where u.workspace_id=${f.wsA.id} and u.subscription_id=${purchase.sid})) as audit_facts`;
    expect(counts).toEqual({
      subscriptions: 1,
      activations: 1,
      upgrades: 1,
      installments: 3,
      payment_events: 3,
      audit_facts: 1,
    });
    const [audit] = await tx`
      select a.details from public.audit_events a
      where a.target_table='subscription_upgrades'
        and a.target_id in (select u.id from public.subscription_upgrades u where u.workspace_id=${f.wsA.id} and u.subscription_id=${purchase.sid})`;
    const details = audit!.details as Record<string, unknown>;
    expect(Object.keys(details).sort()).toEqual(
      [
        'additional_payment_minor',
        'client_id',
        'commission_minor',
        'credit_minor',
        'currency',
        'package_price_minor',
        'package_version_id',
        'service_end_exclusive',
        'service_start_date',
        'subscription_id',
        'tier_rank',
      ].sort(),
    );
    expect(details).toMatchObject({
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
    });
    expect(typeof details.currency).toBe('string');
    expect(details).not.toHaveProperty('replacement_installment_ids');
    expect(details).not.toHaveProperty('superseded_installment_ids');
    const [payment] = await tx`
      select package_price_minor::text,credit_minor::text,additional_payment_minor::text,
        commission_rate_bp,commission_minor::text
      from public.subscription_upgrades where workspace_id=${f.wsA.id} and subscription_id=${purchase.sid}`;
    expect(payment).toEqual({
      package_price_minor: '1600',
      credit_minor: '1200',
      additional_payment_minor: '400',
      commission_rate_bp: original!.commission_rate_bp,
      commission_minor: (
        await tx`select app_private.f12_commission_minor(400::bigint,${original!.commission_rate_bp})::text as value`
      )[0]!.value,
    });
  });
});

it('T042 allows a qualifying upgrade before activation without consuming duration', async () => {
  const f = await clientContext();
  const t = await registered(f, null);
  const approved = await call(f.po.client, 'approve', request(f, t));
  if (approved.status !== 'ok')
    throw new Error('Single-payment approval failed');
  const purchase = {
    t,
    approved,
    sid: approved.receipt!.subscription_id as string,
    rows: await db`select id,seq from public.subscription_installments
      where subscription_id=${approved.receipt!.subscription_id as string} order by seq`,
  };
  const target = await targetOffer(f, { duration_days: 90 });
  await probe(async (tx) => {
    const result = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(result).toMatchObject({
      status: 'ok',
      receipt: {
        subscription_id: purchase.sid,
        service_start_date: null,
        service_end_exclusive: null,
      },
    });
    const [projection] =
      await tx`select app_private.f13_project_entitlement(${f.wsA.id},${purchase.sid},(clock_timestamp() at time zone 'Africa/Cairo')::date) as value`;
    expect(projection!.value).toMatchObject({
      status: 'awaiting_activation',
      effective_end_exclusive: null,
    });
    await activate(tx, f, purchase);
    const [activated] =
      await tx`select (activated_at at time zone 'Africa/Cairo')::date::text as start_on,
      ((activated_at at time zone 'Africa/Cairo')::date+90)::text as end_on
      from public.subscription_activations where subscription_id=${purchase.sid}`;
    const [afterActivation] =
      await tx`select app_private.f13_project_entitlement(${f.wsA.id},${purchase.sid},
      (clock_timestamp() at time zone 'Africa/Cairo')::date) as value`;
    expect(
      (afterActivation!.value as Record<string, unknown>)
        .effective_end_exclusive,
    ).toBe(activated!.end_on);
  });
});

it('T042 refuses frozen upgrades with zero upgrade, installment, payment, or audit writes', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const target = await targetOffer(f, {});
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    await fullyPayInitial(tx, f, purchase);
    const frozen = await freeze(tx, f.trainerA.userId, {
      action: 'apply',
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      duration_days: 10,
      expected_revision: 0,
      request_key: randomUUID(),
    });
    expect(frozen).toMatchObject({ status: 'applied' });
    const [before] = await tx`
      select (select count(*)::int from public.subscription_installments where subscription_id=${purchase.sid}) as installments,
        (select count(*)::int from public.payment_events where subscription_id=${purchase.sid}) as payments,
        (select count(*)::int from public.audit_events where workspace_id=${f.wsA.id}) as audits`;
    const result = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(result).toMatchObject({ status: 'stale_state' });
    const [after] = await tx`
      select (select count(*)::int from public.subscription_installments where subscription_id=${purchase.sid}) as installments,
        (select count(*)::int from public.payment_events where subscription_id=${purchase.sid}) as payments,
        (select count(*)::int from public.audit_events where workspace_id=${f.wsA.id}) as audits`;
    expect(after).toEqual(before);
  });
});

it('T041/T042 upgrade then renewal then upgrade credits only the original purchase', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const baseOffer = await packageOfferId(purchase.t.link);
  const firstTarget = await targetOffer(f, { duration_days: 120 });
  const secondTarget = await targetOffer(f, {
    tier_rank: 3,
    price_minor: '2200',
    duration_days: 150,
  });
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    await fullyPayInitial(tx, f, purchase);
    const first = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: firstTarget,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(first.status).toBe('ok');
    const firstReceipt = first.receipt as Record<string, unknown>;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    let renewed: Record<string, unknown>;
    try {
      const [row] = await tx`select public.record_renewal(${tx.json({
        workspace_id: f.wsA.id,
        client_id: purchase.t.id,
        predecessor_subscription_id: purchase.sid,
        package_offer_id: baseOffer,
        request_key: randomUUID(),
        expected_revision: 1,
        renewal_confirmed: true,
        installments: null,
      } as JSONValue)}) as result`;
      renewed = row!.result as Record<string, unknown>;
    } finally {
      await tx`reset role`;
    }
    expect(renewed!.status).toBe('ok');
    const renewalReceipt = renewed!.receipt as Record<string, unknown>;
    const renewalId = renewalReceipt.renewal_id as string;
    const [renewalInstallment] = await tx`
      select id,seq,amount_minor::text,currency from public.subscription_installments
      where workspace_id=${f.wsA.id} and subscription_id=${purchase.sid} and renewal_id=${renewalId}`;
    const renewalPayment = await sqlPay(tx, f.trainerA.userId, 'collect', {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      request_key: randomUUID(),
      subscription_id: purchase.sid,
      obligation_id: renewalInstallment!.id,
      expected_installment_seq: renewalInstallment!.seq,
      expected_revision: 0,
      expected_previous_event_id: null,
      expected_amount_minor: renewalInstallment!.amount_minor,
      currency: renewalInstallment!.currency,
      collected_on: '1900-01-01',
      payment_confirmed: true,
    });
    expect(renewalPayment.status).toBe('ok');
    const firstStart = firstReceipt.service_start_date as string;
    const firstEnd = firstReceipt.service_end_exclusive as string;
    const renewalEnd = renewalReceipt.service_end_exclusive as string;
    const [expectedEnd] = await tx`
      select (${firstStart}::date + 150
        + (${renewalEnd}::date - ${firstEnd}::date))::text as end_on`;
    const result = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: secondTarget,
      request_key: randomUUID(),
      expected_revision: 2,
      upgrade_confirmed: true,
    });
    expect(result).toMatchObject({
      status: 'ok',
      receipt: {
        subscription_id: purchase.sid,
        package_price_minor: '2200',
        credit_minor: '1200',
        additional_payment_minor: '1000',
        service_end_exclusive: expectedEnd!.end_on,
      },
    });
    const [projection] = await tx`select app_private.f13_project_entitlement(
      ${f.wsA.id},${purchase.sid},(clock_timestamp() at time zone 'Africa/Cairo')::date) as value`;
    expect(projection!.value).toMatchObject({
      effective_end_exclusive: expectedEnd!.end_on,
      coverage_end_exclusive: expectedEnd!.end_on,
    });
    const [rows] = await tx`
      select
        (select count(*)::int from public.subscriptions where client_id=${purchase.t.id}) as subscriptions,
        (select count(*)::int from public.subscription_activations a where a.subscription_id=${purchase.sid}) as activations,
        (select count(*)::int from public.subscription_renewals r where r.subscription_id=${purchase.sid}) as renewals,
        (select count(*)::int from public.subscription_installments i where i.subscription_id=${purchase.sid} and i.renewal_id is not null) as renewal_installments,
        (select count(*)::int from public.subscription_upgrades u where u.subscription_id=${purchase.sid}) as upgrades`;
    expect(rows).toEqual({
      subscriptions: 1,
      activations: 1,
      renewals: 1,
      renewal_installments: 1,
      upgrades: 2,
    });
  });
});

it('T041/T042 rejects a renewal using the pre-upgrade shared revision without writes', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const originalOffer = await packageOfferId(purchase.t.link);
  const target = await targetOffer(f, { duration_days: 90 });
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    await fullyPayInitial(tx, f, purchase);
    const upgraded = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(upgraded.status).toBe('ok');
    const [before] = await tx`
      select
        (select count(*)::int from public.subscription_renewals where subscription_id=${purchase.sid}) as renewals,
        (select count(*)::int from app_private.subscription_renewal_operations where subscription_id=${purchase.sid}) as operations,
        (select count(*)::int from public.subscription_installments where subscription_id=${purchase.sid}) as installments,
        (select count(*)::int from public.audit_events where workspace_id=${f.wsA.id}) as audits`;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    let stale: Record<string, unknown>;
    try {
      const [row] = await tx`select public.record_renewal(${tx.json({
        workspace_id: f.wsA.id,
        client_id: purchase.t.id,
        predecessor_subscription_id: purchase.sid,
        package_offer_id: originalOffer,
        request_key: randomUUID(),
        expected_revision: 0,
        renewal_confirmed: true,
        installments: null,
      } as JSONValue)}) as result`;
      stale = row!.result as Record<string, unknown>;
    } finally {
      await tx`reset role`;
    }
    expect(stale!).toMatchObject({ status: 'stale_state' });
    const [after] = await tx`
      select
        (select count(*)::int from public.subscription_renewals where subscription_id=${purchase.sid}) as renewals,
        (select count(*)::int from app_private.subscription_renewal_operations where subscription_id=${purchase.sid}) as operations,
        (select count(*)::int from public.subscription_installments where subscription_id=${purchase.sid}) as installments,
        (select count(*)::int from public.audit_events where workspace_id=${f.wsA.id}) as audits`;
    expect(after).toEqual(before);
  });
});

it('T042 applies each FR-038 rank and duration date anchor', async () => {
  const cases = [
    {
      label: 'same-rank longer',
      tier_rank: 1,
      duration_days: 90,
      anchor: 'activation',
    },
    {
      label: 'higher-rank equal duration',
      tier_rank: 2,
      duration_days: 61,
      anchor: 'activation',
    },
    {
      label: 'higher-rank longer duration',
      tier_rank: 2,
      duration_days: 90,
      anchor: 'activation',
    },
    {
      label: 'higher-rank shorter duration',
      tier_rank: 2,
      duration_days: 30,
      anchor: 'today',
    },
  ] as const;
  for (const scenario of cases) {
    const f = await clientContext();
    const purchase = await bought(f);
    const target = await targetOffer(f, {
      tier_rank: scenario.tier_rank,
      duration_days: scenario.duration_days,
      price_minor: '1600',
    });
    await probe(async (tx) => {
      await activate(tx, f, purchase);
      await fullyPayInitial(tx, f, purchase);
      const [expected] = await tx`select
        (a.activated_at at time zone 'Africa/Cairo')::date::text as activation_date,
        (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today
        from public.subscription_activations a where a.subscription_id=${purchase.sid}`;
      const result = await upgrade(tx, f.trainerA.userId, {
        workspace_id: f.wsA.id,
        client_id: purchase.t.id,
        subscription_id: purchase.sid,
        package_offer_id: target,
        request_key: randomUUID(),
        expected_revision: 0,
        upgrade_confirmed: true,
      });
      expect(result).toMatchObject({
        status: 'ok',
        receipt: {
          service_start_date:
            scenario.anchor === 'activation'
              ? expected!.activation_date
              : expected!.today,
        },
      });
    });
  }
});

it('T042 reuses the original start after a higher-rank shorter upgrade', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const firstTarget = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1600',
    duration_days: 30,
  });
  const secondTarget = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '2200',
    duration_days: 90,
  });
  await probe(async (tx) => {
    const historicalActivation = new Date(Date.now() - 10 * 86400000);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id, activation_source)
      values(${f.wsA.id},${purchase.sid},${historicalActivation},${randomUUID()}, 'po_override')`;
    await fullyPayInitial(tx, f, purchase);
    const first = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: firstTarget,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(first.status).toBe('ok');
    const second = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: secondTarget,
      request_key: randomUUID(),
      expected_revision: 1,
      upgrade_confirmed: true,
    });
    const [activation] =
      await tx`select (activated_at at time zone 'Africa/Cairo')::date::text as start_on
      from public.subscription_activations where subscription_id=${purchase.sid}`;
    expect(second).toMatchObject({
      status: 'ok',
      receipt: { service_start_date: activation!.start_on },
    });
  });
});

it('T042 refuses a lower package price even when the original package is only partly collected', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const lower = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1000',
    duration_days: 90,
  });
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    const [before] = await tx`
      select (select count(*)::int from public.subscription_upgrades where subscription_id=${purchase.sid}) as upgrades,
        (select count(*)::int from public.subscription_installments where subscription_id=${purchase.sid}) as installments`;
    const result = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: lower,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(result).toMatchObject({ status: 'invalid_input' });
    const [after] = await tx`
      select (select count(*)::int from public.subscription_upgrades where subscription_id=${purchase.sid}) as upgrades,
        (select count(*)::int from public.subscription_installments where subscription_id=${purchase.sid}) as installments`;
    expect(after).toEqual(before);
  });
});

it('T042 preserves a paid renewal and uses the post-lapse renewal start for later upgrade credit and dates', async () => {
  const { f, purchase } = await egp750Purchase();
  const firstTarget = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1400',
    currency: 'EGP',
    duration_days: 90,
    commission_rate_bp: 2000,
  });
  const secondTarget = await targetOffer(f, {
    tier_rank: 3,
    price_minor: '2200',
    currency: 'EGP',
    duration_days: 120,
    commission_rate_bp: 3000,
  });
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    await fullyPayAmounts(tx, f, purchase, '250');
    const first = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: firstTarget,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(first.status).toBe('ok');
    const [expired] =
      await tx`select ((clock_timestamp() at time zone 'Africa/Cairo')::date-10)::text as start_on,
      ((clock_timestamp() at time zone 'Africa/Cairo')::date-5)::text as end_on`;
    expect(
      (
        await adjustDates(tx, f.po.userId, {
          workspace_id: f.wsA.id,
          client_id: purchase.t.id,
          subscription_id: purchase.sid,
          new_service_start_date: expired!.start_on,
          new_service_end_exclusive: expired!.end_on,
          request_key: randomUUID(),
        })
      ).status,
    ).toBe('ok');
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    let renewed: Record<string, unknown>;
    try {
      const [row] = await tx`select public.record_renewal(${tx.json({
        workspace_id: f.wsA.id,
        client_id: purchase.t.id,
        predecessor_subscription_id: purchase.sid,
        package_offer_id: firstTarget,
        request_key: randomUUID(),
        expected_revision: 1,
        renewal_confirmed: true,
        installments: null,
      } as JSONValue)}) as result`;
      renewed = row!.result as Record<string, unknown>;
    } finally {
      await tx`reset role`;
    }
    expect(renewed!.status).toBe('ok');
    const renewalReceipt = renewed!.receipt as Record<string, unknown>;
    const renewalId = renewalReceipt.renewal_id as string;
    const [obligation] =
      await tx`select id,seq,amount_minor::text,currency from public.subscription_installments
      where subscription_id=${purchase.sid} and renewal_id=${renewalId}`;
    expect(obligation).toMatchObject({ amount_minor: '1400', currency: 'EGP' });
    const collected = await sqlPay(tx, f.trainerA.userId, 'collect', {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      request_key: randomUUID(),
      subscription_id: purchase.sid,
      obligation_id: obligation!.id as string,
      expected_installment_seq: obligation!.seq as number,
      expected_revision: 0,
      expected_previous_event_id: null,
      expected_amount_minor: '1400',
      currency: 'EGP',
      collected_on: '1900-01-01',
      payment_confirmed: true,
    });
    expect(collected.status).toBe('ok');
    const second = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: secondTarget,
      request_key: randomUUID(),
      expected_revision: 2,
      upgrade_confirmed: true,
    });
    expect(second).toMatchObject({
      status: 'ok',
      receipt: {
        credit_minor: '750',
        additional_payment_minor: '1450',
        service_start_date: renewalReceipt.service_start_date,
      },
    });
    const renewalStart = renewalReceipt.service_start_date as string;
    const renewalEnd = renewalReceipt.service_end_exclusive as string;
    const [expectedEnd] = await tx`select
      (${renewalStart}::date + 120
        + (${renewalEnd}::date - (clock_timestamp() at time zone 'Africa/Cairo')::date))::text as end_on`;
    expect(
      (second.receipt as Record<string, unknown>).service_end_exclusive,
    ).toBe(expectedEnd!.end_on);
    const [projection] = await tx`select app_private.f13_project_entitlement(
      ${f.wsA.id},${purchase.sid},(clock_timestamp() at time zone 'Africa/Cairo')::date) as value`;
    expect(projection!.value).toMatchObject({
      effective_end_exclusive: expectedEnd!.end_on,
      coverage_end_exclusive: expectedEnd!.end_on,
    });
    const [preserved] = await tx`select
      (select count(*)::int from public.subscription_renewals where id=${renewalId}) as renewal,
      (select count(*)::int from public.payment_events e join public.subscription_installments i
        on i.workspace_id=e.workspace_id and i.id=e.obligation_id where i.renewal_id=${renewalId} and e.kind='collection') as renewal_collections,
      (select count(*)::int from public.subscriptions where client_id=${purchase.t.id}) as subscriptions,
      (select count(*)::int from public.subscription_activations where subscription_id=${purchase.sid}) as activations`;
    expect(preserved).toEqual({
      renewal: 1,
      renewal_collections: 1,
      subscriptions: 1,
      activations: 1,
    });
  });
});

it('T042 carries only unconsumed counted-freeze extension into the upgraded projection', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const target = await targetOffer(f, { duration_days: 60 });
  await probe(async (tx) => {
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    const [dates] = await tx`select
      ((clock_timestamp() at time zone 'Africa/Cairo')::date - s.duration_days - 3)::date as activated_on,
      ((clock_timestamp() at time zone 'Africa/Cairo')::date - 3)::date as original_end,
      ((clock_timestamp() at time zone 'Africa/Cairo')::date - s.duration_days - 3 + s.duration_days)::date as base_end
      from public.subscriptions s where s.workspace_id=${f.wsA.id} and s.id=${purchase.sid}`;
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id, activation_source)
      values(${f.wsA.id},${purchase.sid},(${dates!.activated_on}::date::timestamp + interval '12 hours') at time zone 'Africa/Cairo',${randomUUID()}, 'po_override')`;
    const [terms] = await tx`select s.duration_days::integer,
        (a.activated_at at time zone 'Africa/Cairo')::date::text as activated_on from public.subscriptions s
      join public.subscription_activations a on a.workspace_id=s.workspace_id and a.subscription_id=s.id
      where s.workspace_id=${f.wsA.id} and s.id=${purchase.sid}`;
    const [base] =
      await tx`select (${terms!.activated_on}::date + ${terms!.duration_days}::integer)::text as end_on`;
    const freezeId = randomUUID();
    await tx`insert into public.subscription_freezes(id,workspace_id,subscription_id,applied_on,duration_days,applied_by,recorded_at)
      values(${freezeId},${f.wsA.id},${purchase.sid},${base!.end_on}::date - 10,10,${f.trainerA.userId},clock_timestamp())`;
    await tx`insert into public.subscription_freeze_events(workspace_id,subscription_id,freeze_id,kind,effective_on,actor_user_id,recorded_at)
      values(${f.wsA.id},${purchase.sid},${freezeId},'stop',${base!.end_on}::date - 5,${f.trainerA.userId},clock_timestamp())`;
    await fullyPayInitial(tx, f, purchase);
    const [before] = await tx`select app_private.f13_project_entitlement(
      ${f.wsA.id},${purchase.sid},(clock_timestamp() at time zone 'Africa/Cairo')::date) as value`;
    expect(before!.value).toMatchObject({ status: 'active' });
    const result = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(result.status).toBe('ok');
    const effectiveEnd = (
      before!.value as {
        effective_end_exclusive: string;
      }
    ).effective_end_exclusive;
    const [targetTerms] = await tx`
      select v.duration_days::integer, o.tier_rank::integer
      from public.package_offers o
      join public.package_versions v
        on v.workspace_id=o.workspace_id and v.id=o.current_version_id
      where o.workspace_id=${f.wsA.id} and o.id=${target}`;
    const [baseTerms] = await tx`
      select v.duration_days::integer, o.tier_rank::integer
      from public.subscriptions s
      join public.package_versions v
        on v.workspace_id=s.workspace_id and v.id=s.package_version_id
      join public.package_offers o
        on o.workspace_id=v.workspace_id and o.id=v.offer_id
      where s.workspace_id=${f.wsA.id} and s.id=${purchase.sid}`;
    const [expected] = await tx`select greatest(
      ((case when ${targetTerms!.tier_rank}::integer>${baseTerms!.tier_rank}::integer
          and ${targetTerms!.duration_days}::integer<${baseTerms!.duration_days}::integer
        then (clock_timestamp() at time zone 'Africa/Cairo')::date
        else ${terms!.activated_on}::date end) + ${targetTerms!.duration_days}::integer
        + greatest(0, ${effectiveEnd}::date - greatest(
            (clock_timestamp() at time zone 'Africa/Cairo')::date,
            ${base!.end_on}::date
          )))::date,
      ${effectiveEnd}::date
    )::text as end_on`;
    expect(
      (result.receipt as Record<string, unknown>).service_end_exclusive,
    ).toBe(expected!.end_on);
    const [after] = await tx`select app_private.f13_project_entitlement(
      ${f.wsA.id},${purchase.sid},(clock_timestamp() at time zone 'Africa/Cairo')::date) as value`;
    expect(after!.value).toMatchObject({
      effective_end_exclusive: expected!.end_on,
      coverage_end_exclusive: expected!.end_on,
    });
  });
});

it('T042 records zero commission for an equal-price longer upgrade without additional revenue', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const target = await targetOffer(f, {
    price_minor: '1200',
    duration_days: 90,
    commission_rate_bp: 5000,
  });
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    await fullyPayInitial(tx, f, purchase);
    const result = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(result).toMatchObject({
      status: 'ok',
      receipt: {
        credit_minor: '1200',
        additional_payment_minor: '0',
      },
    });
    expect(Object.hasOwn(result.receipt!, 'commission_rate_bp')).toBe(false);
    expect(Object.hasOwn(result.receipt!, 'commission_minor')).toBe(false);
    const [snapshot] =
      await tx`select commission_rate_bp,additional_payment_minor::text,commission_minor::text
      from public.subscription_upgrades where subscription_id=${purchase.sid}`;
    expect(snapshot).toEqual({
      commission_rate_bp: 17,
      additional_payment_minor: '0',
      commission_minor: '0',
    });
  });
});

it('T042 refuses mixed currency and lower-price upgrades before any writes', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const lowerPrice = await targetOffer(f, {
    price_minor: '1000',
    duration_days: 90,
  });
  const mixedCurrency = await targetOffer(f, {
    currency: 'USD',
    tier_rank: 3,
    duration_days: 90,
  });
  const sameRankSameDuration = await targetOffer(f, {
    tier_rank: 1,
    duration_days: 30,
    price_minor: '1300',
  });
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    await fullyPayInitial(tx, f, purchase);
    const before =
      await tx`select count(*)::int as upgrades from public.subscription_upgrades where subscription_id=${purchase.sid}`;
    for (const packageOfferId of [
      lowerPrice,
      mixedCurrency,
      sameRankSameDuration,
    ]) {
      const result = await upgrade(tx, f.trainerA.userId, {
        workspace_id: f.wsA.id,
        client_id: purchase.t.id,
        subscription_id: purchase.sid,
        package_offer_id: packageOfferId,
        request_key: randomUUID(),
        expected_revision: 0,
        upgrade_confirmed: true,
      });
      expect(result.status).toBe('invalid_input');
      const after =
        await tx`select count(*)::int as upgrades from public.subscription_upgrades where subscription_id=${purchase.sid}`;
      expect(after).toEqual(before);
    }
  });
});

it('T042 replays an identical request once and refuses a stale distinct revision without writes', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const target = await targetOffer(f, { duration_days: 90 });
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    await fullyPayInitial(tx, f, purchase);
    const request = {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    };
    const first = await upgrade(tx, f.trainerA.userId, request);
    expect(first.status).toBe('ok');
    const [storedCommission] = await tx`
      select commission_rate_bp,commission_minor::text from public.subscription_upgrades
      where workspace_id=${f.wsA.id} and subscription_id=${purchase.sid}`;
    expect(await upgrade(tx, f.trainerA.userId, request)).toEqual(first);
    const legacyRequest = { ...request, request_key: randomUUID() };
    const legacyOperationId = randomUUID();
    const legacyUpgradeId = randomUUID();
    const legacyStoredReceipt = {
      receipt: {
        operation_id: legacyOperationId,
        upgrade_id: legacyUpgradeId,
        commission_rate_bp: storedCommission!.commission_rate_bp,
        commission_minor: storedCommission!.commission_minor,
      },
      status: 'ok',
    };
    await tx`
      insert into app_private.subscription_upgrade_operations(
        id,workspace_id,client_id,subscription_id,actor_user_id,request_key,
        expected_revision,canonical_args_hash,result_receipt,recorded_at,transaction_id
      ) values (
        ${legacyOperationId},${f.wsA.id},${purchase.t.id},${purchase.sid},${f.trainerA.userId},${legacyRequest.request_key},
        ${legacyRequest.expected_revision},
        extensions.digest(convert_to(jsonb_build_array(1,${f.wsA.id}::text,${purchase.t.id}::text,
          ${purchase.sid}::text,${target}::text,${legacyRequest.expected_revision}::integer,true)::text,'UTF8'),'sha256'),
        jsonb_build_object('status','ok','receipt',jsonb_build_object(
          'operation_id',${legacyOperationId}::uuid,'upgrade_id',${legacyUpgradeId}::uuid,
          'commission_rate_bp',${storedCommission!.commission_rate_bp}::integer,
          'commission_minor',${storedCommission!.commission_minor}::text)),
        clock_timestamp(),pg_current_xact_id()
      )`;
    expect(await upgrade(tx, f.trainerA.userId, legacyRequest)).toEqual(
      legacyStoredReceipt,
    );
    const [before] = await tx`select
      (select count(*)::int from public.subscription_upgrades where subscription_id=${purchase.sid}) as upgrades,
      (select count(*)::int from app_private.subscription_upgrade_operations where subscription_id=${purchase.sid}) as operations,
      (select count(*)::int from public.audit_events where target_table='subscription_upgrades' and target_id in
        (select id from public.subscription_upgrades where subscription_id=${purchase.sid})) as audits`;
    expect(before).toEqual({ upgrades: 1, operations: 2, audits: 1 });
    const stale = await upgrade(tx, f.trainerA.userId, {
      ...request,
      request_key: randomUUID(),
    });
    expect(stale.status).toBe('stale_state');
    const [after] = await tx`select
      (select count(*)::int from public.subscription_upgrades where subscription_id=${purchase.sid}) as upgrades,
      (select count(*)::int from app_private.subscription_upgrade_operations where subscription_id=${purchase.sid}) as operations,
      (select count(*)::int from public.audit_events where target_table='subscription_upgrades' and target_id in
        (select id from public.subscription_upgrades where subscription_id=${purchase.sid})) as audits`;
    expect(after).toEqual(before);
  });
});

it('T042 authorizes upgrade only for a payment actor in the subscription workspace', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const target = await targetOffer(f, { duration_days: 90 });
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    const denied = await upgrade(tx, f.trainerB.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(denied.status).toBe('not_permitted');
    const [counts] = await tx`select
      (select count(*)::int from public.subscription_upgrades where subscription_id=${purchase.sid}) as upgrades,
      (select count(*)::int from app_private.subscription_upgrade_operations where subscription_id=${purchase.sid}) as operations,
      (select count(*)::int from public.audit_events a where a.workspace_id=${f.wsA.id} and a.target_table='subscription_upgrades' and a.target_id in
        (select u.id from public.subscription_upgrades u where u.workspace_id=${f.wsA.id} and u.subscription_id=${purchase.sid})) as audits`;
    expect(counts).toEqual({ upgrades: 0, operations: 0, audits: 0 });
  });
});

it('T042 exposes the writer only through its definer RPC and keeps upgrade facts forced-RLS and append-only', async () => {
  await probe(async (tx) => {
    const [factTable] =
      await tx`select c.relrowsecurity as rls, c.relforcerowsecurity as forced,
      has_table_privilege('anon',c.oid,'select') as anon_select,
      has_table_privilege('authenticated',c.oid,'select') as authenticated_select,
      has_table_privilege('service_role',c.oid,'select') as service_select,
      exists(select 1 from pg_trigger g where g.tgrelid=c.oid and g.tgname='f13_subscription_upgrade_guard'
        and g.tgenabled='O' and not g.tgisinternal) as insert_guard
      from pg_class c where c.oid='public.subscription_upgrades'::regclass`;
    expect(factTable).toEqual({
      rls: true,
      forced: true,
      anon_select: false,
      authenticated_select: false,
      service_select: false,
      insert_guard: true,
    });
    const [writer] =
      await tx`select p.prosecdef as definer, p.proconfig as config,
      has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
      has_function_privilege('anon',p.oid,'execute') as anon_execute,
      has_function_privilege('service_role',p.oid,'execute') as service_execute
      from pg_proc p where p.oid='public.record_subscription_upgrade(jsonb)'::regprocedure`;
    expect(writer!.definer).toBe(true);
    expect(writer!.config).toContain('search_path=""');
    expect(writer).toMatchObject({
      authenticated_execute: true,
      anon_execute: false,
      service_execute: false,
    });
    const [privateTable] =
      await tx`select c.relrowsecurity as rls, c.relforcerowsecurity as forced,
      has_table_privilege('anon',c.oid,'select') as anon_select,
      has_table_privilege('authenticated',c.oid,'select') as authenticated_select,
      has_table_privilege('service_role',c.oid,'select') as service_select
      from pg_class c where c.oid='app_private.subscription_upgrade_operations'::regclass`;
    expect(privateTable).toEqual({
      rls: true,
      forced: true,
      anon_select: false,
      authenticated_select: false,
      service_select: false,
    });
  });
});

it('T042 refuses an expired effective term before upgrade writes', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const target = await targetOffer(f, { duration_days: 90 });
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    const [dates] =
      await tx`select ((clock_timestamp() at time zone 'Africa/Cairo')::date-10)::text as start_on,
      ((clock_timestamp() at time zone 'Africa/Cairo')::date-5)::text as end_on`;
    expect(
      (
        await adjustDates(tx, f.po.userId, {
          workspace_id: f.wsA.id,
          client_id: purchase.t.id,
          subscription_id: purchase.sid,
          new_service_start_date: dates!.start_on,
          new_service_end_exclusive: dates!.end_on,
          request_key: randomUUID(),
        })
      ).status,
    ).toBe('ok');
    const [before] =
      await tx`select count(*)::int as upgrades from public.subscription_upgrades where subscription_id=${purchase.sid}`;
    const denied = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(denied.status).toBe('stale_state');
    const [after] =
      await tx`select count(*)::int as upgrades from public.subscription_upgrades where subscription_id=${purchase.sid}`;
    expect(after).toEqual(before);
  });
});

it('T042 applies the standard upgrade calculation to the latest PO-adjusted dates', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const target = await targetOffer(f, { duration_days: 120 });
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    await fullyPayInitial(tx, f, purchase);
    const [dates] =
      await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as start_on,
      ((clock_timestamp() at time zone 'Africa/Cairo')::date+10)::text as end_on,
      ((clock_timestamp() at time zone 'Africa/Cairo')::date+120)::text as upgraded_end_on`;
    const adjusted = await adjustDates(tx, f.po.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      new_service_start_date: dates!.start_on,
      new_service_end_exclusive: dates!.end_on,
      request_key: randomUUID(),
    });
    expect(adjusted.status).toBe('ok');
    const result = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(result).toMatchObject({
      status: 'ok',
      receipt: {
        service_start_date: dates!.start_on,
      },
    });
    const [projection] =
      await tx`select app_private.f13_project_entitlement(${f.wsA.id},${purchase.sid},
      (clock_timestamp() at time zone 'Africa/Cairo')::date) as value`;
    expect(projection!.value).toMatchObject({
      effective_end_exclusive: dates!.upgraded_end_on,
    });
  });
});

it('T043 a manual date adjustment supersedes a previously recorded renewal term', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const originalOffer = await packageOfferId(purchase.t.link);
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    await fullyPayInitial(tx, f, purchase);
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    let renewal: Record<string, unknown>;
    try {
      const [row] = await tx`select public.record_renewal(${tx.json({
        workspace_id: f.wsA.id,
        client_id: purchase.t.id,
        predecessor_subscription_id: purchase.sid,
        package_offer_id: originalOffer,
        request_key: randomUUID(),
        expected_revision: 0,
        renewal_confirmed: true,
        installments: null,
      } as JSONValue)}) as result`;
      renewal = row!.result as Record<string, unknown>;
    } finally {
      await tx`reset role`;
    }
    expect(renewal!.status).toBe('ok');
    const [dates] = await tx`select
      ((clock_timestamp() at time zone 'Africa/Cairo')::date+20)::text as start_on,
      ((clock_timestamp() at time zone 'Africa/Cairo')::date+50)::text as end_on`;
    const adjusted = await adjustDates(tx, f.po.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      new_service_start_date: dates!.start_on,
      new_service_end_exclusive: dates!.end_on,
      request_key: randomUUID(),
    });
    expect(adjusted.status).toBe('ok');
    const [projection] = await tx`select app_private.f13_project_entitlement(
      ${f.wsA.id},${purchase.sid},${dates!.start_on}::date+1) as value`;
    expect(projection!.value).toMatchObject({
      status: 'active',
      effective_end_exclusive: dates!.end_on,
    });
  });
});

it('F13 counts successive nonoverlapping freezes in the growing coverage window', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  await probe(async (tx) => {
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id, activation_source)
      values(${f.wsA.id},${purchase.sid},clock_timestamp()-interval '100 days',${randomUUID()}, 'po_override')`;
    const [dates] = await tx`select
      (((clock_timestamp()-interval '100 days') at time zone 'Africa/Cairo')::date+61)::text as base_end`;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    const firstId = randomUUID();
    const secondId = randomUUID();
    await tx`insert into public.subscription_freezes(id,workspace_id,subscription_id,applied_on,duration_days,applied_by,recorded_at)
      values(${firstId},${f.wsA.id},${purchase.sid},${dates!.base_end}::date-3,5,${f.trainerA.userId},clock_timestamp())`;
    await tx`insert into public.subscription_freezes(id,workspace_id,subscription_id,applied_on,duration_days,applied_by,recorded_at)
      values(${secondId},${f.wsA.id},${purchase.sid},${dates!.base_end}::date+2,3,${f.trainerA.userId},clock_timestamp())`;
    const [projection] = await tx`select app_private.f13_project_entitlement(
      ${f.wsA.id},${purchase.sid},(clock_timestamp() at time zone 'Africa/Cairo')::date) as value`;
    const [expected] =
      await tx`select (${dates!.base_end}::date+8)::text as end_on`;
    expect(projection!.value).toMatchObject({
      effective_end_exclusive: expected!.end_on,
    });
  });
});

it('T042 freeze reflows an unstarted renewal from the effective upgraded term', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const originalOffer = await packageOfferId(purchase.t.link);
  const shortHigher = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1600',
    duration_days: 30,
  });
  await probe(async (tx) => {
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id, activation_source)
      values(${f.wsA.id},${purchase.sid},clock_timestamp()-interval '10 days',${randomUUID()}, 'po_override')`;
    await fullyPayInitial(tx, f, purchase);
    const upgraded = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: shortHigher,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(upgraded.status).toBe('ok');
    const upgradedEnd = (upgraded.receipt as Record<string, unknown>)
      .service_end_exclusive as string;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    let renewed: Record<string, unknown>;
    try {
      const [row] = await tx`select public.record_renewal(${tx.json({
        workspace_id: f.wsA.id,
        client_id: purchase.t.id,
        predecessor_subscription_id: purchase.sid,
        package_offer_id: originalOffer,
        request_key: randomUUID(),
        expected_revision: 1,
        renewal_confirmed: true,
        installments: null,
      } as JSONValue)}) as result`;
      renewed = row!.result as Record<string, unknown>;
    } finally {
      await tx`reset role`;
    }
    expect(renewed!.status).toBe('ok');
    const renewalId = (renewed!.receipt as Record<string, unknown>)
      .renewal_id as string;
    const applied = await freeze(tx, f.trainerA.userId, {
      action: 'apply',
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      request_key: randomUUID(),
      expected_revision: 0,
      duration_days: 3,
    });
    expect(applied.status).toBe('applied');
    const [reflowed] = await tx`select service_start_date::text as start_on
      from public.subscription_renewal_date_revisions
      where subscription_id=${purchase.sid} and renewal_id=${renewalId}
      order by revision desc limit 1`;
    const [expected] =
      await tx`select (${upgradedEnd}::date+3)::text as start_on`;
    expect(reflowed!.start_on).toBe(expected!.start_on);
  });
});

it('T049 recomputes the upgraded projection after removing a counted freeze', async () => {
  const f = await clientContext();
  const target = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1600',
    duration_days: 90,
  });
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    const purchase = { t: { id: ids.client }, sid: ids.subscription };
    const activation = new Date(Date.now() - 10 * 86400000);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id, activation_source)
      values(${f.wsA.id},${purchase.sid},${activation},${randomUUID()}, 'po_override')`;
    const freezeId = randomUUID();
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    const [freezeDates] = await tx`select
      (((${activation} at time zone 'Africa/Cairo')::date+2)::text) as apply_on,
      (((${activation} at time zone 'Africa/Cairo')::date+5)::text) as stop_on`;
    await tx`insert into public.subscription_freezes(
      id,workspace_id,subscription_id,applied_on,duration_days,applied_by,recorded_at)
      values(${freezeId},${f.wsA.id},${purchase.sid},
        ${freezeDates!.apply_on}::date,10,${f.trainerA.userId},
        clock_timestamp())`;
    await tx`insert into public.subscription_freeze_events(
      workspace_id,subscription_id,freeze_id,kind,effective_on,actor_user_id,recorded_at)
      values(${f.wsA.id},${purchase.sid},${freezeId},'stop',${freezeDates!.stop_on}::date,${f.trainerA.userId},
        clock_timestamp())`;
    const result = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(result.status).toBe('ok');
    const upgradedEnd = (result.receipt as Record<string, unknown>)
      .service_end_exclusive as string;
    const [before] = await tx`select
      (app_private.f13_project_entitlement(${f.wsA.id},${purchase.sid},
        (clock_timestamp() at time zone 'Africa/Cairo')::date)->>'effective_end_exclusive') as end_on`;
    expect(before!.end_on).toBe(upgradedEnd);

    const removed = await freeze(tx, f.trainerA.userId, {
      action: 'remove',
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      freeze_id: freezeId,
      request_key: randomUUID(),
      expected_revision: 2,
    });
    expect(removed.status).toBe('removed');
    const [after] = await tx`select
      (app_private.f13_project_entitlement(${f.wsA.id},${purchase.sid},
        (clock_timestamp() at time zone 'Africa/Cairo')::date)->>'effective_end_exclusive') as end_on`;
    const [expected] =
      await tx`select (${upgradedEnd}::date-3)::text as end_on`;
    expect(after!.end_on).toBe(expected!.end_on);
  });
});

it('T049 subtracts only unconsumed freeze coverage and reflows a later renewal', async () => {
  const f = await clientContext();
  const baseOffer = await packageOfferId(f.link);
  const target = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1600',
    duration_days: 1,
  });
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    const purchase = { t: { id: ids.client }, sid: ids.subscription };
    const activation = new Date(Date.now() - 81 * 86400000);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id, activation_source)
      values(${f.wsA.id},${purchase.sid},${activation},${randomUUID()}, 'po_override')`;
    const [dates] = await tx`select
      (((${activation} at time zone 'Africa/Cairo')::date+61)::text) as base_end,
      ((clock_timestamp() at time zone 'Africa/Cairo')::date-1)::text as stop_on`;
    const freezeId = randomUUID();
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    await tx`insert into public.subscription_freezes(
      id,workspace_id,subscription_id,applied_on,duration_days,applied_by,recorded_at)
      values(${freezeId},${f.wsA.id},${purchase.sid},${dates!.base_end}::date-3,30,${f.trainerA.userId},clock_timestamp())`;
    await tx`insert into public.subscription_freeze_events(
      workspace_id,subscription_id,freeze_id,kind,effective_on,actor_user_id,recorded_at)
      values(${f.wsA.id},${purchase.sid},${freezeId},'stop',${dates!.stop_on}::date,${f.trainerA.userId},clock_timestamp())`;
    const upgraded = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(upgraded.status).toBe('ok');

    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    let renewed: Record<string, unknown>;
    try {
      const [row] = await tx`select public.record_renewal(${tx.json({
        workspace_id: f.wsA.id,
        client_id: purchase.t.id,
        predecessor_subscription_id: purchase.sid,
        package_offer_id: baseOffer,
        request_key: randomUUID(),
        expected_revision: 1,
        renewal_confirmed: true,
        installments: null,
      } as JSONValue)}) as result`;
      renewed = row!.result as Record<string, unknown>;
    } finally {
      await tx`reset role`;
    }
    expect(renewed!.status).toBe('ok');
    const renewalReceipt = renewed!.receipt as Record<string, unknown>;
    const renewalId = renewalReceipt.renewal_id as string;
    const [obligation] = await tx`select id,seq,amount_minor::text,currency
      from public.subscription_installments where subscription_id=${purchase.sid} and renewal_id=${renewalId}`;
    const paid = await sqlPay(tx, f.trainerA.userId, 'collect', {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      request_key: randomUUID(),
      subscription_id: purchase.sid,
      obligation_id: obligation!.id as string,
      expected_installment_seq: obligation!.seq as number,
      expected_revision: 0,
      expected_previous_event_id: null,
      expected_amount_minor: obligation!.amount_minor as string,
      currency: obligation!.currency as string,
      collected_on: '1900-01-01',
      payment_confirmed: true,
    });
    expect(paid.status).toBe('ok');
    const [beforeRemoval] = await tx`select
      (app_private.f13_project_entitlement(${f.wsA.id},${purchase.sid},
        (clock_timestamp() at time zone 'Africa/Cairo')::date)->>'effective_end_exclusive') as end_on`;

    const removed = await freeze(tx, f.trainerA.userId, {
      action: 'remove',
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      freeze_id: freezeId,
      request_key: randomUUID(),
      expected_revision: 2,
    });
    expect(removed.status).toBe('removed');
    const [after] = await tx`select
      (app_private.f13_project_entitlement(${f.wsA.id},${purchase.sid},
        (clock_timestamp() at time zone 'Africa/Cairo')::date)->>'effective_end_exclusive') as end_on`;
    const [expected] =
      await tx`select (${beforeRemoval!.end_on}::date-2)::text as end_on`;
    expect(after!.end_on).toBe(expected!.end_on);
  });
});

async function seedFreezeRemovalRenewalTimeline(
  tx: TransactionSql,
  f: Awaited<ReturnType<typeof clientContext>>,
  target: string,
  renewalRecordedDay: number,
  renewalStartDay: number,
  removalAfterRenewal = false,
) {
  const ids = await graph(tx, f);
  const purchase = { t: { id: ids.client }, sid: ids.subscription };
  await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id, activation_source)
    values(${f.wsA.id},${purchase.sid},clock_timestamp(),${randomUUID()}, 'po_override')`;
  const [dates] = await tx`select
    ((clock_timestamp() at time zone 'Africa/Cairo')::date+1)::date as day_zero`;
  const dayZero = dates!.day_zero as string;
  const upgradeId = randomUUID();
  const operationId = randomUUID();
  const freezeId = randomUUID();
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
  await tx`insert into public.subscription_freezes(
      id,workspace_id,subscription_id,applied_on,duration_days,applied_by,recorded_at)
    values(${freezeId},${f.wsA.id},${purchase.sid},${dayZero}::date+50,30,${f.trainerA.userId},statement_timestamp())`;
  await tx`insert into app_private.subscription_upgrade_operations(
      id,workspace_id,client_id,subscription_id,actor_user_id,request_key,expected_revision,
      canonical_args_hash,result_receipt,recorded_at,transaction_id)
    values(${operationId},${f.wsA.id},${purchase.t.id},${purchase.sid},${f.trainerA.userId},${randomUUID()},0,
      extensions.digest(convert_to('historical projection fixture','UTF8'),'sha256'),'{}'::jsonb,
      (select recorded_at from public.subscription_freezes where workspace_id=${f.wsA.id} and id=${freezeId}),
      pg_current_xact_id())`;
  await tx`insert into public.subscription_upgrades(
      id,workspace_id,client_id,subscription_id,operation_id,package_offer_id,package_version_id,tier_rank,
      package_price_minor,currency,commission_rate_bp,duration_days,credit_minor,additional_payment_minor,
      commission_minor,service_start_date,service_end_exclusive,expected_revision,recorded_by,recorded_at)
    select ${upgradeId},${f.wsA.id},${purchase.t.id},${purchase.sid},${operationId},o.id,v.id,o.tier_rank,
      v.price_minor,v.currency,v.commission_rate_bp,90,0,v.price_minor,0,${dayZero}::date,${dayZero}::date+120,
      0,${f.trainerA.userId},
      (select recorded_at from public.subscription_freezes where workspace_id=${f.wsA.id} and id=${freezeId})
    from public.package_offers o join public.package_versions v on v.workspace_id=o.workspace_id and v.id=o.current_version_id
    where o.workspace_id=${f.wsA.id} and o.id=${target}`;
  const recordRemoval = async () =>
    tx`insert into public.subscription_freeze_events(
      workspace_id,subscription_id,freeze_id,kind,effective_on,actor_user_id,recorded_at)
    values(${f.wsA.id},${purchase.sid},${freezeId},'remove',${dayZero}::date+80,${f.trainerA.userId},
      (((${dayZero}::date+80)::timestamp+interval '12 hours') at time zone 'Africa/Cairo'))`;
  if (!removalAfterRenewal) await recordRemoval();
  const baseOffer = await packageOfferId(f.link);
  const renewalId = randomUUID();
  await tx`insert into public.subscription_renewals(
      id,workspace_id,client_id,predecessor_subscription_id,subscription_id,package_offer_id,package_version_id,
      expected_revision,recording_date,service_start_date,service_end_exclusive,recorded_by,recorded_at)
    select ${renewalId},${f.wsA.id},${purchase.t.id},${purchase.sid},${purchase.sid},o.id,v.id,1,
      ${dayZero}::date+${renewalRecordedDay}::integer,${dayZero}::date+${renewalStartDay}::integer,
      ${dayZero}::date+${renewalStartDay}::integer+60,${f.trainerA.userId},
      ((((${dayZero}::date+${renewalRecordedDay}::integer)::timestamp+interval '12 hours') at time zone 'Africa/Cairo'))
    from public.package_offers o join public.package_versions v on v.workspace_id=o.workspace_id and v.id=o.current_version_id
    where o.workspace_id=${f.wsA.id} and o.id=${baseOffer}`;
  if (removalAfterRenewal) await recordRemoval();
  return {
    workspaceId: f.wsA.id,
    subscriptionId: purchase.sid,
    renewalId,
    dayZero,
  };
}

it('T049 preserves a renewal recorded after the removed freeze and expired term (day 120/80/130)', async () => {
  const f = await clientContext();
  const target = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1600',
    duration_days: 90,
  });
  await probe(async (tx) => {
    const timeline = await seedFreezeRemovalRenewalTimeline(
      tx,
      f,
      target,
      130,
      130,
    );
    const [renewal] =
      await tx`select recording_date::text,service_start_date::text,service_end_exclusive::text
      from public.subscription_renewals where id=${timeline.renewalId}`;
    const [recordedDates] =
      await tx`select (${timeline.dayZero}::date+130)::text as on,
      (${timeline.dayZero}::date+190)::text as until`;
    expect(renewal).toEqual({
      recording_date: recordedDates!.on,
      service_start_date: recordedDates!.on,
      service_end_exclusive: recordedDates!.until,
    });
    const [projection] = await tx`select
      (app_private.f13_project_entitlement(${timeline.workspaceId},${timeline.subscriptionId},
        ${timeline.dayZero}::date+140)->>'effective_end_exclusive') as effective_end`;
    const [expected] =
      await tx`select (${timeline.dayZero}::date+190)::text as effective_end`;
    expect(projection!.effective_end).toBe(expected!.effective_end);
  });
});

it('T049 shifts a renewal recorded before removal when its term still includes removed freeze days', async () => {
  const f = await clientContext();
  const target = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1600',
    duration_days: 90,
  });
  await probe(async (tx) => {
    const timeline = await seedFreezeRemovalRenewalTimeline(
      tx,
      f,
      target,
      79,
      120,
      true,
    );
    const [seedFacts] = await tx`
      select f.recorded_at::text as freeze_recorded_at,
        u.recorded_at::text as upgrade_recorded_at,
        f.recorded_at<=u.recorded_at as freeze_is_pre_upgrade,
        removal.recorded_at>u.recorded_at as removal_is_post_upgrade,
        f.duration_days,u.service_end_exclusive::text as upgrade_end,
        r.recorded_at as renewal_recorded_at,removal.recorded_at as removal_recorded_at
      from public.subscription_upgrades u
      join public.subscription_freezes f on f.workspace_id=u.workspace_id and f.subscription_id=u.subscription_id
      join public.subscription_freeze_events removal on removal.workspace_id=f.workspace_id
        and removal.subscription_id=f.subscription_id and removal.freeze_id=f.id and removal.kind='remove'
      join public.subscription_renewals r on r.workspace_id=u.workspace_id and r.subscription_id=u.subscription_id
      where u.workspace_id=${timeline.workspaceId} and u.subscription_id=${timeline.subscriptionId}
        and r.id=${timeline.renewalId}
    `;
    expect(seedFacts!.freeze_recorded_at).toBe(seedFacts!.upgrade_recorded_at);
    expect(seedFacts).toMatchObject({
      freeze_is_pre_upgrade: true,
      removal_is_post_upgrade: true,
      duration_days: 30,
    });
    const [renewal] =
      await tx`select recording_date::text,service_start_date::text,service_end_exclusive::text
      from public.subscription_renewals where id=${timeline.renewalId}`;
    const [recordedDates] =
      await tx`select (${timeline.dayZero}::date+79)::text as on,
      (${timeline.dayZero}::date+120)::text as starts_on,(${timeline.dayZero}::date+180)::text as until`;
    expect(renewal).toEqual({
      recording_date: recordedDates!.on,
      service_start_date: recordedDates!.starts_on,
      service_end_exclusive: recordedDates!.until,
    });
    const [projection] = await tx`select
      (app_private.f13_project_entitlement(${timeline.workspaceId},${timeline.subscriptionId},
        ${timeline.dayZero}::date+140)->>'effective_end_exclusive') as effective_end`;
    const [expected] =
      await tx`select (${timeline.dayZero}::date+150)::text as effective_end`;
    expect(projection!.effective_end).toBe(expected!.effective_end);
    const [revised] = await tx`
      select service_start_date::text as service_start_date
      from public.subscription_renewal_date_revisions
      where workspace_id=${timeline.workspaceId}
        and subscription_id=${timeline.subscriptionId}
      order by revision desc limit 1
    `;
    const [revisedExpected] =
      await tx`select (${timeline.dayZero}::date+90)::text as service_start_date`;
    expect(revised!.service_start_date).toBe(
      revisedExpected!.service_start_date,
    );
  });
});

it('T049 kills reflow based on the saved upgraded end after carried freeze removal', async () => {
  const f = await clientContext();
  const target = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1600',
    duration_days: 90,
  });
  await withCrashSafeFunctionMutant(
    'app_private.f13_reflow_unstarted_renewal()',
    (definition) =>
      definition.replace(
        'term_end:=term_end-removed_days;',
        'term_end:=upgrade_row.service_end_exclusive;',
      ),
    async () =>
      await expectInvariantFailure(async () => {
        await probe(async (tx) => {
          const timeline = await seedFreezeRemovalRenewalTimeline(
            tx,
            f,
            target,
            79,
            120,
            true,
          );
          const [revised] = await tx`
            select service_start_date::text as service_start_date
            from public.subscription_renewal_date_revisions
            where workspace_id=${timeline.workspaceId}
              and subscription_id=${timeline.subscriptionId}
            order by revision desc limit 1
          `;
          const [expected] = await tx`
            select (${timeline.dayZero}::date+90)::text as service_start_date
          `;
          expect(revised!.service_start_date).toBe(
            expected!.service_start_date,
          );
        });
      }),
  );
});

async function addLaterRenewalFreezeRemoval(
  tx: TransactionSql,
  f: Awaited<ReturnType<typeof clientContext>>,
  timeline: Awaited<ReturnType<typeof seedFreezeRemovalRenewalTimeline>>,
) {
  const [originalRemoval] = await tx`
      select id from public.subscription_freeze_events
      where workspace_id=${timeline.workspaceId} and subscription_id=${timeline.subscriptionId}
        and kind='remove' and freeze_id=(
          select id from public.subscription_freezes where workspace_id=${timeline.workspaceId}
            and subscription_id=${timeline.subscriptionId} order by recorded_at limit 1
        )
    `;
  await tx`insert into public.subscription_renewal_date_revisions(
        workspace_id,subscription_id,renewal_id,revision,service_start_date,service_end_exclusive,
        cause_table,cause_id,recorded_by,recorded_at)
      values(${timeline.workspaceId},${timeline.subscriptionId},${timeline.renewalId},1,
        ${timeline.dayZero}::date+90,${timeline.dayZero}::date+150,
        'subscription_freeze_events',${originalRemoval!.id},${f.trainerA.userId},
        (((${timeline.dayZero}::date+80)::timestamp+interval '13 hours') at time zone 'Africa/Cairo'))`;
  const [seededRevision] = await tx`
      select service_start_date::text,service_end_exclusive::text
      from public.subscription_renewal_date_revisions
      where workspace_id=${timeline.workspaceId} and subscription_id=${timeline.subscriptionId}
        and renewal_id=${timeline.renewalId} and revision=1
    `;
  expect(seededRevision).toEqual({
    service_start_date: (
      await tx`select (${timeline.dayZero}::date+90)::text as value`
    )[0]!.value,
    service_end_exclusive: (
      await tx`select (${timeline.dayZero}::date+150)::text as value`
    )[0]!.value,
  });
  const [projectionDefinition] = await tx`
      select position('for carried_freeze' in pg_catalog.pg_get_functiondef(
        'app_private.f13_project_entitlement(uuid,uuid,date)'::regprocedure
      )) > 0 as per_freeze_removal_logic
    `;
  expect(projectionDefinition!.per_freeze_removal_logic).toBe(true);
  const [beforeLaterRemoval] = await tx`select
      (app_private.f13_project_entitlement(${timeline.workspaceId},${timeline.subscriptionId},
        ${timeline.dayZero}::date+140)->>'effective_end_exclusive') as effective_end`;
  const [beforeExpected] =
    await tx`select (${timeline.dayZero}::date+150)::text as effective_end`;
  expect(beforeLaterRemoval!.effective_end).toBe(beforeExpected!.effective_end);
  const laterFreeze = randomUUID();
  await tx`insert into public.subscription_freezes(
        id,workspace_id,subscription_id,applied_on,duration_days,applied_by,recorded_at)
      values(${laterFreeze},${timeline.workspaceId},${timeline.subscriptionId},
        ${timeline.dayZero}::date+92,10,${f.trainerA.userId},clock_timestamp())`;
  await tx`insert into public.subscription_freeze_events(
        workspace_id,subscription_id,freeze_id,kind,effective_on,actor_user_id,recorded_at)
      values(${timeline.workspaceId},${timeline.subscriptionId},${laterFreeze},'remove',
        ${timeline.dayZero}::date+95,${f.trainerA.userId},
        (((${timeline.dayZero}::date+95)::timestamp+interval '13 hours') at time zone 'Africa/Cairo'))`;
}

async function expectLaterRemovalProjection(
  tx: TransactionSql,
  timeline: Awaited<ReturnType<typeof seedFreezeRemovalRenewalTimeline>>,
) {
  const [projection] = await tx`select
      (app_private.f13_project_entitlement(${timeline.workspaceId},${timeline.subscriptionId},
        ${timeline.dayZero}::date+140)->>'effective_end_exclusive') as effective_end`;
  const [expected] =
    await tx`select (${timeline.dayZero}::date+150)::text as effective_end`;
  expect(projection!.effective_end).toBe(expected!.effective_end);
}

it('T051 keeps each carried-freeze removal fixed when a later renewal freeze is removed', async () => {
  const f = await clientContext();
  const target = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1600',
    duration_days: 90,
  });
  await probe(async (tx) => {
    const timeline = await seedFreezeRemovalRenewalTimeline(
      tx,
      f,
      target,
      79,
      120,
    );
    await addLaterRenewalFreezeRemoval(tx, f, timeline);
    await expectLaterRemovalProjection(tx, timeline);
  });
});

it('T051 kills a later-removal floor that leaks into the prior renewal term', async () => {
  const f = await clientContext();
  const target = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1600',
    duration_days: 90,
  });
  await withCrashSafeFunctionMutant(
    'app_private.f13_project_entitlement(uuid,uuid,date)',
    (definition) =>
      definition.replace(
        'and (f.applied_on>=term_start and f.applied_on<term_end or not exists(',
        'and (true or not exists(',
      ),
    async () =>
      await expectInvariantFailure(async () => {
        await probe(async (tx) => {
          const timeline = await seedFreezeRemovalRenewalTimeline(
            tx,
            f,
            target,
            79,
            120,
          );
          await addLaterRenewalFreezeRemoval(tx, f, timeline);
          await expectLaterRemovalProjection(tx, timeline);
        });
      }),
  );
});

it('T049 preserves a newer manual date when a freeze is removed after upgrade', async () => {
  const f = await clientContext();
  const target = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1600',
    duration_days: 90,
  });
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    const purchase = { t: { id: ids.client }, sid: ids.subscription };
    const activation = new Date(Date.now() - 62 * 86400000);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id, activation_source)
      values(${f.wsA.id},${purchase.sid},${activation},${randomUUID()}, 'po_override')`;
    const [dates] = await tx`select
      (((${activation} at time zone 'Africa/Cairo')::date+61)::text) as base_end,
      ((clock_timestamp() at time zone 'Africa/Cairo')::date)::text as today,
      ((clock_timestamp() at time zone 'Africa/Cairo')::date+220)::text as manual_end`;
    const freezeId = randomUUID();
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    await tx`insert into public.subscription_freezes(
      id,workspace_id,subscription_id,applied_on,duration_days,applied_by,recorded_at)
      values(${freezeId},${f.wsA.id},${purchase.sid},${dates!.base_end}::date-3,10,${f.trainerA.userId},clock_timestamp())`;
    await tx`insert into public.subscription_freeze_events(
      workspace_id,subscription_id,freeze_id,kind,effective_on,actor_user_id,recorded_at)
      values(${f.wsA.id},${purchase.sid},${freezeId},'stop',${dates!.base_end}::date-1,${f.trainerA.userId},clock_timestamp())`;
    const upgraded = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 0,
      upgrade_confirmed: true,
    });
    expect(upgraded.status).toBe('ok');
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    let adjusted: Record<string, unknown>;
    try {
      const [row] =
        await tx`select public.record_subscription_date_adjustment(${tx.json({
          workspace_id: f.wsA.id,
          client_id: purchase.t.id,
          subscription_id: purchase.sid,
          new_service_start_date: dates!.today,
          new_service_end_exclusive: dates!.manual_end,
          request_key: randomUUID(),
        } as JSONValue)}) as result`;
      adjusted = row!.result as Record<string, unknown>;
    } finally {
      await tx`reset role`;
    }
    expect(adjusted.status).toBe('ok');
    const removed = await freeze(tx, f.trainerA.userId, {
      action: 'remove',
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      freeze_id: freezeId,
      request_key: randomUUID(),
      expected_revision: 2,
    });
    expect(removed.status).toBe('removed');
    const [after] = await tx`select
      (app_private.f13_project_entitlement(${f.wsA.id},${purchase.sid},
        (clock_timestamp() at time zone 'Africa/Cairo')::date)->>'effective_end_exclusive') as end_on`;
    expect(after!.end_on).toBe(dates!.manual_end);
  });
});

it('T045 keeps the upgrade refund source guard and SECURITY DEFINER boundary intact', async () => {
  const [security] = await db`
    select p.prosecdef as security_definer,p.proconfig as config,
      has_function_privilege('authenticated',p.oid,'execute') as authenticated,
      has_function_privilege('anon',p.oid,'execute') as anon,
      has_function_privilege('public',p.oid,'execute') as public,
      has_function_privilege('service_role',p.oid,'execute') as service_role
    from pg_proc p where p.oid='public.record_refund(jsonb)'::regprocedure`;
  expect(security).toMatchObject({
    security_definer: true,
    authenticated: true,
    anon: false,
    public: false,
    service_role: false,
  });
  expect(security!.config).toContain('search_path=""');
  const [validator] = await db`
    select p.prosecdef as security_definer,p.proconfig as config,r.rolname as owner,
      has_function_privilege('authenticated',p.oid,'execute') as authenticated,
      has_function_privilege('anon',p.oid,'execute') as anon,
      has_function_privilege('public',p.oid,'execute') as public,
      has_function_privilege('service_role',p.oid,'execute') as service_role
    from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid='app_private.f13_validate_refund_ledger(uuid,uuid)'::regprocedure`;
  expect(validator).toMatchObject({
    security_definer: true,
    owner: 'postgres',
    authenticated: false,
    anon: false,
    public: false,
    service_role: false,
  });
  expect(validator!.config).toContain('search_path=""');
  const [tablePolicy] = await db`
    select c.relforcerowsecurity as force_rls,
      has_table_privilege('authenticated','public.refund_allocation_events','SELECT') as direct_read
    from pg_class c where c.oid='public.refund_allocation_events'::regclass`;
  expect(tablePolicy).toEqual({ force_rls: true, direct_read: false });
  const [sourceGuard] = await db`
    select count(*)::int as count from pg_constraint
    where conrelid='public.refund_allocation_events'::regclass
      and conname in ('f13_refund_allocation_source_xor','f13_refund_allocation_upgrade_source')`;
  expect(sourceGuard).toEqual({ count: 2 });
});

it('F13 forward replacements keep SECURITY DEFINER, search_path, and execute grants pinned', async () => {
  const routines = await db`
    select n.nspname as schema_name,p.proname,p.prosecdef as security_definer,
      p.proconfig as config,r.rolname as owner,
      has_function_privilege('authenticated',p.oid,'execute') as authenticated,
      has_function_privilege('anon',p.oid,'execute') as anon,
      has_function_privilege('public',p.oid,'execute') as public,
      has_function_privilege('service_role',p.oid,'execute') as service_role
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      join pg_roles r on r.oid=p.proowner
    where p.oid in (
      'public.record_renewal(jsonb)'::regprocedure,
      'app_private.f13_project_entitlement(uuid,uuid,date)'::regprocedure,
      'app_private.f13_reflow_unstarted_renewal()'::regprocedure,
      'public.record_subscription_upgrade(jsonb)'::regprocedure,
      'public.subscription_commission(uuid,uuid)'::regprocedure
    )`;
  expect(routines).toHaveLength(5);
  for (const routine of routines) {
    expect(routine.security_definer).toBe(true);
    expect(routine.owner).toBe('postgres');
    expect(routine.config).toContain('search_path=""');
    expect(routine.anon).toBe(false);
    expect(routine.public).toBe(false);
  }
  const privileges = new Map(
    routines.map((routine) => [
      `${routine.schema_name}.${routine.proname}`,
      {
        authenticated: routine.authenticated,
        service_role: routine.service_role,
      },
    ]),
  );
  expect(privileges.get('public.record_renewal')).toEqual({
    authenticated: true,
    service_role: false,
  });
  expect(privileges.get('app_private.f13_project_entitlement')).toEqual({
    authenticated: false,
    service_role: true,
  });
  expect(privileges.get('app_private.f13_reflow_unstarted_renewal')).toEqual({
    authenticated: false,
    service_role: false,
  });
  expect(privileges.get('public.record_subscription_upgrade')).toEqual({
    authenticated: true,
    service_role: false,
  });
  expect(privileges.get('public.subscription_commission')).toEqual({
    authenticated: true,
    service_role: false,
  });
});

it('T045 refunds the original package plus upgrade charge and leaves a paid renewal untouched', async () => {
  const { f, purchase } = await egp750Purchase();
  const renewalOffer = await targetOffer(f, {
    tier_rank: 1,
    price_minor: '750',
    currency: 'EGP',
    duration_days: 90,
    commission_rate_bp: 5000,
  });
  const target = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1400',
    currency: 'EGP',
    duration_days: 90,
    commission_rate_bp: 2000,
  });
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    await fullyPayAmounts(tx, f, purchase, '250');

    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    let renewal: Record<string, unknown>;
    try {
      const [row] = await tx`select public.record_renewal(${tx.json({
        workspace_id: f.wsA.id,
        client_id: purchase.t.id,
        predecessor_subscription_id: purchase.sid,
        package_offer_id: renewalOffer,
        request_key: randomUUID(),
        expected_revision: 0,
        renewal_confirmed: true,
        installments: null,
      } as JSONValue)}) as result`;
      renewal = row!.result as Record<string, unknown>;
    } finally {
      await tx`reset role`;
    }
    expect(renewal!.status).toBe('ok');
    const renewalId = (renewal!.receipt as Record<string, unknown>)
      .renewal_id as string;
    const [renewalObligation] = await tx`
      select id,seq,amount_minor::text,currency from public.subscription_installments
      where workspace_id=${f.wsA.id} and subscription_id=${purchase.sid}
        and renewal_id=${renewalId} order by seq limit 1`;
    const collection = await sqlPay(tx, f.trainerA.userId, 'collect', {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      request_key: randomUUID(),
      subscription_id: purchase.sid,
      obligation_id: renewalObligation!.id,
      expected_installment_seq: renewalObligation!.seq,
      expected_revision: 0,
      expected_previous_event_id: null,
      expected_amount_minor: renewalObligation!.amount_minor,
      currency: renewalObligation!.currency,
      collected_on: '1900-01-01',
      payment_confirmed: true,
    });
    expect(collection.status).toBe('ok');

    const upgraded = await upgrade(tx, f.trainerA.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      subscription_id: purchase.sid,
      package_offer_id: target,
      request_key: randomUUID(),
      expected_revision: 1,
      upgrade_confirmed: true,
    });
    expect(upgraded).toMatchObject({
      status: 'ok',
      receipt: { additional_payment_minor: '650' },
    });
    expect(Object.hasOwn(upgraded.receipt!, 'commission_rate_bp')).toBe(false);
    expect(Object.hasOwn(upgraded.receipt!, 'commission_minor')).toBe(false);
    const [upgradeFact] = await tx`
      select id from public.subscription_upgrades
      where workspace_id=${f.wsA.id} and subscription_id=${purchase.sid}`;
    const overPackage = await refund(tx, f.po.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      purchase_id: purchase.sid,
      request_key: randomUUID(),
      amount_minor: '1401',
      external_confirmation: true,
    });
    expect(overPackage).toMatchObject({ status: 'invalid_input' });
    const overIncludingRenewal = await refund(tx, f.po.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      purchase_id: purchase.sid,
      request_key: randomUUID(),
      amount_minor: '1500',
      external_confirmation: true,
    });
    expect(overIncludingRenewal).toMatchObject({ status: 'invalid_input' });
    const [noRejectedRefundWrites] = await tx`
      select count(*)::int as refunds from public.refund_operations
      where workspace_id=${f.wsA.id} and subscription_id=${purchase.sid}`;
    expect(noRejectedRefundWrites).toEqual({ refunds: 0 });
    const refunded = await refund(tx, f.po.userId, {
      workspace_id: f.wsA.id,
      client_id: purchase.t.id,
      purchase_id: purchase.sid,
      request_key: randomUUID(),
      amount_minor: '1400',
      external_confirmation: true,
    });
    expect(refunded).toMatchObject({ status: 'ok' });

    const [allocation] = await tx`
      select sum(-amount_minor)::text as principal,
        sum(-commission_minor)::text as commission,
        count(*)::int as allocations,
        count(*) filter(where source_upgrade_id=${upgradeFact!.id})::int as upgrade_allocations,
        count(*) filter(where obligation_id=${renewalObligation!.id})::int as renewal_allocations
      from public.refund_allocation_events where subscription_id=${purchase.sid}`;
    expect(allocation).toEqual({
      principal: '1400',
      commission: '140',
      allocations: 4,
      upgrade_allocations: 1,
      renewal_allocations: 0,
    });
    const [renewalBalance] = await tx`
      select count(*)::int as collections,
        (select count(*)::int from public.refund_allocation_events
          where subscription_id=${purchase.sid} and obligation_id=${renewalObligation!.id}) as refunds
      from public.payment_events where subscription_id=${purchase.sid}
        and obligation_id=${renewalObligation!.id} and kind='collection'`;
    expect(renewalBalance).toEqual({ collections: 1, refunds: 0 });
    const [renewalCollectionEvent] =
      await tx`select id from public.payment_events
      where subscription_id=${purchase.sid} and obligation_id=${renewalObligation!.id} and kind='collection'`;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    let commissionHistory: Record<string, unknown>;
    try {
      const [row] =
        await tx`select public.subscription_commission(${f.wsA.id},${purchase.sid}) as result`;
      commissionHistory = row!.result as Record<string, unknown>;
    } finally {
      await tx`reset role`;
    }
    expect(commissionHistory!.status).toBe('ok');
    const commissionEvents = commissionHistory!.events as Record<
      string,
      unknown
    >[];
    const upgradeCommission = commissionEvents.find(
      (event) => event.kind === 'upgrade_purchase',
    );
    expect(upgradeCommission).toMatchObject({
      event_id: upgradeFact!.id,
      rate_bp: 1000,
      commission_minor: '65',
      source_upgrade_id: upgradeFact!.id,
    });
    const upgradeRefundCommission = commissionEvents.find(
      (event) =>
        event.kind === 'refund_allocation' &&
        event.source_upgrade_id === upgradeFact!.id,
    );
    expect(upgradeRefundCommission).toMatchObject({
      rate_bp: 1000,
      commission_minor: '-65',
    });
    const renewalCommission = commissionEvents.find(
      (event) => event.event_id === renewalCollectionEvent!.id,
    );
    expect(renewalCommission).toMatchObject({ rate_bp: 5000 });
    const originalCommission = commissionEvents.find(
      (event) => event.event_id === purchase.approved.receipt!.event_id,
    );
    expect(originalCommission).toMatchObject({ rate_bp: 1000 });
    expect(Object.hasOwn(originalCommission!, 'source_upgrade_id')).toBe(false);
  });
});

it('T045 rejects a refund confirmation waiting on an upgrade committed after its revision snapshot', async () => {
  const { f, purchase } = await egp750Purchase();
  const target = await targetOffer(f, {
    tier_rank: 2,
    price_minor: '1400',
    currency: 'EGP',
    duration_days: 90,
    commission_rate_bp: 2000,
  });
  const label = `f13-t045-upgrade-first-${randomUUID()}`;
  const blocker = sql();
  const pending = worker(label);
  let flight: Promise<Record<string, unknown>> | undefined;

  try {
    await blocker.begin(async (tx) => {
      await activate(tx, f, purchase);
      await fullyPayAmounts(tx, f, purchase, '250');
      const [beforeUpgrade] = await tx`
        select count(*)::int as revision from public.payment_events
        where workspace_id=${f.wsA.id} and subscription_id=${purchase.sid}`;
      await tx`select id from public.clients where workspace_id=${f.wsA.id} and id=${purchase.t.id} for update`;

      flight = pending.begin((workerTx) =>
        refund(workerTx, f.po.userId, {
          workspace_id: f.wsA.id,
          client_id: purchase.t.id,
          purchase_id: purchase.sid,
          request_key: randomUUID(),
          amount_minor: '1400',
          external_confirmation: true,
          expected_revision: beforeUpgrade!.revision,
        }),
      ) as unknown as Promise<Record<string, unknown>>;
      void flight.catch(() => undefined);
      expect(await waitForLock(db, label)).toBe(true);

      const upgraded = await upgrade(tx, f.trainerA.userId, {
        workspace_id: f.wsA.id,
        client_id: purchase.t.id,
        subscription_id: purchase.sid,
        package_offer_id: target,
        request_key: randomUUID(),
        expected_revision: 0,
        upgrade_confirmed: true,
      });
      expect(upgraded).toMatchObject({
        status: 'ok',
        receipt: { additional_payment_minor: '650' },
      });
    });

    expect(await flight).toEqual({ status: 'stale_state' });
    const [facts] = await db`
      select
        (select count(*)::int from public.subscription_upgrades where subscription_id=${purchase.sid}) as upgrades,
        (select count(*)::int from public.refund_operations where subscription_id=${purchase.sid}) as refunds,
        (select count(*)::int from public.refund_allocation_events where subscription_id=${purchase.sid}) as allocations`;
    expect(facts).toEqual({ upgrades: 1, refunds: 0, allocations: 0 });
  } finally {
    if (flight) await flight.catch(() => undefined);
    await pending.end();
    await blocker.end();
  }
});
