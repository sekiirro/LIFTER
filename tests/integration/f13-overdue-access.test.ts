import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import {
  bought,
  clientContext,
  paymentRequest,
  probe,
  sql,
  sqlPay,
  type Context,
  type Purchase,
} from './registration-approval-payment-fixture';

const db = sql();
let f: Context;
let p: Purchase;
let p2: Purchase;
beforeAll(async () => {
  f = await clientContext();
  // Real approval: installments 1..3 of 400 at offsets 0/30/60 days.
  p = await bought(f);
  // A second approved client in the same workspace (cross-client isolation, wall mutation).
  p2 = await bought(f);
});
afterAll(() => db.end());

async function activateAt(
  tx: TransactionSql,
  instant: string,
  purchase: Purchase = p,
) {
  // P4-owned seam: synthetic activation exists only in a rolled-back probe.
  await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
    values(${f.wsA.id},${purchase.sid},${instant}::timestamptz,gen_random_uuid(),'po_override')`;
}
async function projectOverdue(tx: TransactionSql, asOf: string) {
  const [r] =
    await tx`select app_private.f13_project_overdue(${f.wsA.id},${p.sid},${asOf}::date) as v`;
  return r!.v as Record<string, unknown>;
}
async function authUser(tx: TransactionSql) {
  const [c] =
    await tx`select auth_user_id from public.clients where id=${p.t.id}`;
  return c!.auth_user_id as string;
}
async function clientOverdue(tx: TransactionSql, user: string) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: user, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [r] = await tx`select public.client_overdue_status() as v`;
    return r!.v as Record<string, unknown>;
  } finally {
    await tx`reset role`;
  }
}
async function mutate(
  tx: TransactionSql,
  signature: string,
  from: string | RegExp,
  to: string,
  occurrences = 1,
) {
  const [d] =
    await tx`select pg_get_functiondef(${signature}::regprocedure) as def`;
  const def = d!.def as string;
  const found =
    typeof from === 'string'
      ? def.split(from).length - 1
      : (def.match(new RegExp(from.source, 'g')) ?? []).length;
  expect(found, 'mutation target occurrences').toBe(occurrences);
  await tx.unsafe(
    typeof from === 'string'
      ? def.replaceAll(from, to)
      : def.replace(new RegExp(from.source, 'g'), to),
  );
}
const cancellationPredicate =
  /and not exists \(\s*select 1 from public\.subscription_obligation_cancellations c\s*where c\.workspace_id = i\.workspace_id and c\.obligation_id = i\.id\)/;
async function clientState(tx: TransactionSql, clientId: string, asOf: string) {
  const [r] =
    await tx`select app_private.f13_client_overdue_state(${f.wsA.id},${clientId},${asOf}::date) as v`;
  return r!.v as Record<string, unknown>;
}
async function cairoToday(tx: TransactionSql) {
  const [r] =
    await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as d`;
  return r!.d as string;
}

it('T157 derives overdue from activation-relative due dates, strictly after the Cairo due day', async () => {
  await probe(async (tx) => {
    expect(await projectOverdue(tx, '2099-01-01')).toMatchObject({
      overdue: false,
      overdue_since: null,
    });
    await activateAt(tx, '2026-11-01 10:00:00+02');
    // seq 2 due 2026-12-01 (offset 30), seq 3 due 2026-12-31 (offset 60); seq 1 has no due date.
    expect(await projectOverdue(tx, '2026-12-01')).toMatchObject({
      overdue: false,
    });
    expect(await projectOverdue(tx, '2026-12-02')).toEqual({
      overdue: true,
      overdue_since: '2026-12-01',
      first_overdue_seq: 2,
      overdue_installment_count: 1,
      reason: 'installment_past_due',
    });
    expect(await projectOverdue(tx, '2027-01-01')).toMatchObject({
      overdue: true,
      first_overdue_seq: 2,
      overdue_installment_count: 2,
    });
  });
});

