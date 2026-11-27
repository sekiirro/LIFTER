import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import { admin, createStaff, sql } from './harness';
import { seedSubmittedIntake } from './f17-plan-publish-fixture';
import {
  clientContext,
  graph,
  type Context,
} from './registration-approval-fixture';

const db = sql();
afterAll(() => db.end());
type StrikeContext = Context;

async function seedOverdueInitial() {
  const context = await clientContext();
  const ids = await db.begin((tx) => graph(tx, context));
  const deadlineAt = new Date(Date.now() + 5_000);
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
  const assignment = await context.po.client.rpc(
    'assign_client_responsible_trainer',
    {
      p_workspace_id: context.wsA.id,
      p_client_id: ids.client,
      p_trainer_user_id: context.trainerA.userId,
    },
  );
  if (assignment.error) throw new Error(assignment.error.message);
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

async function recordDueAt(evaluationAt: Date) {
  const worker = sql();
  try {
    const [row] = await worker`
      select app_private.record_due_workforce_strikes(
        ${evaluationAt.toISOString()}::timestamptz
      ) as inserted
    `;
    return row?.inserted as number;
  } finally {
    await worker.end();
  }
}

function recordDue(deadlineAt: Date) {
  return recordDueAt(new Date(deadlineAt.getTime() + 10));
}

async function waitUntilBreach(deadlineAt: Date) {
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, deadlineAt.getTime() + 20 - Date.now())),
  );
}

async function readStrikes(
  context: StrikeContext,
  trainerUserId: string | null,
) {
  return db.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: context.po.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    const [row] = await tx`
      select public.get_workforce_strikes(
        ${context.wsA.id},${trainerUserId}
      ) as result
    `;
    return row?.result as {
      status: string;
      count: number;
      review_threshold: number;
      strikes: Array<{
        strike_id: string;
        trainer_user_id: string;
        voided: boolean;
        breach_at: string;
      }>;
    };
  });
}

