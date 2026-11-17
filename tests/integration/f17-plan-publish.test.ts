import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientContext, graph, sql } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';
import { seedSubmittedIntake } from './f17-plan-publish-fixture';

let context: Context;
let db: ReturnType<typeof sql>;
let seeded: Awaited<ReturnType<typeof graph>>;

beforeAll(async () => {
  context = await clientContext();
  db = sql();
  seeded = await db.begin((tx) => graph(tx, context));
  await db`insert into public.subscription_activations(
    workspace_id, subscription_id, activated_at, delivery_event_id, activation_source
  ) values(
    ${context.wsA.id}, ${seeded.subscription}, clock_timestamp(), ${randomUUID()}, 'po_override'
  )`;
});
afterAll(async () => db?.end());

describe('F17 T020 workout publish intake gate', () => {
  it('refuses an approved client with no submitted intake before revision or delivery writes', async () => {
    const created = await context.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: context.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'workout',
      p_content: {
        schema_version: 1,
        days: [],
        notes: 'latest autosaved plan',
      },
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();
    const planId = created.data as string;
    const [intake] = await db`
      select count(*)::int as count
      from public.form_assignments a
      join app_private.form_submissions s
        on s.workspace_id = a.workspace_id and s.assignment_id = a.id
      where a.workspace_id = ${context.wsA.id} and a.client_id = ${seeded.client}
    `;
    expect(intake?.count).toBe(0);

    const refused = await context.trainerA.client.rpc(
      'ready_and_publish_plan',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );

    expect(refused.error).toBeNull();
    expect(refused.data).toMatchObject({ status: 'not_permitted' });
    const [refusedCounts] = await db`
      select
        (select count(*)::int from public.plan_revisions where plan_id = ${planId}) as revisions,
        (select count(*)::int from public.plan_deliveries where plan_id = ${planId}) as deliveries
    `;
    expect(refusedCounts).toEqual({ revisions: 0, deliveries: 0 });

    await db.begin((tx) =>
      seedSubmittedIntake(tx, context.wsA.id, seeded.client),
    );

    const published = await context.trainerA.client.rpc(
      'ready_and_publish_plan',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );

    expect(published.error).toBeNull();
    expect(published.data).toMatchObject({
      status: 'ok',
      plan_id: planId,
      revision_number: 1,
    });
    const [counts] = await db`
      select
        (select count(*)::int from public.plan_revisions where plan_id = ${planId}) as revisions,
        (select count(*)::int from public.plan_deliveries where plan_id = ${planId}) as deliveries
    `;
    expect(counts).toEqual({ revisions: 1, deliveries: 1 });
    const [revision] = await db`
      select content->>'notes' as notes from public.plan_revisions
      where plan_id = ${planId} and revision_number = 1
    `;
    expect(revision?.notes).toBe('latest autosaved plan');
  });

  it('refuses publish for an expired subscription with no revision or delivery writes', async () => {
    await db.begin((tx) =>
      seedSubmittedIntake(tx, context.wsA.id, seeded.client),
    );
    const expiredPlan = await context.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: context.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'workout',
      p_content: { schema_version: 1, days: [], notes: 'expired subscription' },
      p_operation_key: randomUUID(),
    });
    expect(expiredPlan.error).toBeNull();
    const expiredPlanId = expiredPlan.data as string;
    await db`
      insert into public.subscription_manual_date_adjustments(
        workspace_id, client_id, subscription_id,
        new_service_start_date, new_service_end_exclusive,
        request_key, actor_user_id
      ) values (
        ${context.wsA.id}, ${seeded.client}, ${seeded.subscription},
        ((clock_timestamp() at time zone 'Africa/Cairo')::date - 30),
        (clock_timestamp() at time zone 'Africa/Cairo')::date,
        ${randomUUID()}, ${context.po.userId}
      )
    `;
    const expiredPublish = await context.trainerA.client.rpc(
      'ready_and_publish_plan',
      {
        p_plan_id: expiredPlanId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(expiredPublish.error).toBeNull();
    expect(expiredPublish.data).toMatchObject({ status: 'not_permitted' });
    const [expiredCounts] = await db`
      select
        (select count(*)::int from public.plan_revisions where plan_id = ${expiredPlanId}) as revisions,
        (select count(*)::int from public.plan_deliveries where plan_id = ${expiredPlanId}) as deliveries
    `;
    expect(expiredCounts).toEqual({ revisions: 0, deliveries: 0 });
  });
});
