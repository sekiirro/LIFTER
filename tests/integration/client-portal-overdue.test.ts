import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  bought,
  clientContext,
  paymentRequest,
  probe,
  sql,
  sqlPay,
  type Context,
  type Purchase,
} from './registration-approval-payment-fixture';
import { asUser } from './client-portal-fixture';

// F22 T018 (FR-006, FR-007): the F13 FR-028 overdue input restricts every client
// plan read. Synthetic data only; every state is created in a rolled-back probe.
const db = sql();
let f: Context;
let p: Purchase; // the overdue / non-overdue subject
let other: Purchase; // same workspace, never overdue (isolation)
beforeAll(async () => {
  f = await clientContext();
  // Real approval: installments 1..3 of 400 at offsets 0/30/60 days.
  p = await bought(f);
  other = await bought(f);
});
afterAll(() => db.end());

async function activateDaysAgo(
  tx: TransactionSql,
  purchase: Purchase,
  days: number,
) {
  // F19 T021 guard: a synthetic activation without deliveries is a PO override.
  await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
    values(${f.wsA.id},${purchase.sid},(((statement_timestamp() at time zone 'Africa/Cairo')::date - ${days}::int)::timestamp at time zone 'Africa/Cairo') + interval '10 hours',gen_random_uuid(),'po_override')`;
}
async function authUser(tx: TransactionSql, purchase: Purchase) {
  const [c] =
    await tx`select auth_user_id from public.clients where id=${purchase.t.id}`;
  return c!.auth_user_id as string;
}
async function summary(
  tx: TransactionSql,
  ws: string,
  clientId: string,
): Promise<Record<string, unknown> | null> {
  const [r] =
    await tx`select app_private.f22_subscription_summary(${ws}::uuid,${clientId}::uuid) as v`;
  return r!.v as Record<string, unknown> | null;
}
type Reads = {
  overview: Record<string, unknown>;
  plan: Record<string, unknown>;
  nutrition: Record<string, unknown>;
  workout: Record<string, unknown>;
};
async function reads(tx: TransactionSql, user: string): Promise<Reads> {
  return asUser(tx, user, async (inner) => {
    const id = randomUUID();
    const [o] = await inner`select public.client_portal_overview() as v`;
    const [pl] =
      await inner`select public.client_portal_plan(${id}::uuid,null::integer) as v`;
    const [n] =
      await inner`select public.client_portal_nutrition_plan(${id}::uuid,null::integer) as v`;
    const [w] =
      await inner`select public.client_portal_workout_plan(${id}::uuid,null::integer) as v`;
    return {
      workout: w!.v as Record<string, unknown>,
      overview: o!.v as Record<string, unknown>,
      plan: pl!.v as Record<string, unknown>,
      nutrition: n!.v as Record<string, unknown>,
    };
  });
}
async function mutate(
  tx: TransactionSql,
  signature: string,
  from: string,
  to: string,
) {
  const [d] =
    await tx`select pg_get_functiondef(${signature}::regprocedure) as def`;
  const def = d!.def as string;
  expect(def.split(from).length - 1, 'mutation target occurrences').toBe(1);
  await tx.unsafe(def.replaceAll(from, to));
}

describe('F22 overdue plan restriction (T018)', () => {
  it('reports overdue in the summary while keeping F13 status and end date', async () => {
    await probe(async (tx) => {
      await activateDaysAgo(tx, p, 5);
      expect(await summary(tx, f.wsA.id, p.t.id)).toMatchObject({
        status: 'active',
        overdue: false,
      });
    });
    await probe(async (tx) => {
      // 45 Cairo days: installment 2 (due on day 30) is past due, installment 3 is not.
      await activateDaysAgo(tx, p, 45);
      expect(await summary(tx, f.wsA.id, p.t.id)).toMatchObject({
        status: 'active',
        overdue: true,
        effective_end_exclusive: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
    });
  });

  it('restricts the overview, one plan, one nutrition plan and one workout plan for an overdue active client', async () => {
    await probe(async (tx) => {
      await activateDaysAgo(tx, p, 45);
      const user = await authUser(tx, p);
      const r = await reads(tx, user);
      for (const read of [r.overview, r.plan, r.nutrition, r.workout]) {
        expect(read).toMatchObject({
          status: 'restricted',
          subscription: { status: 'active', overdue: true },
        });
        expect(Object.keys(read).sort()).toEqual(['status', 'subscription']);
        expect(JSON.stringify(read)).not.toContain(p.sid);
      }
    });
  });

  it('is not restricted before any installment is due and recovers when the past-due installment is paid', async () => {
    await probe(async (tx) => {
      await activateDaysAgo(tx, p, 5);
      const r = await reads(tx, await authUser(tx, p));
      expect(r.overview).toMatchObject({ status: 'ok', plans: [] });
      expect(r.plan).toEqual({ status: 'not_found' });
      expect(r.nutrition).toEqual({ status: 'not_found' });
      expect(r.workout).toEqual({ status: 'not_found' });
    });
    await probe(async (tx) => {
      await activateDaysAgo(tx, p, 45);
      expect(
        (await sqlPay(tx, f.po.userId, 'collect', paymentRequest(f, p))).status,
      ).toBe('ok');
      // The only past-due installment (2) is paid: F13 clears overdue, the portal follows.
      const r = await reads(tx, await authUser(tx, p));
      expect(r.overview).toMatchObject({
        status: 'ok',
        subscription: { status: 'active', overdue: false },
      });
    });
  });

  it('keeps clients separate: an overdue client never restricts another, and foreign ids resolve to nothing', async () => {
    await probe(async (tx) => {
      await activateDaysAgo(tx, p, 45);
      await activateDaysAgo(tx, other, 5);
      const r = await reads(tx, await authUser(tx, other));
      expect(r.overview.status).toBe('ok');
      // Foreign workspace and foreign client ids fail closed before overdue is read.
      expect(await summary(tx, f.wsB.id, p.t.id)).toBeNull();
      expect(await summary(tx, f.wsA.id, randomUUID())).toBeNull();
    });
  });

  it('mutation kills: removing the overdue gate or the overdue input lets an overdue client read plans', async () => {
    const gate = ` or coalesce((summary->>'overdue')::boolean, true)`;
    for (const [signature, key] of [
      ['public.client_portal_overview()', 'overview'],
      ['public.client_portal_plan(uuid,integer)', 'plan'],
      ['public.client_portal_nutrition_plan(uuid,integer)', 'nutrition'],
      ['public.client_portal_workout_plan(uuid,integer)', 'workout'],
    ] as const)
      await probe(async (tx) => {
        await activateDaysAgo(tx, p, 45);
        await mutate(tx, signature, gate, '');
        const r = await reads(tx, await authUser(tx, p));
        expect(r[key].status, signature).not.toBe('restricted');
      });
    await probe(async (tx) => {
      await activateDaysAgo(tx, p, 45);
      await mutate(
        tx,
        'app_private.f22_subscription_summary(uuid,uuid)',
        `coalesce((overdue_state->>'overdue')::boolean, false)`,
        'false',
      );
      const r = await reads(tx, await authUser(tx, p));
      expect(r.overview.status).toBe('ok');
    });
  });
});