async function asUser<T>(
  tx: TransactionSql,
  userId: string,
  run: (sp: TransactionSql) => Promise<T>,
) {
  return tx.savepoint(async (sp) => {
    await sp`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
    await sp`set local role authenticated`;
    return run(sp);
  });
}

async function waitForLockWait(queryText: string) {
  const observer = sql();
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const [row] = await observer`
        select count(*)::int as count from pg_stat_activity
        where wait_event_type='Lock' and query ilike ${`%${queryText}%`}
      `;
      if ((row?.count as number) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`RPC did not reach the expected lock wait: ${queryText}`);
  } finally {
    await observer.end();
  }
}

async function seedPlanPair(
  context: StrikeContext,
  ids: Awaited<ReturnType<typeof graph>>,
  deliveredAt: Date,
) {
  return db.begin(async (tx) => {
    const deliveries: Record<'workout' | 'nutrition', string> = {
      workout: randomUUID(),
      nutrition: randomUUID(),
    };
    for (const kind of ['workout', 'nutrition'] as const) {
      const planId = randomUUID();
      const revisionId = randomUUID();
      const operationKey = randomUUID();
      const content =
        kind === 'workout'
          ? { schema_version: 1, days: [], notes: 'strike boundary fixture' }
          : {
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
            };
      await tx`insert into public.plan_roots(
        id,workspace_id,client_id,plan_kind,created_by
      ) values (
        ${planId},${context.wsA.id},${ids.client},${kind},${context.trainerA.userId}
      )`;
      await tx`insert into public.plan_drafts(
        workspace_id,plan_id,draft_version,content,created_by,updated_by
      ) values (
        ${context.wsA.id},${planId},1,${tx.json(content)},${context.trainerA.userId},${context.trainerA.userId}
      )`;
      await tx`insert into public.plan_revisions(
        id,workspace_id,plan_id,revision_number,source_draft_version,plan_kind,
        content,authored_by,published_at
      ) values (
        ${revisionId},${context.wsA.id},${planId},1,1,${kind},${tx.json(content)},
        ${context.trainerA.userId},${deliveredAt.toISOString()}::timestamptz
      )`;
      await tx`insert into app_private.plan_delivery_operations(
        workspace_id,actor_user_id,operation_key,request_fingerprint,plan_id
      ) values (
        ${context.wsA.id},${context.trainerA.userId},${operationKey},
        decode(repeat('ab',32),'hex'),${planId}
      )`;
      const [delivery] = await tx`insert into public.plan_deliveries(
        workspace_id,subscription_id,client_id,plan_id,plan_kind,revision_id,
        delivery_event_id,delivered_at,delivered_by
      ) values (
        ${context.wsA.id},${ids.subscription},${ids.client},${planId},${kind},${revisionId},
        ${operationKey},${deliveredAt.toISOString()}::timestamptz,${context.trainerA.userId}
      ) returning id`;
      deliveries[kind] = delivery!.id as string;
    }
    const [activation] = await tx`
      insert into public.subscription_activations(
        workspace_id,subscription_id,activated_at,delivery_event_id,activation_source,
        workout_delivery_id,nutrition_delivery_id
      ) values (
        ${context.wsA.id},${ids.subscription},${deliveredAt.toISOString()}::timestamptz,
        (select delivery_event_id from public.plan_deliveries where id=${deliveries.nutrition}),
        'plan_deliveries',${deliveries.workout},${deliveries.nutrition}
      ) returning id
    `;
    return { ...deliveries, activationId: activation!.id as string };
  });
}

it('records the authoritative consumed F15 initial:<client> breach once, even without later delivery', async () => {
  const fixture = await seedOverdueInitial();
  const [binding] = await db`
    select fa.occurrence_key,c.subscription_id,c.assignment_id
    from app_private.form_assignment_consumptions c
    join public.form_assignments fa on fa.workspace_id=c.workspace_id and fa.id=c.assignment_id
    where c.workspace_id=${fixture.context.wsA.id} and c.subscription_id=${fixture.ids.subscription}
  `;
  expect(binding).toEqual({
    occurrence_key: `initial:${fixture.ids.client}`,
    subscription_id: fixture.ids.subscription,
    assignment_id: fixture.assignmentId,
  });
  const [first, second] = await Promise.all([
    recordDue(fixture.deadlineAt),
    recordDue(fixture.deadlineAt),
  ]);
  expect([first, second].sort()).toEqual([0, 1]);

  const events = await db`
    select id,trainer_user_id,breach_at,source_key
    from public.workforce_strike_events where workspace_id=${fixture.context.wsA.id}
  `;
  expect(events).toHaveLength(1);
  expect(events[0]?.trainer_user_id).toBe(fixture.context.trainerA.userId);
  expect(new Date(events[0]!.breach_at as string).toISOString()).toBe(
    fixture.deadlineAt.toISOString(),
  );
  expect(events[0]?.source_key).not.toContain(fixture.ids.client);
  expect(events[0]?.source_key).not.toContain(fixture.ids.subscription);

  const columns = await db`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='workforce_strike_events'
  `;
  expect(columns.map((row) => row.column_name)).not.toContain('client_id');
  expect(columns.map((row) => row.column_name)).not.toContain(
    'subscription_id',
  );
});

it('uses the exact deadline boundary and ignores renewal subscriptions', async () => {
  const fixture = await seedOverdueInitial();
  expect(await recordDueAt(new Date(fixture.deadlineAt.getTime() - 1))).toBe(0);
  await db.begin(async (tx) => {
    await tx.unsafe(
      'alter table public.subscriptions disable trigger f12_subscription_insert',
    );
    await tx.unsafe(
      'alter table public.subscriptions disable trigger f12_subscription_integrity',
    );
    try {
      await tx`insert into public.subscriptions(
        id,workspace_id,client_id,kind,registration_link_id,package_version_id,
        price_minor,currency,commission_rate_bp,duration_days,duration_months,created_by,
        predecessor_subscription_id
      ) values (
        ${randomUUID()},${fixture.context.wsA.id},${fixture.ids.client},'renewal',null,
        ${fixture.context.p.versionId},1200,'USD',17,30,null,${fixture.context.po.userId},
        ${fixture.ids.subscription}
      )`;
    } finally {
      await tx.unsafe(
        'alter table public.subscriptions enable trigger f12_subscription_insert',
      );
      await tx.unsafe(
        'alter table public.subscriptions enable trigger f12_subscription_integrity',
      );
    }
  });
  expect(await recordDueAt(fixture.deadlineAt)).toBe(1);
  expect(await recordDueAt(new Date(fixture.deadlineAt.getTime() + 1))).toBe(0);
});

it('does not use an unrelated initial form deadline instead of the consumed assignment', async () => {
  const fixture = await seedOverdueInitial();
  const unrelatedAssignment = await db.begin((tx) =>
    seedSubmittedIntake(tx, fixture.context.wsA.id, fixture.ids.client),
  );
  const unrelatedDeadline = new Date(fixture.deadlineAt.getTime() - 60_000);
  await db`
    insert into app_private.form_submission_slas(
      workspace_id,assignment_id,rule_id,start_date,day_five_date,deadline_at
    ) values (
      ${fixture.context.wsA.id},${unrelatedAssignment},'cairo-d03-v1',
      '2026-11-20','2026-11-26',${unrelatedDeadline.toISOString()}::timestamptz
    )
  `;
  expect(await recordDueAt(unrelatedDeadline)).toBe(0);
  expect(await recordDueAt(fixture.deadlineAt)).toBe(1);
  const [event] = await db`
    select breach_at from public.workforce_strike_events
    where workspace_id=${fixture.context.wsA.id}
  `;
  expect(new Date(event!.breach_at as string).toISOString()).toBe(
    fixture.deadlineAt.toISOString(),
  );
});

it('does not let an on-time PO override without a plan pair suppress the strike', async () => {
  const fixture = await seedOverdueInitial();
  await db`
    insert into public.subscription_activations(
      workspace_id,subscription_id,activated_at,delivery_event_id,activation_source
    ) values (
      ${fixture.context.wsA.id},${fixture.ids.subscription},
      ${fixture.deadlineAt.toISOString()}::timestamptz,${randomUUID()},'po_override'
    )
  `;
  expect(await recordDueAt(fixture.deadlineAt)).toBe(1);
});

it('suppresses the strike only when the first plan pair is delivered on or before the deadline', async () => {
  const fixture = await seedOverdueInitial();
  await seedPlanPair(fixture.context, fixture.ids, fixture.deadlineAt);
  expect(await recordDueAt(fixture.deadlineAt)).toBe(0);
  const [events] = await db`
    select count(*)::int as count from public.workforce_strike_events
    where workspace_id=${fixture.context.wsA.id}
  `;
  expect(events?.count).toBe(0);
});

it('commits the strike and existing forms alert through the real scheduler entry point', async () => {
  const fixture = await seedOverdueInitial();
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Math.max(0, fixture.deadlineAt.getTime() + 20 - Date.now()),
    ),
  );
  const scheduleId = randomUUID();
  await db`
    insert into app_private.form_alert_schedules(
      id,workspace_id,source_assignment_id,alert_kind,deadline_at,trainer_user_id
    ) values (
      ${scheduleId},${fixture.context.wsA.id},${fixture.assignmentId},'trainer_late',
      ${fixture.deadlineAt.toISOString()}::timestamptz,${fixture.context.trainerA.userId}
    )
  `;
  const rollback = new Error('rollback scheduler strike fixture');
  try {
    await db.begin(async (tx) => {
      const [run] =
        await tx`select app_private.f15_alert_schedule_run() as result`;
      expect(run?.result).toMatchObject({ status: 'ok' });
      const [event] = await tx`
        select count(*)::int as count from public.workforce_strike_events
        where workspace_id=${fixture.context.wsA.id}
      `;
      const [occurrence] = await tx`
        select count(*)::int as count from app_private.form_alert_occurrences
        where workspace_id=${fixture.context.wsA.id} and schedule_id=${scheduleId}
      `;
      expect(event?.count).toBe(1);
      expect(occurrence?.count).toBe(1);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});

it('keeps a D-03 breach immutable when the first pair is completed late', async () => {
  const fixture = await seedOverdueInitial();
  await recordDue(fixture.deadlineAt);
  const lateActivation = new Date(fixture.deadlineAt.getTime() + 60_000);
  await seedPlanPair(fixture.context, fixture.ids, lateActivation);
  await recordDue(fixture.deadlineAt);
  const [row] = await db`
    select count(*)::int as count,min(breach_at) as breach_at
    from public.workforce_strike_events where workspace_id=${fixture.context.wsA.id}
  `;
  expect(row?.count).toBe(1);
  expect(new Date(row!.breach_at as string).toISOString()).toBe(
    fixture.deadlineAt.toISOString(),
  );
});

it('preserves breach-time attribution and PO history after reassignment and departure', async () => {
  const fixture = await seedOverdueInitial();
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Math.max(0, fixture.deadlineAt.getTime() + 10 - Date.now()),
    ),
  );
  await recordDue(fixture.deadlineAt);
  const [event] = await db`
    select id,trainer_user_id from public.workforce_strike_events
    where workspace_id=${fixture.context.wsA.id}
  `;
  const replacement = await createStaff('trainer', 'strike-reassignment');
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
  const [originalMembership] = await db`
    select workspace_membership_id from public.client_trainer_assignments
    where workspace_id=${fixture.context.wsA.id} and client_id=${fixture.ids.client}
      and trainer_user_id=${fixture.context.trainerA.userId}
  `;
  const departure = await admin()
    .from('workspace_memberships')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: fixture.context.po.userId,
    })
    .eq('id', originalMembership!.workspace_membership_id);
  if (departure.error) throw new Error(departure.error.message);

  const [row] = await db.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.context.po.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    return tx`
      select public.get_workforce_strikes(
        ${fixture.context.wsA.id},${fixture.context.trainerA.userId}
      ) as result
    `;
  });
  expect(row?.result).toMatchObject({ status: 'ok', count: 1 });
  expect(event?.trainer_user_id).toBe(fixture.context.trainerA.userId);
  const [stored] = await db`
    select trainer_user_id from public.workforce_strike_events where id=${event!.id}
  `;
  expect(stored?.trainer_user_id).toBe(fixture.context.trainerA.userId);
});

it('uses the exact rolling window and only exposes 3/6/9 review flags to the PO', async () => {
  const context = await clientContext();
  const sixStrikes = await createStaff('trainer', 'strike-threshold-six');
  const nineStrikes = await createStaff('trainer', 'strike-threshold-nine');
  const boundaryStrikes = await createStaff(
    'trainer',
    'strike-threshold-boundary',
  );
  await db.begin(async (tx) => {
    for (const [trainerId, total] of [
      [context.trainerA.userId, 3],
      [sixStrikes.userId, 6],
      [nineStrikes.userId, 9],
    ] as const)
      for (let index = 0; index < total; index++)
        await tx`
          insert into public.workforce_strike_events(
            workspace_id,trainer_user_id,source_key,breach_at
          ) values (
            ${context.wsA.id},${trainerId},${randomUUID()},
            transaction_timestamp() - (${index}::text || ' hours')::interval
          )
        `;
    await tx`
      insert into public.workforce_strike_events(
        workspace_id,trainer_user_id,source_key,breach_at
      ) values (
        ${context.wsA.id},${nineStrikes.userId},${randomUUID()},
        transaction_timestamp() - interval '90 days'
      )
    `;
    for (const days of [89, 90, 91])
      await tx`
        insert into public.workforce_strike_events(
          workspace_id,trainer_user_id,source_key,breach_at
        ) values (
          ${context.wsA.id},${boundaryStrikes.userId},${randomUUID()},
          transaction_timestamp() - (${days}::text || ' days')::interval
        )
      `;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: context.po.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    const counts = await tx`
      select public.get_workforce_strikes(${context.wsA.id},${context.trainerA.userId}) as three,
        public.get_workforce_strikes(${context.wsA.id},${sixStrikes.userId}) as six,
        public.get_workforce_strikes(${context.wsA.id},${nineStrikes.userId}) as nine,
        public.get_workforce_strikes(${context.wsA.id},${boundaryStrikes.userId}) as boundary,
        public.get_workforce_strikes(${context.wsA.id},null) as all
    `;
    expect(counts[0]).toMatchObject({
      three: { status: 'ok', count: 3, review_threshold: 3 },
      six: { status: 'ok', count: 6, review_threshold: 6 },
      nine: { status: 'ok', count: 9, review_threshold: 9 },
      boundary: { status: 'ok', count: 1, review_threshold: 0 },
      all: { status: 'ok', count: 19, review_threshold: 9 },
    });
    expect(counts[0]?.three.strikes).toHaveLength(3);
    expect(counts[0]?.six.strikes).toHaveLength(6);
    expect(counts[0]?.nine.strikes).toHaveLength(9);
    expect(counts[0]?.boundary.strikes).toHaveLength(1);
    expect(counts[0]?.all.strikes).toHaveLength(19);
    expect(
      counts[0]?.three.strikes.every(
        (strike: { trainer_user_id: string }) =>
          strike.trainer_user_id === context.trainerA.userId,
      ),
    ).toBe(true);
    expect(
      counts[0]?.all.strikes.every((strike: { trainer_user_id: string }) =>
        [
          context.trainerA.userId,
          sixStrikes.userId,
          nineStrikes.userId,
          boundaryStrikes.userId,
        ].includes(strike.trainer_user_id),
      ),
    ).toBe(true);
  });
});

it('appends void, reinstate and breach-time reattribution without changing the strike row', async () => {
  const fixture = await seedOverdueInitial();
  await recordDue(fixture.deadlineAt);
  await waitUntilBreach(fixture.deadlineAt);
  const [event] = await db`
    select id from public.workforce_strike_events where workspace_id=${fixture.context.wsA.id}
  `;
  const targetTrainer = await createStaff('trainer', 'strike-reattribution');
  const membership = await admin()
    .from('workspace_memberships')
    .insert({
      workspace_id: fixture.context.wsA.id,
      user_id: targetTrainer.userId,
      granted_by: fixture.context.po.userId,
      granted_at: new Date(fixture.deadlineAt.getTime() - 60_000).toISOString(),
    });
  if (membership.error) throw new Error(membership.error.message);

  const call = (operation: string, key = randomUUID()) =>
    fixture.context.po.client.rpc('correct_workforce_strike', {
      p_workspace_id: fixture.context.wsA.id,
      p_strike_id: event!.id,
      p_operation: operation,
      p_target_trainer_user_id:
        operation === 'reattribute' ? targetTrainer.userId : null,
      p_reason: 'source review correction',
      p_idempotency_key: key,
    });
  expect((await call('void')).data).toMatchObject({ status: 'ok' });
  expect(
    await readStrikes(fixture.context, fixture.context.trainerA.userId),
  ).toMatchObject({
    status: 'ok',
    count: 0,
    review_threshold: 0,
    strikes: [
      {
        strike_id: event!.id,
        trainer_user_id: fixture.context.trainerA.userId,
        voided: true,
      },
    ],
  });
  expect((await call('reinstate')).data).toMatchObject({ status: 'ok' });
  expect(
    await readStrikes(fixture.context, fixture.context.trainerA.userId),
  ).toMatchObject({
    status: 'ok',
    count: 1,
    review_threshold: 0,
    strikes: [
      {
        strike_id: event!.id,
        trainer_user_id: fixture.context.trainerA.userId,
        voided: false,
      },
    ],
  });
  expect((await call('reattribute')).data).toMatchObject({ status: 'ok' });
  expect(
    await readStrikes(fixture.context, fixture.context.trainerA.userId),
  ).toMatchObject({
    status: 'ok',
    count: 0,
    strikes: [],
  });
  expect(
    await readStrikes(fixture.context, targetTrainer.userId),
  ).toMatchObject({
    status: 'ok',
    count: 1,
    strikes: [
      {
        strike_id: event!.id,
        trainer_user_id: targetTrainer.userId,
        voided: false,
      },
    ],
  });

  const [original] = await db`
    select trainer_user_id,breach_at from public.workforce_strike_events where id=${event!.id}
  `;
  expect(original?.trainer_user_id).toBe(fixture.context.trainerA.userId);
  expect(new Date(original!.breach_at as string).toISOString()).toBe(
    fixture.deadlineAt.toISOString(),
  );
  const corrections = await db`
    select correction_kind,reason,audit_ref from public.workforce_strike_corrections
    where workspace_id=${fixture.context.wsA.id} and strike_id=${event!.id}
    order by correction_no
  `;
  expect(corrections.map((row) => row.correction_kind)).toEqual([
    'void',
    'reinstate',
    'reattribute',
  ]);
  expect(
    corrections.every((row) => row.reason === 'source review correction'),
  ).toBe(true);
  expect(
    corrections.every(
      (row) => row.audit_ref && String(row.audit_ref).length > 0,
    ),
  ).toBe(true);
  const audit = await db`
    select action,target_table,details from public.audit_events
    where workspace_id=${fixture.context.wsA.id}
      and action='workforce.strike_corrected'
    order by occurred_at
  `;
  expect(audit).toHaveLength(3);
  expect(
    audit.every(
      (row) =>
        row.action === 'workforce.strike_corrected' &&
        row.target_table === 'workforce_strike_corrections' &&
        Object.keys(row.details as object).join(',') === 'reference' &&
        corrections.some(
          (correction) => correction.audit_ref === row.details.reference,
        ),
    ),
  ).toBe(true);
});

it('rejects invalid corrections and changed replay arguments without mutating history', async () => {
  const fixture = await seedOverdueInitial();
  await recordDue(fixture.deadlineAt);
  await waitUntilBreach(fixture.deadlineAt);
  const [event] = await db`
    select id from public.workforce_strike_events where workspace_id=${fixture.context.wsA.id}
  `;
  const revokedTrainer = await createStaff('trainer', 'strike-revoked-target');
  const postBreachTrainer = await createStaff(
    'trainer',
    'strike-post-breach-target',
  );
  await admin()
    .from('workspace_memberships')
    .insert([
      {
        workspace_id: fixture.context.wsA.id,
        user_id: revokedTrainer.userId,
        granted_by: fixture.context.po.userId,
        granted_at: new Date(
          fixture.deadlineAt.getTime() - 60_000,
        ).toISOString(),
        revoked_at: new Date(fixture.deadlineAt.getTime() - 1).toISOString(),
        revoked_by: fixture.context.po.userId,
      },
      {
        workspace_id: fixture.context.wsA.id,
        user_id: postBreachTrainer.userId,
        granted_by: fixture.context.po.userId,
        granted_at: new Date(fixture.deadlineAt.getTime() + 1).toISOString(),
      },
    ]);
  const call = (
    operation: string,
    target: string | null = null,
    reason = 'negative correction fixture',
    key = randomUUID(),
  ) =>
    fixture.context.po.client.rpc('correct_workforce_strike', {
      p_workspace_id: fixture.context.wsA.id,
      p_strike_id: event!.id,
      p_operation: operation,
      p_target_trainer_user_id: target,
      p_reason: reason,
      p_idempotency_key: key,
    });

  expect((await call('void', null, '   ')).data).toMatchObject({
    status: 'invalid_input',
  });
  expect((await call('reinstate')).data).toMatchObject({
    status: 'invalid_correction',
  });
  for (const target of [
    fixture.context.trainerA.userId,
    fixture.context.trainerB.userId,
    fixture.context.woA.userId,
    revokedTrainer.userId,
    postBreachTrainer.userId,
  ]) {
    expect((await call('reattribute', target)).data).toMatchObject({
      status: 'invalid_target',
    });
  }
  const [before] = await db`
    select count(*)::int as count from public.workforce_strike_corrections
    where workspace_id=${fixture.context.wsA.id} and strike_id=${event!.id}
  `;
  expect(before?.count).toBe(0);

  const replayKey = randomUUID();
  expect(
    (await call('void', null, 'original replay reason', replayKey)).data,
  ).toMatchObject({ status: 'ok' });
  expect(
    (await call('void', null, 'changed replay reason', replayKey)).data,
  ).toMatchObject({ status: 'idempotency_conflict' });
  const [afterReplay] = await db`
    select count(*)::int as count from public.workforce_strike_corrections
    where workspace_id=${fixture.context.wsA.id} and strike_id=${event!.id}
  `;
  expect(afterReplay?.count).toBe(1);

  const concurrent = await Promise.all([
    call('void', null, 'different key one'),
    call('void', null, 'different key two'),
  ]);
  expect(concurrent.map((result) => result.data.status)).toEqual(['ok', 'ok']);
  expect(
    await readStrikes(fixture.context, fixture.context.trainerA.userId),
  ).toMatchObject({
    status: 'ok',
    count: 0,
    review_threshold: 0,
  });
  const [afterDifferentKeys] = await db`
    select count(*)::int as count from public.workforce_strike_corrections
    where workspace_id=${fixture.context.wsA.id} and strike_id=${event!.id}
  `;
  expect(afterDifferentKeys?.count).toBe(3);
});

it('serializes concurrent retries of one PO correction idempotency key', async () => {
  const fixture = await seedOverdueInitial();
  await recordDue(fixture.deadlineAt);
  const [event] = await db`
    select id from public.workforce_strike_events where workspace_id=${fixture.context.wsA.id}
  `;
  const key = randomUUID();
  const args = {
    p_workspace_id: fixture.context.wsA.id,
    p_strike_id: event!.id,
    p_operation: 'void',
    p_target_trainer_user_id: null,
    p_reason: 'duplicate request replay',
    p_idempotency_key: key,
  };
  const [first, second] = await Promise.all([
    fixture.context.po.client.rpc('correct_workforce_strike', args),
    fixture.context.po.client.rpc('correct_workforce_strike', args),
  ]);
  expect(first.data).toMatchObject({ status: 'ok' });
  expect(second.data).toMatchObject({ status: 'ok' });
  expect(first.data.correction_id).toBe(second.data.correction_id);
  expect([first.data.replayed, second.data.replayed].sort()).toEqual([
    false,
    true,
  ]);
  const [count] = await db`
    select count(*)::int as count from public.workforce_strike_corrections
    where workspace_id=${fixture.context.wsA.id} and idempotency_key=${key}
  `;
  expect(count?.count).toBe(1);
});

it('denies Trainer, WO and Sales strike reads and corrections before resolving identifiers', async () => {
  const context = await clientContext();
  for (const userId of [
    context.trainerA.userId,
    context.woA.userId,
    context.salesA.userId,
  ]) {
    await db.begin(async (tx) => {
      await expect(
        asUser(
          tx,
          userId,
          (sp) =>
            sp`select public.get_workforce_strikes(${context.wsA.id},${randomUUID()}) as result`,
        ),
      ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
      await expect(
        asUser(
          tx,
          userId,
          (sp) =>
            sp`select public.correct_workforce_strike(
            ${context.wsA.id},${randomUUID()},'void',null,'forbidden',${randomUUID()}
          ) as result`,
        ),
      ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
    });
  }
});

it('rejects direct UPDATE, DELETE and TRUNCATE attempts on retained strike history', async () => {
  const fixture = await seedOverdueInitial();
  await recordDue(fixture.deadlineAt);
  const [event] = await db`
    select id from public.workforce_strike_events where workspace_id=${fixture.context.wsA.id}
  `;
  const correction = await fixture.context.po.client.rpc(
    'correct_workforce_strike',
    {
      p_workspace_id: fixture.context.wsA.id,
      p_strike_id: event!.id,
      p_operation: 'void',
      p_target_trainer_user_id: null,
      p_reason: 'immutable history fixture',
      p_idempotency_key: randomUUID(),
    },
  );
  expect(correction.error).toBeNull();
  await expect(
    db`update public.workforce_strike_events set breach_at=breach_at where id=${event!.id}`,
  ).rejects.toThrow(/workforce_strike_immutable/);
  await expect(
    db`delete from public.workforce_strike_events where id=${event!.id}`,
  ).rejects.toThrow(/workforce_strike_immutable/);
  await expect(
    db`truncate public.workforce_strike_events cascade`,
  ).rejects.toThrow(/workforce_strike_immutable/);
  await expect(
    db`update public.workforce_strike_corrections set reason=reason where strike_id=${event!.id}`,
  ).rejects.toThrow(/workforce_strike_immutable/);
  await expect(
    db`delete from public.workforce_strike_corrections where strike_id=${event!.id}`,
  ).rejects.toThrow(/workforce_strike_immutable/);
  await expect(
    db`truncate public.workforce_strike_corrections`,
  ).rejects.toThrow(/workforce_strike_immutable/);
});

it('keeps non-PII strike history outside the F26 client purge closure', async () => {
  const fixture = await seedOverdueInitial();
  await recordDue(fixture.deadlineAt);
  const [event] = await db`
    select id,source_key from public.workforce_strike_events where workspace_id=${fixture.context.wsA.id}
  `;
  const correction = await fixture.context.po.client.rpc(
    'correct_workforce_strike',
    {
      p_workspace_id: fixture.context.wsA.id,
      p_strike_id: event!.id,
      p_operation: 'void',
      p_target_trainer_user_id: null,
      p_reason: 'retention fixture',
      p_idempotency_key: randomUUID(),
    },
  );
  expect(correction.data).toMatchObject({ status: 'ok' });
  const [closure] = await db`
    select
      (select count(*)::int from pg_constraint
        where contype='f' and confrelid='public.clients'::regclass
          and conrelid in ('public.workforce_strike_events'::regclass,'public.workforce_strike_corrections'::regclass)) as client_fks,
      (select count(*)::int from app_private.retention_purge_allowlist
        where table_oid in ('public.workforce_strike_events'::regclass,'public.workforce_strike_corrections'::regclass)) as allowlist_rows
  `;
  expect(closure).toEqual({ client_fks: 0, allowlist_rows: 0 });
  expect(event?.source_key).not.toContain(fixture.ids.client);

  const rollback = new Error('rollback F26 strike retention fixture');
  try {
    await db.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.clients set deactivated_at=clock_timestamp()-interval '31 days',
        deactivation_reason='closure' where workspace_id=${fixture.context.wsA.id} and id=${fixture.ids.client}`;
      await tx`set local session_replication_role = origin`;
      await tx.unsafe(`create or replace function app_private.p7_retention_has_open_dispute(
        p_workspace_id uuid,p_client_id uuid
      ) returns boolean language sql stable security invoker set search_path='' as $$
        select p_client_id <> '${fixture.ids.client}'::uuid
      $$`);
      const [purge] =
        await tx`select app_private.purge_retention_apply(${randomUUID()},'apply') as result`;
      expect(purge?.result).toMatchObject({ status: 'applied' });
      const [client] =
        await tx`select id from public.clients where id=${fixture.ids.client}`;
      expect(client).toBeUndefined();
      const [retainedEvent] =
        await tx`select id from public.workforce_strike_events where id=${event!.id}`;
      const [retainedCorrection] =
        await tx`select id,reason from public.workforce_strike_corrections
        where workspace_id=${fixture.context.wsA.id} and strike_id=${event!.id}`;
      expect(retainedEvent?.id).toBe(event!.id);
      expect(retainedCorrection?.reason).toBe('retention fixture');
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});

it('rechecks PO authority after strike generation waits on the client row', async () => {
  const fixture = await seedOverdueInitial();
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Math.max(0, fixture.deadlineAt.getTime() + 20 - Date.now()),
    ),
  );
  const holder = sql();
  const caller = sql();
  let announceLocked!: () => void;
  let release!: () => void;
  const locked = new Promise<void>((resolve) => (announceLocked = resolve));
  const gate = new Promise<void>((resolve) => (release = resolve));
  const hold = holder.begin(async (tx) => {
    await tx`select id from public.clients where workspace_id=${fixture.context.wsA.id} and id=${fixture.ids.client} for update`;
    announceLocked();
    await gate;
  });
  try {
    await locked;
    const pending = caller.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.context.po.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [row] = await tx`select public.get_workforce_strikes(
        ${fixture.context.wsA.id},${fixture.context.trainerA.userId}
      ) as result`;
      return row?.result;
    });
    await waitForLockWait('get_workforce_strikes');
    await db`update public.staff_profiles set role='trainer' where user_id=${fixture.context.po.userId}`;
    release();
    await hold;
    await expect(pending).rejects.toMatchObject({
      code: '42501',
      message: 'not_permitted',
    });
    const [events] = await db`
      select count(*)::int as count from public.workforce_strike_events
      where workspace_id=${fixture.context.wsA.id}
    `;
    expect(events?.count).toBe(0);
  } finally {
    release();
    await Promise.allSettled([hold]);
    await db`update public.staff_profiles set role='platform_owner' where user_id=${fixture.context.po.userId}`;
    await caller.end();
    await holder.end();
  }
}, 20_000);

