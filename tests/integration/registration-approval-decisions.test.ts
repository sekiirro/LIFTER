import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  clientContext,
  registered,
  request,
  call,
  state,
  sql,
  type Context,
  type Target,
} from './registration-approval-operations-fixture';
const db = sql();
let f: Context;
beforeAll(async () => {
  f = await clientContext();
});
afterAll(() => db.end());
async function identity(t: Target) {
  const [r] =
    await db`select md5((to_jsonb(c)-'approval_state')::text) as client,md5(to_jsonb(u)::text) as auth,md5(to_jsonb(l)::text) as link,md5(to_jsonb(k)::text) as claims,(select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)::text) from public.recovery_link_issuances r where r.target_user_id=c.auth_user_id) as recovery from public.clients c join auth.users u on u.id=c.auth_user_id join public.registration_links l on l.id=c.registration_link_id join app_private.account_identifier_claims k on k.auth_user_id=c.auth_user_id where c.id=${t.id}`;
  return r;
}
it.each(['po', 'woA'] as const)(
  'T014 %s rejection changes only approval state and records the single reason',
  async (role) => {
    const t = await registered(f),
      before = await identity(t);
    expect(
      (await call(f.actors[role].client, 'reject', request(f, t, 'reject')))
        .status,
    ).toBe('ok');
    expect(await state(db, t)).toEqual({
      approval_state: 'rejected',
      subscriptions: 0,
      installments: 0,
      payments: 0,
      decisions: 1,
      receipts: 1,
      facts: 0,
      activations: 0,
      audits: 1,
    });
    expect(await identity(t)).toEqual(before);
    const [d] =
      await db`select rejection_reason_code from app_private.registration_decisions where client_id=${t.id}`;
    expect(d?.rejection_reason_code).toBe('registration_rejected');
  },
);
it.each([
  { reason_code: 'duplicate_account' },
  { reason_code: null },
  { reason: 'free text' },
  { payment_confirmed: true },
])(
  'T014 unapproved rejection shape fails without transition %#',
  async (extra) => {
    const t = await registered(f),
      before = await state(db, t);
    expect(
      await call(f.po.client, 'reject', request(f, t, 'reject', extra)),
    ).toEqual({ status: 'invalid_input', fields: [] });
    expect(await state(db, t)).toEqual(before);
  },
);
it('T014 only PO can reconsider; stale normal approval never reopens a rejected client', async () => {
  const t = await registered(f),
    before = await identity(t);
  expect(
    (await call(f.woA.client, 'reject', request(f, t, 'reject'))).status,
  ).toBe('ok');
  expect(
    await call(f.woA.client, 'reconsider', request(f, t, 'reconsider')),
  ).toEqual({ status: 'not_permitted' });
  expect(
    await call(f.salesA.client, 'reconsider', request(f, t, 'reconsider')),
  ).toEqual({ status: 'not_permitted' });
  expect(await call(f.po.client, 'approve', request(f, t))).toEqual({
    status: 'stale_state',
  });
  expect(
    (await call(f.po.client, 'reconsider', request(f, t, 'reconsider'))).status,
  ).toBe('ok');
  expect(await state(db, t)).toMatchObject({
    approval_state: 'approved',
    subscriptions: 1,
    payments: 1,
    decisions: 2,
    receipts: 2,
    facts: 1,
    audits: 3,
    activations: 0,
  });
  expect(await identity(t)).toEqual(before);
  expect(
    await call(f.po.client, 'reconsider', request(f, t, 'reconsider')),
  ).toEqual({ status: 'stale_state' });
});
it.each([
  'salesA',
  'trainerA',
  'woB',
  'revoked',
  'noProfile',
  'client',
] as const)(
  'T014 %s cannot approve or reject even through direct RPC',
  async (role) => {
    const t = await registered(f),
      before = await state(db, t);
    for (const kind of ['approve', 'reject'] as const)
      expect(
        await call(f.actors[role].client, kind, request(f, t, kind)),
      ).toEqual({ status: 'not_permitted' });
    expect(await state(db, t)).toEqual(before);
  },
);
it('T014 PO targets must exist; foreign/nonexistent workspace and target denial is identical', async () => {
  const t = await registered(f);
  for (const input of [
    { workspace_id: randomUUID() },
    { workspace_id: f.wsB.id },
    { client_id: randomUUID() },
  ])
    for (const kind of ['approve', 'reject', 'reconsider'] as const)
      expect(await call(f.po.client, kind, request(f, t, kind, input))).toEqual(
        { status: 'not_permitted' },
      );
  expect(
    await call(
      f.woA.client,
      'approve',
      request(f, t, 'approve', { workspace_id: f.wsB.id }),
    ),
  ).toEqual({ status: 'not_permitted' });
  expect(await state(db, t)).toMatchObject({
    approval_state: 'pending-approval',
    receipts: 0,
  });
});
