import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  clientContext,
  registered,
  request,
  call,
  state,
  sql,
  approver,
  worker,
  waitForLock,
  sqlCall,
  type Context,
  type Result,
} from './registration-approval-operations-fixture';
const db = sql();
let f: Context;
beforeAll(async () => {
  f = await clientContext();
});
afterAll(() => db.end());
it('T015 exact replay is byte-identical and has only the safe receipt allow-list', async () => {
  const t = await registered(f),
    input = request(f, t),
    first = await call(f.po.client, 'approve', input);
  expect(first.status).toBe('ok');
  const before = await state(db, t);
  expect(await call(f.po.client, 'approve', input)).toEqual(first);
  expect(await state(db, t)).toEqual(before);
  expect(Object.keys(first.receipt!).sort()).toEqual(
    [
      'id',
      'operation',
      'workspace_id',
      'client_id',
      'subscription_id',
      'obligation_id',
      'event_id',
      'installment_seq',
      'revision',
      'outcome',
      'amount_minor',
      'currency',
      'collected_on',
      'recorded_at',
    ].sort(),
  );
  expect(JSON.stringify(first)).not.toMatch(
    /commission|rate|email|phone|token|hash|password|name|args|secret/,
  );
  const [row] =
    await db`select result_receipt from app_private.registration_operations where client_id=${t.id}`;
  expect(row?.result_receipt).toEqual(first);
});
it('T015 replay key is bound to canonical date, amount, currency, operation and target', async () => {
  const t = await registered(f),
    other = await registered(f),
    input = request(f, t);
  expect((await call(f.po.client, 'approve', input)).status).toBe('ok');
  for (const extra of [
    { collected_on: '1900-01-02' },
    { expected_amount_minor: '1201' },
    { currency: 'USD' },
    { client_id: other.id },
    { payment_confirmed: false },
    { expected_installment_seq: 2 },
    { expected_state: 'approved' },
  ])
    expect(await call(f.po.client, 'approve', { ...input, ...extra })).toEqual({
      status: 'key_conflict',
    });
  expect(
    await call(
      f.po.client,
      'reject',
      request(f, t, 'reject', { request_key: input.request_key }),
    ),
  ).toEqual({ status: 'key_conflict' });
  expect(await call(f.woA.client, 'approve', input)).toEqual({
    status: 'stale_state',
  });
  expect(await state(db, other)).toMatchObject({
    approval_state: 'pending-approval',
    receipts: 0,
  });
});
it('T015 authorized uppercase UUID spelling replays the same normalized intent', async () => {
  const t = await registered(f),
    input = request(f, t),
    first = await call(f.po.client, 'approve', input);
  expect(first.status).toBe('ok');
  expect(
    await call(f.po.client, 'approve', {
      ...input,
      workspace_id: String(input.workspace_id).toUpperCase(),
      client_id: t.id.toUpperCase(),
      request_key: String(input.request_key).toUpperCase(),
    }),
  ).toEqual(first);
});
it('T015 different-key approval/rejection race commits exactly one outcome', async () => {
  const t = await registered(f);
  const outcomes = await Promise.all([
    call(f.po.client, 'approve', request(f, t)),
    call(f.woA.client, 'reject', request(f, t, 'reject')),
  ]);
  expect(outcomes.map((r) => r.status).sort()).toEqual(['ok', 'stale_state']);
  const after = await state(db, t);
  expect(after.decisions).toBe(1);
  expect(after.receipts).toBe(1);
  expect(after.facts).toBe(after.approval_state === 'approved' ? 1 : 0);
  expect(after.payments).toBe(after.facts);
});
it('T015 identical concurrent approval returns the same receipt once', async () => {
  const t = await registered(f),
    input = request(f, t);
  const results = await Promise.all([
    call(f.po.client, 'approve', input),
    call(f.po.client, 'approve', input),
  ]);
  expect(results[0]?.status).toBe('ok');
  expect(results[1]).toEqual(results[0]);
  expect(await state(db, t)).toMatchObject({
    subscriptions: 1,
    receipts: 1,
    decisions: 1,
    payments: 1,
    facts: 1,
    audits: 2,
  });
});
it('T015 same actor/key racing across two authorized clients binds one target', async () => {
  const a = await registered(f),
    b = await registered(f),
    key = randomUUID();
  const results = await Promise.all([
    call(
      f.po.client,
      'approve',
      request(f, a, 'approve', { request_key: key }),
    ),
    call(
      f.po.client,
      'approve',
      request(f, b, 'approve', { request_key: key }),
    ),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual(['key_conflict', 'ok']);
  expect((await state(db, a)).receipts + (await state(db, b)).receipts).toBe(1);
});
it('T015 authorization precedes receipt, stale-state and key-conflict disclosure', async () => {
  const actor = await approver(f),
    t = await registered(f),
    input = request(f, t);
  expect((await call(actor.client, 'approve', input)).status).toBe('ok');
  await db`update public.staff_profiles set role='sales' where user_id=${actor.userId}`;
  expect(await call(actor.client, 'approve', input)).toEqual({
    status: 'not_permitted',
  });
  expect(
    await call(actor.client, 'approve', {
      ...input,
      collected_on: '1900-01-02',
    }),
  ).toEqual({ status: 'not_permitted' });
});
it.each(['role', 'membership'] as const)(
  'T015 revocation during target wait denies replay: %s',
  async (mode) => {
    const actor = await approver(f),
      t = await registered(f),
      input = request(f, t);
    expect((await call(actor.client, 'approve', input)).status).toBe('ok');
    const before = await state(db, t);
    const label = 'f12-u3-' + randomUUID(),
      blocker = sql(),
      pending = worker(label);
    let flight: Promise<Result> | undefined;
    try {
      await blocker.begin(async (tx) => {
        await tx`select id from public.clients where id=${t.id} for update`;
        flight = pending.begin(async (workerTx) =>
          sqlCall(workerTx, actor.userId, 'approve', input),
        ) as unknown as Promise<Result>;
        // Attach a handler immediately: a missing RPC in RED must not leak an unhandled rejection.
        void flight.catch(() => undefined);
        expect(await waitForLock(db, label)).toBe(true);
        if (mode === 'role')
          await db`update public.staff_profiles set role='trainer' where user_id=${actor.userId}`;
        else
          await db`update public.workspace_memberships set revoked_at=now(),revoked_by=${f.po.userId} where workspace_id=${f.wsA.id} and user_id=${actor.userId} and revoked_at is null`;
      });
      expect(await flight).toEqual({ status: 'not_permitted' });
      expect(await state(db, t)).toEqual(before);
    } finally {
      if (flight) await flight.catch(() => undefined);
      await pending.end();
      await blocker.end();
    }
  },
);
it('T015 anonymous and service_role have no RPC EXECUTE; private primitives are sealed', async () => {
  const signatures = [
    'public.registration_approve(jsonb)',
    'public.registration_reject(jsonb)',
    'public.registration_reconsider(jsonb)',
    'app_private.f12_u3_can_decide(uuid,boolean)',
    'app_private.f12_u3_lock_authorization(uuid,boolean)',
    'app_private.f12_u3_canonical(text,jsonb)',
    'app_private.f12_u3_purchase(uuid,uuid,uuid,uuid,text,date,timestamptz)',
    'app_private.f12_u3_operation(text,jsonb)',
  ];
  for (const signature of signatures) {
    const [row] =
      await db`select prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid=to_regprocedure(${signature})`;
    expect(row).toEqual({
      prosecdef: true,
      proconfig: ['search_path=""'],
      owner: 'postgres',
    });
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const [g] =
        await db`select has_function_privilege(${role},${signature},'EXECUTE') as allowed`;
      expect(g?.allowed).toBe(
        signature.startsWith('public.') && role === 'authenticated',
      );
    }
  }
  const t = await registered(f);
  expect(await call(f.actors.anon.client, 'approve', request(f, t))).toEqual({
    status: 'rpc_error',
    code: '42501',
  });
});
