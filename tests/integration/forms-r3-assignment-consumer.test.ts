import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import {
  clientContext,
  registered,
  request,
  sql,
  sqlCall,
} from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());
const rollback = new Error('rollback T008 synthetic assignment consumer');

async function createSelectionFixture(
  tx: Parameters<typeof sqlCall>[0],
  workspaceId: string,
) {
  const policy = `t008-${randomUUID()}`;
  const formId = randomUUID();
  const definition = { questions: [{ id: 'q1', type: 'short_text' }] };
  await tx`
    insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${policy},'terms','published')
  `;
  await tx`insert into public.forms(id,workspace_id,name)
    values(${formId},${workspaceId},'T008 synthetic selection')`;
  await tx`
    insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values(${workspaceId},${formId},1,${policy},${tx.json(definition)},'published')
  `;
  return { policy, formId, definition };
}

it('T008 reconciles real F12 approval and F15 selection facts in either order, once', async () => {
  const context = await clientContext();
  const selectionFirst = await registered(context);
  const approvalFirst = await registered(context);
  const mutationTarget = await registered(context);
  let triggerMutationWouldBeCaught = false;

  await expect(
    db.begin(async (tx) => {
      const first = await createSelectionFixture(tx, context.wsA.id);
      await tx`
        insert into app_private.form_assignment_selections(workspace_id,client_id,form_id,version_number,terms_policy_version,selected_by)
        values(${context.wsA.id},${selectionFirst.id},${first.formId},1,${first.policy},${context.po.userId})
      `;
      expect(
        await tx`select 1 from public.form_assignments where workspace_id=${context.wsA.id} and client_id=${selectionFirst.id}`,
      ).toHaveLength(0);
      const firstApproval = await sqlCall(
        tx,
        context.po.userId,
        'approve',
        request(context, selectionFirst),
      );
      expect(firstApproval.status).toBe('ok');
      const initialAssignment = await tx`
        select a.id,a.policy_id,a.configured_by,a.client_deadline_at,a.audience_snapshot_at,
          s.deadline_at as schedule_deadline
        from public.form_assignments a
        left join app_private.form_alert_schedules s
          on s.workspace_id=a.workspace_id and s.source_assignment_id=a.id and s.alert_kind='client_late'
        where a.workspace_id=${context.wsA.id} and a.client_id=${selectionFirst.id} and a.form_id=${first.formId}`;
      expect(initialAssignment).toHaveLength(1);
      expect(initialAssignment[0]?.policy_id).toBeTruthy();
      expect(initialAssignment[0]?.configured_by).toBe(context.po.userId);
      expect(initialAssignment[0]?.client_deadline_at).toEqual(
        initialAssignment[0]?.schedule_deadline,
      );
      const expectedDeadline = await tx`
        select ((((${initialAssignment[0]!.audience_snapshot_at}::timestamptz at time zone 'Africa/Cairo')::date+4)::timestamp at time zone 'Africa/Cairo')-interval '1 millisecond') as deadline`;
      expect(initialAssignment[0]?.client_deadline_at).toEqual(
        expectedDeadline[0]?.deadline,
      );

      const second = await createSelectionFixture(tx, context.wsA.id);
      expect(
        (
          await sqlCall(
            tx,
            context.po.userId,
            'approve',
            request(context, approvalFirst),
          )
        ).status,
      ).toBe('ok');
      await tx`
        insert into app_private.form_assignment_selections(workspace_id,client_id,form_id,version_number,terms_policy_version,selected_by)
        values(${context.wsA.id},${approvalFirst.id},${second.formId},1,${second.policy},${context.po.userId})
      `;
      expect(
        await tx`select 1 from public.form_assignments where workspace_id=${context.wsA.id} and client_id=${approvalFirst.id} and form_id=${second.formId}`,
      ).toHaveLength(1);

      const third = await createSelectionFixture(tx, context.wsA.id);
      expect(
        (
          await sqlCall(
            tx,
            context.po.userId,
            'approve',
            request(context, mutationTarget),
          )
        ).status,
      ).toBe('ok');
      await tx.savepoint(async (sp) => {
        await sp`alter table app_private.form_assignment_selections disable trigger f15_selection_reconcile`;
        await sp`
          insert into app_private.form_assignment_selections(workspace_id,client_id,form_id,version_number,terms_policy_version,selected_by)
          values(${context.wsA.id},${mutationTarget.id},${third.formId},1,${third.policy},${context.po.userId})
        `;
        const assignments = await sp`
          select 1 from public.form_assignments where workspace_id=${context.wsA.id} and client_id=${mutationTarget.id}
        `;
        try {
          expect(assignments).toHaveLength(1);
        } catch {
          triggerMutationWouldBeCaught = true;
        }
      });
      throw rollback;
    }),
  ).rejects.toBe(rollback);

  expect(triggerMutationWouldBeCaught).toBe(true);
});