it('T157 clears the paid installment while later past-due installments stay restricted', async () => {
  await probe(async (tx) => {
    await activateAt(tx, '2026-11-01 10:00:00+02');
    expect(await projectOverdue(tx, '2027-01-01')).toMatchObject({
      overdue_installment_count: 2,
    });
    expect(
      (await sqlPay(tx, f.po.userId, 'collect', paymentRequest(f, p))).status,
    ).toBe('ok');
    expect(await projectOverdue(tx, '2027-01-01')).toMatchObject({
      overdue: true,
      first_overdue_seq: 3,
      overdue_installment_count: 1,
    });
  });
});

it('T157 client wall returns only the caller own restriction facts', async () => {
  await probe(async (tx) => {
    const user = await authUser(tx);
    expect(await clientOverdue(tx, user)).toMatchObject({
      status: 'ok',
      overdue: false,
    });
    // 45 Cairo days since activation: seq 2 (30 days) is overdue, seq 3 (60 days) is not yet.
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
      values(${f.wsA.id},${p.sid},(((statement_timestamp() at time zone 'Africa/Cairo')::date - 45)::timestamp at time zone 'Africa/Cairo') + interval '10 hours',gen_random_uuid(),'po_override')`;
    const [cairo] =
      await tx`select ((statement_timestamp() at time zone 'Africa/Cairo')::date - 15)::text as since`;
    const overdue = await clientOverdue(tx, user);
    expect(overdue).toEqual({
      status: 'ok',
      overdue: true,
      overdue_since: cairo!.since,
      first_overdue_seq: 2,
      overdue_installment_count: 1,
      reason: 'installment_past_due',
    });
    // No amounts, ids or payment details are exposed.
    expect(Object.keys(overdue).sort()).toEqual([
      'first_overdue_seq',
      'overdue',
      'overdue_installment_count',
      'overdue_since',
      'reason',
      'status',
    ]);
    expect(
      (await sqlPay(tx, f.po.userId, 'collect', paymentRequest(f, p))).status,
    ).toBe('ok');
    expect(await clientOverdue(tx, user)).toMatchObject({
      status: 'ok',
      overdue: false,
    });
  });
});

it('T157 staff and unknown identities are not clients; anon cannot call', async () => {
  await probe(async (tx) => {
    for (const user of [f.po.userId, f.trainerA.userId])
      expect(await clientOverdue(tx, user)).toEqual({ status: 'invalid' });
    expect(
      await clientOverdue(tx, '00000000-0000-4000-8000-000000000001'),
    ).toEqual({ status: 'invalid' });
  });
  await expect(
    probe(async (tx) => {
      await tx`set local role anon`;
      await tx`select public.client_overdue_status()`;
    }),
  ).rejects.toThrow(/permission denied/i);
  await expect(
    probe(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select app_private.f13_project_overdue(${f.wsA.id},${p.sid},'2026-12-01'::date)`;
    }),
  ).rejects.toThrow(/permission denied/i);
});

it('T157 foreign-workspace and unknown targets fail closed', async () => {
  for (const run of [
    (tx: TransactionSql) =>
      tx`select app_private.f13_project_overdue(${f.wsB.id},${p.sid},'2026-12-02'::date)`,
    (tx: TransactionSql) =>
      tx`select app_private.f13_client_overdue_state(${f.wsB.id},${p.t.id},'2026-12-02'::date)`,
    (tx: TransactionSql) =>
      tx`select app_private.f13_client_overdue_state(${f.wsA.id},gen_random_uuid(),'2026-12-02'::date)`,
    (tx: TransactionSql) =>
      tx`select app_private.f13_project_overdue(${f.wsA.id},gen_random_uuid(),'2026-12-02'::date)`,
    (tx: TransactionSql) =>
      tx`select app_private.f13_project_overdue(${f.wsA.id},${p.sid},'infinity'::date)`,
  ])
    await expect(probe(async (tx) => void (await run(tx)))).rejects.toThrow();
});

