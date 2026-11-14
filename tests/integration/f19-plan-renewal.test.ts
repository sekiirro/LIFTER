import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import { activate, bought, sql } from './registration-approval-payment-fixture';
import {
  clientContext,
  probe,
} from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());

async function packageOfferId(linkId: string) {
  const [row] = await db`
    select v.offer_id from public.registration_links l
    join public.package_versions v on v.workspace_id=l.workspace_id and v.id=l.package_version_id
    where l.id=${linkId}`;
  if (!row) throw new Error('Fixture package offer missing');
  return row.offer_id as string;
}

async function renewal(
  tx: TransactionSql,
  userId: string,
  input: Record<string, unknown>,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select public.record_renewal(${tx.json(input as JSONValue)}) as result`;
    return row!.result as Record<string, unknown>;
  } finally {
    await tx`reset role`;
  }
}

function request(
  f: Awaited<ReturnType<typeof clientContext>>,
  clientId: string,
  subscriptionId: string,
  offerId: string,
  expectedRevision = 0,
) {
  return {
    workspace_id: f.wsA.id,
    client_id: clientId,
    predecessor_subscription_id: subscriptionId,
    package_offer_id: offerId,
    request_key: randomUUID(),
    expected_revision: expectedRevision,
    renewal_confirmed: true,
    installments: null,
  };
}

it('extends the continuous subscription in place and records the full renewal price without an activation or unit', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const offerId = await packageOfferId(purchase.t.link);
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    const [before] = await tx`
      select app_private.f13_project_entitlement(
        ${f.wsA.id},${purchase.sid},(clock_timestamp() at time zone 'Africa/Cairo')::date
      ) as entitlement,
      (select count(*)::int from public.subscriptions where client_id=${purchase.t.id}) as subscriptions,
      (select count(*)::int from public.subscription_activations where subscription_id=${purchase.sid}) as activations`;
    const result = await renewal(
      tx,
      f.trainerA.userId,
      request(f, purchase.t.id, purchase.sid, offerId),
    );
    expect(result.status).toBe('ok');
    const receipt = result.receipt as Record<string, unknown>;
    expect(receipt.subscription_id).toBe(purchase.sid);
    const [after] = await tx`
      select app_private.f13_project_entitlement(
        ${f.wsA.id},${purchase.sid},(clock_timestamp() at time zone 'Africa/Cairo')::date
      ) as entitlement,
      (select count(*)::int from public.subscriptions where client_id=${purchase.t.id}) as subscriptions,
      (select count(*)::int from public.subscription_activations where subscription_id=${purchase.sid}) as activations,
      (select count(*)::int from public.productivity_units where client_id=${purchase.t.id}) as units,
      (select sum(i.amount_minor)::text from public.subscription_installments i
        where i.workspace_id=${f.wsA.id} and i.subscription_id=${purchase.sid}
          and i.renewal_id=${receipt.renewal_id as string}) as recorded_revenue,
      (select count(*)::int from public.subscription_renewals
        where workspace_id=${f.wsA.id} and id=${receipt.renewal_id as string}
          and subscription_id=${purchase.sid}) as renewal_events`;
    const beforeEnd = (
      before!.entitlement as { effective_end_exclusive: string }
    ).effective_end_exclusive;
    const afterEnd = (after!.entitlement as { effective_end_exclusive: string })
      .effective_end_exclusive;
    expect(afterEnd).toBe(
      new Date(
        new Date(`${beforeEnd}T00:00:00Z`).getTime() +
          Number(receipt.duration_days) * 86400000,
      )
        .toISOString()
        .slice(0, 10),
    );
    expect(after).toMatchObject({
      subscriptions: before!.subscriptions,
      activations: before!.activations,
      units: 0,
      recorded_revenue: receipt.price_minor,
      renewal_events: 1,
    });
  });
});

it('awards no renewal unit when the client never earned one or already has one', async () => {
  for (const alreadyEarned of [false, true]) {
    const f = await clientContext();
    const purchase = await bought(f);
    const offerId = await packageOfferId(purchase.t.link);
    await probe(async (tx) => {
      await activate(tx, f, purchase);
      if (alreadyEarned) {
        const [activation] = await tx`
          select id from public.subscription_activations where subscription_id=${purchase.sid}`;
        await tx`alter table public.productivity_units disable trigger productivity_units_immutable`;
        try {
          await tx`insert into public.productivity_units(
            workspace_id,client_id,subscription_id,activation_id,recipient_trainer_user_id
          ) values(${f.wsA.id},${purchase.t.id},${purchase.sid},${activation!.id},${f.trainerA.userId})`;
        } finally {
          await tx`alter table public.productivity_units enable trigger productivity_units_immutable`;
        }
      }
      const result = await renewal(
        tx,
        f.trainerA.userId,
        request(f, purchase.t.id, purchase.sid, offerId),
      );
      expect(result.status).toBe('ok');
      const [units] = await tx`
        select count(*)::int as count from public.productivity_units where client_id=${purchase.t.id}`;
      expect(units!.count).toBe(alreadyEarned ? 1 : 0);
    });
  }
});

it('preserves a historical renewal activation and rejects a new renewal activation write', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const offerId = await packageOfferId(purchase.t.link);
  await probe(async (tx) => {
    await tx`alter table public.subscription_activations disable trigger subscription_activations_source_guard`;
    let activationId: string;
    try {
      const [activation] = await tx`
        insert into public.subscription_activations(
          workspace_id,subscription_id,activated_at,delivery_event_id,activation_source
        ) values(${f.wsA.id},${purchase.sid},clock_timestamp(),${randomUUID()},'renewal') returning id`;
      activationId = activation!.id as string;
    } finally {
      await tx`alter table public.subscription_activations enable trigger subscription_activations_source_guard`;
    }
    const result = await renewal(
      tx,
      f.trainerA.userId,
      request(f, purchase.t.id, purchase.sid, offerId),
    );
    expect(result.status).toBe('ok');
    await expect(
      tx.savepoint(
        (inner) => inner`
        insert into public.subscription_activations(
          workspace_id,subscription_id,activated_at,delivery_event_id,activation_source
        ) values(${f.wsA.id},${purchase.sid},clock_timestamp(),${randomUUID()},'renewal')`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const [activation] = await tx`
      select id,activation_source from public.subscription_activations where subscription_id=${purchase.sid}`;
    expect(activation).toEqual({
      id: activationId!,
      activation_source: 'renewal',
    });
  });
});

it('resolves a reattached legacy successor to the continuous subscription before renewal', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const offerId = await packageOfferId(purchase.t.link);
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    const [packageVersion] = await tx`
      select current_version_id from public.package_offers where workspace_id=${f.wsA.id} and id=${offerId}`;
    const successor = randomUUID();
    const renewalId = randomUUID();
    await tx`set local session_replication_role = replica`;
    await tx`insert into public.subscriptions(
      id,workspace_id,client_id,kind,registration_link_id,package_version_id,
      price_minor,currency,commission_rate_bp,duration_days,duration_months,created_by,predecessor_subscription_id
    ) values(${successor},${f.wsA.id},${purchase.t.id},'renewal',null,${packageVersion!.current_version_id},
      1200,'XTS',17,30,null,${f.po.userId},${purchase.sid})`;
    await tx`
      insert into public.subscription_renewals(
        id,workspace_id,client_id,predecessor_subscription_id,subscription_id,package_offer_id,
        package_version_id,expected_revision,recording_date,service_start_date,service_end_exclusive,recorded_by
      ) values(${renewalId},${f.wsA.id},${purchase.t.id},${purchase.sid},${successor},${offerId},
        ${packageVersion!.current_version_id},0,(clock_timestamp() at time zone 'Africa/Cairo')::date,
        (clock_timestamp() at time zone 'Africa/Cairo')::date,
        (clock_timestamp() at time zone 'Africa/Cairo')::date+30,${f.trainerA.userId})`;
    await tx`set local session_replication_role = origin`;
    await tx`insert into app_private.subscription_reattachments(
      workspace_id,successor_subscription_id,continuous_subscription_id,actor_user_id,dry_run_evidence_hash
    ) values(${f.wsA.id},${successor},${purchase.sid},${f.po.userId},decode(repeat('00',32),'hex'))`;
    const result = await renewal(
      tx,
      f.trainerA.userId,
      request(f, purchase.t.id, successor, offerId, 1),
    );
    expect(result).toMatchObject({ status: 'ok' });
    expect((result.receipt as Record<string, unknown>).subscription_id).toBe(
      purchase.sid,
    );
    const [counts] = await tx`
      select (select count(*)::int from public.subscriptions where client_id=${purchase.t.id}) as subscriptions,
        (select count(*)::int from public.subscription_renewals
          where client_id=${purchase.t.id} and subscription_id=${purchase.sid}) as continuous_renewals,
        (select count(*)::int from public.subscription_activations a join public.subscriptions s
          on s.workspace_id=a.workspace_id and s.id=a.subscription_id where s.client_id=${purchase.t.id}) as activations`;
    expect(counts).toEqual({
      subscriptions: 2,
      continuous_renewals: 1,
      activations: 1,
    });
  });
});
