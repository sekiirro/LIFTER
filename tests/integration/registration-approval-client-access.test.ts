import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  clientContext,
  probe,
  sql,
  type Context,
} from './registration-approval-fixture';
import {
  request as decisionRequest,
  sqlCall,
} from './registration-approval-operations-fixture';
import {
  registered,
  request as approvalRequest,
} from './registration-approval-operations-fixture';

const db = sql();
let f: Context;
afterAll(() => db.end());
beforeAll(async () => {
  f = await clientContext();
});

it('T024 zero-argument self status returns only the signed client state', async () => {
  await probe(async (tx) => {
    const client = await (
      await import('./client-accounts-fixture')
    ).pending(tx, f);
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.auth_user_id, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    const [state] = await tx`select public.client_self_status() as result`;
    expect(state!.result).toEqual({
      status: 'ok',
      approval_state: 'pending-approval',
    });
    await tx`reset role`;
    const [helper] =
      await tx`select app_private.client_has_access(${f.wsA.id},${client.id}) as allowed`;
    expect(helper!.allowed).toBe(false);
    const target = {
      id: client.id as string,
      userId: client.auth_user_id as string,
      link: f.link,
      rows: null,
    };
    const rejected = await sqlCall(
      tx,
      f.po.userId,
      'reject',
      decisionRequest(f, target, 'reject'),
    );
    expect(rejected.status).toBe('ok');
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.auth_user_id, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    const [rejection] = await tx`select public.client_self_status() as result`;
    expect(rejection!.result).toEqual({
      status: 'ok',
      approval_state: 'rejected',
    });
    await tx`reset role`;
    const [rejectedAccess] =
      await tx`select app_private.client_has_access(${f.wsA.id},${client.id}) as allowed`;
    expect(rejectedAccess!.allowed).toBe(false);
    for (const table of [
      'subscriptions',
      'subscription_installments',
      'payment_events',
      'subscription_activations',
    ]) {
      await tx.unsafe(`grant select on public.${table} to authenticated`);
      await tx`set local role authenticated`;
      expect(await tx.unsafe(`select * from public.${table}`)).toEqual([]);
      await tx`reset role`;
    }
  });
});

it('T024 self helper uses auth.uid association, has no caller target input, and is not executable by browser roles', async () => {
  const [status] =
    await db`select oid::regprocedure::text as signature,pronargs,prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid='public.client_self_status()'::regprocedure`;
  expect(status).toMatchObject({
    signature: 'client_self_status()',
    pronargs: 0,
    prosecdef: true,
    proconfig: ['search_path=""'],
    owner: 'postgres',
  });
  const indexes =
    await db`select indexdef from pg_indexes where schemaname='public' and tablename='clients'`;
  expect(
    indexes.some((row) => /\(auth_user_id\)/.test(row.indexdef as string)),
  ).toBe(true);
  const overloads =
    await db`select oid::regprocedure::text as signature from pg_proc where pronamespace='public'::regnamespace and proname='client_self_status'`;
  expect(overloads).toEqual([{ signature: 'client_self_status()' }]);
  const [helper] =
    await db`select oid::regprocedure::text as signature,prosrc,prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid='app_private.client_has_access(uuid,uuid)'::regprocedure`;
  expect(helper!.prosrc).toMatch(/auth\.uid\(\)/);
  expect(helper).toMatchObject({
    prosecdef: true,
    proconfig: ['search_path=""'],
    owner: 'postgres',
  });
  for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
    const [a] =
      await db`select has_function_privilege(${role},'public.client_self_status()','EXECUTE') as allowed`;
    expect(a!.allowed).toBe(role === 'authenticated');
    const [b] =
      await db`select has_function_privilege(${role},'app_private.client_has_access(uuid,uuid)','EXECUTE') as allowed`;
    expect(b!.allowed).toBe(false);
  }
});

it('T024 approved self status adds no base-table or activation access', async () => {
  await probe(async (tx) => {
    const target = await registered(f);
    const approval = await sqlCall(
      tx,
      f.po.userId,
      'approve',
      approvalRequest(f, target),
    );
    expect(approval.status).toBe('ok');
    const [identity] =
      await tx`select auth_user_id from public.clients where id=${target.id}`;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: identity!.auth_user_id, role: 'authenticated' })},true)`;
    const [status] = await tx`select public.client_self_status() as result`;
    expect(status!.result).toEqual({
      status: 'ok',
      approval_state: 'approved',
    });
    const [access] =
      await tx`select app_private.client_has_access(${f.wsA.id},${target.id}) as allowed`;
    expect(access!.allowed).toBe(true);
    for (const table of [
      'subscriptions',
      'subscription_installments',
      'payment_events',
      'subscription_activations',
    ])
      await tx.unsafe(`grant select on public.${table} to authenticated`);
    await tx`set local role authenticated`;
    for (const table of [
      'subscriptions',
      'subscription_installments',
      'payment_events',
      'subscription_activations',
    ])
      expect(await tx.unsafe(`select * from public.${table}`)).toEqual([]);
    await tx`reset role`;
  });
});

it('T024 foreign and nonexistent users receive the same denial; no target can be supplied', async () => {
  await probe(async (tx) => {
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: randomUUID(), role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    const [result] = await tx`select public.client_self_status() as result`;
    expect(result!.result).toEqual({ status: 'not_permitted' });
    await tx`reset role`;
  });
});