it('mutation: removing the post-wait PO recheck exposes strike reads after demotion', async () => {
  const fixture = await seedOverdueInitial();
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Math.max(0, fixture.deadlineAt.getTime() + 20 - Date.now()),
    ),
  );
  const [definitionRow] = await db`
    select pg_get_functiondef('public.get_workforce_strikes(uuid,uuid)'::regprocedure) as definition
  `;
  const original = definitionRow!.definition as string;
  const guardedBlock = `  perform app_private.record_due_workforce_strikes(pg_catalog.clock_timestamp());
  if auth.uid() is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;`;
  const mutant = original.replace(
    guardedBlock,
    `  perform app_private.record_due_workforce_strikes(pg_catalog.clock_timestamp());
  if false then
    raise exception 'not_permitted' using errcode = '42501';
  end if;`,
  );
  expect(mutant).not.toBe(original);
  const holder = sql();
  const caller = sql();
  try {
    await db.unsafe(mutant);
    let announceLocked!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((resolve) => (announceLocked = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    const hold = holder.begin(async (tx) => {
      await tx`select id from public.clients where workspace_id=${fixture.context.wsA.id} and id=${fixture.ids.client} for update`;
      announceLocked();
      await gate;
    });
    try {
      await locked;
      const pending = caller.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.context.po.userId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const [row] = await tx`select public.get_workforce_strikes(
          ${fixture.context.wsA.id},${fixture.context.trainerA.userId}
        ) as result`;
        return row?.result;
      });
      await waitForLockWait('get_workforce_strikes');
      await db`update public.staff_profiles set role='trainer' where user_id=${fixture.context.po.userId}`;
      release();
      await hold;
      await expect(pending).resolves.toMatchObject({ status: 'ok', count: 1 });
    } finally {
      release();
      await Promise.allSettled([hold]);
    }
  } finally {
    await db.unsafe(original);
    await db`update public.staff_profiles set role='platform_owner' where user_id=${fixture.context.po.userId}`;
    await caller.end();
    await holder.end();
  }
}, 20_000);

