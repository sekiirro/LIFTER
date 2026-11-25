import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { admin, createStaff, sql } from './harness';
import { seedSubmittedIntake } from './f17-plan-publish-fixture';
import { clientContext, graph } from './registration-approval-fixture';

const db = sql();
afterAll(() => db.end());

async function seedOverdueInitial() {
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
        (clock_timestamp() + interval '2 seconds')::timestamptz
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

async function recordDue(deadlineAt: Date) {
  const worker = sql();
  try {
    const [row] = await worker`
      select app_private.record_due_workforce_strikes(
        ${new Date(deadlineAt.getTime() + 10).toISOString()}::timestamptz
      ) as inserted
    `;
    return row?.inserted as number;
  } finally {
    await worker.end();
  }
}

it('records the persisted D-03 breach once at deadline, even without later delivery', async () => {
  const fixture = await seedOverdueInitial();
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

it('keeps a D-03 breach immutable when the first pair is completed late', async () => {
  const fixture = await seedOverdueInitial();
  await recordDue(fixture.deadlineAt);
  const lateActivation = new Date(fixture.deadlineAt.getTime() + 60_000);
  await db`
    insert into public.subscription_activations(
      workspace_id,subscription_id,activated_at,delivery_event_id,activation_source
    ) values (
      ${fixture.context.wsA.id},${fixture.ids.subscription},${lateActivation.toISOString()}::timestamptz,
      ${randomUUID()},'po_override'
    )
  `;
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

it('uses the exact rolling window and only exposes 3/6/9 review flags to the PO', async () => {
  const context = await clientContext();
  await db.begin(async (tx) => {
    for (let index = 0; index < 9; index++) {
      await tx`
        insert into public.workforce_strike_events(
          workspace_id,trainer_user_id,source_key,breach_at
        ) values (
          ${context.wsA.id},${context.trainerA.userId},${randomUUID()},
          transaction_timestamp() - (${index}::text || ' hours')::interval
        )
      `;
    }
    await tx`
      insert into public.workforce_strike_events(
        workspace_id,trainer_user_id,source_key,breach_at
      ) values (
        ${context.wsA.id},${context.trainerA.userId},${randomUUID()},
        transaction_timestamp() - interval '90 days'
      )
    `;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: context.po.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    const [result] = await tx`
      select public.get_workforce_strikes(${context.wsA.id},${context.trainerA.userId}) as result
    `;
    expect(result?.result).toMatchObject({
      status: 'ok',
      count: 9,
      review_threshold: 9,
    });
  });
});

it('appends void, reinstate and breach-time reattribution without changing the strike row', async () => {
  const fixture = await seedOverdueInitial();
  await recordDue(fixture.deadlineAt);
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
      created_at: new Date(fixture.deadlineAt.getTime() - 60_000).toISOString(),
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
  expect((await call('reinstate')).data).toMatchObject({ status: 'ok' });
  expect((await call('reattribute')).data).toMatchObject({ status: 'ok' });

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
});

it('denies Trainer, WO and Sales strike reads and corrections before resolving identifiers', async () => {
  const context = await clientContext();
  for (const userId of [
    context.trainerA.userId,
    context.woA.userId,
    context.salesA.userId,
  ]) {
    await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [read] = await tx`
        select public.get_workforce_strikes(${context.wsA.id},${randomUUID()}) as result
      `;
      const [write] = await tx`
        select public.correct_workforce_strike(
          ${context.wsA.id},${randomUUID()},'void',null,'forbidden',${randomUUID()}
        ) as result
      `;
      expect(read?.result).toMatchObject({ status: 'not_permitted' });
      expect(write?.result).toMatchObject({ status: 'not_permitted' });
    });
  }
});
