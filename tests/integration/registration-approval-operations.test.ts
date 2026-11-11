import { afterAll, beforeAll, expect, it } from 'vitest';
import { calculateCommissionMinor } from '../../lib/registration-approval/money';
import { createRecoveryClientTarget } from './client-accounts-fixture';
import {
  clientContext,
  registered,
  request,
  call,
  state,
  sql,
  probe,
  sqlCall,
  publish,
  type Context,
} from './registration-approval-operations-fixture';
const db = sql();
let f: Context;
beforeAll(async () => {
  f = await clientContext();
});
afterAll(() => db.end());
it.each(['po', 'woA'] as const)(
  'T013 %s approval atomically commits one purchase graph and no activation',
  async (role) => {
    const t = await registered(f);
    const result = await call(f.actors[role].client, 'approve', request(f, t));
    expect(result.status).toBe('ok');
    expect(await state(db, t)).toEqual({
      approval_state: 'approved',
      subscriptions: 1,
      installments: 1,
      payments: 1,
      decisions: 1,
      receipts: 1,
      facts: 1,
      activations: 0,
      audits: 2,
    });
    const [row] =
      await db`select price_minor::text,currency,duration_days,commission_rate_bp from public.subscriptions where client_id=${t.id}`;
    expect(row).toEqual({
      price_minor: '1200',
      currency: 'XTS',
      duration_days: 61,
      commission_rate_bp: 17,
    });
    const [event] =
      await db`select e.amount_minor::text,e.commission_minor::text,e.collected_on::text,e.recorded_by from public.payment_events e join public.subscriptions s on s.id=e.subscription_id where s.client_id=${t.id}`;
    expect(event).toEqual({
      amount_minor: '1200',
      commission_minor: '2',
      collected_on: '1900-01-01',
      recorded_by: f.actors[role].userId,
    });
    expect(result.receipt?.recorded_at).toEqual(expect.any(String));
  },
);
it('T013 flexible issued rows copy exactly; only the first full obligation is collected', async () => {
  const rows = [
    { seq: 1, amount_minor: '399', due_offset_days: 2 },
    { seq: 2, amount_minor: '401', due_offset_days: 17 },
    { seq: 3, amount_minor: '400', due_offset_days: 44 },
  ];
  const t = await registered(f, rows);
  const r = await call(f.po.client, 'approve', request(f, t));
  expect(r.status).toBe('ok');
  const saved =
    await db`select i.seq,i.amount_minor::text,i.issued_day_offset as due_offset_days from public.subscription_installments i join public.subscriptions s on s.workspace_id=i.workspace_id and s.id=i.subscription_id where s.client_id=${t.id} order by i.seq`;
  expect(saved).toEqual(rows);
  expect(r.receipt?.amount_minor).toBe('399');
  expect(await state(db, t)).toMatchObject({
    installments: 3,
    payments: 1,
    facts: 1,
    activations: 0,
  });
});
it.each([
  { expected_amount_minor: 1200 },
  { expected_amount_minor: '1199' },
  { expected_amount_minor: '9223372036854775808' },
  { expected_amount_minor: '1e3' },
  { currency: 'USD' },
  { collected_on: '2999-01-01' },
  { collected_on: '2026-02-30' },
  { collected_on: '0000-01-01' },
  { payment_confirmed: false },
  { expected_installment_seq: 2 },
  { payment_method: 'cash' },
  { actor_user_id: 'spoof' },
  { recorded_at: '1900-01-01' },
  { expected_state: 'approved' },
])(
  'T013 malformed or mismatched confirmation creates nothing %#',
  async (extra) => {
    const t = await registered(f),
      before = await state(db, t);
    expect(
      await call(f.po.client, 'approve', request(f, t, 'approve', extra)),
    ).toEqual({ status: 'invalid_input', fields: [] });
    expect(await state(db, t)).toEqual(before);
  },
);
it.each(['audit', 'deferred'] as const)(
  'T013 %s failure returns generic unavailable and rolls back the entire graph',
  async (mode) => {
    const t = await registered(f),
      before = await state(db, t);
    await probe(async (tx) => {
      await tx.unsafe(
        "create function pg_temp.u3_fail() returns trigger language plpgsql as $$ begin raise exception 'U3 synthetic failure' using errcode='23514'; end $$",
      );
      if (mode === 'audit')
        await tx`create trigger u3_fail_audit before insert on public.audit_events for each row when (new.action='client.approved') execute function pg_temp.u3_fail()`;
      else
        await tx`create constraint trigger u3_fail_deferred after insert on app_private.registration_approval_events deferrable initially deferred for each row execute function pg_temp.u3_fail()`;
      expect(await sqlCall(tx, f.po.userId, 'approve', request(f, t))).toEqual({
        status: 'unavailable',
      });
      expect(await state(tx, t)).toEqual(before);
    });
    expect(await state(db, t)).toEqual(before);
  },
);
it('T013 money beyond JS safe integer remains exact through snapshot, collection and safe receipt', async () => {
  const fresh = await clientContext(),
    amount = '9007199254740993';
  const version = await publish(fresh, fresh.p.id, {
    tier_rank: 1,
    price_minor: amount,
  });
  if (version.error) throw new Error('Bigint fixture publication failed');
  fresh.p.versionId = version.data as string;
  const t = await registered(fresh),
    r = await call(
      fresh.po.client,
      'approve',
      request(fresh, t, 'approve', { expected_amount_minor: amount }),
    );
  expect(r.status).toBe('ok');
  expect(r.receipt?.amount_minor).toBe(amount);
  const [row] =
    await db`select e.amount_minor::text,e.commission_minor::text from public.payment_events e join public.subscriptions s on s.id=e.subscription_id where s.client_id=${t.id}`;
  expect(row).toEqual({
    amount_minor: amount,
    commission_minor: calculateCommissionMinor(amount, 17),
  });
});
it('T013 committed signup binding survives consumed/expired link, disabled offer and newer version', async () => {
  const fresh = await clientContext(),
    expires = new Date(Date.now() + 10_000).toISOString(),
    t = await registered(fresh, null, expires);
  const oldVersion = fresh.p.versionId;
  const disabled = await fresh.po.client.rpc('set_package_offer_available', {
    workspace_id: fresh.wsA.id,
    offer_id: fresh.p.offer.id,
    available: false,
  });
  expect(disabled.error).toBeNull();
  expect(
    (await publish(fresh, fresh.p.id, { tier_rank: 1, price_minor: '1300' }))
      .error,
  ).toBeNull();
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, Date.parse(expires) - Date.now() + 5000)),
  );
  const [before] =
    await db`select consumed_at is not null as consumed,expires_at<clock_timestamp() as expired from public.registration_links where id=${t.link}`;
  expect(before).toEqual({ consumed: true, expired: true });
  expect(
    (await call(fresh.po.client, 'approve', request(fresh, t))).status,
  ).toBe('ok');
  const [s] =
    await db`select registration_link_id,package_version_id,price_minor::text from public.subscriptions where client_id=${t.id}`;
  expect(s).toEqual({
    registration_link_id: t.link,
    package_version_id: oldVersion,
    price_minor: '1200',
  });
});