it('rechecks PO authority after a correction waits on the strike row', async () => {
  const fixture = await seedOverdueInitial();
  await recordDue(fixture.deadlineAt);
  const [event] = await db`
    select id from public.workforce_strike_events where workspace_id=${fixture.context.wsA.id}
  `;
  const holder = sql();
  const caller = sql();
  let announceLocked!: () => void;
  let release!: () => void;
  const locked = new Promise<void>((resolve) => (announceLocked = resolve));
  const gate = new Promise<void>((resolve) => (release = resolve));
  const hold = holder.begin(async (tx) => {
    await tx`select id from public.workforce_strike_events where workspace_id=${fixture.context.wsA.id} and id=${event!.id} for update`;
    announceLocked();
    await gate;
  });
  try {
    await locked;
    const pending = caller.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.context.po.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [row] = await tx`select public.correct_workforce_strike(
        ${fixture.context.wsA.id},${event!.id},'void',null,'revocation race',${randomUUID()}
      ) as result`;
      return row?.result;
    });
    await waitForLockWait('correct_workforce_strike');
    await db`update public.staff_profiles set role='trainer' where user_id=${fixture.context.po.userId}`;
    release();
    await hold;
    await expect(pending).rejects.toMatchObject({
      code: '42501',
      message: 'not_permitted',
    });
    const [corrections] = await db`
      select count(*)::int as count from public.workforce_strike_corrections
      where workspace_id=${fixture.context.wsA.id} and strike_id=${event!.id}
    `;
    expect(corrections?.count).toBe(0);
  } finally {
    release();
    await Promise.allSettled([hold]);
    await db`update public.staff_profiles set role='platform_owner' where user_id=${fixture.context.po.userId}`;
    await caller.end();
    await holder.end();
  }
}, 20_000);

