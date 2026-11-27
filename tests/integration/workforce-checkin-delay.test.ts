import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import { sql } from './harness';
import { clientContext, graph } from './registration-approval-fixture';

const db = sql();
afterAll(() => db.end());

type Tx = TransactionSql;

async function asUser<T>(tx: Tx, userId: string, run: (sp: Tx) => Promise<T>) {
  return (await tx.savepoint(async (sp) => {
    await sp`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
    await sp`set local role authenticated`;
    const result = await run(sp as Tx);
    await sp`reset role`;
    return result;
  })) as T;
}

async function evaluator(
  workspaceId: string,
  jwtRole = 'service_role',
  userId?: string,
) {
  const connection = sql();
  try {
    return await connection.begin(async (tx) => {
      await tx`select set_config(
        'request.jwt.claims',
        ${JSON.stringify({ role: jwtRole, ...(userId ? { sub: userId } : {}) })},true)`;
      await tx`set local role service_role`;
      const [row] =
        await tx`select public.run_p7_checkin_delay_evaluator(${workspaceId}) as result`;
      await tx`reset role`;
      return row!.result;
    });
  } finally {
    await connection.end();
  }
}

async function checkinFixture(
  options: {
    ageHours?: number;
    ageDays?: number;
    exactFollowup?: boolean;
    submitted?: boolean;
    reassignAfterBreach?: boolean;
  } = {},
) {
  const f = await clientContext();
  return db.begin(async (tx) => {
    const ids = await graph(tx, f);
    const [clock] = await tx`
      select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today`;
    const today = clock!.today as string;
    await tx`insert into public.subscription_activations(
      workspace_id,subscription_id,activated_at,delivery_event_id,activation_source
    ) values(
      ${f.wsA.id},${ids.subscription},
      ((${today}::date - 7)::timestamp + interval '9 hours') at time zone 'Africa/Cairo',
      ${randomUUID()},'po_override'
    )`;
    const terms = `p7-delay-${randomUUID()}`;
    const formId = randomUUID();
    const definition = {
      questions: [
        {
          id: 'workoutAdherence',
          sectionId: 'checkin',
          type: 'number',
          required: false,
          validation: { min: 0, max: 10, step: 1 },
        },
        {
          id: 'dietAdherence',
          sectionId: 'checkin',
          type: 'number',
          required: false,
          validation: { min: 0, max: 10, step: 1 },
        },
      ],
    };
    await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
      values(${terms},'terms','published')`;
    await tx`insert into public.forms(id,workspace_id,name)
      values(${formId},${f.wsA.id},'Synthetic check-in delay')`;
    await tx`insert into public.form_versions(
      workspace_id,form_id,version_number,terms_policy_version,definition,status
    ) values(${f.wsA.id},${formId},1,${terms},${tx.json(definition as JSONValue)},'published')`;
    const config = await asUser(
      tx,
      f.trainerA.userId,
      (sp) =>
        sp`select public.configure_weekly_checkin_form(${f.wsA.id},${formId},1)`,
    );
    expect(config[0]?.configure_weekly_checkin_form).toMatchObject({
      status: 'configured',
    });
    await tx`select app_private.f23_weekly_checkin_run(${today}::date)`;
    const [assignment] = await tx`
      select id from public.form_assignments
      where workspace_id=${f.wsA.id} and client_id=${ids.client} and form_id=${formId}
        and occurrence_key=${'weekly_checkin:' + today}`;
    expect(assignment).toBeDefined();
    const assignmentId = assignment!.id as string;

    await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by)
      values(${f.wsA.id},${f.trainerB.userId},${f.po.userId})`;
    const [memberships] = await tx`
      select
        (select id from public.workspace_memberships where workspace_id=${f.wsA.id}
          and user_id=${f.trainerA.userId}) as trainer_a_membership,
        (select id from public.workspace_memberships where workspace_id=${f.wsA.id}
          and user_id=${f.trainerB.userId}) as trainer_b_membership`;
    const ageHours =
      options.ageDays === undefined
        ? (options.ageHours ?? 26)
        : options.ageDays * 24;
    await tx`insert into public.client_trainer_assignments(
      workspace_id,client_id,trainer_user_id,assigned_by,assigned_at,workspace_membership_id
    ) values(${f.wsA.id},${ids.client},${f.trainerA.userId},${f.po.userId},
      clock_timestamp() - (${ageHours} * interval '1 hour') - interval '24 hours',
      ${memberships!.trainer_a_membership})`;
    if (options.reassignAfterBreach) {
      await tx`update public.client_trainer_assignments
        set ended_at=clock_timestamp() - (${ageHours} * interval '1 hour') + interval '24 hours 30 minutes',
          ended_by=${f.po.userId}
        where workspace_id=${f.wsA.id} and client_id=${ids.client} and ended_at is null`;
      await tx`insert into public.client_trainer_assignments(
        workspace_id,client_id,trainer_user_id,assigned_by,assigned_at,workspace_membership_id
      ) values(${f.wsA.id},${ids.client},${f.trainerB.userId},${f.po.userId},
        clock_timestamp() - (${ageHours} * interval '1 hour') + interval '24 hours 30 minutes',
        ${memberships!.trainer_b_membership})`;
    }

    if (options.submitted !== false) {
      await tx`insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
        values(${f.wsA.id},${assignmentId},1,${tx.json({ workoutAdherence: 8, dietAdherence: 5 })})`;
      await tx`insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
        values(${f.wsA.id},${assignmentId},1,
          clock_timestamp() - (${ageHours} * interval '1 hour'))`;
      if (options.exactFollowup) {
        await tx`insert into app_private.workforce_checkin_transitions(
          workspace_id,assignment_id,status,actor_user_id,occurred_at
        ) select ${f.wsA.id},${assignmentId},'Followed Up',${f.trainerA.userId},
          s.submitted_at + interval '24 hours'
        from app_private.form_submissions s
        where s.workspace_id=${f.wsA.id} and s.assignment_id=${assignmentId}`;
      }
    }
    return { f, clientId: ids.client, assignmentId, workspaceId: f.wsA.id };
  });
}

async function penalty(workspaceId: string, assignmentId: string) {
  return db`
    select id,staff_user_id,points::text as points,effective_month::text as effective_month,
      original_month::text as original_month,source_key::text as source_key,reason_code
    from public.p7_adjustment_entries
    where workspace_id=${workspaceId} and source_key=${assignmentId}::uuid`;
}

describe('P7 T010/T011 check-in delay occurrence', () => {
  it('records one catch-up penalty at the deadline and retries idempotently', async () => {
    const f = await checkinFixture({ reassignAfterBreach: true });
    const [source] = await db`
      select s.submitted_at + interval '24 hours' as due_at
      from app_private.form_submissions s
      where s.workspace_id=${f.workspaceId} and s.assignment_id=${f.assignmentId}`;
    await evaluator(f.workspaceId);
    await evaluator(f.workspaceId);
    const rows = await penalty(f.workspaceId, f.assignmentId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      staff_user_id: f.f.trainerA.userId,
      points: '-0.50',
      source_key: f.assignmentId,
      reason_code: 'checkin_delay',
    });
    const [month] = await db`
      select app_private.p7_month_for_trigger(${source!.due_at}::timestamptz)::text as month`;
    expect(rows[0]!.original_month).toBe(month!.month);
    expect(rows[0]!.effective_month).toBe(month!.month);
    const [audit] = await db`
      select action,target_table,details from public.audit_events where target_id=${rows[0]!.id}::uuid`;
    expect(audit).toEqual({
      action: 'workforce.checkin_delay_penalty_recorded',
      target_table: 'p7_adjustment_entries',
      details: { reference: f.assignmentId },
    });
    await expect(
      db`update public.p7_adjustment_entries set points=-1.00 where id=${rows[0]!.id}::uuid`,
    ).rejects.toThrow('p7_ledger_immutable');
    await expect(
      db`delete from public.p7_adjustment_entries where id=${rows[0]!.id}::uuid`,
    ).rejects.toThrow('p7_ledger_immutable');
  });

  it('does not penalize an exact 24-hour follow-up or client lateness without submission', async () => {
    const exact = await checkinFixture({ ageHours: 24, exactFollowup: true });
    const noSubmission = await checkinFixture({ submitted: false });
    await evaluator(exact.f.wsB.id);
    await evaluator(exact.workspaceId);
    await evaluator(noSubmission.workspaceId);
    expect(await penalty(exact.workspaceId, exact.assignmentId)).toHaveLength(
      0,
    );
    expect(
      await penalty(noSubmission.workspaceId, noSubmission.assignmentId),
    ).toHaveLength(0);
  });

  it('converges a late confirmation and the evaluator on one occurrence', async () => {
    const f = await checkinFixture();
    const confirmed = await f.f.trainerA.client.rpc(
      'confirm_trainer_checkin_followup',
      {
        p_workspace_id: f.workspaceId,
        p_assignment_id: f.assignmentId,
      },
    );
    expect(confirmed.error).toBeNull();
    await evaluator(f.workspaceId);
    const rows = await penalty(f.workspaceId, f.assignmentId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      staff_user_id: f.f.trainerA.userId,
      points: '-0.50',
      source_key: f.assignmentId,
      reason_code: 'checkin_delay',
    });
    const [history] = await db`
      select array_agg(status order by occurred_at,status) as statuses
      from app_private.workforce_checkin_transitions
      where workspace_id=${f.workspaceId} and assignment_id=${f.assignmentId}`;
    expect(history!.statuses).toEqual(['Pending', 'Late', 'Followed Up']);
  });

  it('serializes concurrent catch-up calls and rejects an authenticated Trainer operator call', async () => {
    const f = await checkinFixture();
    const [confirmed] = await Promise.all([
      f.f.trainerA.client.rpc('confirm_trainer_checkin_followup', {
        p_workspace_id: f.workspaceId,
        p_assignment_id: f.assignmentId,
      }),
      evaluator(f.workspaceId),
    ]);
    expect(confirmed.error).toBeNull();
    expect(await penalty(f.workspaceId, f.assignmentId)).toHaveLength(1);
    await expect(
      evaluator(f.workspaceId, 'authenticated', f.f.trainerA.userId),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('routes a catch-up penalty from a finalized month into the current open month', async () => {
    const f = await checkinFixture({ ageDays: 40 });
    const [periods] = await db`
      select app_private.p7_month_for_trigger(s.submitted_at + interval '24 hours')::text as original_month,
        app_private.p7_month_for_trigger(clock_timestamp())::text as open_month
      from app_private.form_submissions s
      where s.workspace_id=${f.workspaceId} and s.assignment_id=${f.assignmentId}`;
    const finalized = await f.f.po.client.rpc('p7_finalize_month', {
      p_workspace_id: f.workspaceId,
      p_month: periods!.original_month,
    });
    expect(finalized.error).toBeNull();
    expect(finalized.data).toMatchObject({ status: 'finalized' });
    await evaluator(f.workspaceId);
    expect(await penalty(f.workspaceId, f.assignmentId)).toMatchObject([
      {
        points: '-0.50',
        effective_month: periods!.open_month,
        original_month: periods!.original_month,
      },
    ]);
  });
});
