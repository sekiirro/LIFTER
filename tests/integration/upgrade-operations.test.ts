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
import {
  call,
  clientContext,
  probe,
  registered,
  request,
} from './registration-approval-operations-fixture';
import { checked, publish } from './registration-links-fixture';

const db = sql();
afterAll(() => db.end());

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

it('T042 prices the FR-038 EGP 750 to EGP 1400 upgrade as EGP 650 revenue', async () => {
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
        commission_rate_bp: 2000,
        commission_minor: '130',
      },
    });
    const [ledger] = await tx`select count(*)::int as count,
      sum(additional_payment_minor)::text as new_revenue,
      sum(credit_minor)::text as credited from public.subscription_upgrades
      where subscription_id=${purchase.sid}`;
    expect(ledger).toEqual({ count: 1, new_revenue: '650', credited: '750' });
  });
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

it('T042 records only the additional payment at the selected version commission rate and keeps one subscription/activation', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const target = await targetOffer(f, {});
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
        subscription_id: purchase.sid,
        package_price_minor: '1600',
        credit_minor: '1200',
        additional_payment_minor: '400',
        currency: 'XTS',
        commission_rate_bp: 2500,
      },
    });
    const [counts] = await tx`
      select
        (select count(*)::int from public.subscriptions where workspace_id=${f.wsA.id} and client_id=${purchase.t.id}) as subscriptions,
        (select count(*)::int from public.subscription_activations a where a.workspace_id=${f.wsA.id} and a.subscription_id=${purchase.sid}) as activations,
        (select count(*)::int from public.subscription_upgrades u where u.workspace_id=${f.wsA.id} and u.subscription_id=${purchase.sid}) as upgrades`;
    expect(counts).toEqual({ subscriptions: 1, activations: 1, upgrades: 1 });
    const [payment] = await tx`
      select package_price_minor::text,credit_minor::text,additional_payment_minor::text,
        commission_rate_bp,commission_minor::text
      from public.subscription_upgrades where workspace_id=${f.wsA.id} and subscription_id=${purchase.sid}`;
    expect(payment).toEqual({
      package_price_minor: '1600',
      credit_minor: '1200',
      additional_payment_minor: '400',
      commission_rate_bp: 2500,
      commission_minor: '100',
    });
  });
});

it('T042 allows a qualifying upgrade before activation without consuming duration', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
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
        expected_revision: 0,
        renewal_confirmed: true,
        installments: null,
      } as JSONValue)}) as result`;
      renewed = row!.result as Record<string, unknown>;
    } finally {
      await tx`reset role`;
    }
    expect(renewed!.status).toBe('ok');
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
      },
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
        expected_revision: 0,
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

it('T042 snapshots selected-version commission and permits an equal-price longer upgrade without revenue', async () => {
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
        commission_rate_bp: 5000,
        commission_minor: '0',
      },
    });
    const [snapshot] =
      await tx`select commission_rate_bp,additional_payment_minor::text,commission_minor::text
      from public.subscription_upgrades where subscription_id=${purchase.sid}`;
    expect(snapshot).toEqual({
      commission_rate_bp: 5000,
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
    expect(await upgrade(tx, f.trainerA.userId, request)).toEqual(first);
    const [before] = await tx`select
      (select count(*)::int from public.subscription_upgrades where subscription_id=${purchase.sid}) as upgrades,
      (select count(*)::int from app_private.subscription_upgrade_operations where subscription_id=${purchase.sid}) as operations,
      (select count(*)::int from public.audit_events where target_table='subscription_upgrades' and target_id in
        (select id from public.subscription_upgrades where subscription_id=${purchase.sid})) as audits`;
    expect(before).toEqual({ upgrades: 1, operations: 1, audits: 1 });
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
      (select count(*)::int from public.audit_events where target_table='subscription_upgrades') as audits`;
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

it('T045 refunds the original package plus upgrade charge and leaves a paid renewal untouched', async () => {
  const { f, purchase } = await egp750Purchase();
  const originalOffer = await packageOfferId(purchase.t.link);
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
      receipt: { additional_payment_minor: '650', commission_minor: '130' },
    });
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
      commission: '205',
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
  });
});