it('mutation: removing the post-lock PO recheck exposes corrections after demotion', async () => {
  const fixture = await seedOverdueInitial();
  await recordDue(fixture.deadlineAt);
  const [event] = await db`
    select id from public.workforce_strike_events where workspace_id=${fixture.context.wsA.id}
  `;
  const [definitionRow] = await db`
    select pg_get_functiondef('public.correct_workforce_strike(uuid,uuid,text,uuid,text,uuid)'::regprocedure) as definition
  `;
  const original = definitionRow!.definition as string;
  const lockMarker =
    'where e.workspace_id = p_workspace_id and e.id = p_strike_id for update;';
  const lockIndex = original.indexOf(lockMarker);
  expect(lockIndex).toBeGreaterThan(0);
  const afterLock = original.slice(lockIndex + lockMarker.length);
  const guardedBlock = `  if auth.uid() is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;`;
  expect(afterLock).toContain(guardedBlock);
  const mutant =
    original.slice(0, lockIndex + lockMarker.length) +
    afterLock.replace(
      guardedBlock,
      `  if false then
    raise exception 'not_permitted' using errcode = '42501';
  end if;`,
    );
  expect(mutant).not.toBe(original);
  const holder = sql();
  const caller = sql();
  try {
    await db.unsafe(mutant);
    let announceLocked!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((resolve) => (announceLocked = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    const hold = holder.begin(async (tx) => {
      await tx`select id from public.workforce_strike_events where workspace_id=${fixture.context.wsA.id} and id=${event!.id} for update`;
      announceLocked();
      await gate;
    });
    try {
      await locked;
      const pending = caller.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.context.po.userId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const [row] = await tx`select public.correct_workforce_strike(
          ${fixture.context.wsA.id},${event!.id},'void',null,'revocation mutation',${randomUUID()}
        ) as result`;
        return row?.result;
      });
      await waitForLockWait('correct_workforce_strike');
      await db`update public.staff_profiles set role='trainer' where user_id=${fixture.context.po.userId}`;
      release();
      await hold;
      await expect(pending).resolves.toMatchObject({ status: 'ok' });
      const [corrections] = await db`
        select count(*)::int as count from public.workforce_strike_corrections
        where workspace_id=${fixture.context.wsA.id} and strike_id=${event!.id}
      `;
      expect(corrections?.count).toBe(1);
    } finally {
      release();
      await Promise.allSettled([hold]);
    }
  } finally {
    await db.unsafe(original);
    await db`update public.staff_profiles set role='platform_owner' where user_id=${fixture.context.po.userId}`;
    await caller.end();
    await holder.end();
  }
}, 20_000);

