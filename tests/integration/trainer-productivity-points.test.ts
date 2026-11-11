import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import {
  clientContext,
  graph,
  probe,
  sql,
} from './registration-approval-fixture';
import { activate, bought } from './registration-approval-payment-fixture';

const db = sql();
afterAll(() => db.end());

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

async function packageOfferId(
  tx: TransactionSql | ReturnType<typeof sql>,
  linkId: string,
) {
  const [row] = await tx`
    select v.offer_id from public.registration_links l
    join public.package_versions v on v.workspace_id=l.workspace_id and v.id=l.package_version_id
    where l.id=${linkId}`;
  if (!row) throw new Error('Fixture package offer missing');
  return row.offer_id as string;
}

async function awardPoint(
  tx: TransactionSql,
  f: Awaited<ReturnType<typeof clientContext>>,
  clientId: string,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
  await tx`insert into public.trainer_productivity_points(workspace_id,trainer_user_id,client_id,recorded_by)
    values(${f.wsA.id},${f.trainerA.userId},${clientId},${f.po.userId})`;
}

it('T044 awards one point per new client with immutable audit', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await awardPoint(tx, f, ids.client);
    const [row] = await tx`
      select points, trainer_user_id, awarded_at is not null as awarded
      from public.trainer_productivity_points where client_id=${ids.client}`;
    expect(row).toMatchObject({
      points: 1,
      trainer_user_id: f.trainerA.userId,
      awarded: true,
    });
    const audits = await tx`
      select action, details from public.audit_events
      where target_table='trainer_productivity_points'`;
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'trainer.productivity_point_awarded',
    });
    expect(audits[0]!.details).toMatchObject({
      trainer_user_id: f.trainerA.userId,
      client_id: ids.client,
      points: 1,
    });
  });
});

it('T044 rejects a repeat point for the same returning client', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await awardPoint(tx, f, ids.client);
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
    await expect(
      tx.savepoint(
        (inner) =>
          inner`insert into public.trainer_productivity_points(workspace_id,trainer_user_id,client_id,recorded_by)
          values(${f.wsA.id},${f.trainerA.userId},${ids.client},${f.po.userId})`,
      ),
    ).rejects.toMatchObject({ code: '23505' });
    const [counts] = await tx`
      select (select count(*)::int from public.trainer_productivity_points where client_id=${ids.client}) as points,
        (select count(*)::int from public.audit_events where target_table='trainer_productivity_points') as audits`;
    expect(counts).toEqual({ points: 1, audits: 1 });
  });
});

it('T044 renewal writes zero point rows and preserves the single new-client point', async () => {
  const f = await clientContext();
  const purchase = await bought(f);
  const offerId = await packageOfferId(db, purchase.t.link);
  await probe(async (tx) => {
    await activate(tx, f, purchase);
    await awardPoint(tx, f, purchase.t.id);
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
    const [counts] = await tx`
      select (select count(*)::int from public.trainer_productivity_points where client_id=${purchase.t.id}) as points,
        (select count(*)::int from public.audit_events where target_table='trainer_productivity_points') as audits`;
    expect(counts).toEqual({ points: 1, audits: 1 });
  });
});

it('T044 freeze operations write zero point rows', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${ids.subscription},clock_timestamp(),${randomUUID()})`;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    try {
      const [applied] =
        await tx`select public.subscription_freeze_operation(${tx.json({
          action: 'apply',
          workspace_id: f.wsA.id,
          client_id: ids.client,
          subscription_id: ids.subscription,
          duration_days: 3,
          expected_revision: 0,
          request_key: randomUUID(),
        } as JSONValue)}) as receipt`;
      expect(applied!.receipt).toMatchObject({ status: 'applied' });
    } finally {
      await tx`reset role`;
    }
    const [counts] = await tx`
      select count(*)::int as points from public.trainer_productivity_points`;
    expect(counts!.points).toBe(0);
  });
});

it('T044 point rows are tenant-bound, immutable and carry no publication limit', async () => {
  const [table] = await db`
    select c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) as owner
    from pg_class c where c.oid = to_regclass('public.trainer_productivity_points')`;
  expect(table).toEqual({
    relrowsecurity: true,
    relforcerowsecurity: true,
    owner: 'postgres',
  });
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const [grant] = await db`
      select has_table_privilege(${role}, 'public.trainer_productivity_points', 'SELECT') as read,
             has_table_privilege(${role}, 'public.trainer_productivity_points', 'INSERT') as insert,
             has_table_privilege(${role}, 'public.trainer_productivity_points', 'UPDATE') as update,
             has_table_privilege(${role}, 'public.trainer_productivity_points', 'DELETE') as delete`;
    expect(grant).toEqual({
      read: false,
      insert: false,
      update: false,
      delete: false,
    });
  }
  const triggers = await db`
    select tgname from pg_trigger
    where tgrelid='public.trainer_productivity_points'::regclass and not tgisinternal order by tgname`;
  expect(triggers.map((trigger) => trigger.tgname)).toEqual([
    'f13_no_delete',
    'f13_no_truncate',
    'f13_no_update',
    'f13_productivity_point_audit',
  ]);
  const checks = await db`
    select pg_get_constraintdef(oid) as definition from pg_constraint
    where conrelid='public.trainer_productivity_points'::regclass and contype='c'`;
  expect(checks.length).toBeGreaterThan(0);
  for (const check of checks) expect(check.definition).toContain('points');
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await awardPoint(tx, f, ids.client);
    await expect(
      tx.savepoint(
        (inner) =>
          inner`update public.trainer_productivity_points set points=1 where client_id=${ids.client}`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      tx.savepoint(
        (inner) =>
          inner`delete from public.trainer_productivity_points where client_id=${ids.client}`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const [counts] = await tx`
      select count(*)::int as points from public.trainer_productivity_points where client_id=${ids.client}`;
    expect(counts!.points).toBe(1);
  });
});
