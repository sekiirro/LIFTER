import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import {
  clientContext,
  registered,
  request,
  sql,
  sqlCall,
} from './registration-approval-operations-fixture';
import { withCrashSafeFunctionMutant } from './function-drift-guard';

const db = sql();
afterAll(() => db.end());
const rollback = new Error('rollback T008 synthetic assignment consumer');

async function expectInvariantFailure(body: () => Promise<void>) {
  let failure: unknown;
  try {
    await body();
  } catch (error) {
    failure = error;
  }
  expect(failure, 'the named invariant must kill the mutant').toBeDefined();
}

async function createSelectionFixture(
  tx: Parameters<typeof sqlCall>[0],
  workspaceId: string,
  existingPolicy?: string,
) {
  const policy = existingPolicy ?? `t008-${randomUUID()}`;
  const formId = randomUUID();
  const definition = { questions: [{ id: 'q1', type: 'short_text' }] };
  if (!existingPolicy)
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
  const [materializer] = await db`
    select pg_get_functiondef('app_private.materialize_intake_assignment_occurrence_core(uuid,uuid,text,date)'::regprocedure) as definition
  `;
  expect(materializer!.definition).toContain('c.deactivated_at is null');
  const context = await clientContext();
  const selectionFirst = await registered(context);
  const approvalFirst = await registered(context);
  const mutationTarget = await registered(context);
  const sharedPolicyTarget = await registered(context);
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
        select a.id,a.policy_id,a.configured_by,a.client_deadline_at,a.audience_snapshot_at,a.occurrence_key,
          s.deadline_at as schedule_deadline
        from public.form_assignments a
        left join app_private.form_alert_schedules s
          on s.workspace_id=a.workspace_id and s.source_assignment_id=a.id and s.alert_kind='client_late'
        where a.workspace_id=${context.wsA.id} and a.client_id=${selectionFirst.id} and a.form_id=${first.formId}`;
      expect(initialAssignment).toHaveLength(1);
      expect(initialAssignment[0]?.policy_id).toBeTruthy();
      expect(initialAssignment[0]?.occurrence_key).toBe(
        `initial:${selectionFirst.id}`,
      );
      expect(initialAssignment[0]?.configured_by).toBe(context.po.userId);
      expect(initialAssignment[0]?.client_deadline_at).toEqual(
        initialAssignment[0]?.schedule_deadline,
      );
      const expectedDeadline = await tx`
        select ((((${initialAssignment[0]!.audience_snapshot_at}::timestamptz at time zone 'Africa/Cairo')::date+4)::timestamp at time zone 'Africa/Cairo')-interval '1 millisecond') as deadline`;
      expect(initialAssignment[0]?.client_deadline_at).toEqual(
        expectedDeadline[0]?.deadline,
      );

      const second = await createSelectionFixture(
        tx,
        context.wsA.id,
        first.policy,
      );
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

      await tx`
        insert into app_private.form_assignment_selections(workspace_id,client_id,form_id,version_number,terms_policy_version,selected_by)
        values(${context.wsA.id},${sharedPolicyTarget.id},${first.formId},1,${first.policy},${context.po.userId})
      `;
      const sharedPolicyApproval = await sqlCall(
        tx,
        context.po.userId,
        'approve',
        request(context, sharedPolicyTarget),
      );
      expect(sharedPolicyApproval.status).toBe('ok');
      expect(
        await tx`select occurrence_key from public.form_assignments where workspace_id=${context.wsA.id} and client_id=${sharedPolicyTarget.id} and form_id=${first.formId}`,
      ).toHaveLength(1);
      const perClientOccurrences = await tx`
        select a.client_id,a.occurrence_key,o.audience_client_ids
        from public.form_assignments a
        join app_private.form_assignment_occurrences o
          on o.workspace_id=a.workspace_id and o.policy_id=a.policy_id and o.occurrence_key=a.occurrence_key
        where a.workspace_id=${context.wsA.id} and a.form_id=${first.formId}
        order by a.client_id`;
      expect(perClientOccurrences).toHaveLength(2);
      expect(
        perClientOccurrences.map((row) => row.occurrence_key).sort(),
      ).toEqual(
        [
          `initial:${selectionFirst.id}`,
          `initial:${sharedPolicyTarget.id}`,
        ].sort(),
      );
      expect(perClientOccurrences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            client_id: selectionFirst.id,
            audience_client_ids: [selectionFirst.id],
          }),
          expect.objectContaining({
            client_id: sharedPolicyTarget.id,
            audience_client_ids: [sharedPolicyTarget.id],
          }),
        ]),
      );

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

it('kills an approval assignment deadline-fact mutant', async () => {
  const context = await clientContext();
  const target = await registered(context);
  await withCrashSafeFunctionMutant(
    'app_private.reconcile_f15_form_assignment(uuid,uuid)',
    (definition) =>
      definition.replace(
        "((snapshot_at at time zone 'Africa/Cairo')::date+4)",
        "((snapshot_at at time zone 'Africa/Cairo')::date+5)",
      ),
    async () => {
      await expectInvariantFailure(async () =>
        expect(
          db.begin(async (tx) => {
            const fixture = await createSelectionFixture(tx, context.wsA.id);
            await tx`
              insert into app_private.form_assignment_selections
                (workspace_id,client_id,form_id,version_number,terms_policy_version,selected_by)
              values(${context.wsA.id},${target.id},${fixture.formId},1,${fixture.policy},${context.po.userId})
            `;
            const approval = await sqlCall(
              tx,
              context.po.userId,
              'approve',
              request(context, target),
            );
            expect(approval.status).toBe('ok');
            const [assignment] = await tx`
              select a.client_deadline_at,
                (((a.audience_snapshot_at at time zone 'Africa/Cairo')::date+4)::timestamp at time zone 'Africa/Cairo')-interval '1 millisecond' as expected_deadline
              from public.form_assignments a
              where a.workspace_id=${context.wsA.id} and a.client_id=${target.id} and a.form_id=${fixture.formId}
            `;
            expect(assignment?.client_deadline_at).toEqual(
              assignment?.expected_deadline,
            );
            throw rollback;
          }),
        ).rejects.toBe(rollback),
      );
    },
  );
});

it('S41-PO-12 replaces a stale unconsumed selection and preserves its history', async () => {
  const context = await clientContext();
  const target = await registered(context);
  await expect(
    db.begin(async (tx) => {
      const old = await createSelectionFixture(tx, context.wsA.id);
      const currentPolicy = `t143-current-${randomUUID()}`;
      await tx`insert into app_private.terms_policy_versions(version,policy_kind,status) values(${currentPolicy},'terms','published')`;
      await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status) values(${context.wsA.id},${old.formId},2,${currentPolicy},${tx.json(old.definition)},'published')`;
      await tx`insert into app_private.form_assignment_selections(workspace_id,client_id,form_id,version_number,terms_policy_version,selected_by) values(${context.wsA.id},${target.id},${old.formId},1,${old.policy},${context.po.userId})`;
      const result = await sqlCall(
        tx,
        context.po.userId,
        'approve',
        request(context, target),
      );
      expect(result.status).toBe('ok');
      const [retry] =
        await tx`select app_private.reconcile_f15_form_assignment(${context.wsA.id},${target.id}) as result`;
      expect(retry?.result).toBe('already_assigned');
      const [selection] =
        await tx`select version_number,terms_policy_version from app_private.form_assignment_selections where workspace_id=${context.wsA.id} and client_id=${target.id}`;
      expect(selection).toEqual({
        version_number: 2,
        terms_policy_version: currentPolicy,
      });
      const history =
        await tx`select version_number,terms_policy_version from app_private.form_assignment_selection_history where workspace_id=${context.wsA.id} and client_id=${target.id}`;
      expect(history).toEqual([
        { version_number: 1, terms_policy_version: old.policy },
      ]);
      const assignment =
        await tx`select version_number,terms_policy_version from public.form_assignments where workspace_id=${context.wsA.id} and client_id=${target.id} and form_id=${old.formId}`;
      expect(assignment).toEqual([
        { version_number: 2, terms_policy_version: currentPolicy },
      ]);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('mutation: skipping stale selection refresh is caught', async () => {
  const context = await clientContext();
  const target = await registered(context);
  await withCrashSafeFunctionMutant(
    'app_private.reconcile_f15_form_assignment(uuid,uuid)',
    (definition) =>
      definition.replace(
        'if not app_private.f15_current_terms_policy(selection.terms_policy_version)',
        'if false',
      ),
    async () => {
      await expectInvariantFailure(async () =>
        db.begin(async (tx) => {
          const old = await createSelectionFixture(tx, context.wsA.id);
          const current = `t143-mutant-${randomUUID()}`;
          await tx`insert into app_private.terms_policy_versions(version,policy_kind,status) values(${current},'terms','published')`;
          await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status) values(${context.wsA.id},${old.formId},2,${current},${tx.json(old.definition)},'published')`;
          await tx`insert into app_private.form_assignment_selections(workspace_id,client_id,form_id,version_number,terms_policy_version,selected_by) values(${context.wsA.id},${target.id},${old.formId},1,${old.policy},${context.po.userId})`;
          await sqlCall(
            tx,
            context.po.userId,
            'approve',
            request(context, target),
          );
          const [assignment] =
            await tx`select version_number from public.form_assignments where workspace_id=${context.wsA.id} and client_id=${target.id} and form_id=${old.formId}`;
          expect(assignment?.version_number).toBe(2);
          throw rollback;
        }),
      );
    },
  );
});

it('mutation: selection history archival is caught', async () => {
  const context = await clientContext();
  const target = await registered(context);
  await withCrashSafeFunctionMutant(
    'app_private.archive_f15_selection_update()',
    (definition) =>
      definition.replace("'stale_terms_replacement'", "'bad_reason'"),
    async () => {
      await expectInvariantFailure(async () =>
        db.begin(async (tx) => {
          const old = await createSelectionFixture(tx, context.wsA.id);
          const current = `t143-history-mutant-${randomUUID()}`;
          await tx`insert into app_private.terms_policy_versions(version,policy_kind,status) values(${current},'terms','published')`;
          await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status) values(${context.wsA.id},${old.formId},2,${current},${tx.json(old.definition)},'published')`;
          await tx`insert into app_private.form_assignment_selections(workspace_id,client_id,form_id,version_number,terms_policy_version,selected_by) values(${context.wsA.id},${target.id},${old.formId},1,${old.policy},${context.po.userId})`;
          await sqlCall(
            tx,
            context.po.userId,
            'approve',
            request(context, target),
          );
          const history =
            await tx`select 1 from app_private.form_assignment_selection_history where workspace_id=${context.wsA.id} and client_id=${target.id}`;
          expect(history).toHaveLength(1);
          throw rollback;
        }),
      );
    },
  );
});

