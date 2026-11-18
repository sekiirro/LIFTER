import { afterAll, beforeAll, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
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
beforeAll(async () => {
  f = await clientContext();
  // Real approval: installments 1..3 of 400 at offsets 0/30/60 days.
  p = await bought(f);
});
afterAll(() => db.end());

async function activateAt(tx: TransactionSql, instant: string) {
  // P4-owned seam: synthetic activation exists only in a rolled-back probe.
  await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
    values(${f.wsA.id},${p.sid},${instant}::timestamptz,gen_random_uuid(),'po_override')`;
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
  from: string,
  to: string,
) {
  const [d] =
    await tx`select pg_get_functiondef(${signature}::regprocedure) as def`;
  const def = d!.def as string;
  expect(def).toContain(from);
  await tx.unsafe(def.replaceAll(from, to));
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
  // M4: dropping the own-account filter breaks the client wall (kill = own result no longer ok).
  await probe(async (tx) => {
    const user = await authUser(tx);
    expect(await clientOverdue(tx, user)).toMatchObject({ status: 'ok' });
    await mutate(
      tx,
      'public.client_overdue_status()',
      'c.auth_user_id = auth.uid() and ',
      '',
    );
    const own = await clientOverdue(tx, user);
    const staff = await clientOverdue(tx, f.po.userId);
    // Killed when the own result is no longer ok (several clients exist) or a staff user is accepted.
    expect(own.status === 'ok' && staff.status === 'invalid').toBe(false);
  });
  // Restored definitions are re-checked outside the rolled-back probes.
  const [def] = await db`select
    pg_get_functiondef('app_private.f13_project_overdue(uuid,uuid,date)'::regprocedure) as a,
    pg_get_functiondef('public.client_overdue_status()'::regprocedure) as b`;
  expect(def!.a).toContain('d.due_on < as_of');
  expect(def!.b).toContain('c.auth_user_id = auth.uid()');
});
