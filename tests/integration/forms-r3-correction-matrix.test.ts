import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, expect, it } from 'vitest';
import { createStaff, sql } from './harness';
import {
  clientContext,
  registered,
  request,
  sqlCall,
} from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());

async function seedAssignment(
  tx: TransactionSql,
  context: Awaited<ReturnType<typeof clientContext>>,
  client: Awaited<ReturnType<typeof registered>>,
  label: string,
) {
  expect(
    (await sqlCall(tx, context.po.userId, 'approve', request(context, client)))
      .status,
  ).toBe('ok');
  const formId = randomUUID();
  const assignmentId = randomUUID();
  const policy = `t014-${randomUUID()}`;
  const definition = { questions: [{ id: 'ordinary' }, { id: 'sensitive' }] };
  const answers = {
    ordinary: `${label} original`,
    sensitive: `${label} synthetic health`,
  };
  await tx`
    insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${policy},'terms','published')
  `;
  await tx`insert into public.forms(id,workspace_id,name)
    values(${formId},${context.wsA.id},${label})`;
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
    values(${context.wsA.id},${assignmentId},1,${tx.json(answers)})
  `;
  await tx`
    insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
    values(${context.wsA.id},${assignmentId},1,clock_timestamp())
  `;
  return { assignmentId, answers };
}

async function act(tx: TransactionSql, userId: string) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
}

it('T014 enforces correction and audited history access for Client, Trainer, WO, PO, and Sales', async () => {
  const context = await clientContext();
  const client = await registered(context);
  const sameWorkspaceClient = await registered(context);
  const otherContext = await clientContext();
  const otherWorkspaceClient = await registered(otherContext);
  const outsider = await createStaff('trainer', 't014-nonmember');
  const rollback = new Error('rollback T014 access matrix');

  await expect(
    db.begin(async (tx) => {
      const primary = await seedAssignment(tx, context, client, 'T014 primary');
      const sameWorkspace = await seedAssignment(
        tx,
        context,
        sameWorkspaceClient,
        'T014 other client',
      );
      const foreignWorkspace = await seedAssignment(
        tx,
        otherContext,
        otherWorkspaceClient,
        'T014 foreign workspace',
      );
      const actors = [
        { label: 'Client', userId: client.userId, allowed: true },
        { label: 'Trainer', userId: context.trainerA.userId, allowed: true },
        { label: 'WO', userId: context.woA.userId, allowed: true },
        { label: 'PO', userId: context.po.userId, allowed: true },
        { label: 'Sales', userId: context.salesA.userId, allowed: false },
      ];

      let revision = 1;
      for (const actor of actors) {
        await act(tx, actor.userId);
        const [history] = await tx`
        select public.read_form_answer(${context.wsA.id},${primary.assignmentId},'history') as result
      `;
        if (actor.allowed) {
          expect(history?.result).toHaveLength(revision);
          expect(history?.result.at(-1)?.answers).toEqual(
            revision === 1
              ? primary.answers
              : {
                  ordinary: `revision ${revision}`,
                  sensitive: `health ${revision}`,
                },
          );
          const next = revision + 1;
          const [result] = await tx`
          select public.correct_form_answer(
            ${context.wsA.id},${primary.assignmentId},${revision},${randomUUID()},
            ${tx.json({ ordinary: `revision ${next}`, sensitive: `health ${next}` })},'synthetic matrix correction'
          ) as result
        `;
          expect(result?.result).toMatchObject({
            status: 'corrected',
            revision: next,
          });
          revision = next;
        } else {
          expect(history?.result).toBeNull();
          const [result] = await tx`
          select public.correct_form_answer(
            ${context.wsA.id},${primary.assignmentId},${revision},${randomUUID()},
            ${tx.json({ ordinary: 'blocked', sensitive: 'blocked' })},'synthetic denied correction'
          ) as result
        `;
          expect(result?.result).toEqual({ status: 'not_permitted' });
        }
        await tx`reset role`;
      }

      await act(tx, client.userId);
      const [crossClientRead] = await tx`
      select public.read_form_answer(${context.wsA.id},${sameWorkspace.assignmentId},'history') as result
    `;
      const [crossClientWrite] = await tx`
      select public.correct_form_answer(
        ${context.wsA.id},${sameWorkspace.assignmentId},1,${randomUUID()},${tx.json(sameWorkspace.answers)},'cross-client attempt'
      ) as result
    `;
      expect(crossClientRead?.result).toBeNull();
      expect(crossClientWrite?.result).toEqual({ status: 'not_permitted' });
      await tx`reset role`;

      await act(tx, context.trainerA.userId);
      const [foreignRead] = await tx`
      select public.read_form_answer(${otherContext.wsA.id},${foreignWorkspace.assignmentId},'history') as result
    `;
      const [foreignWrite] = await tx`
      select public.correct_form_answer(
        ${otherContext.wsA.id},${foreignWorkspace.assignmentId},1,${randomUUID()},${tx.json(foreignWorkspace.answers)},'foreign workspace attempt'
      ) as result
    `;
      expect(foreignRead?.result).toBeNull();
      expect(foreignWrite?.result).toEqual({ status: 'not_permitted' });
      await tx`reset role`;

      await act(tx, context.po.userId);
      const inventedWorkspaceId = randomUUID();
      const [inventedWorkspaceRead] = await tx`
      select public.read_form_answer(${inventedWorkspaceId},${primary.assignmentId},'history') as result
    `;
      const [inventedWorkspaceWrite] = await tx`
      select public.correct_form_answer(
        ${inventedWorkspaceId},${primary.assignmentId},${revision},${randomUUID()},${tx.json({ ordinary: 'blocked', sensitive: 'blocked' })},'invented workspace attempt'
      ) as result
    `;
      expect(inventedWorkspaceRead?.result).toBeNull();
      expect(inventedWorkspaceWrite?.result).toEqual({ status: 'not_found' });
      await tx`reset role`;

      await act(tx, outsider.userId);
      const [nonmemberRead] = await tx`
      select public.read_form_answer(${context.wsA.id},${primary.assignmentId},'history') as result
    `;
      const [nonmemberWrite] = await tx`
      select public.correct_form_answer(
        ${context.wsA.id},${primary.assignmentId},${revision},${randomUUID()},${tx.json({ ordinary: 'blocked', sensitive: 'blocked' })},'nonmember attempt'
      ) as result
    `;
      expect(nonmemberRead?.result).toBeNull();
      expect(nonmemberWrite?.result).toEqual({ status: 'not_permitted' });
      await tx`reset role`;

      for (const sourceKind of ['closure', 'refund', 'deactivation'] as const) {
        const endedClient = await registered(context);
        const endedAssignment = await seedAssignment(
          tx,
          context,
          endedClient,
          `T014 ended ${sourceKind}`,
        );
        await tx`
        insert into app_private.form_retention_windows(workspace_id,client_id,source_event_id,source_kind,ended_at)
        values(${context.wsA.id},${endedClient.id},${randomUUID()},${sourceKind},clock_timestamp())
      `;
        // Grant a new staff member only after the relationship ended. The grant
        // must not bypass the relationship-end guard.
        const lateTrainer = await createStaff(
          'trainer',
          `t014-post-end-${sourceKind}`,
        );
        await tx`
        insert into public.workspace_memberships(workspace_id,user_id,granted_by)
        values(${context.wsA.id},${lateTrainer.userId},${context.po.userId})
      `;
        const endedActors = [
          { label: 'Client', userId: endedClient.userId, allowed: true },
          ...actors.slice(1, 4),
          { label: 'late Trainer', userId: lateTrainer.userId, allowed: true },
        ];
        for (const actor of endedActors) {
          await act(tx, actor.userId);
          const [ended] = await tx`
          select public.correct_form_answer(
            ${context.wsA.id},${endedAssignment.assignmentId},1,${randomUUID()},
            ${tx.json({ ordinary: 'blocked after end', sensitive: 'blocked after end' })},'post-end attempt'
          ) as result
        `;
          expect(ended?.result).toEqual({ status: 'relationship_ended' });
          await tx`reset role`;
        }
      }

      const [correctionAuditCount] = await tx`
      select count(*)::int as count from public.audit_events
      where action='form.answer_corrected' and target_id=${primary.assignmentId}
    `;
      expect(correctionAuditCount?.count).toBe(4);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});
