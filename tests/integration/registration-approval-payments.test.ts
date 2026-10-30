import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  clientContext,
  bought,
  paymentRequest,
  pay,
  sqlPay,
  activate,
  probe,
  sql,
  state,
  type Context,
  type Purchase,
} from './registration-approval-payment-fixture';
const db = sql();
let f: Context;
let p: Purchase;
beforeAll(async () => {
  f = await clientContext();
  p = await bought(f);
});
afterAll(() => db.end());
it('T018 later collection requires activation; approval alone is insufficient', async () => {
  expect(await pay(f.po.client, 'collect', paymentRequest(f, p))).toEqual({
    status: 'stale_state',
  });
});
for (const who of ['po', 'woA', 'salesA'] as const)
  it(`T018 ${who} full early collection after activation, past date, exact snapshot commission`, async () => {
    await probe(async (tx) => {
      await activate(tx, f, p);
      const r = await sqlPay(
        tx,
        f[who].userId,
        'collect',
        paymentRequest(f, p),
      );
      expect(r.status).toBe('ok');
      const [e] =
        await tx`select amount_minor::text,commission_minor::text,collected_on::text,effective_on::text,recorded_by from public.payment_events where id=${r.receipt!.event_id as string}`;
      expect(e).toEqual({
        amount_minor: '400',
        commission_minor: '1',
        collected_on: '1900-01-01',
        effective_on: '1900-01-01',
        recorded_by: f[who].userId,
      });
      expect(r.receipt).toMatchObject({
        operation: 'collect',
        outcome: 'collected',
        revision: 1,
        installment_seq: 2,
        amount_minor: '400',
      });
    });
  });
it('T018 later sequence requires every earlier obligation currently paid, even after correction', async () => {
  await probe(async (tx) => {
    await activate(tx, f, p);
    const third = paymentRequest(f, p, 'collect', {
      obligation_id: p.rows[2]!.id,
      expected_installment_seq: 3,
    });
    expect(await sqlPay(tx, f.po.userId, 'collect', third)).toEqual({
      status: 'stale_state',
    });
    expect(
      (await sqlPay(tx, f.po.userId, 'collect', paymentRequest(f, p))).status,
    ).toBe('ok');
    expect(
      (
        await sqlPay(
          tx,
          f.po.userId,
          'correct',
          paymentRequest(f, p, 'correct'),
        )
      ).status,
    ).toBe('ok');
    expect(await sqlPay(tx, f.po.userId, 'collect', third)).toEqual({
      status: 'stale_state',
    });
  });
});
for (const extra of [
  { expected_amount_minor: '399' },
  { expected_amount_minor: 400 },
  { currency: 'USD' },
  { collected_on: '9999-12-31' },
  { collected_on: '2025-02-29' },
  { payment_confirmed: false },
  { method: 'cash' },
  { reference: 'x' },
  { recorded_by: randomUUID() },
  { expected_revision: -1 },
  { expected_installment_seq: 1.5 },
])
  it(`T018 invalid collection ${JSON.stringify(extra)} writes nothing`, async () => {
    await probe(async (tx) => {
      await activate(tx, f, p);
      const before = await state(tx, p.t);
      expect(
        await sqlPay(
          tx,
          f.po.userId,
          'collect',
          paymentRequest(f, p, 'collect', extra),
        ),
      ).toEqual({ status: 'invalid_input', fields: [] });
      expect(await state(tx, p.t)).toEqual(before);
    });
  });
it('T018 stale revision/predecessor/seq cannot drift to a different obligation', async () => {
  await probe(async (tx) => {
    await activate(tx, f, p);
    for (const extra of [
      { expected_revision: 1 },
      { expected_previous_event_id: p.approved.receipt!.event_id },
      { expected_installment_seq: 3 },
    ])
      expect(
        await sqlPay(
          tx,
          f.po.userId,
          'collect',
          paymentRequest(f, p, 'collect', extra),
        ),
      ).toEqual({ status: 'stale_state' });
  });
});
it('T018 all U4 foreign/nonexistent targets and disallowed roles have generic denial', async () => {
  for (const kind of ['collect', 'correct'] as const) {
    const denied =
      kind === 'collect'
        ? (['trainerB', 'noProfile', 'revoked'] as const)
        : (['trainerA', 'trainerB', 'noProfile', 'revoked'] as const);
    for (const who of denied)
      expect(
        await pay(f.actors[who].client, kind, paymentRequest(f, p, kind)),
      ).toEqual({ status: 'not_permitted' });
    if (kind === 'collect')
      expect(
        (await pay(f.actors.trainerA.client, kind, paymentRequest(f, p, kind)))
          .status,
      ).not.toBe('not_permitted');
    for (const extra of [
      { workspace_id: randomUUID() },
      { workspace_id: f.wsB.id },
      { client_id: randomUUID() },
      { subscription_id: randomUUID() },
      { obligation_id: randomUUID() },
    ])
      expect(
        await pay(f.po.client, kind, paymentRequest(f, p, kind, extra)),
      ).toEqual({ status: 'not_permitted' });
  }
});
it('T018 Cairo today is accepted without a signup lower bound', async () => {
  await probe(async (tx) => {
    await activate(tx, f, p);
    const [today] =
      await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as day`;
    expect(
      (
        await sqlPay(
          tx,
          f.po.userId,
          'collect',
          paymentRequest(f, p, 'collect', { collected_on: today!.day }),
        )
      ).status,
    ).toBe('ok');
  });
});
