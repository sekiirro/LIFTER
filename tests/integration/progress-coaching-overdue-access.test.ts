import { afterAll, beforeAll, expect, it } from 'vitest';
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

// Spec 023 T028 (FR-016): client measurements are restricted while the F13 overdue input says
// overdue, and restored when it clears, on top of the existing expiry rule. Rolled-back probes.

const db = sql();
let f: Context;
let p: Purchase;
let p2: Purchase;
beforeAll(async () => {
  f = await clientContext();
  p = await bought(f);
  p2 = await bought(f);
});
afterAll(() => db.end());

async function userOf(tx: TransactionSql, clientId: string) {
  const [c] =
    await tx`select auth_user_id from public.clients where id=${clientId}`;
  return c!.auth_user_id as string;
}

async function activateDaysAgo(
  tx: TransactionSql,
  purchase: Purchase,
  days: number,
) {
  // seq 2 is due 30 days after activation; the package runs 61 days, so 45 is overdue but active.
  await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
    values(${f.wsA.id},${purchase.sid},(((statement_timestamp() at time zone 'Africa/Cairo')::date - ${days}::int)::timestamp at time zone 'Africa/Cairo') + interval '10 hours',gen_random_uuid(),'po_override')`;
}

async function seedMeasurement(
  tx: TransactionSql,
  clientId: string,
  user: string,
) {
  await tx`insert into public.progress_measurements(workspace_id,client_id,measurement_type,value,unit_en,unit_ar,recorded_on,source_kind,entered_by,updated_by)
    values(${f.wsA.id},${clientId},'bodyWeight',90,'kg','كجم',(statement_timestamp() at time zone 'Africa/Cairo')::date,'manual',${user},${user})`;
}

async function asUser<T>(
  tx: TransactionSql,
  user: string,
  run: () => Promise<T>,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: user, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    return await run();
  } finally {
    await tx`reset role`;
  }
}

const selfProgress = (tx: TransactionSql, user: string) =>
  asUser(tx, user, async () => {
    const [r] = await tx`select public.client_self_progress() as v`;
    return r!.v as { measurements_status: string; measurements: unknown[] };
  });

const visible = async (tx: TransactionSql, clientId: string) =>
  (
    await tx`select app_private.f23_client_progress_visible(${f.wsA.id},${clientId}) as v`
  )[0]!.v as boolean;

it('restricts own measurements while overdue and restores them when it clears', async () => {
  await probe(async (tx) => {
    const user = await userOf(tx, p.t.id);
    await seedMeasurement(tx, p.t.id, user);
    await tx`select set_config('request.jwt.claims','{}',true)`;
    await activateDaysAgo(tx, p, 45);
    const overdue = await asUser(tx, user, async () => {
      const [r] = await tx`select public.client_overdue_status() as v`;
      return r!.v as { overdue: boolean };
    });
    expect(overdue.overdue).toBe(true);

    // Entitlement is active, yet the overdue restriction hides the measurements.
    const restricted = await selfProgress(tx, user);
    expect(restricted.measurements_status).toBe('restricted');
    expect(restricted.measurements).toEqual([]);
    // The RLS read path and the write walls agree.
    const rows = await asUser(
      tx,
      user,
      () => tx`select id from public.progress_measurements`,
    );
    expect(rows).toHaveLength(0);

    // Staff keep access (overdue restricts the client, not coaching work).
    const staffRows = await asUser(
      tx,
      f.trainerA.userId,
      () =>
        tx`select id from public.progress_measurements where client_id = ${p.t.id}`,
    );
    expect(staffRows).toHaveLength(1);

    // Collecting the past-due installment clears overdue and restores the view.
    await tx`select set_config('request.jwt.claims','{}',true)`;
    expect(
      (await sqlPay(tx, f.po.userId, 'collect', paymentRequest(f, p))).status,
    ).toBe('ok');
    const restored = await selfProgress(tx, user);
    expect(restored.measurements_status).toBe('ok');
    expect(restored.measurements).toHaveLength(1);
  });
});

it('keeps another client of the same workspace unaffected and negatives foreign access', async () => {
  await probe(async (tx) => {
    const user1 = await userOf(tx, p.t.id);
    const user2 = await userOf(tx, p2.t.id);
    await seedMeasurement(tx, p2.t.id, user2);
    await tx`select set_config('request.jwt.claims','{}',true)`;
    await activateDaysAgo(tx, p, 45);
    await activateDaysAgo(tx, p2, 5);
    expect(await visible(tx, p.t.id)).toBe(false);
    expect(await visible(tx, p2.t.id)).toBe(true);
    expect((await selfProgress(tx, user2)).measurements_status).toBe('ok');
    // The overdue client cannot read the other client's rows either way.
    const foreign = await asUser(
      tx,
      user1,
      () =>
        tx`select id from public.progress_measurements where client_id = ${p2.t.id}`,
    );
    expect(foreign).toHaveLength(0);
    // A client id from another workspace fails closed (never visible).
    const [cross] =
      await tx`select app_private.f23_client_progress_visible(${f.wsB.id},${p2.t.id}) as v`;
    expect(cross!.v).toBe(false);
  });
});

it('kills a mutant that ignores the overdue input', async () => {
  await probe(async (tx) => {
    const user = await userOf(tx, p.t.id);
    await tx`select set_config('request.jwt.claims','{}',true)`;
    await activateDaysAgo(tx, p, 45);
    expect(await visible(tx, p.t.id)).toBe(false);
    const identity = 'app_private.f23_client_progress_visible(uuid,uuid)';
    const [d] =
      await tx`select pg_get_functiondef(${identity}::regprocedure) as def`;
    const original = d!.def as string;
    const mutant = original.replace(
      "->>'overdue')::boolean",
      "->>'never')::boolean",
    );
    expect(mutant).not.toBe(original);
    await tx.unsafe(mutant);
    let failed = false;
    try {
      expect(await visible(tx, p.t.id)).toBe(false);
    } catch {
      failed = true;
    }
    await tx.unsafe(original);
    expect(failed, 'overdue mutant must fail').toBe(true);
    expect(user).toBeTruthy();
  });
});
