import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import { probe } from './registration-approval-fixture';
import {
  asUser,
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

// F22 FR-006/FR-010 review items 1, 2 and 5: raw workout content never leaves client_portal_plan,
// and an overdue client cannot record a successful export audit. Synthetic data only. The F13
// overdue input itself is proven against real installments in client-portal-overdue.test.ts;
// here a rolled-back transaction stubs it, so these cases isolate the F22 gates.
let p: PortalFixture;
let client: PortalClient;
let workoutPlan: string;
let nutritionPlan: string;
let workoutRevision: string;
let nutritionRevision: string;

beforeAll(async () => {
  p = await portalFixture();
  client = await p.makeClient({ activate: true, label: 'audit overdue' });
  workoutPlan = await p.createDraft(client.clientId, 'workout', 'audit w');
  await p.publish(workoutPlan, 1, 0);
  nutritionPlan = await p.createDraft(client.clientId, 'nutrition', 'audit n');
  await p.publish(nutritionPlan, 1, 0);
  const rows = await p.db`select id, plan_id from public.plan_revisions
    where plan_id in (${workoutPlan}, ${nutritionPlan}) and revision_number = 1`;
  workoutRevision = rows.find((r) => r.plan_id === workoutPlan)!.id as string;
  nutritionRevision = rows.find((r) => r.plan_id === nutritionPlan)!
    .id as string;
});
afterAll(async () => p?.close());

async function stubOverdue(tx: TransactionSql) {
  await tx`create or replace function app_private.f13_client_overdue_state(ws uuid, cid uuid, as_of date)
    returns jsonb language sql stable as $$ select '{"overdue": true}'::jsonb $$`;
}
async function mutate(tx: TransactionSql, signature: string, from: string) {
  const [d] =
    await tx`select pg_get_functiondef(${signature}::regprocedure) as def`;
  const def = d!.def as string;
  expect(def.split(from).length - 1, 'mutation target occurrences').toBe(1);
  await tx.unsafe(def.replace(from, ''));
}
const WORKOUT_SIG =
  'public.record_workout_export_audit(uuid,uuid,uuid,text,text,text)';
const NUTRITION_SIG =
  'public.record_nutrition_export_audit(uuid,uuid,uuid,text,text)';
const WORKOUT_GATE =
  "    and not coalesce((app_private.f22_subscription_summary(v_workspace_id, v_client_id) ->> 'overdue')::boolean, true)";
const NUTRITION_GATE =
  "        and not coalesce(\n          (app_private.f22_subscription_summary(c.workspace_id, c.id) ->> 'overdue')::boolean, true)";

const recordWorkout = (tx: TransactionSql) =>
  asUser(
    tx,
    client.authUserId,
    () =>
      tx`select public.record_workout_export_audit(${p.fixture.wsA.id}::uuid, ${workoutPlan}::uuid,
        ${workoutRevision}::uuid, 'excel', 'success', null)`,
  );
const recordNutrition = (tx: TransactionSql) =>
  asUser(
    tx,
    client.authUserId,
    () =>
      tx`select public.record_nutrition_export_audit(${p.fixture.wsA.id}::uuid, ${nutritionPlan}::uuid,
        ${nutritionRevision}::uuid, 'success', null)`,
  );

describe('F22 client_portal_plan never returns raw workout content (review 1)', () => {
  const planRead = (tx: TransactionSql) =>
    asUser(tx, client.authUserId, async (inner) => {
      const [row] =
        await inner`select public.client_portal_plan(${workoutPlan}::uuid, 1::integer) as v`;
      return row!.v as { status: string; plan: { content: unknown } };
    });
  const plant = async (tx: TransactionSql) => {
    // Replica role skips the immutability guard for this rolled-back fixture edit only.
    await tx`set local session_replication_role = replica`;
    await tx`update public.plan_revisions
      set content = jsonb_build_object('schema_version', 1, 'notes', 'safe',
        'coach_private', 'LEAK-ROOT', 'days', '[]'::jsonb)
      where id = ${workoutRevision}`;
    await tx`set local session_replication_role = origin`;
  };

  it('drops non-allowlisted keys from workout content', async () => {
    await probe(async (tx) => {
      await plant(tx);
      const read = await planRead(tx);
      expect(read.status).toBe('ok');
      expect(JSON.stringify(read)).not.toContain('LEAK-ROOT');
      expect(read.plan.content).toMatchObject({ notes: 'safe', days: [] });
    });
  });

  it('mutation kill: returning raw content leaks the planted key', async () => {
    await probe(async (tx) => {
      await plant(tx);
      const [d] =
        await tx`select pg_get_functiondef('public.client_portal_plan(uuid,integer)'::regprocedure) as def`;
      const def = d!.def as string;
      const from =
        'then app_private.f17_client_safe_workout_document(selected.content)';
      expect(def.split(from).length - 1).toBe(1);
      await tx.unsafe(def.replace(from, 'then selected.content'));
      expect(JSON.stringify(await planRead(tx))).toContain('LEAK-ROOT');
    });
  });
});

describe('F22 overdue client cannot record a success export audit (review 2, 5)', () => {
  it('records for an entitled client (control) and denies with 42501 when overdue', async () => {
    for (const record of [recordWorkout, recordNutrition]) {
      await probe(async (tx) => {
        await record(tx);
      });
      await expect(
        probe(async (tx) => {
          await stubOverdue(tx);
          await record(tx);
        }),
      ).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('mutation kills: dropping the overdue term lets an overdue client record the success audit', async () => {
    for (const [signature, gate, record] of [
      [WORKOUT_SIG, WORKOUT_GATE, recordWorkout],
      [NUTRITION_SIG, NUTRITION_GATE, recordNutrition],
    ] as const)
      await probe(async (tx) => {
        await stubOverdue(tx);
        await mutate(tx, signature, gate);
        await record(tx); // no 42501: the control is the only thing stopping it
      });
  });

  it('keeps the denial audit available to an overdue client', async () => {
    await probe(async (tx) => {
      await stubOverdue(tx);
      await asUser(
        tx,
        client.authUserId,
        () =>
          tx`select public.record_nutrition_export_audit(${p.fixture.wsA.id}::uuid, ${nutritionPlan}::uuid,
            null::uuid, 'denied', 'not_permitted')`,
      );
    });
  });
});