it('mutation: removing the PO guard exposes strike reads and corrections', async () => {
  const fixture = await seedOverdueInitial();
  await recordDue(fixture.deadlineAt);
  const [event] = await db`
    select id from public.workforce_strike_events where workspace_id=${fixture.context.wsA.id}
  `;
  await db.begin(async (tx) => {
    const readGuard =
      'if auth.uid() is null or not app_private.is_platform_owner() then';
    await tx`savepoint strike_read_guard_mutation`;
    const [readDefinition] = await tx`
      select pg_get_functiondef('public.get_workforce_strikes(uuid,uuid)'::regprocedure) as definition
    `;
    const readMutant = (readDefinition!.definition as string).replaceAll(
      readGuard,
      'if auth.uid() is null then',
    );
    expect(readMutant).not.toBe(readDefinition!.definition);
    await tx.unsafe(readMutant);
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.context.trainerA.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    const [mutatedRead] = await tx`
      select public.get_workforce_strikes(${fixture.context.wsA.id},${fixture.context.trainerA.userId}) as result
    `;
    expect(mutatedRead?.result).toMatchObject({ status: 'ok' });
    await tx`rollback to savepoint strike_read_guard_mutation`;

    await tx`savepoint strike_correction_guard_mutation`;
    const [correctionDefinition] = await tx`
      select pg_get_functiondef('public.correct_workforce_strike(uuid,uuid,text,uuid,text,uuid)'::regprocedure) as definition
    `;
    const correctionMutant = (correctionDefinition!.definition as string)
      .replaceAll(
        'if actor is null or not app_private.is_platform_owner() then',
        'if actor is null then',
      )
      .replaceAll(
        'if auth.uid() is null or not app_private.is_platform_owner() then',
        'if auth.uid() is null then',
      );
    expect(correctionMutant).not.toBe(correctionDefinition!.definition);
    await tx.unsafe(correctionMutant);
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.context.trainerA.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    const [mutatedCorrection] = await tx`
      select public.correct_workforce_strike(
        ${fixture.context.wsA.id},${event!.id},'void',null,'guard mutation',${randomUUID()}
      ) as result
    `;
    expect(mutatedCorrection?.result).toMatchObject({ status: 'ok' });
    await tx`rollback to savepoint strike_correction_guard_mutation`;
  });
});