it('T157 is independent of entitlement and freeze state', async () => {
  await probe(async (tx) => {
    await activateAt(tx, '2026-11-01 10:00:00+02');
    const [before] =
      await tx`select app_private.f13_project_entitlement(${f.wsA.id},${p.sid},'2026-12-02'::date) as v`;
    const overdue = await projectOverdue(tx, '2026-12-02');
    expect(overdue.overdue).toBe(true);
    // Expired coverage (duration 61 days from 2026-11-01) does not clear overdue.
    const [expired] =
      await tx`select app_private.f13_project_entitlement(${f.wsA.id},${p.sid},'2027-02-01'::date) as v`;
    expect((expired!.v as { status: string }).status).toBe('expired');
    expect(await projectOverdue(tx, '2027-02-01')).toMatchObject({
      overdue: true,
    });
    expect((before!.v as { status: string }).status).toBe('active');
  });
});

it('T157 excludes cancelled obligations', async () => {
  await probe(async (tx) => {
    await activateAt(tx, '2026-11-01 10:00:00+02');
    expect(await projectOverdue(tx, '2027-01-01')).toMatchObject({
      first_overdue_seq: 2,
      overdue_installment_count: 2,
    });
    // Probe-only cancellation fact (the real path is a PO refund); the deferred FK and
    // ledger integrity triggers never fire because the probe is rolled back.
    await tx`insert into public.subscription_obligation_cancellations(workspace_id,subscription_id,obligation_id,refund_operation_id,actor_user_id,effective_on)
      values(${f.wsA.id},${p.sid},${p.rows[1]!.id},gen_random_uuid(),${f.po.userId},'2026-12-05')`;
    expect(await projectOverdue(tx, '2027-01-01')).toMatchObject({
      overdue: true,
      overdue_since: '2026-12-31',
      first_overdue_seq: 3,
      overdue_installment_count: 1,
    });
    await tx`insert into public.subscription_obligation_cancellations(workspace_id,subscription_id,obligation_id,refund_operation_id,actor_user_id,effective_on)
      values(${f.wsA.id},${p.sid},${p.rows[2]!.id},gen_random_uuid(),${f.po.userId},'2026-12-05')`;
    expect(await projectOverdue(tx, '2027-01-01')).toMatchObject({
      overdue: false,
      overdue_since: null,
      overdue_installment_count: 0,
    });
  });
});

it('T157 anchors due dates to the Cairo calendar day of activation', async () => {
  await probe(async (tx) => {
    // 00:30 Cairo on 2026-11-02 is 22:30Z on 2026-11-01: Cairo day 11-02, UTC day 11-01.
    await activateAt(tx, '2026-11-01T22:30:00Z');
    expect(await projectOverdue(tx, '2026-12-02')).toMatchObject({
      overdue: false,
    });
    expect(await projectOverdue(tx, '2026-12-03')).toMatchObject({
      overdue: true,
      overdue_since: '2026-12-02',
    });
  });
});

it('T157 never counts another client in the same workspace', async () => {
  await probe(async (tx) => {
    await activateAt(tx, '2026-11-01 10:00:00+02');
    const aloneA = await clientState(tx, p.t.id, '2027-01-01');
    expect(aloneA).toMatchObject({
      overdue: true,
      overdue_since: '2026-12-01',
      first_overdue_seq: 2,
      overdue_installment_count: 2,
    });
    expect(await clientState(tx, p2.t.id, '2027-01-01')).toMatchObject({
      overdue: false,
      overdue_installment_count: 0,
    });
    // Client B becomes overdue earlier and with its own count; A must not change.
    await activateAt(tx, '2026-10-01 10:00:00+02', p2);
    expect(await clientState(tx, p2.t.id, '2027-01-01')).toMatchObject({
      overdue: true,
      overdue_since: '2026-10-31',
      overdue_installment_count: 2,
    });
    expect(await clientState(tx, p.t.id, '2027-01-01')).toEqual(aloneA);
    expect(await clientOverdue(tx, await authUser(tx))).toMatchObject({
      status: 'ok',
    });
  });
});

