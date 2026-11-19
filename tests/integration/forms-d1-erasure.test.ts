import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createStaff, sql } from './harness';
import { clientContext, pending } from './client-accounts-fixture';

const db = sql();
afterAll(() => db.end());

const rollback = new Error('rollback T029 D1 privacy erasure fixture');

describe('T029 D1 privacy erasure (DB security, atomicity, legal holds, and mutations)', () => {
  it('denies direct UPDATE/DELETE/TRUNCATE, forged GUCs, and API/service_role execution', async () => {
    const [policyRow] = await db`
      select count(*)::int as delete_policies
      from pg_catalog.pg_policies
      where schemaname='public' and tablename='audit_events' and cmd='DELETE'
    `;
    expect(policyRow?.delete_policies).toBe(0);

    const [selectPolicy] = await db`
      select policyname from pg_catalog.pg_policies
      where schemaname='public' and tablename='audit_events' and policyname='audit_events_select_scoped'
    `;
    expect(selectPolicy?.policyname).toBe('audit_events_select_scoped');

    for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
      for (const priv of ['DELETE', 'UPDATE', 'TRUNCATE']) {
        const [grant] = await db`
          select has_table_privilege(${role},'public.audit_events',${priv}) as allowed
        `;
        expect(grant?.allowed, `${role} ${priv} on audit_events`).toBe(false);
      }
      for (const fn of [
        'app_private.d1_erase_inapplicable_answers(uuid,uuid)',
        'app_private.f15_d1_erasure_run_batch(integer)',
        'app_private.f15_d1_erasure_run()',
        'app_private.f15_d1_erasure_schedule_activate()',
        'app_private.f15_d1_erasure_schedule_deactivate()',
      ]) {
        const [fnGrant] = await db`
          select has_function_privilege(${role},${fn},'EXECUTE') as allowed
        `;
        expect(fnGrant?.allowed, `${role} exec ${fn}`).toBe(false);
      }
    }

    const fnMeta = await db`
      select p.proname, p.prosecdef, p.proconfig,
        pg_catalog.pg_get_userbyid(p.proowner) as owner
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private'
        and p.proname in (
          'd1_erase_inapplicable_answers',
          'f15_d1_erasure_run_batch',
          'f15_d1_erasure_run',
          'f15_d1_erasure_schedule_activate',
          'f15_d1_erasure_schedule_deactivate',
          'guard_form_d1_erasure_control'
        )
    `;
    expect(fnMeta).toHaveLength(6);
    for (const row of fnMeta) {
      expect(row.owner).toBe('postgres');
      expect(row.proconfig).toContain('search_path=""');
    }

    const context = await clientContext();
    await expect(
      db.begin(async (tx) => {
        const [auditRow] = await tx`
          insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
          values(null,'form.answer_viewed','form_answer_current',${randomUUID()},${context.wsA.id},'{"view":"current","revision":1}'::jsonb)
          returning id
        `;
        await expect(
          tx.savepoint(async (sp) => {
            await sp`delete from public.audit_events where id=${auditRow!.id}`;
          }),
        ).rejects.toThrow('Audit events are immutable');

        await expect(
          tx.savepoint(async (sp) => {
            await sp`update public.audit_events set action='form.tampered' where id=${auditRow!.id}`;
          }),
        ).rejects.toThrow('Audit events are immutable');

        await expect(
          tx.savepoint(async (sp) => {
            await sp`truncate public.audit_events cascade`;
          }),
        ).rejects.toThrow('Audit events are immutable');

        // A caller-settable GUC alone cannot authorize deletion.
        await expect(
          tx.savepoint(async (sp) => {
            await sp`select pg_catalog.set_config('app_private.f15_d1_erasure_token',${randomUUID()},true)`;
            await sp`delete from public.audit_events where id=${auditRow!.id}`;
          }),
        ).rejects.toThrow('Audit events are immutable');

        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('erases currently inapplicable answers across versions/drafts and matching audit rows atomically with counts-only control', async () => {
    const wsA = await clientContext();
    const wsB = await clientContext();
    const po = await createStaff('platform_owner', 't029-d1-po');
    const wo = await createStaff('workspace_owner', 't029-d1-wo');
    const formA = randomUUID();
    const formB = randomUUID();
    const assignA = randomUUID();
    const assignB = randomUUID();
    const policy = `t029-${randomUUID()}`;
    const canary1 = 'SYNTHETIC-CANARY-REV1';
    const canary2 = 'SYNTHETIC-CANARY-REV2';
    const canaryDraft = 'SYNTHETIC-CANARY-DRAFT';

    const snapshot = {
      questions: [
        { id: 'has_injury', type: 'boolean', required: true },
        {
          id: 'injury_detail',
          type: 'shortText',
          when: {
            mode: 'all',
            conditions: [
              { questionId: 'has_injury', operator: 'equals', value: true },
            ],
          },
        },
        { id: 'goal', type: 'shortText', required: true },
      ],
    };

    await expect(
      db.begin(async (tx) => {
        const clientA = await pending(tx, wsA);
        const clientB = await pending(tx, wsB);
        await tx`
          insert into public.workspace_memberships(workspace_id,user_id,granted_by)
          values(${wsA.wsA.id},${wo.userId},${po.userId})
        `;
        await tx`
          insert into app_private.terms_policy_versions(version,policy_kind,status)
          values(${policy},'terms','published')
        `;

        for (const [ctx, formId, assignId, clientId] of [
          [wsA, formA, assignA, clientA.id],
          [wsB, formB, assignB, clientB.id],
        ] as const) {
          await tx`insert into public.forms(id,workspace_id,name) values(${formId},${ctx.wsA.id},'T029 D1 Form')`;
          await tx`
            insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
            values(${ctx.wsA.id},${formId},1,${policy},${tx.json(snapshot)},'published')
          `;
          await tx`
            insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
            values(${assignId},${ctx.wsA.id},${clientId},${formId},1,${policy},${tx.json(snapshot)})
          `;
        }

        // Tenant A has inapplicable answers across rev 1..3 + submitted draft.
        await tx`
          insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
          values
            (${wsA.wsA.id},${assignA},1,${tx.json({ has_injury: true, injury_detail: canary1, goal: 'strength' })}),
            (${wsA.wsA.id},${assignA},2,${tx.json({ has_injury: true, injury_detail: canary2, goal: 'endurance' })}),
            (${wsA.wsA.id},${assignA},3,${tx.json({ has_injury: false, injury_detail: canary2, goal: 'endurance' })}),
            (${wsA.wsA.id},${assignA},4,${tx.json({ has_injury: false, goal: 'mobility' })})
        `;
        await tx`
          insert into public.form_answer_drafts(workspace_id,assignment_id,revision,answer_values)
          values(${wsA.wsA.id},${assignA},1,${tx.json({ has_injury: true, injury_detail: canaryDraft, goal: 'strength' })})
        `;
        await tx`
          insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
          values(${wsA.wsA.id},${assignA},1,clock_timestamp())
        `;

        // Tenant B still has has_injury = true, so injury_detail is applicable there.
        await tx`
          insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
          values(${wsB.wsA.id},${assignB},1,${tx.json({ has_injury: true, injury_detail: 'tenant-b-applicable', goal: 'strength' })})
        `;

        // Matching answer-change & access-view audits for A, plus non-target audits.
        const [draftAudit] = await tx`
          insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
          values(${clientA.auth_user_id},'form.draft_saved','form_answer_drafts',${assignA},${wsA.wsA.id},'{"revision":1}'::jsonb)
          returning id
        `;
        const [corrRev2Audit] = await tx`
          insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
          values(${clientA.auth_user_id},'form.answer_corrected','form_answer_revisions',${assignA},${wsA.wsA.id},'{"revision":2}'::jsonb)
          returning id
        `;
        const [corrRev3Audit] = await tx`
          insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
          values(${clientA.auth_user_id},'form.answer_corrected','form_answer_revisions',${assignA},${wsA.wsA.id},'{"revision":3}'::jsonb)
          returning id
        `;
        const [corrRev4Audit] = await tx`
          insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
          values(${clientA.auth_user_id},'form.answer_corrected','form_answer_revisions',${assignA},${wsA.wsA.id},'{"revision":4}'::jsonb)
          returning id
        `;
        const [viewRev1Audit] = await tx`
          insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
          values(${wo.userId},'form.answer_viewed','form_answer_current',${assignA},${wsA.wsA.id},'{"view":"current","revision":1}'::jsonb)
          returning id
        `;
        const [viewHist4Audit] = await tx`
          insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
          values(${wo.userId},'form.answer_viewed','form_answer_history',${assignA},${wsA.wsA.id},'{"view":"history","revision":4}'::jsonb)
          returning id
        `;
        const [viewDraftAudit] = await tx`
          insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
          values(${wo.userId},'form.answer_viewed','form_answer_draft',${assignA},${wsA.wsA.id},'{"view":"draft","revision":1}'::jsonb)
          returning id
        `;
        const [viewClean4Audit] = await tx`
          insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
          values(${wo.userId},'form.answer_viewed','form_answer_current',${assignA},${wsA.wsA.id},'{"view":"current","revision":4}'::jsonb)
          returning id
        `;
        const [submittedAudit] = await tx`
          insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
          values(${clientA.auth_user_id},'form.submitted','form_submissions',${assignA},${wsA.wsA.id},'{"revision":1,"rule_id":"cairo-d03-v1"}'::jsonb)
          returning id
        `;
        const [builderAudit] = await tx`
          insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
          values(${wo.userId},'form.draft_saved','forms',${assignA},${wsA.wsA.id},'{"revision":1}'::jsonb)
          returning id
        `;
        const [financialAudit] = await tx`
          insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
          values(${po.userId},'payment.recorded','payment_events',${assignA},${wsA.wsA.id},'{"amount_minor":"100"}'::jsonb)
          returning id
        `;
        const [tenantBAudit] = await tx`
          insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
          values(${po.userId},'form.answer_viewed','form_answer_current',${assignB},${wsB.wsA.id},'{"view":"current","revision":1}'::jsonb)
          returning id
        `;

        // Cross-tenant call must fail closed identically to nonexistent assignment.
        const [crossTenant] = await tx`
          select app_private.d1_erase_inapplicable_answers(${wsB.wsA.id},${assignA}) as res
        `;
        const [missing] = await tx`
          select app_private.d1_erase_inapplicable_answers(${wsB.wsA.id},${randomUUID()}) as res
        `;
        expect(crossTenant?.res).toEqual({ status: 'not_found' });
        expect(missing?.res).toEqual({ status: 'not_found' });

        // Atomic rollback test: control-table failure rolls back revisions, drafts, and audit deletions.
        await expect(
          tx.savepoint(async (sp) => {
            await sp.unsafe(`create function app_private.t029_fail_control() returns trigger
              language plpgsql set search_path = '' as $$ begin
                raise exception 'synthetic control outage';
              end $$`);
            await sp.unsafe(`create trigger t029_fail_control
              before insert on app_private.form_d1_erasure_controls
              for each row execute function app_private.t029_fail_control()`);
            await sp`select app_private.d1_erase_inapplicable_answers(${wsA.wsA.id},${assignA})`;
          }),
        ).rejects.toThrow('synthetic control outage');
        expect(
          await tx`select answer_values from public.form_answer_revisions where assignment_id=${assignA} and revision=1`,
        ).toEqual([
          {
            answer_values: {
              has_injury: true,
              injury_detail: canary1,
              goal: 'strength',
            },
          },
        ]);

        // Execute D1 erasure on Tenant A.
        const [erased] = await tx`
          select app_private.d1_erase_inapplicable_answers(${wsA.wsA.id},${assignA}) as res
        `;
        expect(erased?.res).toEqual({
          status: 'erased',
          answer_values: 3,
          revisions: 3,
          draft_values: 1,
          answer_change_audits: 3,
          access_view_audits: 3,
        });

        // Context must be cleared immediately after erasure within the same transaction.
        await expect(
          tx.savepoint(async (sp) => {
            await sp`delete from public.audit_events where id=${submittedAudit!.id}`;
          }),
        ).rejects.toThrow('Audit events are immutable');
        await expect(
          tx.savepoint(async (sp) => {
            await sp`update public.form_answer_revisions set answer_values='{}'::jsonb where assignment_id=${assignA} and revision=4`;
          }),
        ).rejects.toThrow('form answer revisions are immutable');

        // Verify revisions & drafts stripped ONLY inapplicable key across all versions.
        const revs = await tx`
          select revision, answer_values from public.form_answer_revisions
          where workspace_id=${wsA.wsA.id} and assignment_id=${assignA}
          order by revision
        `;
        expect(revs).toEqual([
          {
            revision: 1,
            answer_values: { has_injury: true, goal: 'strength' },
          },
          {
            revision: 2,
            answer_values: { has_injury: true, goal: 'endurance' },
          },
          {
            revision: 3,
            answer_values: { has_injury: false, goal: 'endurance' },
          },
          {
            revision: 4,
            answer_values: { has_injury: false, goal: 'mobility' },
          },
        ]);
        const [draftAfter] = await tx`
          select answer_values from public.form_answer_drafts
          where workspace_id=${wsA.wsA.id} and assignment_id=${assignA}
        `;
        expect(draftAfter?.answer_values).toEqual({
          has_injury: true,
          goal: 'strength',
        });

        // Verify matching audits removed, non-matching/excluded/tenant-B audits preserved.
        const remainingAuditIds = (
          await tx`
            select id from public.audit_events
            where id = any(${[
              draftAudit!.id,
              corrRev2Audit!.id,
              corrRev3Audit!.id,
              corrRev4Audit!.id,
              viewRev1Audit!.id,
              viewHist4Audit!.id,
              viewDraftAudit!.id,
              viewClean4Audit!.id,
              submittedAudit!.id,
              builderAudit!.id,
              financialAudit!.id,
              tenantBAudit!.id,
            ]})
            order by id
          `
        ).map((r) => r.id);
        expect(remainingAuditIds).toEqual([
          corrRev4Audit!.id,
          viewClean4Audit!.id,
          submittedAudit!.id,
          builderAudit!.id,
          financialAudit!.id,
          tenantBAudit!.id,
        ]);

        // Verify Tenant B untouched.
        expect(
          await tx`select answer_values from public.form_answer_revisions where assignment_id=${assignB}`,
        ).toEqual([
          {
            answer_values: {
              has_injury: true,
              injury_detail: 'tenant-b-applicable',
              goal: 'strength',
            },
          },
        ]);

        // Verify counts-only zero-ID control record & append-only guard.
        const idCols = await tx`
          select column_name from information_schema.columns
          where table_schema='app_private' and table_name='form_d1_erasure_controls'
            and column_name in ('id','workspace_id','client_id','assignment_id','question_id','answer_id','audit_id')
        `;
        expect(idCols).toHaveLength(0);
        const controls = await tx`
          select outcome, answer_value_count, answer_version_count, draft_value_count,
            answer_change_audit_count, access_view_audit_count
          from app_private.form_d1_erasure_controls
        `;
        expect(controls).toContainEqual({
          outcome: 'erased',
          answer_value_count: 3,
          answer_version_count: 3,
          draft_value_count: 1,
          answer_change_audit_count: 3,
          access_view_audit_count: 3,
        });
        await expect(
          tx.savepoint(async (sp) => {
            await sp`delete from app_private.form_d1_erasure_controls`;
          }),
        ).rejects.toThrow('form d1 erasure controls are append-only');

        // Idempotent rerun returns zero counts and adds no duplicate control rows.
        const controlCountBeforeRerun = (
          await tx`select count(*)::int as c from app_private.form_d1_erasure_controls`
        )[0]!.c;
        const [rerun] = await tx`
          select app_private.d1_erase_inapplicable_answers(${wsA.wsA.id},${assignA}) as res
        `;
        expect(rerun?.res).toEqual({
          status: 'no_targets',
          answer_values: 0,
          revisions: 0,
          draft_values: 0,
          answer_change_audits: 0,
          access_view_audits: 0,
        });
        expect(
          (
            await tx`select count(*)::int as c from app_private.form_d1_erasure_controls`
          )[0]!.c,
        ).toBe(controlCountBeforeRerun);

        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('defers and alerts under legal hold, resumes via batch after release, and kills security/isolation mutants', async () => {
    const wsA = await clientContext();
    const wsB = await clientContext();
    const po = await createStaff('platform_owner', 't029-hold-po');
    const wo = await createStaff('workspace_owner', 't029-hold-wo');
    const formA = randomUUID();
    const formB = randomUUID();
    const assignA = randomUUID();
    const assignB = randomUUID();
    const policy = `t029-hold-${randomUUID()}`;
    const holdRef = randomUUID();

    const snapshot = {
      questions: [
        { id: 'has_injury', type: 'boolean', required: true },
        {
          id: 'injury_detail',
          type: 'shortText',
          when: {
            mode: 'all',
            conditions: [
              { questionId: 'has_injury', operator: 'equals', value: true },
            ],
          },
        },
        { id: 'goal', type: 'shortText', required: true },
      ],
    };

    await expect(
      db.begin(async (tx) => {
        const clientA = await pending(tx, wsA);
        const clientB = await pending(tx, wsB);
        await tx`
          insert into public.workspace_memberships(workspace_id,user_id,granted_by)
          values(${wsA.wsA.id},${wo.userId},${po.userId})
        `;
        await tx`
          insert into app_private.terms_policy_versions(version,policy_kind,status)
          values(${policy},'terms','published')
        `;
        for (const [ctx, formId, assignId, clientId] of [
          [wsA, formA, assignA, clientA.id],
          [wsB, formB, assignB, clientB.id],
        ] as const) {
          await tx`insert into public.forms(id,workspace_id,name) values(${formId},${ctx.wsA.id},'T029 Hold Form')`;
          await tx`
            insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
            values(${ctx.wsA.id},${formId},1,${policy},${tx.json(snapshot)},'published')
          `;
          await tx`
            insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
            values(${assignId},${ctx.wsA.id},${clientId},${formId},1,${policy},${tx.json(snapshot)})
          `;
        }

        await tx`
          insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
          values(${wsA.wsA.id},${assignA},1,${tx.json({ has_injury: false, injury_detail: 'held-canary', goal: 'strength' })})
        `;
        await tx`
          insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
          values(${wsB.wsA.id},${assignB},1,${tx.json({ has_injury: true, injury_detail: 'tenant-b-keep', goal: 'strength' })})
        `;
        await tx`
          insert into app_private.form_legal_holds(workspace_id,client_id,hold_reference)
          values(${wsA.wsA.id},${clientA.id},${holdRef})
        `;

        const [deferred] = await tx`
          select app_private.d1_erase_inapplicable_answers(${wsA.wsA.id},${assignA}) as res
        `;
        expect(deferred?.res).toEqual({
          status: 'deferred_legal_hold',
          defer: true,
          alert: true,
        });
        expect(
          await tx`select answer_values from public.form_answer_revisions where assignment_id=${assignA}`,
        ).toEqual([
          {
            answer_values: {
              has_injury: false,
              injury_detail: 'held-canary',
              goal: 'strength',
            },
          },
        ]);
        const [holdAlert] = await tx`
          select id, recipient_user_ids, resolved_at
          from app_private.form_d1_erasure_hold_alerts
          where workspace_id=${wsA.wsA.id} and assignment_id=${assignA} and hold_reference=${holdRef}
        `;
        expect(holdAlert).toBeDefined();
        expect(holdAlert!.resolved_at).toBeNull();
        expect(holdAlert!.recipient_user_ids).toEqual(
          expect.arrayContaining([po.userId, wo.userId]),
        );

        const [deferAudit] = await tx`
          select action, target_table, details from public.audit_events
          where workspace_id=${wsA.wsA.id} and target_id=${holdAlert!.id}
        `;
        expect(deferAudit).toEqual({
          action: 'form.erasure_deferred',
          target_table: 'form_d1_erasure_hold_alerts',
          details: { reason: 'legal_hold' },
        });

        // Mutant 1: switch audit_events_immutable() to SECURITY DEFINER so service_role can spoof postgres caller identity.
        let auditGuardMutantKilled = false;
        await expect(
          tx.savepoint(async (sp) => {
            const [probeAudit] = await sp`
              insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
              values(null,'form.answer_viewed','form_answer_current',${assignA},${wsA.wsA.id},'{"view":"current","revision":1}'::jsonb)
              returning id
            `;
            const token = randomUUID();
            await sp`select pg_catalog.set_config('app_private.f15_d1_erasure_token',${token},true)`;
            await sp`
              insert into app_private.f15_d1_erasure_context(tx_id,token,workspace_id,assignment_id,inapplicable_question_ids,allowed_revision_ids,allowed_audit_ids)
              values(pg_catalog.pg_current_xact_id()::text,${token},${wsA.wsA.id},${assignA},'{}'::text[],'{}'::uuid[],${[probeAudit!.id]})
            `;
            await sp`alter table public.audit_events disable row level security`;
            await sp`grant select, delete on public.audit_events to service_role`;
            await sp`set local role service_role`;
            await expect(
              sp.savepoint(async (inner) => {
                await inner`delete from public.audit_events where id=${probeAudit!.id}`;
              }),
            ).rejects.toThrow();
            await sp`reset role`;

            const [fn] = await sp`
              select pg_catalog.pg_get_functiondef('app_private.audit_events_immutable()'::regprocedure) as body
            `;
            const mutant = (fn!.body as string).replace(
              'SET search_path TO',
              'SECURITY DEFINER SET search_path TO',
            );
            expect(mutant).not.toBe(fn!.body);
            await sp.unsafe(mutant);
            await sp`set local role service_role`;
            let deletedByServiceRole = false;
            try {
              await sp.savepoint(async (inner) => {
                await inner`delete from public.audit_events where id=${probeAudit!.id}`;
                deletedByServiceRole = true;
              });
            } catch {
              deletedByServiceRole = false;
            }
            await sp`reset role`;
            if (deletedByServiceRole) auditGuardMutantKilled = true;
            throw rollback;
          }),
        ).rejects.toBe(rollback);
        expect(auditGuardMutantKilled, 'auditGuardMutantKilled').toBe(true);

        // Mutant 2: drop legal-hold check from d1_erase_inapplicable_answers().
        let holdMutantKilled = false;
        await expect(
          tx.savepoint(async (sp) => {
            const [fn] = await sp`
              select pg_catalog.pg_get_functiondef('app_private.d1_erase_inapplicable_answers(uuid,uuid)'::regprocedure) as body
            `;
            const mutant = (fn!.body as string).replace(
              'and h.released_at is null',
              'and false',
            );
            expect(mutant).not.toBe(fn!.body);
            await sp.unsafe(mutant);
            const [res] =
              await sp`select app_private.d1_erase_inapplicable_answers(${wsA.wsA.id},${assignA}) as res`;
            if ((res!.res as { status: string }).status === 'erased') {
              holdMutantKilled = true;
            }
            throw rollback;
          }),
        ).rejects.toBe(rollback);
        expect(holdMutantKilled, 'holdMutantKilled').toBe(true);

        // Mutant 3: invert applicability check so still-applicable Tenant B answers get erased.
        let applicabilityMutantKilled = false;
        await expect(
          tx.savepoint(async (sp) => {
            const [fn] = await sp`
              select pg_catalog.pg_get_functiondef('app_private.d1_erase_inapplicable_answers(uuid,uuid)'::regprocedure) as body
            `;
            const mutant = (fn!.body as string).replace(
              'and not app_private.f15_question_applies(',
              'and app_private.f15_question_applies(',
            );
            expect(mutant).not.toBe(fn!.body);
            await sp.unsafe(mutant);
            await sp`select app_private.d1_erase_inapplicable_answers(${wsB.wsA.id},${assignB})`;
            const [bAfter] = await sp`
              select answer_values from public.form_answer_revisions where assignment_id=${assignB}
            `;
            if (
              !(
                'injury_detail' in
                (bAfter!.answer_values as Record<string, unknown>)
              )
            ) {
              applicabilityMutantKilled = true;
            }
            throw rollback;
          }),
        ).rejects.toBe(rollback);
        expect(applicabilityMutantKilled, 'applicabilityMutantKilled').toBe(
          true,
        );

        // Release legal hold and verify batch runner erases without a new branch change.
        await tx`
          update app_private.form_legal_holds set released_at=clock_timestamp()
          where workspace_id=${wsA.wsA.id} and client_id=${clientA.id} and hold_reference=${holdRef}
        `;
        const [batchCount] =
          await tx`select app_private.f15_d1_erasure_run_batch(10) as erased`;
        expect(batchCount?.erased).toBeGreaterThanOrEqual(1);
        expect(
          await tx`select answer_values from public.form_answer_revisions where assignment_id=${assignA}`,
        ).toEqual([{ answer_values: { has_injury: false, goal: 'strength' } }]);
        const [resolvedAlert] = await tx`
          select resolved_at from app_private.form_d1_erasure_hold_alerts where id=${holdAlert!.id}
        `;
        expect(resolvedAlert?.resolved_at).not.toBeNull();

        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