it('T013 committed approval cannot acquire late obligations from a new transaction', async () => {
  const fresh = await clientContext(),
    t = await registered(fresh);
  expect(
    (await call(fresh.po.client, 'approve', request(fresh, t))).status,
  ).toBe('ok');
  await expect(
    probe(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
      await tx`insert into public.subscription_installments(workspace_id,subscription_id,seq,amount_minor,currency,issued_day_offset,source_kind)
   select workspace_id,id,2,1,currency,30,'issued_schedule' from public.subscriptions where client_id=${t.id}`;
    }),
  ).rejects.toMatchObject({
    code: '23514',
    message: 'immutable_installment_schedule',
  });
});

it('T042 real F11 client session observes pending then approved status without signing in again', async () => {
  const client = await createRecoveryClientTarget(f);
  const session = await client.client.auth.getSession();
  expect(session.error).toBeNull();
  expect(session.data.session?.user.id).toBe(client.userId);
  const target = {
    id: client.clientId,
    userId: client.userId,
    link: f.link,
    rows: null,
  };
  const pending = await client.client.rpc('client_self_status');
  expect(pending.error).toBeNull();
  expect(pending.data).toEqual({
    status: 'ok',
    approval_state: 'pending-approval',
  });
  expect((await call(f.po.client, 'approve', request(f, target))).status).toBe(
    'ok',
  );
  const refreshed = await client.client.rpc('client_self_status');
  expect(refreshed.error).toBeNull();
  expect(refreshed.data).toEqual({
    status: 'ok',
    approval_state: 'approved',
  });
});
