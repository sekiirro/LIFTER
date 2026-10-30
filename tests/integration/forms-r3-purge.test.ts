import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { sql } from './harness';
import {
  clientContext,
  registered,
} from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());
const rollback = new Error('rollback T018 synthetic retention fixture');

it('T018 purges all answer-bearing lifecycle rows after the source event + 30 days', async () => {
  const context = await clientContext();
  const client = await registered(context);
  const formId = randomUUID();
  const assignmentId = randomUUID();
  const policy = `t018-${randomUUID()}`;
  const sourceEventId = randomUUID();
  const intentKey = randomUUID();

  await expect(
    db.begin(async (tx) => {
      await tx`
        insert into app_private.terms_policy_versions(version,policy_kind,status)
        values(${policy},'terms','published')
      `;
      await tx`insert into public.forms(id,workspace_id,name)
        values(${formId},${context.wsA.id},'T018 synthetic reusable template')`;
      const definition = { questions: [{ id: 'q1', type: 'shortText' }] };
      await tx`
        insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
        values(${context.wsA.id},${formId},1,${policy},${tx.json(definition)},'published')
      `;
      await tx`
        insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
        values(${assignmentId},${context.wsA.id},${client.id},${formId},1,${policy},${tx.json(definition)})
      `;
      await tx`
        insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
        values(${context.wsA.id},${assignmentId},1,${tx.json({ q1: 'synthetic answer' })})
      `;
      await tx`
        insert into public.form_answer_drafts(workspace_id,assignment_id,revision,answer_values)
        values(${context.wsA.id},${assignmentId},1,${tx.json({ q1: 'synthetic draft' })})
      `;
      await tx`
        insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
        values(${context.wsA.id},${assignmentId},1,clock_timestamp())
      `;
      await tx`
        insert into app_private.form_submission_slas(workspace_id,assignment_id,rule_id,start_date,day_five_date,deadline_at)
        values(${context.wsA.id},${assignmentId},'cairo-d03-v1',current_date,current_date,current_timestamp)
      `;
      await tx`
        insert into app_private.form_submission_intents(workspace_id,assignment_id,intent_key,request_hash,result)
        values(${context.wsA.id},${assignmentId},${intentKey},decode(repeat('ab',32),'hex'),${tx.json({ status: 'submitted' })})
      `;
      for (const sourceKind of ['closure', 'refund', 'deactivation'] as const) {
        await tx`
          insert into app_private.form_retention_windows(workspace_id,client_id,source_event_id,source_kind,ended_at)
          values(${context.wsA.id},${client.id},${sourceKind === 'closure' ? sourceEventId : randomUUID()},${sourceKind},clock_timestamp()-interval '31 days')
        `;
      }

      expect(
        await tx`select app_private.purge_ended_form_answers(${context.wsA.id},${client.id}) as result`,
      ).toMatchObject([
        { result: { status: 'purged', revisions: 1, drafts: 1 } },
      ]);
      for (const table of [
        'public.form_answer_revisions',
        'public.form_answer_drafts',
        'app_private.form_submissions',
        'app_private.form_submission_slas',
        'app_private.form_submission_intents',
      ]) {
        const [row] = await tx.unsafe(
          `select count(*)::int as count from ${table} where workspace_id=$1 and assignment_id=$2`,
          [context.wsA.id, assignmentId],
        );
        expect(row?.count, table).toBe(0);
      }
      expect(
        await tx`select id from public.forms where id=${formId}`,
      ).toHaveLength(1);
      expect(
        await tx`select app_private.purge_ended_form_answers(${context.wsA.id},${client.id}) as result`,
      ).toMatchObject([
        { result: { status: 'purged', revisions: 0, drafts: 0 } },
      ]);

      let purgeMutationKilled = false;
      await expect(
        tx.savepoint(async (sp) => {
          const mutantFormId = randomUUID();
          const mutantAssignmentId = randomUUID();
          const mutantEventId = randomUUID();
          await sp`insert into public.forms(id,workspace_id,name)
            values(${mutantFormId},${context.wsA.id},'T018 mutant template')`;
          await sp`
            insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
            values(${context.wsA.id},${mutantFormId},1,${policy},${sp.json(definition)},'published')
          `;
          await sp`
            insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
            values(${mutantAssignmentId},${context.wsA.id},${client.id},${mutantFormId},1,${policy},${sp.json(definition)})
          `;
          await sp`
            insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
            values(${context.wsA.id},${mutantAssignmentId},1,${sp.json({ q1: 'mutation answer' })})
          `;
          await sp`
            insert into public.form_answer_drafts(workspace_id,assignment_id,revision,answer_values)
            values(${context.wsA.id},${mutantAssignmentId},1,${sp.json({ q1: 'mutation draft' })})
          `;
          await sp`
            insert into app_private.form_retention_windows(workspace_id,client_id,source_event_id,source_kind,ended_at)
            values(${context.wsA.id},${client.id},${mutantEventId},'refund',clock_timestamp()-interval '31 days')
          `;
          await sp.unsafe(`create or replace function app_private.purge_ended_form_answers(p_workspace_id uuid,p_client_id uuid)
            returns jsonb language sql security definer set search_path = '' as $$
              select '{"status":"purged","revisions":0,"drafts":0}'::jsonb
            $$`);
          const [mutated] = await sp`
            select app_private.purge_ended_form_answers(${context.wsA.id},${client.id}) as result
          `;
          try {
            expect(
              await sp`select count(*)::int as count from public.form_answer_revisions where assignment_id=${mutantAssignmentId}`,
            ).toEqual([{ count: 0 }]);
          } catch {
            purgeMutationKilled = true;
          }
          expect(mutated?.result).toEqual({
            status: 'purged',
            revisions: 0,
            drafts: 0,
          });
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(purgeMutationKilled).toBe(true);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});
