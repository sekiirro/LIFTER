import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import { bought, activate, sql } from './registration-approval-payment-fixture';
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
      await renewal(tx, f.po.userId, { ...request, request_key: randomUUID() }),
    ).toMatchObject({ status: 'stale_state' });
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
