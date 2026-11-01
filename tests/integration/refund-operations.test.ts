import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  clientContext,
  graph,
  probe,
  sql,
  type Context,
} from './registration-approval-fixture';

const db = sql();
afterAll(() => db.end());

type RefundRequest = {
  workspace_id: string;
  client_id: string;
  purchase_id: string;
  request_key: string;
  amount_minor: string;
  external_confirmation: true;
};

async function refund(
  tx: TransactionSql,
  userId: string,
  request: RefundRequest,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select public.record_refund(${tx.json(request)}) as result`;
    return row!.result as {
      status: string;
      receipt?: Record<string, unknown>;
    };
  } finally {
    await tx`reset role`;
  }
}

function request(
  f: Context,
  ids: Awaited<ReturnType<typeof graph>>,
): RefundRequest {
  return {
    workspace_id: f.wsA.id,
    client_id: ids.client,
    purchase_id: ids.subscription,
    request_key: randomUUID(),
    amount_minor: '600',
    external_confirmation: true,
  };
}

it('records an atomic capped refund and replays its exact authorized receipt', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    const input = request(f, ids);
    const first = await refund(tx, f.po.userId, input);
    expect(first.status).toBe('ok');
    expect(first.receipt).toMatchObject({
      workspace_id: f.wsA.id,
      client_id: ids.client,
      purchase_id: ids.subscription,
      amount_minor: '600',
      currency: 'XTS',
    });
    expect(Object.keys(first.receipt ?? {}).sort()).toEqual(
      [
        'amount_minor',
        'client_id',
        'currency',
        'operation_id',
        'purchase_id',
        'workspace_id',
      ].sort(),
    );

    const replay = await refund(tx, f.po.userId, input);
    expect(replay).toEqual(first);
    const changed = await refund(tx, f.po.userId, {
      ...input,
      amount_minor: '601',
    });
    expect(changed.status).toBe('key_conflict');

    const [counts] = await tx`
      select
        (select count(*)::int from public.refund_operations where client_id=${ids.client}) as refunds,
        (select count(*)::int from public.refund_allocation_events where subscription_id=${ids.subscription}) as allocations,
        (select count(*)::int from app_private.client_deactivation_state where client_id=${ids.client}) as deactivation,
        (select count(*)::int from app_private.refund_auth_lockouts where client_id=${ids.client}) as lockouts,
        (select count(*)::int from app_private.registration_operations where actor_user_id=${f.po.userId} and request_key=${input.request_key}) as receipts,
        (select count(*)::int from public.clients where id=${ids.client} and approval_state='approved' and deactivated_at is not null) as inactive_clients`;
    expect(counts).toEqual({
      refunds: 1,
      allocations: 1,
      deactivation: 1,
      lockouts: 1,
      receipts: 1,
      inactive_clients: 1,
    });

    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
    const [client] = await tx`
      select auth_user_id from public.clients where id=${ids.client}`;
    await tx`set local role authenticated`;
    try {
      const [queue] = await tx`
        select public.workspace_payment_queue(${f.wsA.id}) as result`;
      expect(
        (queue!.result as { items: { client_id: string }[] }).items,
      ).not.toContainEqual(expect.objectContaining({ client_id: ids.client }));

      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client!.auth_user_id, role: 'authenticated' })},true)`;
      const [status] = await tx`select public.client_self_status() as result`;
      expect(status!.result).toEqual({ status: 'not_permitted' });
    } finally {
      await tx`reset role`;
    }
  });
});

it('rejects a client deactivation transition without a same-transaction refund link', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    const [client] = await tx`
      select auth_user_id from public.clients where id=${ids.client}`;
    const timestamp = new Date('2026-10-30T12:00:00.000Z');
    await tx`insert into app_private.client_deactivation_state(client_id,auth_user_id,deactivated_at)
      values(${ids.client},${client!.auth_user_id},${timestamp})`;
    await expect(
      tx`update public.clients set deactivated_at=${timestamp} where id=${ids.client}`,
    ).rejects.toMatchObject({ code: '23514' });
  });
});

it('rejects an over-balance refund without writing any financial or lockout facts', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    const result = await refund(tx, f.po.userId, {
      ...request(f, ids),
      amount_minor: '1201',
    });
    expect(result.status).toBe('invalid_input');
    const [counts] = await tx`
      select
        (select count(*)::int from public.refund_operations where client_id=${ids.client}) as refunds,
        (select count(*)::int from public.refund_allocation_events where subscription_id=${ids.subscription}) as allocations,
        (select count(*)::int from app_private.client_deactivation_state where client_id=${ids.client}) as deactivation,
        (select count(*)::int from app_private.refund_auth_lockouts where client_id=${ids.client}) as lockouts`;
    expect(counts).toEqual({
      refunds: 0,
      allocations: 0,
      deactivation: 0,
      lockouts: 0,
    });
  });
});

it('grants Auth lockout worker access only through narrow SECURITY DEFINER RPCs', async () => {
  const functions = [
    'claim_refund_auth_lockout_jobs(integer)',
    'complete_refund_auth_lockout_job(uuid,timestamp with time zone)',
    'retry_refund_auth_lockout_job(uuid,integer,timestamp with time zone,text)',
  ];
  for (const signature of functions) {
    const [row] = await db`
      select p.prosecdef as security_definer,
        has_function_privilege('service_role',p.oid,'execute') as service_role,
        has_function_privilege('authenticated',p.oid,'execute') as authenticated,
        has_function_privilege('anon',p.oid,'execute') as anon,
        has_function_privilege('public',p.oid,'execute') as public
      from pg_proc p where p.oid=to_regprocedure(${`public.${signature}`})`;
    expect(row).toEqual({
      security_definer: true,
      service_role: true,
      authenticated: false,
      anon: false,
      public: false,
    });
  }
  for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    const [row] = await db`
      select has_table_privilege('service_role','app_private.refund_auth_lockouts',${privilege}) as allowed`;
    expect(row!.allowed).toBe(false);
  }
});

it('keeps sensitive Auth outbox columns inaccessible to the service role directly', async () => {
  const [row] = await db`
    select has_table_privilege('service_role','app_private.refund_auth_lockouts','SELECT') as select_table,
      has_column_privilege('service_role','app_private.refund_auth_lockouts','auth_user_id','SELECT') as select_user,
      has_column_privilege('service_role','app_private.refund_auth_lockouts','safe_error_code','SELECT') as select_error`;
  expect(row).toEqual({
    select_table: false,
    select_user: false,
    select_error: false,
  });
});
