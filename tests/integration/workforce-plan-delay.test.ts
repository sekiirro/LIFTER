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
  const deadlineAt = new Date(Date.now() + deadlineDelaySeconds * 1_000);
  const assignmentId = await db.begin(async (tx) => {
    const assignment = await seedSubmittedIntake(
      tx,
      context.wsA.id,
      ids.client,
      {
        subscriptionId: ids.subscription,
        authoritative: true,
        configuredBy: context.po.userId,
        deadlineAt,
      },
    );
    await tx`
      insert into app_private.form_submission_slas(
        workspace_id,assignment_id,rule_id,start_date,day_five_date,deadline_at
      ) values (
        ${context.wsA.id},${assignment},'cairo-d03-v1','2026-11-20','2026-11-26',
        ${deadlineAt.toISOString()}::timestamptz
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
                name: { ar: 'ÙŠÙˆÙ…', en: 'Day' },
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
    where workspace_id=${fixture.context.wsA.id} and reason_code='plan_delay'
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
    reason_code: 'plan_delay',
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
      ${sourceKey},${'a'.repeat(64)},'plan_delay'
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

it('keeps plan-delay evidence immutable and appends PO reattribution effects', async () => {
  const fixture = await seedPlanDeadline();
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Math.max(0, fixture.deadlineAt.getTime() + 25 - Date.now()),
    ),
  );
  await deliverPlanPair(fixture);
  await evaluate(fixture.deadlineAt);
  const [event] = await db`
    select id,trainer_user_id from public.workforce_plan_delay_events where workspace_id=${fixture.context.wsA.id}
  `;
  const target = await createStaff('trainer', 'plan-delay-target');
  const membership = await admin().from('workspace_memberships').insert({
    workspace_id: fixture.context.wsA.id,
    user_id: target.userId,
    granted_by: fixture.context.po.userId,
  });
  if (membership.error) throw new Error(membership.error.message);

  const idempotencyKey = randomUUID();
  const reasonCodes = [
    'client_caused_delay',
    'system_issue',
    'wrong_trainer',
    'duplicate',
    'po_exception',
  ] as const;
  const args = {
    p_workspace_id: fixture.context.wsA.id,
    p_event_id: event!.id,
    p_target_trainer_user_id: target.userId,
    p_reason_code: reasonCodes[0],
    p_idempotency_key: idempotencyKey,
  };
  const results = await Promise.all([
    fixture.context.po.client.rpc('reattribute_workforce_plan_delay', args),
    fixture.context.po.client.rpc('reattribute_workforce_plan_delay', args),
  ]);
  for (const result of results) {
    if (result.error) throw new Error(result.error.message);
    expect(result.data).toMatchObject({ status: 'ok' });
  }
  expect(results.map((result) => result.data?.replayed).sort()).toEqual([
    false,
    true,
  ]);
  for (const reasonCode of reasonCodes.slice(1)) {
    const result = await fixture.context.po.client.rpc(
      'reattribute_workforce_plan_delay',
      { ...args, p_reason_code: reasonCode, p_idempotency_key: randomUUID() },
    );
    if (result.error) throw new Error(result.error.message);
    expect(result.data).toMatchObject({ status: 'ok', replayed: false });
  }
  const conflict = await fixture.context.po.client.rpc(
    'reattribute_workforce_plan_delay',
    { ...args, p_reason_code: 'system_issue' },
  );
  expect(conflict.data).toMatchObject({ status: 'idempotency_conflict' });
  const corrections = await db`
    select reason_code from public.workforce_plan_delay_corrections
    where workspace_id=${fixture.context.wsA.id} and event_id=${event!.id}
    order by reason_code
  `;
  expect(corrections.map((row) => row.reason_code).sort()).toEqual(
    [...reasonCodes].sort(),
  );
  const rows = await db`
    select points,staff_user_id,reason_code from public.p7_adjustment_entries
    where workspace_id=${fixture.context.wsA.id}
    order by case reason_code
      when 'plan_delay' then 1
      else 3 end
  `;
  expect(rows).toHaveLength(11);
  expect(rows.map((row) => row.reason_code)).toEqual(
    Array.from({ length: 11 }, () => 'plan_delay'),
  );
  const [original] = await db`
    select trainer_user_id from public.workforce_plan_delay_events where id=${event!.id}
  `;
  expect(original?.trainer_user_id).toBe(fixture.context.trainerA.userId);
});

it('rejects free text, blank, and unknown plan-delay reason codes without writing rows', async () => {
  const fixture = await seedPlanDeadline();
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Math.max(0, fixture.deadlineAt.getTime() + 25 - Date.now()),
    ),
  );
  await deliverPlanPair(fixture);
  await evaluate(fixture.deadlineAt);
  const [event] = await db`
    select id from public.workforce_plan_delay_events where workspace_id=${fixture.context.wsA.id}
  `;
  const target = await createStaff('trainer', 'plan-delay-invalid-target');
  const membership = await admin().from('workspace_memberships').insert({
    workspace_id: fixture.context.wsA.id,
    user_id: target.userId,
    granted_by: fixture.context.po.userId,
  });
  if (membership.error) throw new Error(membership.error.message);

  for (const reasonCode of [
    'free text reason',
    '',
    '   ',
    'not_a_reason_code',
  ]) {
    const result = await fixture.context.po.client.rpc(
      'reattribute_workforce_plan_delay',
      {
        p_workspace_id: fixture.context.wsA.id,
        p_event_id: event!.id,
        p_target_trainer_user_id: target.userId,
        p_reason_code: reasonCode,
        p_idempotency_key: randomUUID(),
      },
    );
    expect(result.error?.code).toBe('22023');
    expect(result.error?.message).toContain('invalid_reason_code');
  }
  const [count] = await db`
    select count(*)::int as count from public.workforce_plan_delay_corrections
    where workspace_id=${fixture.context.wsA.id} and event_id=${event!.id}
  `;
  expect(count?.count).toBe(0);
});

it('denies non-PO reattribution and proves the PO guard with a mutation test', async () => {
  const fixture = await seedPlanDeadline();
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Math.max(0, fixture.deadlineAt.getTime() + 25 - Date.now()),
    ),
  );
  await deliverPlanPair(fixture);
  await evaluate(fixture.deadlineAt);
  const [event] = await db`
    select id from public.workforce_plan_delay_events where workspace_id=${fixture.context.wsA.id}
  `;
  const target = await (
    await import('./harness')
  ).createStaff('trainer', 'plan-delay-guard-target');
  const membership = await (
    await import('./harness')
  )
    .admin()
    .from('workspace_memberships')
    .insert({
      workspace_id: fixture.context.wsA.id,
      user_id: target.userId,
      granted_by: fixture.context.po.userId,
    });
  if (membership.error) throw new Error(membership.error.message);
  const args = {
    p_workspace_id: fixture.context.wsA.id,
    p_event_id: event!.id,
    p_target_trainer_user_id: target.userId,
    p_reason_code: 'wrong_trainer',
    p_idempotency_key: randomUUID(),
  };
  const denied = await fixture.context.trainerA.client.rpc(
    'reattribute_workforce_plan_delay',
    args,
  );
  expect(denied.data).toMatchObject({ status: 'not_permitted' });

  await db.begin(async (tx) => {
    await tx`savepoint plan_delay_guard_mutation`;
    const [fn] = await tx`
      select pg_get_functiondef('public.reattribute_workforce_plan_delay(uuid,uuid,uuid,text,uuid)'::regprocedure) as definition
    `;
    const original = fn!.definition as string;
    const mutated = original
      .replaceAll('not app_private.is_platform_owner()', 'false')
      .replaceAll(
        'not app_private.has_workspace_access(p_workspace_id,null)',
        'false',
      );
    expect(mutated).not.toBe(original);
    await tx.unsafe(mutated);
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.context.trainerA.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    const [mutatedResult] = await tx`
      select public.reattribute_workforce_plan_delay(
        ${fixture.context.wsA.id},${event!.id},${target.userId},'wrong_trainer',${randomUUID()}
      ) as result
    `;
    expect(mutatedResult?.result).toMatchObject({ status: 'ok' });
    await tx`rollback to savepoint plan_delay_guard_mutation`;
  });
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
      where workspace_id=${fixture.context.wsA.id} and reason_code='plan_delay'
    `;
    expect(mutatedCount?.count).toBe(2);
    await tx`rollback to savepoint plan_delay_idempotency_mutation`;
  });
  const [count] = await db`
    select count(*)::int as count from public.p7_adjustment_entries
    where workspace_id=${fixture.context.wsA.id} and reason_code='plan_delay'
  `;
  expect(count?.count).toBe(1);
});
