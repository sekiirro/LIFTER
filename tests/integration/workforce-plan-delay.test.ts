import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { admin, createStaff, sql } from './harness';
import { seedSubmittedIntake } from './f17-plan-publish-fixture';
import { clientContext, graph } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';

const db = sql();
afterAll(() => db.end());

async function seedPlanDeadline(deadlineDelaySeconds = 3) {
  const context = await clientContext();
  const ids = await db.begin((tx) => graph(tx, context));
  const assignmentId = await db.begin(async (tx) => {
    const assignment = await seedSubmittedIntake(
      tx,
      context.wsA.id,
      ids.client,
    );
    await tx`
      insert into app_private.form_submission_slas(
        workspace_id,assignment_id,rule_id,start_date,day_five_date,deadline_at
      ) values (
        ${context.wsA.id},${assignment},'cairo-d03-v1','2026-11-20','2026-11-26',
        (clock_timestamp() + ${deadlineDelaySeconds} * interval '1 second')::timestamptz
      )
    `;
    return assignment;
  });
  const assigned = await context.po.client.rpc(
    'assign_client_responsible_trainer',
    {
      p_workspace_id: context.wsA.id,
      p_client_id: ids.client,
      p_trainer_user_id: context.trainerA.userId,
    },
  );
  if (assigned.error) throw new Error(assigned.error.message);
  const [sla] = await db`
    select deadline_at from app_private.form_submission_slas
    where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}
  `;
  return {
    context,
    ids,
    assignmentId,
    deadlineAt: new Date(sla!.deadline_at as string),
  };
}

async function deliverPlanPair(
  fixture: Awaited<ReturnType<typeof seedPlanDeadline>>,
  actor: Context['trainerA']['client'] = fixture.context.trainerA.client,
) {
  for (const kind of ['workout', 'nutrition'] as const) {
    const content =
      kind === 'nutrition'
        ? {
            schemaVersion: 1,
            structure: 'single_day',
            implicitDayTypeId: 'dt-1',
            dayTypes: [
              {
                id: 'dt-1',
                trainingDay: false,
                name: { ar: 'يوم', en: 'Day' },
              },
            ],
            meals: [],
          }
        : { schema_version: 1, days: [], notes: 'T009 plan-delay fixture' };
    const created = await actor.rpc('create_plan_draft', {
      p_workspace_id: fixture.context.wsA.id,
      p_client_id: fixture.ids.client,
      p_plan_kind: kind,
      p_content: content,
      p_operation_key: randomUUID(),
    });
    if (created.error || typeof created.data !== 'string')
      throw new Error(
        `Plan draft failed: ${created.error?.code ?? 'missing id'}`,
      );
    const rpc =
      kind === 'nutrition'
        ? 'publish_nutrition_revision'
        : 'ready_and_publish_plan';
    const delivered = await actor.rpc(rpc, {
      p_plan_id: created.data,
      p_expected_draft_version: 1,
      p_expected_published_version: 0,
      p_operation_key: randomUUID(),
    });
    if (delivered.error)
      throw new Error(`Plan delivery failed: ${delivered.error.message}`);
  }
}

async function evaluate(deadlineAt: Date) {
  const [row] = await db`
    select app_private.record_due_workforce_strikes(
      ${new Date(deadlineAt.getTime() + 20).toISOString()}::timestamptz
    ) as inserted
  `;
  return row?.inserted as number;
}

it('records one separate -1 for the late first pair using the persisted breach attribution and confirmer', async () => {
  const fixture = await seedPlanDeadline();
  await evaluate(fixture.deadlineAt);
  const [beforeDelivery] = await db`
    select count(*)::int as count from public.p7_adjustment_entries
    where workspace_id=${fixture.context.wsA.id} and reason_code='workforce.plan_delay'
  `;
  expect(beforeDelivery?.count).toBe(0);
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Math.max(0, fixture.deadlineAt.getTime() + 25 - Date.now()),
    ),
  );
  const replacement = await createStaff('trainer', 'plan-delay-confirmer');
  const membership = await admin().from('workspace_memberships').insert({
    workspace_id: fixture.context.wsA.id,
    user_id: replacement.userId,
    granted_by: fixture.context.po.userId,
  });
  if (membership.error) throw new Error(membership.error.message);
  const reassignment = await fixture.context.po.client.rpc(
    'assign_client_responsible_trainer',
    {
      p_workspace_id: fixture.context.wsA.id,
      p_client_id: fixture.ids.client,
      p_trainer_user_id: replacement.userId,
    },
  );
  if (reassignment.error) throw new Error(reassignment.error.message);
  await deliverPlanPair(fixture, replacement.client);
  await Promise.all([
    evaluate(fixture.deadlineAt),
    evaluate(fixture.deadlineAt),
  ]);

  const [point] = await db`
    select e.id,e.trainer_user_id,e.confirmer_user_id,e.breach_at,a.points,a.reason_code,
      a.effective_month,a.original_month,a.source_key
    from public.workforce_plan_delay_events e
    join public.p7_adjustment_entries a on a.workspace_id=e.workspace_id and a.source_key=e.source_key
    where e.workspace_id=${fixture.context.wsA.id}
  `;
  expect(point).toMatchObject({
    trainer_user_id: fixture.context.trainerA.userId,
    confirmer_user_id: replacement.userId,
    points: '-1.00',
    reason_code: 'workforce.plan_delay',
  });
  expect(new Date(point!.breach_at as string).toISOString()).toBe(
    fixture.deadlineAt.toISOString(),
  );
  expect(point!.source_key).not.toBe(fixture.ids.client);
  const [audit] = await db`
    select action,details::text as details from public.audit_events
    where action='workforce.plan_delay_recorded' and target_id=${point!.id}
  `;
  expect(audit?.action).toBe('workforce.plan_delay_recorded');
  expect(audit?.details).toContain(point!.source_key as string);
  expect(audit?.details).not.toContain(fixture.ids.client);
  const [counts] = await db`
    select
      (select count(*)::int from public.workforce_plan_delay_events where workspace_id=${fixture.context.wsA.id}) as penalties,
      (select count(*)::int from public.workforce_strike_events where workspace_id=${fixture.context.wsA.id}) as strikes
  `;
  expect(counts).toEqual({ penalties: 1, strikes: 1 });
});

