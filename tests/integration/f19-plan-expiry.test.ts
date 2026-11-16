import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readClientPlanProjection } from '../../lib/plans/client-projection';
import { clientContext, graph, sql } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';
import { seedSubmittedIntake } from './f17-plan-publish-fixture';

let fixture: Context;
let db: ReturnType<typeof sql>;
let seeded: Awaited<ReturnType<typeof graph>>;
let planId: string;
let clientAuthUserId: string;

const workoutDocument = (notes: string) => ({
  schema_version: 1,
  days: [],
  notes,
});

async function callProjectionAsClient(authUserId: string) {
  return db.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: authUserId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    try {
      const [row] = await tx`select public.client_plan_projection() as value`;
      return row!.value as Record<string, unknown>;
    } finally {
      await tx`reset role`;
    }
  });
}

beforeAll(async () => {
  fixture = await clientContext();
  db = sql();
  seeded = await db.begin((tx) => graph(tx, fixture));
  await db`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,
    delivery_event_id,activation_source)
    values(${fixture.wsA.id},${seeded.subscription},clock_timestamp(),${randomUUID()},'po_override')`;
  await db.begin((tx) =>
    seedSubmittedIntake(tx, fixture.wsA.id, seeded.client),
  );

  const created = await fixture.trainerA.client.rpc('create_plan_draft', {
    p_workspace_id: fixture.wsA.id,
    p_client_id: seeded.client,
    p_plan_kind: 'workout',
    p_content: workoutDocument('T030 expiry test plan'),
    p_operation_key: randomUUID(),
  });
  expect(created.error).toBeNull();
  planId = created.data as string;

  const delivered = await fixture.trainerA.client.rpc(
    'ready_and_publish_plan',
    {
      p_plan_id: planId,
      p_expected_draft_version: 1,
      p_expected_published_version: 0,
      p_operation_key: randomUUID(),
    },
  );
  expect(delivered.data).toMatchObject({ status: 'ok', revision_number: 1 });

  const [clientRow] =
    await db`select auth_user_id from public.clients where id=${seeded.client}`;
  clientAuthUserId = clientRow!.auth_user_id as string;
});

afterAll(async () => db?.end());

describe('F19 T030 expiry denial and client projection boundary', () => {
  it('denies plan content generically when the client subscription expires', async () => {
    const activeProjection = await callProjectionAsClient(clientAuthUserId);
    expect(activeProjection).toMatchObject({ status: 'ok' });
    expect(
      (activeProjection.plans as Array<{ plan_id: string }>).map(
        (p) => p.plan_id,
      ),
    ).toContain(planId);

    // Expire the subscription as of today (Africa/Cairo) via manual date adjustment.
    await db`
      insert into public.subscription_manual_date_adjustments(
        workspace_id, client_id, subscription_id,
        new_service_start_date, new_service_end_exclusive,
        request_key, actor_user_id
      ) values (
        ${fixture.wsA.id},
        ${seeded.client},
        ${seeded.subscription},
        ((clock_timestamp() at time zone 'Africa/Cairo')::date - 30),
        (clock_timestamp() at time zone 'Africa/Cairo')::date,
        ${randomUUID()},
        ${fixture.po.userId}
      )
    `;

    const [entitlementRow] = await db`
      select app_private.f13_project_entitlement(
        ${fixture.wsA.id},
        ${seeded.subscription},
        (clock_timestamp() at time zone 'Africa/Cairo')::date
      ) as entitlement
    `;
    expect(entitlementRow!.entitlement).toMatchObject({ status: 'expired' });

    const expiredProjection = await callProjectionAsClient(clientAuthUserId);
    expect(expiredProjection).toEqual({ status: 'invalid' });
    expect(expiredProjection).not.toHaveProperty('plans');

    const helperResult = await readClientPlanProjection({
      rpc: async () => ({
        data: expiredProjection,
        error: null,
        count: null,
        status: 200,
        statusText: 'OK',
      }),
    } as never);
    expect(helperResult).toEqual({ status: 'denied' });
    expect(helperResult).not.toHaveProperty('plans');
  });
});