it('T157 covers renewal obligations through their stored due date', async () => {
  const [offer] = await db`
    select v.offer_id from public.registration_links l
    join public.package_versions v on v.workspace_id=l.workspace_id and v.id=l.package_version_id
    where l.id=${p.t.link}`;
  await probe(async (tx) => {
    // Activate now so initial installments 2 and 3 are not yet due; only the renewal can be overdue.
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
      values(${f.wsA.id},${p.sid},clock_timestamp(),gen_random_uuid(),'po_override')`;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    const renewalInput = {
      workspace_id: f.wsA.id,
      client_id: p.t.id,
      predecessor_subscription_id: p.sid,
      package_offer_id: offer!.offer_id,
      request_key: randomUUID(),
      expected_revision: 0,
      renewal_confirmed: true,
      installments: [
        { amount_minor: '600', due_offset_days: 0 },
        { amount_minor: '600', due_offset_days: 30 },
      ],
    };
    const [renewed] =
      await tx`select public.record_renewal(${tx.json(renewalInput as JSONValue)}) as result`;
    await tx`reset role`;
    const result = renewed!.result as {
      status: string;
      receipt: { renewal_id: string };
    };
    expect(result.status).toBe('ok');
    const today = await cairoToday(tx);
    const [tomorrow] = await tx`select (${today}::date + 1)::text as d`;
    const obligations = await tx`select id,seq,due_on::text as due_on
      from public.subscription_installments
      where workspace_id=${f.wsA.id} and subscription_id=${p.sid} and renewal_id=${result.receipt.renewal_id}
      order by seq`;
    expect(obligations).toHaveLength(2);
    expect(obligations[0]!.due_on).toBe(today);
    // Payable through Cairo day-end: not overdue on the due day, overdue the next day.
    expect(await projectOverdue(tx, today)).toMatchObject({ overdue: false });
    expect(await projectOverdue(tx, tomorrow!.d as string)).toMatchObject({
      overdue: true,
      overdue_since: today,
      first_overdue_seq: obligations[0]!.seq,
      overdue_installment_count: 1,
    });
    const collected = await sqlPay(tx, f.trainerA.userId, 'collect', {
      workspace_id: f.wsA.id,
      client_id: p.t.id,
      request_key: randomUUID(),
      subscription_id: p.sid,
      obligation_id: obligations[0]!.id as string,
      expected_installment_seq: obligations[0]!.seq as number,
      expected_revision: 0,
      expected_previous_event_id: null,
      expected_amount_minor: '600',
      currency: 'USD',
      collected_on: '1900-01-01',
      payment_confirmed: true,
    });
    expect(collected.status).toBe('ok');
    expect(await projectOverdue(tx, tomorrow!.d as string)).toMatchObject({
      overdue: false,
      overdue_installment_count: 0,
    });
  });
});

it('T157 authorization mutations are killed: each control is replaced by a mutant and its invariant fails', async () => {
  // M1: inclusive comparison would restrict on the due day itself.
  await probe(async (tx) => {
    await activateAt(tx, '2026-11-01 10:00:00+02');
    expect(await projectOverdue(tx, '2026-12-01')).toMatchObject({
      overdue: false,
    });
    await mutate(
      tx,
      'app_private.f13_project_overdue(uuid,uuid,date)',
      'd.due_on < as_of',
      'd.due_on <= as_of',
    );
    expect(await projectOverdue(tx, '2026-12-01')).toMatchObject({
      overdue: true,
    });
  });
  // M2: ignoring payments would keep a paid client restricted.
  await probe(async (tx) => {
    await activateAt(tx, '2026-11-01 10:00:00+02');
    await sqlPay(tx, f.po.userId, 'collect', paymentRequest(f, p));
    expect(await projectOverdue(tx, '2026-12-15')).toMatchObject({
      overdue: false,
    });
    await mutate(
      tx,
      'app_private.f13_project_overdue(uuid,uuid,date)',
      'where not d.paid and',
      'where',
    );
    expect(await projectOverdue(tx, '2026-12-15')).toMatchObject({
      overdue: true,
    });
  });
  // M3: dropping the tenant predicate would accept a foreign workspace for a real client id.
  await probe(async (tx) => {
    await expect(
      tx.savepoint(
        (s) =>
          s`select app_private.f13_client_overdue_state(${f.wsB.id},${p.t.id},'2026-12-02'::date)`,
      ),
    ).rejects.toThrow();
    await mutate(
      tx,
      'app_private.f13_client_overdue_state(uuid,uuid,date)',
      'c.workspace_id = ws and c.id = cid',
      'c.id = cid',
    );
    const [r] =
      await tx`select app_private.f13_client_overdue_state(${f.wsB.id},${p.t.id},'2026-12-02'::date) as v`;
    expect(r!.v).toMatchObject({ overdue: false });
  });
  // M4: dropping the own-account filter breaks the client wall. Two approved clients exist
  // (p and p2), so the mutant counts several matches and must return invalid for the owner.
  await probe(async (tx) => {
    const user = await authUser(tx);
    expect(await clientOverdue(tx, user)).toMatchObject({ status: 'ok' });
    await mutate(
      tx,
      'public.client_overdue_status()',
      'c.auth_user_id = auth.uid() and ',
      '',
      2,
    );
    expect(await clientOverdue(tx, user)).toEqual({ status: 'invalid' });
  });
  // M5: stripping the cancellation predicate would keep cancelled obligations restricting.
  await probe(async (tx) => {
    await activateAt(tx, '2026-11-01 10:00:00+02');
    await tx`insert into public.subscription_obligation_cancellations(workspace_id,subscription_id,obligation_id,refund_operation_id,actor_user_id,effective_on)
      values(${f.wsA.id},${p.sid},${p.rows[1]!.id},gen_random_uuid(),${f.po.userId},'2026-12-05')`;
    expect(await projectOverdue(tx, '2027-01-01')).toMatchObject({
      overdue_installment_count: 1,
    });
    await mutate(
      tx,
      'app_private.f13_project_overdue(uuid,uuid,date)',
      cancellationPredicate,
      '',
    );
    expect(await projectOverdue(tx, '2027-01-01')).toMatchObject({
      overdue_installment_count: 2,
    });
  });
  // M6: computing the activation day in UTC moves the due date a day early.
  await probe(async (tx) => {
    await activateAt(tx, '2026-11-01T22:30:00Z');
    expect(await projectOverdue(tx, '2026-12-02')).toMatchObject({
      overdue: false,
    });
    await mutate(
      tx,
      'app_private.f13_project_overdue(uuid,uuid,date)',
      "at time zone 'Africa/Cairo'",
      "at time zone 'UTC'",
    );
    expect(await projectOverdue(tx, '2026-12-02')).toMatchObject({
      overdue: true,
      overdue_since: '2026-12-01',
    });
  });
  // Restored definitions are re-checked outside the rolled-back probes.
  const [def] = await db`select
    pg_get_functiondef('app_private.f13_project_overdue(uuid,uuid,date)'::regprocedure) as a,
    pg_get_functiondef('public.client_overdue_status()'::regprocedure) as b`;
  expect(def!.a).toContain('d.due_on < as_of');
  expect(def!.a).toMatch(cancellationPredicate);
  expect(def!.a).toContain("at time zone 'Africa/Cairo'");
  expect(def!.b).toContain('c.auth_user_id = auth.uid()');
});