it('records no plan-delay point when the first pair is delivered on time', async () => {
  const fixture = await seedPlanDeadline(30);
  await deliverPlanPair(fixture);
  await evaluate(fixture.deadlineAt);
  const [counts] = await db`
    select
      (select count(*)::int from public.workforce_plan_delay_events where workspace_id=${fixture.context.wsA.id}) as penalties,
      (select count(*)::int from public.workforce_strike_events where workspace_id=${fixture.context.wsA.id}) as strikes
  `;
  expect(counts).toEqual({ penalties: 0, strikes: 0 });
});

it('routes a closed-month plan-delay entry through the shared P7 period trigger', async () => {
  const context = await clientContext();
  await db.begin((tx) => graph(tx, context));
  const closedMonth = '2026-10-01';
  const finalized = await context.po.client.rpc('p7_finalize_month', {
    p_workspace_id: context.wsA.id,
    p_month: closedMonth,
  });
  if (finalized.error) throw new Error(finalized.error.message);
  expect(finalized.data).toMatchObject({ status: 'finalized' });

  const sourceKey = randomUUID();
  await db`
    insert into public.p7_adjustment_entries(
      workspace_id,staff_user_id,points,effective_month,original_month,source_key,source_hash,reason_code
    ) values (
      ${context.wsA.id},${context.trainerA.userId},-1.00,${closedMonth},${closedMonth},
      ${sourceKey},${'a'.repeat(64)},'workforce.plan_delay'
    )
  `;
  const [entry] = await db`
    select effective_month,original_month from public.p7_adjustment_entries
    where workspace_id=${context.wsA.id} and source_key=${sourceKey}
  `;
  const [current] = await db`
    select app_private.p7_month_for_trigger(clock_timestamp()) as month
  `;
  expect(entry?.effective_month).toEqual(current?.month);
  expect(new Date(entry!.original_month as string).toISOString()).toBe(
    `${closedMonth}T00:00:00.000Z`,
  );
});

it('mutation: replacing the deterministic occurrence key allows a replay to add a duplicate -1', async () => {
  const fixture = await seedPlanDeadline();
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Math.max(0, fixture.deadlineAt.getTime() + 25 - Date.now()),
    ),
  );
  await deliverPlanPair(fixture);
  await evaluate(fixture.deadlineAt);

  await db.begin(async (tx) => {
    await tx`savepoint plan_delay_idempotency_mutation`;
    const [definition] = await tx`
      select pg_get_functiondef('app_private.record_due_workforce_strikes(timestamptz)'::regprocedure) as definition
    `;
    const original = definition!.definition as string;
    const mutated = original.replace(
      /opaque_source := \([\s\S]*?\)::uuid;/,
      'opaque_source := extensions.gen_random_uuid();',
    );
    expect(mutated).not.toBe(original);
    await tx.unsafe(mutated);
    await tx`
      select app_private.record_due_workforce_strikes(${new Date(fixture.deadlineAt.getTime() + 30).toISOString()}::timestamptz)
    `;
    const [mutatedCount] = await tx`
      select count(*)::int as count from public.p7_adjustment_entries
      where workspace_id=${fixture.context.wsA.id} and reason_code='workforce.plan_delay'
    `;
    expect(mutatedCount?.count).toBe(2);
    await tx`rollback to savepoint plan_delay_idempotency_mutation`;
  });
  const [count] = await db`
    select count(*)::int as count from public.p7_adjustment_entries
    where workspace_id=${fixture.context.wsA.id} and reason_code='workforce.plan_delay'
  `;
  expect(count?.count).toBe(1);
});
