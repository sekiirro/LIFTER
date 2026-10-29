import {
  registered,
  request,
  call,
  state,
} from './registration-approval-operations-fixture';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  sql,
  probe,
  graph,
  append,
  clientContext,
  type Context,
} from './registration-approval-fixture';
const db = sql();
let f: Context;
beforeAll(async () => {
  f = await clientContext();
});
afterAll(() => db.end());
it('T010 complete latest F11 audit body is preserved verbatim outside F12 addition', async () => {
  const source = readFileSync(
    'supabase/migrations/20261031122000_client_accounts_signup.sql',
    'utf8',
  );
  const oldBody = source
    .split(
      'create or replace function app_private.audit_row_change() returns trigger',
    )[1]!
    .split('as $$')[1]!
    .split('$$;')[0]!;
  const [row] =
    await db`select prosrc from pg_proc where oid='app_private.audit_row_change()'::regprocedure`;
  expect(row!.prosrc).toContain('payment.collection_corrected');
  expect(
    row!.prosrc
      .replace(/\r\n/g, '\n')
      .replace(
        /  -- F12 extension begin[\s\S]*?  -- F12 extension end\r?\n/,
        '',
      ),
  ).toBe(oldBody.replace(/\r\n/g, '\n'));
});
it('T010 client UPDATE audit exists and signup INSERT retains exactly one trigger', async () => {
  const rows =
    await db`select tgname,tgtype::int as type from pg_trigger where tgrelid='public.clients'::regclass and tgfoid='app_private.audit_row_change()'::regprocedure and tgenabled='O' order by tgname`;
  expect(rows).toEqual([
    { tgname: 'audit_client_approval', type: 17 },
    { tgname: 'audit_client_signup', type: 5 },
  ]);
  const [g] =
    await db`select prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid='app_private.audit_row_change()'::regprocedure`;
  expect(g).toEqual({
    prosecdef: true,
    proconfig: ['search_path=""'],
    owner: 'postgres',
  });
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const [r] =
      await db`select has_function_privilege(${role},'app_private.audit_row_change()','EXECUTE') as allowed`;
    expect(r!.allowed).toBe(false);
  }
});
it('T010 signup once, approval once, collection/correction once; exact safe payload', async () => {
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    const reversal = await append(tx, f, ids);
    await tx`set constraints all immediate`;
    const rows =
      await tx`select action,actor_user_id,details from public.audit_events where target_id in (${ids.client},${ids.event},${reversal.id}) order by action`;
    expect(rows.map((r) => r.action)).toEqual([
      'client.approved',
      'client.signup_succeeded',
      'payment.collected',
      'payment.collection_corrected',
    ]);
    for (const row of rows.filter(
      (r) => r.action !== 'client.signup_succeeded',
    ))
      expect(row.actor_user_id).toBe(f.po.userId);
    const payment = rows.find((r) => r.action === 'payment.collected')!.details;
    expect(payment).toMatchObject({
      amount_minor: '1200',
      currency: 'XTS',
      installment_seq: 1,
      revision: 1,
    });
    expect(Object.keys(payment).sort()).toEqual(
      [
        'amount_minor',
        'client_id',
        'collected_on',
        'currency',
        'effective_on',
        'event_id',
        'installment_seq',
        'obligation_id',
        'recorded_at',
        'revision',
        'subscription_id',
      ].sort(),
    );
    expect(JSON.stringify(rows.map((r) => r.details))).not.toMatch(
      /commission|rate|phone|email|password|token|hash|secret|method|reference|U2 synthetic/,
    );
  });
});
it('T010 audit insertion failure aborts graph; no partial financial rows survive', async () => {
  const before =
    await db`select (select count(*) from public.clients)::text as clients,(select count(*) from public.payment_events)::text as events`;
  await expect(
    probe(async (tx) => {
      await tx.unsafe(
        "create function pg_temp.f12_fail_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic_audit_failure' using errcode='23514'; end $$",
      );
      await tx`create trigger f12_synthetic_audit_failure before insert on public.audit_events for each row execute function pg_temp.f12_fail_audit()`;
      await graph(tx, f);
    }),
  ).rejects.toMatchObject({
    code: '23514',
    message: 'synthetic_audit_failure',
  });
  expect(
    await db`select (select count(*) from public.clients)::text as clients,(select count(*) from public.payment_events)::text as events`,
  ).toEqual(before);
});

