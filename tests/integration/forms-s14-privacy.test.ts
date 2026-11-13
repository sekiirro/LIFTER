import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  clientContext,
  createRecoveryClientTarget,
  pending,
} from './client-accounts-fixture';
import { createStaff, sql } from './harness';

const db = sql();

afterAll(() => db.end());

describe('T048 personal-data authorization and erasure', () => {
  it('keeps answer, legal-hold, and counts-only erasure records private under forced RLS', async () => {
    const rows = await db`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        not has_table_privilege('authenticated',c.oid,'select') as direct_select_denied
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where (n.nspname='public' and c.relname='form_answer_revisions')
        or (n.nspname='app_private' and c.relname in ('form_retention_windows', 'form_legal_holds', 'form_answer_erasure_controls'))
    `;

    expect(rows).toHaveLength(4);
    expect(
      rows.every(
        (row) =>
          row.relrowsecurity &&
          row.relforcerowsecurity &&
          row.direct_select_denied,
      ),
    ).toBe(true);
  });

  it('has no direct answer-table SELECT policies', async () => {
    const policies = await db`
      select tablename, policyname
      from pg_catalog.pg_policies
      where schemaname='public'
        and tablename in ('form_answer_revisions','form_answer_drafts')
    `;

    expect(policies).toEqual([]);
  });

  it('denies raw answer reads and embeds for Client, Trainer, WO, PO, and Sales JWTs', async () => {
    const context = await clientContext();
    const clientTarget = await createRecoveryClientTarget(context);
    const trainer = await createStaff('trainer', 'f15-answer-reader-trainer');
    const owner = await createStaff('workspace_owner', 'f15-answer-reader-wo');
    const platformOwner = await createStaff(
      'platform_owner',
      'f15-answer-reader-po',
    );
    const sales = await createStaff('sales', 'f15-answer-reader-sales');
    const policy = `s17-r18-${randomUUID()}`;
    const formId = randomUUID();
    const assignmentId = randomUUID();
    const workspaceId = clientTarget.workspaceId;
    const answer = {
      ordinary: 'synthetic answer',
      sex: 'female',
      health: 'synthetic value',
    };
    const snapshot = {
      questions: Object.keys(answer).map((id) => ({ id, type: 'shortText' })),
    };

    await db.begin(async (tx) => {
      await tx`
        insert into app_private.terms_policy_versions(version,policy_kind,status)
        values(${policy},'terms','published')
      `;
      await tx`
        insert into public.forms(id,workspace_id,name)
        values(${formId},${workspaceId},'R18 synthetic form')
      `;
      await tx`
        insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
        values(${workspaceId},${formId},1,${policy},${tx.json(snapshot)},'published')
      `;
      await tx`
        insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
        values(${assignmentId},${workspaceId},${clientTarget.clientId},${formId},1,${policy},${tx.json(snapshot)})
      `;
      await tx`
        insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
        values(${workspaceId},${assignmentId},1,${tx.json(answer)})
      `;
      await tx`
        insert into public.form_answer_drafts(workspace_id,assignment_id,revision,answer_values)
        values(${workspaceId},${assignmentId},1,${tx.json(answer)})
      `;
    });

    const actors = [
      ['Client', clientTarget.client],
      ['Trainer', trainer.client],
      ['WO', owner.client],
      ['PO', platformOwner.client],
      ['Sales', sales.client],
    ] as const;

    for (const [label, actor] of actors) {
      for (const table of ['form_answer_revisions', 'form_answer_drafts']) {
        const result = await actor.from(table).select('answer_values');
        expect(result.error, `${label} direct ${table} read`).not.toBeNull();
        expect(JSON.stringify(result.data)).not.toContain('synthetic answer');
        expect(JSON.stringify(result.data)).not.toContain('synthetic value');
        expect(JSON.stringify(result.data)).not.toContain('female');
      }

      const embedded = await actor
        .from('form_assignments')
        .select('id,form_answer_revisions(answer_values)')
        .eq('id', assignmentId);
      expect(embedded.error, `${label} assignment answer embed`).not.toBeNull();
      expect(JSON.stringify(embedded.data)).not.toContain('synthetic answer');
      expect(JSON.stringify(embedded.data)).not.toContain('synthetic value');
      expect(JSON.stringify(embedded.data)).not.toContain('female');

      for (const table of ['forms', 'form_versions', 'form_assignments']) {
        const result = await actor.from(table).select('*');
        expect(
          result.error,
          `${label} direct ${table} read without grants`,
        ).not.toBeNull();
        expect(result.data).toBeNull();
      }
    }

    const callableAnswerRpcs = await db`
      select p.proname
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.oid <> to_regprocedure('public.read_form_answer(uuid,uuid)')
        and p.oid <> to_regprocedure('public.read_form_answer(uuid,uuid,text)')
        -- T012-T014 writers return only allow-listed acknowledgement metadata;
        -- their focused tests assert exact shapes and no answer bytes.
        and p.proname not in ('save_form_draft','submit_form_assignment','correct_form_answer','read_client_form_draft')
        and has_function_privilege('authenticated',p.oid,'execute')
        and (p.prosrc ilike '%form_answer_revisions%'
          or p.prosrc ilike '%form_answer_drafts%')
    `;
    expect(callableAnswerRpcs).toEqual([]);
  });

  it('purges the target tenant sex answer while preserving another tenant answer', async () => {
    const targetContext = await clientContext();
    const otherContext = await clientContext();
    const targetForm = randomUUID();
    const otherForm = randomUUID();
    const targetAssignment = randomUUID();
    const otherAssignment = randomUUID();
    const targetPolicy = `s14-purge-${randomUUID()}`;
    const otherPolicy = `s14-purge-${randomUUID()}`;
    const rollback = new Error('synthetic tenant erasure rollback');

    await expect(
      db.begin(async (tx) => {
        const targetClient = await pending(tx, targetContext);
        const otherClient = await pending(tx, otherContext);
        for (const [context, formId, policy, assignmentId, clientId] of [
          [
            targetContext,
            targetForm,
            targetPolicy,
            targetAssignment,
            targetClient.id,
          ],
          [
            otherContext,
            otherForm,
            otherPolicy,
            otherAssignment,
            otherClient.id,
          ],
        ] as const) {
          const snapshot = {
            questions: [
              { id: 'sex', type: 'shortText' },
              { id: 'marker', type: 'shortText' },
            ],
          };
          await tx`
            insert into app_private.terms_policy_versions(version,policy_kind,status)
            values(${policy},'terms','published')
          `;
          await tx`insert into public.forms(id,workspace_id,name)
            values(${formId},${context.wsA.id},'Synthetic privacy erasure form')`;
          await tx`
            insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
            values(${context.wsA.id},${formId},1,${policy},${tx.json(snapshot)},'published')
          `;
          await tx`
            insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
            values(${assignmentId},${context.wsA.id},${clientId},${formId},1,${policy},${tx.json(snapshot)})
          `;
          await tx`
            insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
            values(${context.wsA.id},${assignmentId},1,${tx.json({ sex: 'female', marker: 'synthetic' })})
          `;
          await tx`
            insert into public.form_answer_drafts(workspace_id,assignment_id,revision,answer_values)
            values(${context.wsA.id},${assignmentId},1,${tx.json({ sex: 'female', marker: 'synthetic draft' })})
          `;
        }
        await tx`
          insert into app_private.form_retention_windows(workspace_id,client_id,source_event_id,source_kind,ended_at)
          values(${targetContext.wsA.id},${targetClient.id},${randomUUID()},'deactivation',clock_timestamp()-interval '31 days')
        `;

        const [result] = await tx`
          select app_private.purge_ended_form_answers(${targetContext.wsA.id},${targetClient.id}) as result
        `;
        expect(result?.result).toMatchObject({ status: 'purged' });
        expect(
          await tx`select 1 from public.form_answer_revisions where assignment_id=${targetAssignment}`,
        ).toHaveLength(0);
        expect(
          await tx`select 1 from public.form_answer_drafts where assignment_id=${targetAssignment}`,
        ).toHaveLength(0);
        expect(
          await tx`select answer_values from public.form_answer_revisions where assignment_id=${otherAssignment}`,
        ).toEqual([{ answer_values: { sex: 'female', marker: 'synthetic' } }]);
        expect(
          await tx`select answer_values from public.form_answer_drafts where assignment_id=${otherAssignment}`,
        ).toEqual([
          { answer_values: { sex: 'female', marker: 'synthetic draft' } },
        ]);

        let killed = false;
        const purgeKilled = new Error('cross-tenant purge mutant killed');
        await expect(
          tx.savepoint(async (sp) => {
            await sp.unsafe(`create or replace function app_private.purge_ended_form_answers(p_workspace_id uuid,p_client_id uuid)
              returns jsonb language plpgsql security definer set search_path = '' as $$
              declare target record;
              begin
                for target in select distinct workspace_id,client_id from public.form_assignments loop
                  perform pg_catalog.set_config('app_private.f15_retention_purge',target.workspace_id::text||':'||target.client_id::text,true);
                  delete from app_private.form_correction_intents i where i.workspace_id=target.workspace_id and i.assignment_id in (
                    select a.id from public.form_assignments a where a.workspace_id=target.workspace_id and a.client_id=target.client_id
                  );
                  delete from app_private.form_corrections c where c.workspace_id=target.workspace_id and c.assignment_id in (
                    select a.id from public.form_assignments a where a.workspace_id=target.workspace_id and a.client_id=target.client_id
                  );
                  delete from app_private.form_submission_intents i where i.workspace_id=target.workspace_id and i.assignment_id in (
                    select a.id from public.form_assignments a where a.workspace_id=target.workspace_id and a.client_id=target.client_id
                  );
                  delete from app_private.form_submission_slas s where s.workspace_id=target.workspace_id and s.assignment_id in (
                    select a.id from public.form_assignments a where a.workspace_id=target.workspace_id and a.client_id=target.client_id
                  );
                  delete from public.form_answer_drafts d where d.workspace_id=target.workspace_id and d.assignment_id in (
                    select a.id from public.form_assignments a where a.workspace_id=target.workspace_id and a.client_id=target.client_id
                  );
                  delete from app_private.form_submissions s where s.workspace_id=target.workspace_id and s.assignment_id in (
                    select a.id from public.form_assignments a where a.workspace_id=target.workspace_id and a.client_id=target.client_id
                  );
                  delete from public.form_answer_revisions r where r.workspace_id=target.workspace_id and r.assignment_id in (
                    select a.id from public.form_assignments a where a.workspace_id=target.workspace_id and a.client_id=target.client_id
                  );
                end loop;
                return '{"status":"purged"}'::jsonb;
              end
              $$`);
            await sp`
              select app_private.purge_ended_form_answers(${targetContext.wsA.id},${targetClient.id})
            `;
            const surviving =
              await sp`select answer_values from public.form_answer_revisions where assignment_id=${otherAssignment}`;
            try {
              expect(surviving).toHaveLength(1);
            } catch {
              killed = true;
              throw purgeKilled;
            }
          }),
        ).rejects.toBe(purgeKilled);
        expect(killed).toBe(true);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('requires the shared Forms answer-read capability and denies Sales/unknown', async () => {
    const rows = await db`
      select role::text as role,
        app_private.role_has_capability(role,'read_form_answers') as allowed,
        app_private.role_has_capability(role,'unknown_forms_capability') as unknown_allowed
      from unnest(enum_range(null::public.staff_role)) role
    `;

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'platform_owner',
          allowed: true,
          unknown_allowed: false,
        }),
        expect.objectContaining({
          role: 'workspace_owner',
          allowed: true,
          unknown_allowed: false,
        }),
        expect.objectContaining({
          role: 'trainer',
          allowed: true,
          unknown_allowed: false,
        }),
        expect.objectContaining({
          role: 'sales',
          allowed: false,
          unknown_allowed: false,
        }),
      ]),
    );
  });

  it('provides a single audited reader before answer data can be returned', async () => {
    const rows = await db`
      select to_regprocedure('public.read_form_answer(uuid,uuid,text)') is not null as present,
        p.prosrc as body
      from (select 1) seed
      left join pg_catalog.pg_proc p on p.oid=to_regprocedure('public.read_form_answer(uuid,uuid,text)')
    `;
    expect(rows[0]?.present).toBe(true);
    const body = rows[0]?.body as string;
    const auditInsert = body.indexOf('insert into public.audit_events');
    const answerReturn = body.lastIndexOf('return answer_result');
    expect(auditInsert).toBeGreaterThanOrEqual(0);
    expect(answerReturn).toBeGreaterThan(auditInsert);
    const auditValues = body.slice(
      body.indexOf('values', auditInsert),
      body.indexOf(';', auditInsert),
    );
    expect(auditValues).not.toMatch(/answer_values|sex|answer_text/iu);
  });

  it('defers purge during a legal hold, then deletes answer copies only after day 30', async () => {
    const context = await clientContext();
    const assignment = randomUUID();
    const form = randomUUID();
    const policy = `s17-synthetic-${randomUUID()}`;
    const versionData = {
      n7: { minMeals: 2, maxMeals: 5 },
      n12: { seriesBySex: { male: 'standard-male', female: 'female' } },
      questions: [
        { id: 'sex', type: 'shortText' },
        { id: 'private_note', type: 'shortText' },
      ],
    };
    const rollback = new Error('synthetic retention fixture rollback');

    await expect(
      db.begin(async (tx) => {
        const client = await pending(tx, context);
        await tx`
          insert into app_private.terms_policy_versions(version,policy_kind,status)
          values(${policy},'terms','published')
        `;
        await tx`insert into public.forms(id,workspace_id,name) values(${form},${context.wsA.id},'Synthetic Intake')`;
        await tx`
          insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
          values(${context.wsA.id},${form},1,${policy},${tx.json(versionData)},'published')
        `;
        await tx`
          insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
          values(${assignment},${context.wsA.id},${client.id},${form},1,${policy},${tx.json(versionData)})
        `;
        await tx`
          insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
          values(${context.wsA.id},${assignment},1,${tx.json({ sex: 'female', private_note: 'SYNTHETIC-CANARY' })})
        `;
        await tx`
          insert into public.form_answer_drafts(workspace_id,assignment_id,revision,answer_values)
          values(${context.wsA.id},${assignment},1,${tx.json({ sex: 'female', private_note: 'SYNTHETIC-CANARY' })})
        `;
        const [window] = await tx`
          insert into app_private.form_retention_windows(workspace_id,client_id,source_event_id,source_kind,ended_at)
          values(${context.wsA.id},${client.id},${randomUUID()},'closure',clock_timestamp()-interval '31 days')
          returning id
        `;
        await tx`
          insert into app_private.form_legal_holds(workspace_id,client_id,hold_reference)
          values(${context.wsA.id},${client.id},${randomUUID()})
        `;

        const [held] = await tx`
          select app_private.purge_ended_form_answers(${context.wsA.id},${client.id}) as result
        `;
        expect(held?.result).toMatchObject({ status: 'deferred_legal_hold' });
        expect(
          await tx`select 1 from public.form_answer_revisions where assignment_id=${assignment}`,
        ).toHaveLength(1);
        expect(
          await tx`select 1 from app_private.form_answer_erasure_controls where outcome='deferred_legal_hold'`,
        ).toHaveLength(1);

        await tx`
          update app_private.form_legal_holds set released_at=clock_timestamp()
          where workspace_id=${context.wsA.id} and client_id=${client.id} and released_at is null
        `;
        const [purged] = await tx`
          select app_private.purge_ended_form_answers(${context.wsA.id},${client.id}) as result
        `;
        expect(purged?.result).toMatchObject({
          status: 'purged',
          revisions: 1,
          drafts: 1,
        });
        expect(
          await tx`select 1 from public.form_answer_revisions where assignment_id=${assignment}`,
        ).toHaveLength(0);
        expect(
          await tx`select 1 from public.form_answer_drafts where assignment_id=${assignment}`,
        ).toHaveLength(0);
        expect(
          await tx`select 1 from public.form_assignments where id=${assignment}`,
        ).toHaveLength(1);
        const identifiers = await tx`
          select column_name from information_schema.columns
          where table_schema='app_private' and table_name='form_answer_erasure_controls'
            and column_name in ('id','workspace_id','client_id','assignment_id','answer_id')
        `;
        expect(identifiers).toHaveLength(0);
        const [controls] = await tx`
          select bool_and(answer_count is not null and draft_count is not null) as counts_only
          from app_private.form_answer_erasure_controls
        `;
        expect(controls).toEqual({ counts_only: true });
        expect(window?.id).toBeTruthy();
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('does not purge before the authoritative 30-day window', async () => {
    const context = await clientContext();
    const rollback = new Error('synthetic retention fixture rollback');
    await expect(
      db.begin(async (tx) => {
        const client = await pending(tx, context);
        await tx`
          insert into app_private.form_retention_windows(workspace_id,client_id,source_event_id,source_kind,ended_at)
          values(${context.wsA.id},${client.id},${randomUUID()},'closure',clock_timestamp()-interval '29 days')
        `;
        const [result] = await tx`
          select app_private.purge_ended_form_answers(${context.wsA.id},${client.id}) as result
        `;
        expect(result?.result).toMatchObject({ status: 'not_due' });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