it('mutation: disabling selection history RLS is caught and rolled back', async () => {
  let caught = false;
  await expect(
    db.begin(async (tx) => {
      await tx`alter table app_private.form_assignment_selection_history disable row level security`;
      const [table] = await tx`
        select c.relrowsecurity as enabled,c.relforcerowsecurity as forced,
          has_table_privilege('anon','app_private.form_assignment_selection_history','select') as anon_select,
          has_table_privilege('authenticated','app_private.form_assignment_selection_history','select') as authenticated_select,
          has_table_privilege('service_role','app_private.form_assignment_selection_history','select') as service_select
        from pg_class c where c.oid='app_private.form_assignment_selection_history'::regclass
      `;
      try {
        expect(table).toEqual({
          enabled: true,
          forced: true,
          anon_select: false,
          authenticated_select: false,
          service_select: false,
        });
      } catch {
        caught = true;
      }
      throw rollback;
    }),
  ).rejects.toBe(rollback);
  expect(caught).toBe(true);
});

it('S41-PO-12 leaves a consumed stale selection unchanged', async () => {
  const context = await clientContext();
  const target = await registered(context);
  await expect(
    db.begin(async (tx) => {
      const old = await createSelectionFixture(tx, context.wsA.id);
      await tx`insert into app_private.form_assignment_selections(workspace_id,client_id,form_id,version_number,terms_policy_version,selected_by) values(${context.wsA.id},${target.id},${old.formId},1,${old.policy},${context.po.userId})`;
      await sqlCall(tx, context.po.userId, 'approve', request(context, target));
      const current = `t143-consumed-${randomUUID()}`;
      await tx`insert into app_private.terms_policy_versions(version,policy_kind,status) values(${current},'terms','published')`;
      await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status) values(${context.wsA.id},${old.formId},2,${current},${tx.json(old.definition)},'published')`;
      const [result] =
        await tx`select app_private.reconcile_f15_form_assignment(${context.wsA.id},${target.id}) as result`;
      expect(result?.result).toBe('already_assigned');
      const [selection] =
        await tx`select version_number,terms_policy_version from app_private.form_assignment_selections where workspace_id=${context.wsA.id} and client_id=${target.id}`;
      expect(selection).toEqual({
        version_number: 1,
        terms_policy_version: old.policy,
      });
      expect(
        await tx`select 1 from app_private.form_assignment_selection_history where workspace_id=${context.wsA.id} and client_id=${target.id}`,
      ).toHaveLength(0);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('S41-PO-12 fails closed when no current Terms-bound version exists', async () => {
  const context = await clientContext();
  const target = await registered(context);
  await expect(
    db.begin(async (tx) => {
      const old = await createSelectionFixture(tx, context.wsA.id);
      const latestPolicy = `t143-unmapped-${randomUUID()}`;
      await tx`insert into app_private.terms_policy_versions(version,policy_kind,status) values(${latestPolicy},'terms','published')`;
      await tx`insert into app_private.form_assignment_selections(workspace_id,client_id,form_id,version_number,terms_policy_version,selected_by) values(${context.wsA.id},${target.id},${old.formId},1,${old.policy},${context.po.userId})`;
      await sqlCall(tx, context.po.userId, 'approve', request(context, target));
      const [selection] =
        await tx`select version_number,terms_policy_version from app_private.form_assignment_selections where workspace_id=${context.wsA.id} and client_id=${target.id}`;
      expect(selection).toEqual({
        version_number: 1,
        terms_policy_version: old.policy,
      });
      expect(
        await tx`select 1 from public.form_assignments where workspace_id=${context.wsA.id} and client_id=${target.id} and form_id=${old.formId}`,
      ).toHaveLength(0);
      expect(
        await tx`select 1 from app_private.form_assignment_selection_history where workspace_id=${context.wsA.id} and client_id=${target.id}`,
      ).toHaveLength(0);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('S41-PO-12 replaces an approved stale selection once under concurrent retries', async () => {
  const context = await clientContext();
  const target = await registered(context);
  const old = await db.begin(async (tx) => {
    const fixture = await createSelectionFixture(tx, context.wsA.id);
    const currentPolicy = `t143-race-${randomUUID()}`;
    await tx`insert into app_private.terms_policy_versions(version,policy_kind,status) values(${currentPolicy},'terms','published')`;
    await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status) values(${context.wsA.id},${fixture.formId},2,${currentPolicy},${tx.json(fixture.definition)},'published')`;
    await tx`insert into app_private.form_assignment_selections(workspace_id,client_id,form_id,version_number,terms_policy_version,selected_by) values(${context.wsA.id},${target.id},${fixture.formId},1,${fixture.policy},${context.po.userId})`;
    return { ...fixture, currentPolicy };
  });

  await Promise.all([
    db.begin((tx) =>
      sqlCall(tx, context.po.userId, 'approve', request(context, target)),
    ),
    db.begin((tx) =>
      sqlCall(tx, context.po.userId, 'approve', request(context, target)),
    ),
  ]);

  const [selection] =
    await db`select version_number,terms_policy_version from app_private.form_assignment_selections where workspace_id=${context.wsA.id} and client_id=${target.id}`;
  expect(selection).toEqual({
    version_number: 2,
    terms_policy_version: old.currentPolicy,
  });
  const history =
    await db`select version_number,terms_policy_version from app_private.form_assignment_selection_history where workspace_id=${context.wsA.id} and client_id=${target.id}`;
  expect(history).toEqual([
    { version_number: 1, terms_policy_version: old.policy },
  ]);
  expect(
    await db`select 1 from public.form_assignments where workspace_id=${context.wsA.id} and client_id=${target.id} and form_id=${old.formId}`,
  ).toHaveLength(1);
});
