import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  clientContext,
  bought,
  paymentRequest,
  pay,
  sqlPay,
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
it('T019 correction negates stored original exactly, books fresh Cairo month, preserves original/client/facts', async () => {
  await probe(async (tx) => {
    const [before] =
      await tx`select to_jsonb(e) as value from public.payment_events e where id=${p.approved.receipt!.event_id as string}`;
    const old = await state(tx, p.t);
    const r = await sqlPay(
      tx,
      f.po.userId,
      'correct',
      paymentRequest(f, p, 'correct'),
    );
    expect(r.status).toBe('ok');
    const [e] =
      await tx`select amount_minor::text,commission_minor::text,collected_on,effective_on::text,(recorded_at at time zone 'Africa/Cairo')::date::text as today,to_char(effective_on,'YYYY-MM') as month,to_char(recorded_at at time zone 'Africa/Cairo','YYYY-MM') as recording_month from public.payment_events where id=${r.receipt!.event_id as string}`;
    expect(e).toMatchObject({
      amount_minor: '-400',
      commission_minor: '-1',
      collected_on: null,
    });
    expect(e!.effective_on).toBe(e!.today);
    expect(e!.month).toBe(e!.recording_month);
    const [original] =
      await tx`select to_jsonb(e) as value from public.payment_events e where id=${p.approved.receipt!.event_id as string}`;
    expect(original).toEqual(before);
    const after = await state(tx, p.t);
    expect(after).toMatchObject({
      approval_state: 'approved',
      subscriptions: old.subscriptions,
      facts: old.facts,
      activations: old.activations,
      payments: old.payments + 1,
      receipts: old.receipts + 1,
    });
    expect(r.receipt).toMatchObject({
      operation: 'correct',
      outcome: 'reversed',
      amount_minor: '-400',
      collected_on: null,
      revision: 2,
    });
  });
});
for (const who of ['woA', 'salesA', 'trainerA'] as const)
  it(`T019 ${who} cannot correct`, async () => {
    expect(
      await pay(
        f.actors[who].client,
        'correct',
        paymentRequest(f, p, 'correct'),
      ),
    ).toEqual({ status: 'not_permitted' });
  });
for (const extra of [
  { amount_minor: '-399' },
  { commission_minor: '0' },
  { collected_on: '1900-01-01' },
  { effective_on: '1900-01-01' },
  { reason: 'text' },
  { correction_confirmed: false },
])
  it(`T019 caller cannot control correction value/date ${JSON.stringify(extra)}`, async () => {
    expect(
      await pay(f.po.client, 'correct', paymentRequest(f, p, 'correct', extra)),
    ).toEqual({ status: 'invalid_input', fields: [] });
  });
it('T019 full recollection of installment 1 requires explicit reversal tail, no activation needed', async () => {
  await probe(async (tx) => {
    const r = await sqlPay(
      tx,
      f.po.userId,
      'correct',
      paymentRequest(f, p, 'correct'),
    );
    expect(r.status).toBe('ok');
    expect(
      await sqlPay(tx, f.po.userId, 'correct', paymentRequest(f, p, 'correct')),
    ).toEqual({ status: 'stale_state' });
    const collect = paymentRequest(f, p, 'collect', {
      obligation_id: p.rows[0]!.id,
      expected_installment_seq: 1,
      expected_revision: 2,
      expected_previous_event_id: r.receipt!.event_id,
    });
    expect((await sqlPay(tx, f.salesA.userId, 'collect', collect)).status).toBe(
      'ok',
    );
    const [net] =
      await tx`select sum(amount_minor)::text as amount,sum(commission_minor)::text as commission from public.payment_events where obligation_id=${p.rows[0]!.id as string}`;
    expect(net).toEqual({ amount: '400', commission: '1' });
  });
});
it('T022 correction audit failure and deferred failure roll back event, receipt and audit together', async () => {
  for (const deferred of [false, true])
    await probe(async (tx) => {
      const before = await state(tx, p.t);
      if (deferred) {
        await tx`create function app_private.u4_fail() returns trigger language plpgsql as $$begin raise exception 'synthetic'; end$$`;
        await tx`create constraint trigger u4_fail after insert on public.payment_events deferrable initially deferred for each row execute function app_private.u4_fail()`;
      } else {
        await tx`create function app_private.u4_fail() returns trigger language plpgsql as $$begin raise exception 'synthetic'; end$$`;
        await tx`create trigger u4_fail before insert on public.audit_events for each row execute function app_private.u4_fail()`;
      }
      expect(
        await sqlPay(
          tx,
          f.po.userId,
          'correct',
          paymentRequest(f, p, 'correct'),
        ),
      ).toEqual({ status: 'unavailable' });
      expect(await state(tx, p.t)).toEqual(before);
    });
});
