import { randomUUID } from 'node:crypto';
import type { JSONValue, TransactionSql } from 'postgres';
import {
  activate,
  bought,
  sql,
  sqlPay,
} from './registration-approval-payment-fixture';
import {
  clientContext,
  probe,
  registered,
  type Context,
} from './registration-approval-operations-fixture';

type Purchase = Awaited<ReturnType<typeof bought>>;
type Scenario = {
  clientId: string;
  subscriptionId: string;
  renewalId?: string;
  occurrenceKey?: string;
  serviceStart?: string;
};

async function packageOfferId(f: Context, purchase: Purchase) {
  const db = sql();
  try {
    const [row] = await db`
      select v.offer_id from public.registration_links l
      join public.package_versions v on v.workspace_id=l.workspace_id and v.id=l.package_version_id
      where l.workspace_id=${f.wsA.id} and l.id=${purchase.t.link}
    `;
    if (!row) throw new Error('F13 policy fixture package offer missing');
    return row.offer_id as string;
  } finally {
    await db.end();
  }
}

async function renewal(
  tx: TransactionSql,
  f: Context,
  purchase: Purchase,
  offerId: string,
  activationDate?: string,
) {
  if (activationDate) {
    await tx`insert into public.subscription_activations(
      workspace_id,subscription_id,activated_at,delivery_event_id
    ) values(
      ${f.wsA.id},${purchase.sid},
      (${activationDate}::date::timestamp at time zone 'Africa/Cairo'),${randomUUID()}
    )`;
  } else {
    await activate(tx, f, purchase);
  }
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [result] = await tx`
      select public.record_renewal(${tx.json({
        workspace_id: f.wsA.id,
        client_id: purchase.t.id,
        predecessor_subscription_id: purchase.sid,
        package_offer_id: offerId,
        request_key: randomUUID(),
        expected_revision: 0,
        renewal_confirmed: true,
        installments: [{ amount_minor: '1200', due_offset_days: 0 }],
      } as JSONValue)}) as value
    `;
    const value = result!.value as {
      status: string;
      receipt?: Record<string, unknown>;
    };
    if (value.status !== 'ok' || !value.receipt?.subscription_id)
      throw new Error(`F13 renewal fixture failed: ${value.status}`);
    return value.receipt.subscription_id as string;
  } finally {
    await tx`reset role`;
  }
}

