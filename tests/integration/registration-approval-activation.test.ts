import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  bought,
  activate,
  sql,
  type Context,
  type Purchase,
} from './registration-approval-payment-fixture';
import { probe } from './registration-approval-fixture';
import {
  registered,
  request,
  sqlCall,
} from './registration-approval-operations-fixture';
import { randomUUID } from 'node:crypto';

const db = sql();
let f: Context;
let p: Purchase;
beforeAll(async () => {
  f = await (
    await import('./registration-approval-payment-fixture')
  ).clientContext();
  p = await bought(f);
});
afterAll(() => db.end());

it('T025 later due dates are undefined before activation and use each immutable issued offset after it', async () => {
  await probe(async (tx) => {
    const read = async () => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [row] =
        await tx`select public.subscription_payment_status(${f.wsA.id},${p.t.id},${p.sid}) as result`;
      await tx`reset role`;
      return row!.result;
    };
    const before = await read();
    expect(before).toMatchObject({ status: 'ok' });
    expect(
      before.obligations.map(
        (x: { seq: number; due_on: string | null }) => x.due_on,
      ),
    ).toEqual([null, null, null]);
    await activate(tx, f, p);
    const after = await read();
    const [activation] =
      await tx`select activated_at from public.subscription_activations where subscription_id=${p.sid}`;
    const [dueDates] =
      await tx`select array[((${activation!.activated_at} at time zone 'Africa/Cairo')::date+30)::text,((${activation!.activated_at} at time zone 'Africa/Cairo')::date+60)::text] as days`;
    expect(
      after.obligations.map(
        (x: { seq: number; due_on: string | null }) => x.due_on,
      ),
    ).toEqual([null, ...dueDates!.days]);
  });
});

it('T025 exact custom offsets survive across Cairo date and DST boundaries', async () => {
  await probe(async (tx) => {
    const fixture = await registered(f, [
      { seq: 1, amount_minor: '400', due_offset_days: 9 },
      { seq: 2, amount_minor: '400', due_offset_days: 17 },
      { seq: 3, amount_minor: '400', due_offset_days: 53 },
    ]);
    const result = await sqlCall(
      tx,
      f.po.userId,
      'approve',
      request(f, fixture),
    );
    expect(result.status).toBe('ok');
    const activation = new Date('2026-10-24T21:30:00Z');
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id, activation_source) values(${f.wsA.id},${result.receipt!.subscription_id as string},${activation},${randomUUID()}, 'po_override')`;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    const [projected] =
      await tx`select public.subscription_payment_status(${f.wsA.id},${fixture.id},${result.receipt!.subscription_id as string}) as result`;
    await tx`reset role`;
    expect(
      projected!.result.obligations.map(
        (x: { due_on: string | null }) => x.due_on,
      ),
    ).toEqual([null, '2026-11-11', '2026-12-17']);
    const [rows] =
      await tx`select array_agg(issued_day_offset order by seq) as offsets from public.subscription_installments where subscription_id=${result.receipt!.subscription_id as string}`;
    expect(rows!.offsets).toEqual([9, 17, 53]);
  });
});