it('mutation: removing idempotency replay checks exposes duplicate correction writes', async () => {
  const fixture = await seedOverdueInitial();
  await recordDue(fixture.deadlineAt);
  const [event] = await db`
    select id from public.workforce_strike_events where workspace_id=${fixture.context.wsA.id}
  `;
  const rollback = new Error('rollback strike idempotency mutation');
  let duplicateRejected = false;
  let originalDefinition = '';
  try {
    await db.begin(async (tx) => {
      const [definitionRow] = await tx`
        select pg_get_functiondef('public.correct_workforce_strike(uuid,uuid,text,uuid,text,uuid)'::regprocedure) as definition
      `;
      originalDefinition = definitionRow!.definition as string;
      const replayCheck =
        /\n  if found then\n    if prior\.request_hash <> request_hash then\n      return jsonb_build_object\('status', 'idempotency_conflict'\);\n    end if;\n    return jsonb_build_object\([\s\S]*?\n    \);\n  end if;/g;
      const mutant = originalDefinition.replace(replayCheck, '');
      expect(mutant).not.toBe(originalDefinition);
      expect(mutant.match(/idempotency_conflict/g)).toBeNull();
      await tx.unsafe(mutant);
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.context.po.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const key = randomUUID();
      const invoke = () => tx`
        select public.correct_workforce_strike(
          ${fixture.context.wsA.id},${event!.id},'void',null,'duplicate mutation',${key}
        ) as result
      `;
      expect((await invoke())[0]?.result).toMatchObject({ status: 'ok' });
      try {
        await invoke();
      } catch (error) {
        duplicateRejected = String(error).includes(
          'workforce_strike_corrections_workspace_id_idempotency_key_key',
        );
        throw rollback;
      }
      throw new Error('idempotency mutant did not expose duplicate write');
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  expect(duplicateRejected).toBe(true);
  const [restored] = await db`
    select pg_get_functiondef('public.correct_workforce_strike(uuid,uuid,text,uuid,text,uuid)'::regprocedure) as definition
  `;
  expect(restored?.definition).toBe(originalDefinition);
});