async function freeze(
  tx: TransactionSql,
  f: Context,
  clientId: string,
  subscriptionId: string,
  action: 'apply' | 'remove',
  expectedRevision: number,
  freezeId?: string,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select public.subscription_freeze_operation(${tx.json({
        action,
        workspace_id: f.wsA.id,
        client_id: clientId,
        subscription_id: subscriptionId,
        request_key: randomUUID(),
        expected_revision: expectedRevision,
        ...(action === 'apply'
          ? { duration_days: 5 }
          : { freeze_id: freezeId }),
      } as JSONValue)}) as value
    `;
    const result = row!.value as { status: string; freeze_id?: string };
    if (result.status !== (action === 'apply' ? 'applied' : 'removed'))
      throw new Error(`F13 freeze fixture failed: ${result.status}`);
    return result.freeze_id ?? freezeId!;
  } finally {
    await tx`reset role`;
  }
}

/**
 * Builds real F13 source facts inside a rolled-back integration probe. The
 * callback can inspect RPC results, F13 projections, payments, and reflow rows.
 */
export async function withFormsPolicyF13Fixtures(
  body: (
    tx: TransactionSql,
    f: Context,
    scenarios: {
      earlyPaidRenewal: Scenario;
      missedRenewal: Scenario;
      reflowedRenewal: Scenario;
      frozenThenUnfrozen: Scenario;
      expiredSubscription: Scenario;
      recurringActive: Scenario;
      recurringFreeze: Scenario;
      futureSubscription: Scenario;
      pendingCandidate?: Awaited<ReturnType<typeof registered>>;
    },
  ) => Promise<void>,
  options: { pendingCandidate?: boolean } = {},
) {
  const f = await clientContext();
  const purchases = await Promise.all([
    bought(f),
    bought(f),
    bought(f),
    bought(f),
    bought(f),
    bought(f),
    bought(f),
    bought(f),
  ]);
  const offers = await Promise.all(
    purchases.map((purchase) => packageOfferId(f, purchase)),
  );
  const pendingCandidate = options.pendingCandidate
    ? await registered(f)
    : undefined;

  await probe(async (tx) => {
    const [calendar] = await tx`
      select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today
    `;
    const earlyRenewalId = await renewal(tx, f, purchases[0]!, offers[0]!);
    const [early] = await tx`
      select r.service_start_date::text,
        app_private.f13_project_entitlement(${f.wsA.id},r.subscription_id,${calendar!.today}::date)->>'status' as status,
        i.id as installment_id,i.seq,i.amount_minor::text,s.currency
      from public.subscription_renewals r
      join public.subscriptions s on s.workspace_id=r.workspace_id and s.id=r.subscription_id
      join public.subscription_installments i on i.workspace_id=s.workspace_id and i.subscription_id=s.id
        and i.renewal_id=r.id
      where r.subscription_id=${earlyRenewalId}
    `;
    const payment = await sqlPay(tx, f.trainerA.userId, 'collect', {
      workspace_id: f.wsA.id,
      client_id: purchases[0]!.t.id,
      request_key: randomUUID(),
      subscription_id: earlyRenewalId,
      obligation_id: early!.installment_id,
      expected_installment_seq: early!.seq,
      expected_revision: 0,
      expected_previous_event_id: null,
      expected_amount_minor: early!.amount_minor,
      currency: early!.currency,
      collected_on: '1900-01-01',
      payment_confirmed: true,
    });
    // F13 projects the continuous subscription's current state; the renewal's
    // own service boundary remains future even while that subscription is active.
    if (
      payment.status !== 'ok' ||
      early!.status !== 'active' ||
      early!.service_start_date <= calendar!.today
    )
      throw new Error('Early-paid renewal fixture must remain F13 future');

    const missedRenewalId = await renewal(tx, f, purchases[4]!, offers[4]!);
    const [missedRenewal] = await tx`
      select service_start_date::text from public.subscription_renewals
      where subscription_id=${missedRenewalId}
    `;

    const [durationRow] = await tx`
      select duration_days from public.subscriptions where id=${purchases[1]!.sid}
    `;
    const startN = await renewal(
      tx,
      f,
      purchases[1]!,
      offers[1]!,
      (
        await tx`select (${calendar!.today}::date-${durationRow!.duration_days}::int+10)::text as date`
      )[0]!.date as string,
    );
    const [beforeReflow] = await tx`
      select service_start_date::text from public.subscription_renewals where subscription_id=${startN}
    `;
    const [shift] = await tx`
      select (${calendar!.today}::date+10)::text as day10,(${calendar!.today}::date+15)::text as day15
    `;
    if (beforeReflow!.service_start_date !== shift!.day10)
      throw new Error('Renewal fixture did not start at day 10');
    await freeze(tx, f, purchases[1]!.t.id, purchases[1]!.sid, 'apply', 0);
    const [afterReflow] = await tx`
      select d.service_start_date::text from public.subscription_renewal_date_revisions d
      where d.subscription_id=${startN} order by d.revision desc limit 1
    `;
    if (afterReflow!.service_start_date !== shift!.day15)
      throw new Error(
        'Freeze fixture did not reflow renewal from day 10 to day 15',
      );

    await activate(tx, f, purchases[2]!);
    const [frozenRow] = await tx`
      select app_private.f13_project_entitlement(${f.wsA.id},${purchases[2]!.sid},${calendar!.today}::date)->>'status' as status
    `;
    if (frozenRow!.status !== 'active')
      throw new Error('Expected active subscription before freeze');
    const freezeId = await freeze(
      tx,
      f,
      purchases[2]!.t.id,
      purchases[2]!.sid,
      'apply',
      0,
    );
    await freeze(
      tx,
      f,
      purchases[2]!.t.id,
      purchases[2]!.sid,
      'remove',
      1,
      freezeId,
    );

    await activate(tx, f, purchases[5]!);
    await activate(tx, f, purchases[6]!);
    const [futureDate] = await tx`
      select (${calendar!.today}::date+5)::timestamp at time zone 'Africa/Cairo' as activated_at
    `;
    await tx`insert into public.subscription_activations(
      workspace_id,subscription_id,activated_at,delivery_event_id
    ) values(${f.wsA.id},${purchases[7]!.sid},${futureDate!.activated_at},${randomUUID()})`;
    const [futureProjection] = await tx`
      select app_private.f13_project_entitlement(${f.wsA.id},${purchases[7]!.sid},${calendar!.today}::date)->>'status' as status
    `;
    if (futureProjection!.status !== 'future')
      throw new Error('Expected future F13 projection');

    const [expiredDuration] = await tx`
      select duration_days from public.subscriptions where id=${purchases[3]!.sid}
    `;
    const expiredActivation = await tx`
      select (${calendar!.today}::date-${expiredDuration!.duration_days}::int-1)::text as date
    `;
    await tx`insert into public.subscription_activations(
      workspace_id,subscription_id,activated_at,delivery_event_id
    ) values(${f.wsA.id},${purchases[3]!.sid},
      (${expiredActivation[0]!.date}::date::timestamp at time zone 'Africa/Cairo'),${randomUUID()})`;
    const [expired] = await tx`
      select app_private.f13_project_entitlement(${f.wsA.id},${purchases[3]!.sid},${calendar!.today}::date)->>'status' as status
    `;
    if (expired!.status !== 'expired')
      throw new Error('Expected expired F13 projection');

    await body(tx, f, {
      earlyPaidRenewal: {
        clientId: purchases[0]!.t.id,
        subscriptionId: purchases[0]!.sid,
        renewalId: earlyRenewalId,
        occurrenceKey: `renewal:${earlyRenewalId}`,
        serviceStart: early!.service_start_date,
      },
      missedRenewal: {
        clientId: purchases[4]!.t.id,
        subscriptionId: purchases[4]!.sid,
        renewalId: missedRenewalId,
        occurrenceKey: `renewal:${missedRenewalId}`,
        serviceStart: missedRenewal!.service_start_date,
      },
      reflowedRenewal: {
        clientId: purchases[1]!.t.id,
        subscriptionId: purchases[1]!.sid,
        renewalId: startN,
        occurrenceKey: `renewal:${startN}`,
        serviceStart: afterReflow!.service_start_date,
      },
      frozenThenUnfrozen: {
        clientId: purchases[2]!.t.id,
        subscriptionId: purchases[2]!.sid,
      },
      expiredSubscription: {
        clientId: purchases[3]!.t.id,
        subscriptionId: purchases[3]!.sid,
      },
      recurringActive: {
        clientId: purchases[5]!.t.id,
        subscriptionId: purchases[5]!.sid,
      },
      recurringFreeze: {
        clientId: purchases[6]!.t.id,
        subscriptionId: purchases[6]!.sid,
      },
      futureSubscription: {
        clientId: purchases[7]!.t.id,
        subscriptionId: purchases[7]!.sid,
      },
      ...(pendingCandidate ? { pendingCandidate } : {}),
    });
  });
}

export async function changePolicyFixtureFreeze(
  tx: TransactionSql,
  f: Context,
  scenario: Scenario,
  action: 'apply' | 'remove',
  expectedRevision: number,
  freezeId?: string,
) {
  return freeze(
    tx,
    f,
    scenario.clientId,
    scenario.subscriptionId,
    action,
    expectedRevision,
    freezeId,
  );
}
