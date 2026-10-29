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
