import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createRecoveryClientTarget } from './client-accounts-fixture';
import { admin } from './harness';
import {
  bought,
  paymentRequest,
  pay,
  sqlPay,
} from './registration-approval-payment-fixture';
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
  type Request as OperationRequest,
  type Result,
} from './registration-approval-operations-fixture';
const db = sql();
it('T042 global Auth revocation prevents a real F11 client session from refreshing', async () => {
  const context = await clientContext();
  const target = await createRecoveryClientTarget(context);
  const session = await target.client.auth.getSession();
  const accessToken = session.data.session?.access_token;
  expect(accessToken).toBeTruthy();
  const revoked = await admin().auth.admin.signOut(accessToken!, 'global');
  expect(revoked.error).toBeNull();
  const refresh = await target.client.auth.refreshSession();
  expect(refresh.error).not.toBeNull();
});
it('T020 distinct-key concurrent correction serializes to one success and one stale', async () => {
  const p = await bought(f);
  const results = await Promise.all([
    pay(f.po.client, 'correct', paymentRequest(f, p, 'correct')),
    pay(f.po.client, 'correct', paymentRequest(f, p, 'correct')),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual(['ok', 'stale_state']);
});
it('T020 exact correction replay is stable; intent drift conflicts; collection namespace is shared', async () => {
  const p = await bought(f);
  const input = paymentRequest(f, p, 'correct');
  const r = await pay(f.po.client, 'correct', input);
  expect(r.status).toBe('ok');
  const before = await state(db, p.t);
  expect(await pay(f.po.client, 'correct', input)).toEqual(r);
  expect(
    await pay(f.po.client, 'correct', { ...input, expected_revision: 2 }),
  ).toEqual({ status: 'key_conflict' });
  expect(
    await pay(
      f.po.client,
      'collect',
      paymentRequest(f, p, 'collect', { request_key: input.request_key }),
    ),
  ).toEqual({ status: 'key_conflict' });
  expect(await state(db, p.t)).toEqual(before);
  expect(JSON.stringify(r)).not.toMatch(
    /commission|rate|phone|email|token|hash|secret/,
  );
});
it('T020 concurrent recollection and repeated correction share subscription serialization', async () => {
  const p = await bought(f);
  const reversed = await pay(
    f.po.client,
    'correct',
    paymentRequest(f, p, 'correct'),
  );
  expect(reversed.status).toBe('ok');
  const input = paymentRequest(f, p, 'collect', {
    obligation_id: p.rows[0]!.id,
    expected_installment_seq: 1,
    expected_revision: 2,
    expected_previous_event_id: reversed.receipt!.event_id,
  });
  const results = await Promise.all([
    pay(f.po.client, 'collect', input),
    pay(f.salesA.client, 'collect', { ...input, request_key: randomUUID() }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual(['ok', 'stale_state']);
  expect(
    await pay(f.po.client, 'correct', paymentRequest(f, p, 'correct')),
  ).toEqual({ status: 'stale_state' });
  const result = results.find((r) => r.status === 'ok')!;
  expect(
    (
      await pay(
        f.po.client,
        'correct',
        paymentRequest(f, p, 'correct', {
          expected_revision: 3,
          expected_previous_event_id: result.receipt!.event_id,
          original_event_id: result.receipt!.event_id,
        }),
      )
    ).status,
  ).toBe('ok');
});
it('T020 subscription lock blocks cross-obligation operations', async () => {
  const p = await bought(f),
    label = 'u4-lock-' + randomUUID(),
    pending = worker(label),
    blocker = sql();
  let flight: Promise<Result> | undefined;
  try {
    await blocker.begin(async (tx) => {
      await tx`select id from public.subscriptions where id=${p.sid} for update`;
      flight = pending.begin((tx) =>
        sqlPay(tx, f.po.userId, 'correct', paymentRequest(f, p, 'correct')),
      ) as unknown as Promise<Result>;
      void flight.catch(() => undefined);
      expect(await waitForLock(db, label)).toBe(true);
    });
    expect((await flight)!.status).toBe('ok');
  } finally {
    if (flight) await flight.catch(() => undefined);
    await pending.end();
    await blocker.end();
  }
});
it.each(['role', 'membership'] as const)(
  'T020 replay denies authorization revocation after target wait: %s',
  async (mode) => {
    const actor = mode === 'role' ? f.po : await approver(f),
      p = await bought(f);
    const kind = mode === 'role' ? 'correct' : 'collect';
    let input: OperationRequest;
    if (mode === 'role') {
      input = paymentRequest(f, p, 'correct');
      const first = await pay(actor.client, 'correct', input);
      expect(first.status).toBe('ok');
      expect(await pay(actor.client, 'correct', input)).toEqual(first);
    } else {
      const reversal = await pay(
        f.po.client,
        'correct',
        paymentRequest(f, p, 'correct'),
      );
      expect(reversal.status).toBe('ok');
      input = paymentRequest(f, p, 'collect', {
        obligation_id: p.rows[0]!.id,
        expected_installment_seq: 1,
        expected_revision: 2,
        expected_previous_event_id: reversal.receipt!.event_id,
      });
      expect((await pay(actor.client, 'collect', input)).status).toBe('ok');
    }
    const label = 'u4-revoke-' + randomUUID(),
      pending = worker(label),
      blocker = sql();
    let flight: Promise<Result> | undefined;
    try {
      await blocker.begin(async (tx) => {
        await tx`select id from public.clients where id=${p.t.id} for update`;
        flight = pending.begin((tx) =>
          sqlPay(tx, actor.userId, kind, input),
        ) as unknown as Promise<Result>;
        void flight.catch(() => undefined);
        expect(await waitForLock(db, label)).toBe(true);
        if (mode === 'role')
          await db`update public.staff_profiles set role='trainer' where user_id=${actor.userId}`;
        else
          await db`update public.workspace_memberships set revoked_at=now(),revoked_by=${f.po.userId} where workspace_id=${f.wsA.id} and user_id=${actor.userId} and revoked_at is null`;
      });
      expect(await flight).toEqual({ status: 'not_permitted' });
    } finally {
      if (flight) await flight.catch(() => undefined);
      if (mode === 'role')
        await db`update public.staff_profiles set role='platform_owner' where user_id=${actor.userId}`;
      await pending.end();
      await blocker.end();
    }
  },
);
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
    { currency: 'EGP' },
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
