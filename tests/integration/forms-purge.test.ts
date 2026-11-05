import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  clientContext,
  graph,
  probe,
  sql,
} from './registration-approval-fixture';

const db = sql();

async function refund(
  tx: TransactionSql,
  actorId: string,
  input: Record<string, unknown>,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: actorId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select public.record_refund(${tx.json(input as never)}) as result
    `;
    return row!.result as { status: string };
  } finally {
    await tx`reset role`;
  }
}

async function closeClient(
  tx: TransactionSql,
  actorId: string,
  input: Record<string, unknown>,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: actorId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] =
      await tx`select public.close_client(${tx.json(input as never)}) as result`;
    return row!.result as { status: string; operation_id?: string };
  } finally {
    await tx`reset role`;
  }
}

describe.runIf(process.env.LIFTER_SUPABASE_STACK === 'd')(
  'T018 synthetic lifecycle proof (Stack D only; no cron activation)',
  () => {
    it('uses a dedicated purge scheduler lock without changing alert evaluation locks', async () => {
      await probe(async (tx) => {
        const [activate] = await tx`
          select pg_get_functiondef('app_private.f15_forms_purge_schedule_activate()'::regprocedure) as body`;
        const [deactivate] = await tx`
          select pg_get_functiondef('app_private.f15_forms_purge_schedule_deactivate()'::regprocedure) as body`;
        const [evaluator] = await tx`
          select pg_get_functiondef('app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer)'::regprocedure) as body`;
        const [alertScheduler] = await tx`
          select pg_get_functiondef('app_private.f15_alert_schedule_activate()'::regprocedure) as body`;
        expect(activate!.body).toContain(
          'pg_catalog.pg_advisory_xact_lock(11011,319)',
        );
        expect(deactivate!.body).toContain(
          'pg_catalog.pg_advisory_xact_lock(11011,319)',
        );
        expect(evaluator!.body).toContain(
          'pg_catalog.pg_advisory_xact_lock(11011,318)',
        );
        expect(alertScheduler!.body).toContain(
          'pg_catalog.pg_advisory_xact_lock(11011,317)',
        );
      });
    });

    it('starts retention at the authoritative refund/deactivation timestamp, not approval or assignment', async () => {
      const f = await clientContext();
      await probe(async (tx) => {
        const ids = await graph(tx, f);
        expect(
          await tx`select id from app_private.form_retention_windows
        where workspace_id=${f.wsA.id} and client_id=${ids.client}`,
        ).toHaveLength(0);

        const result = await refund(tx, f.po.userId, {
          workspace_id: f.wsA.id,
          client_id: ids.client,
          purchase_id: ids.subscription,
          request_key: randomUUID(),
          amount_minor: '600',
          external_confirmation: true,
        });
        expect(result.status).toBe('ok');

        const [source] = await tx`
      select r.recorded_at as refund_at, c.deactivated_at,c.deactivation_reason,
        r.amount_minor::text as refund_amount,
        (select sum(a.amount_minor)::text from public.refund_allocation_events a
          where a.workspace_id=r.workspace_id and a.refund_operation_id=r.id) as allocation_amount,
        (select sum(a.commission_minor)::text from public.refund_allocation_events a
          where a.workspace_id=r.workspace_id and a.refund_operation_id=r.id) as commission_correction
      from public.refund_operations r
      join public.clients c on c.workspace_id=r.workspace_id and c.id=r.client_id
      where r.workspace_id=${f.wsA.id} and r.client_id=${ids.client}
    `;
        expect(source).toBeDefined();
        expect(source!.refund_at).toEqual(source!.deactivated_at);
        expect(source).toMatchObject({
          deactivation_reason: 'refund',
          refund_amount: '600',
          allocation_amount: '-600',
          commission_correction: '-1',
        });

        const windows = await tx`
      select source_kind,source_event_id,ended_at,purge_after
      from app_private.form_retention_windows
      where workspace_id=${f.wsA.id} and client_id=${ids.client}
    `;
        expect(windows).toEqual([
          expect.objectContaining({
            source_kind: 'refund',
            source_event_id: expect.any(String),
            ended_at: source!.refund_at,
            purge_after: new Date(
              new Date(source!.deactivated_at).getTime() +
                30 * 24 * 60 * 60 * 1000,
            ),
          }),
        ]);
      });
    });

    it('closes with an immutable non-financial fact, immediate lockout, and a 30-day window', async () => {
      const f = await clientContext();
      await probe(async (tx) => {
        const ids = await graph(tx, f);
        const [schedule] = await tx`
          select pg_get_userbyid(p.proowner) as owner,p.prosecdef,
            has_function_privilege('authenticated',p.oid,'execute') as authenticated_can_activate
          from pg_proc p where p.oid='app_private.f15_forms_purge_schedule_activate()'::regprocedure
        `;
        expect(schedule).toEqual({
          owner: 'postgres',
          prosecdef: false,
          authenticated_can_activate: false,
        });
        expect(await tx`select count(*)::int as count from cron.job`).toEqual([
          { count: 0 },
        ]);
        const key = randomUUID();
        const formId = randomUUID();
        const assignmentId = randomUUID();
        const policy = `t018-${randomUUID()}`;
        const definition = { questions: [{ id: 'q1', type: 'shortText' }] };
        await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
          values(${policy},'terms','published')`;
        await tx`insert into public.forms(id,workspace_id,name)
          values(${formId},${f.wsA.id},'T018 synthetic reusable template')`;
        await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status,published_at)
          values(${f.wsA.id},${formId},1,${policy},${tx.json(definition)},'published',clock_timestamp())`;
        await tx`insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot,created_at)
          values(${assignmentId},${f.wsA.id},${ids.client},${formId},1,${policy},${tx.json(definition)},clock_timestamp()-interval '60 days')`;
        await tx`insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
          values(${f.wsA.id},${assignmentId},1,${tx.json({ q1: 'synthetic answer' })}),
            (${f.wsA.id},${assignmentId},2,${tx.json({ q1: 'synthetic corrected answer' })})`;
        await tx`insert into public.form_answer_drafts(workspace_id,assignment_id,revision,answer_values)
          values(${f.wsA.id},${assignmentId},3,${tx.json({ q1: 'synthetic draft' })})`;
        await tx`insert into app_private.form_corrections(workspace_id,assignment_id,revision,actor_user_id,correction_note)
          values(${f.wsA.id},${assignmentId},2,${f.po.userId},'synthetic correction')`;
        await tx`insert into app_private.form_correction_intents(workspace_id,assignment_id,intent_key,request_hash,result)
          values(${f.wsA.id},${assignmentId},${randomUUID()},decode(repeat('cd',32),'hex'),${tx.json({ status: 'corrected' })})`;
        await tx`insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
          values(${f.wsA.id},${assignmentId},1,clock_timestamp())`;
        await tx`insert into app_private.form_submission_slas(workspace_id,assignment_id,rule_id,start_date,day_five_date,deadline_at)
          values(${f.wsA.id},${assignmentId},'cairo-d03-v1',current_date,current_date,clock_timestamp())`;
        await tx`insert into app_private.form_submission_intents(workspace_id,assignment_id,intent_key,request_hash,result)
          values(${f.wsA.id},${assignmentId},${randomUUID()},decode(repeat('ab',32),'hex'),${tx.json({ status: 'submitted' })})`;
        const financialBefore = await tx`
          select
            (select count(*)::int from public.payment_events where workspace_id=${f.wsA.id} and subscription_id=${ids.subscription}) as payments,
            (select count(*)::int from public.refund_operations where workspace_id=${f.wsA.id} and client_id=${ids.client}) as refunds,
            (select count(*)::int from public.refund_allocation_events where workspace_id=${f.wsA.id} and subscription_id=${ids.subscription}) as allocations,
            (select count(*)::int from public.subscription_obligation_cancellations where workspace_id=${f.wsA.id} and subscription_id=${ids.subscription}) as cancellations
        `;
        const result = await closeClient(tx, f.po.userId, {
          workspace_id: f.wsA.id,
          client_id: ids.client,
          request_key: key,
        });
        expect(result.status).toBe('ok');
        const [clientUser] = await tx`
          select auth_user_id from public.clients
          where workspace_id=${f.wsA.id} and id=${ids.client}`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: clientUser!.auth_user_id, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const [endedContext] = await tx`
          select public.read_form_assignment_context(${assignmentId}) as value`;
        expect(endedContext!.value).toMatchObject({
          relationship_active: false,
        });
        await tx`reset role`;
        const [fact] = await tx`
          select c.deactivation_reason,c.deactivated_at,o.recorded_at,o.id as operation_id,
            d.auth_user_id as lockout_user, l.auth_user_id as auth_lockout_user,
            (select count(*)::int from app_private.form_retention_windows w
              where w.workspace_id=c.workspace_id and w.client_id=c.id) as window_count,
            (select count(*)::int from public.audit_events a where a.workspace_id=c.workspace_id
              and a.target_id=c.id and a.action='client.deactivated'
              and a.details->>'reason'='closure') as audit_count
          from public.clients c
          join app_private.client_closure_operations o on o.workspace_id=c.workspace_id
            and o.client_id=c.id and o.recorded_at=c.deactivated_at
          join app_private.client_deactivation_state d on d.client_id=c.id
          join app_private.refund_auth_lockouts l on l.client_id=c.id
          where c.workspace_id=${f.wsA.id} and c.id=${ids.client}
        `;
        expect(fact).toMatchObject({
          deactivation_reason: 'closure',
          lockout_user: (
            await tx`select auth_user_id from public.clients where id=${ids.client}`
          )[0]!.auth_user_id,
          auth_lockout_user: (
            await tx`select auth_user_id from public.clients where id=${ids.client}`
          )[0]!.auth_user_id,
          window_count: 1,
          audit_count: 1,
        });
        expect(fact!.recorded_at).toEqual(fact!.deactivated_at);
        const [window] = await tx`
          select source_event_id,source_kind,ended_at,purge_after
          from app_private.form_retention_windows where workspace_id=${f.wsA.id} and client_id=${ids.client}
        `;
        expect(window).toMatchObject({
          source_event_id: fact!.operation_id,
          source_kind: 'closure',
          ended_at: fact!.deactivated_at,
          purge_after: new Date(
            new Date(fact!.deactivated_at).getTime() + 30 * 24 * 60 * 60 * 1000,
          ),
        });
        expect(new Date(window!.ended_at).getTime()).toBeGreaterThan(
          new Date(
            (
              await tx`select created_at from public.form_assignments where workspace_id=${f.wsA.id} and id=${assignmentId}`
            )[0]!.created_at,
          ).getTime(),
        );
        expect(
          await closeClient(tx, f.po.userId, {
            workspace_id: f.wsA.id,
            client_id: ids.client,
            request_key: key,
          }),
        ).toEqual(result);
        const financialAfter = await tx`
          select
            (select count(*)::int from public.payment_events where workspace_id=${f.wsA.id} and subscription_id=${ids.subscription}) as payments,
            (select count(*)::int from public.refund_operations where workspace_id=${f.wsA.id} and client_id=${ids.client}) as refunds,
            (select count(*)::int from public.refund_allocation_events where workspace_id=${f.wsA.id} and subscription_id=${ids.subscription}) as allocations,
            (select count(*)::int from public.subscription_obligation_cancellations where workspace_id=${f.wsA.id} and subscription_id=${ids.subscription}) as cancellations
        `;
        expect(financialAfter).toEqual(financialBefore);
        const [auditCountBefore] =
          await tx`select count(*)::int as count from public.audit_events where workspace_id=${f.wsA.id}`;
        expect(
          await tx`select app_private.purge_ended_form_answers_at(
          ${f.wsA.id},${ids.client},(select purge_after from app_private.form_retention_windows
            where workspace_id=${f.wsA.id} and client_id=${ids.client})) as result`,
        ).toMatchObject([
          { result: { status: 'purged', revisions: 2, drafts: 1 } },
        ]);
        for (const table of [
          'public.form_answer_revisions',
          'public.form_answer_drafts',
          'app_private.form_corrections',
          'app_private.form_correction_intents',
          'app_private.form_submissions',
          'app_private.form_submission_slas',
          'app_private.form_submission_intents',
        ]) {
          const [row] = await tx.unsafe(
            `select count(*)::int as count from ${table} where workspace_id=$1 and assignment_id=$2`,
            [f.wsA.id, assignmentId],
          );
          expect(row?.count, table).toBe(0);
        }
        expect(
          await tx`select id from public.forms where id=${formId}`,
        ).toHaveLength(1);
        expect(
          await tx`select count(*)::int as count from public.audit_events where workspace_id=${f.wsA.id}`,
        ).toEqual([auditCountBefore]);
        expect(
          await tx`select app_private.purge_ended_form_answers_at(
          ${f.wsA.id},${ids.client},(select purge_after from app_private.form_retention_windows
            where workspace_id=${f.wsA.id} and client_id=${ids.client})) as result`,
        ).toMatchObject([
          { result: { status: 'purged', revisions: 0, drafts: 0 } },
        ]);
        expect(
          await tx`select id from public.forms where id=${formId}`,
        ).toHaveLength(1);
        expect(
          await tx`select count(*)::int as count from public.audit_events where workspace_id=${f.wsA.id}`,
        ).toEqual([auditCountBefore]);
        expect(
          await tx`
          select
            (select count(*)::int from public.payment_events where workspace_id=${f.wsA.id} and subscription_id=${ids.subscription}) as payments,
            (select count(*)::int from public.refund_operations where workspace_id=${f.wsA.id} and client_id=${ids.client}) as refunds,
            (select count(*)::int from public.refund_allocation_events where workspace_id=${f.wsA.id} and subscription_id=${ids.subscription}) as allocations,
            (select count(*)::int from public.subscription_obligation_cancellations where workspace_id=${f.wsA.id} and subscription_id=${ids.subscription}) as cancellations
        `,
        ).toEqual(financialBefore);
        expect(await tx`select count(*)::int as count from cron.job`).toEqual([
          { count: 0 },
        ]);
        await expect(
          tx.savepoint(async (sp) => {
            await sp`update public.clients set deactivation_reason='refund' where workspace_id=${f.wsA.id} and id=${ids.client}`;
          }),
        ).rejects.toThrow();
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: (await tx`select auth_user_id from public.clients where id=${ids.client}`)[0]!.auth_user_id, role: 'authenticated' })},true)`;
        expect(
          await tx`select app_private.client_has_access(${f.wsA.id},${ids.client}) as allowed`,
        ).toEqual([{ allowed: false }]);
      });
    });
    afterAll(() => db.end());
  },
);