it('T017 real approval RPC emits exactly one safe approval fact and two success audits; replay/denial emit none', async () => {
  const t = await registered(f),
    input = request(f, t),
    result = await call(f.po.client, 'approve', input);
  expect(result.status).toBe('ok');
  const facts =
    await db`select kind,schema_version,workspace_id,client_id,subscription_id from app_private.registration_approval_events where client_id=${t.id}`;
  expect(facts).toEqual([
    {
      kind: 'registration.approved',
      schema_version: 1,
      workspace_id: f.wsA.id,
      client_id: t.id,
      subscription_id: result.receipt!.subscription_id,
    },
  ]);
  const events =
    await db`select action,actor_user_id,details from public.audit_events where target_id=${t.id} or (action='payment.collected' and details->>'client_id'=${t.id}) order by action`;
  expect(events.map((r) => r.action)).toEqual([
    'client.approved',
    'client.signup_succeeded',
    'payment.collected',
  ]);
  for (const row of events.filter(
    (r) => r.action !== 'client.signup_succeeded',
  ))
    expect(row.actor_user_id).toBe(f.po.userId);
  expect(Object.keys(events[0]!.details).sort()).toEqual([
    'client_id',
    'decision_id',
    'from_state',
    'to_state',
  ]);
  expect(JSON.stringify(events.map((r) => r.details))).not.toMatch(
    /commission|rate|email|phone|password|token|hash|secret|method|reference|U3 synthetic/,
  );
  const before = await state(db, t);
  expect(await call(f.po.client, 'approve', input)).toEqual(result);
  expect(await call(f.woA.client, 'approve', request(f, t))).toEqual({
    status: 'stale_state',
  });
  expect(await call(f.salesA.client, 'approve', input)).toEqual({
    status: 'not_permitted',
  });
  expect(await state(db, t)).toEqual(before);
});
it('T017 rejection has no approval fact; reconsideration creates exactly one fact and owner-scoped audits', async () => {
  const t = await registered(f),
    rejection = request(f, t, 'reject');
  const rejected = await call(f.woA.client, 'reject', rejection);
  expect(rejected.status).toBe('ok');
  expect(await state(db, t)).toMatchObject({
    facts: 0,
    payments: 0,
    audits: 1,
  });
  const [event] =
    await db`select details from public.audit_events where target_id=${t.id} and action='client.rejected'`;
  expect(event!.details).toMatchObject({
    reason_code: 'registration_rejected',
    from_state: 'pending-approval',
    to_state: 'rejected',
  });
  const reconsideration = request(f, t, 'reconsider'),
    result = await call(f.po.client, 'reconsider', reconsideration);
  expect(result.status).toBe('ok');
  expect(await call(f.po.client, 'reconsider', reconsideration)).toEqual(
    result,
  );
  // The original rejection receipt remains identical after reconsideration.
  expect(await call(f.woA.client, 'reject', rejection)).toEqual(rejected);
  expect(await state(db, t)).toMatchObject({
    facts: 1,
    payments: 1,
    audits: 3,
    activations: 0,
  });
  for (const role of ['po', 'woA', 'salesA', 'trainerA', 'woB'] as const) {
    const rows = await f.actors[role].client
      .from('audit_events')
      .select('action')
      .eq('target_id', t.id);
    expect(rows.error).toBeNull();
    expect(rows.data?.map((r) => r.action).sort()).toEqual(
      role === 'po' || role === 'woA'
        ? ['client.reconsidered', 'client.rejected', 'client.signup_succeeded']
        : [],
    );
  }
});
