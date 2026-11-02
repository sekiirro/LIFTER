import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { calculateCairoD03Deadline } from '../../lib/forms/cairo-deadline';
import { sql } from './harness';
import {
  clientContext,
  registered,
  request,
  sqlCall,
  worker,
} from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());
const rollback = new Error('rollback T013 synthetic submission fixture');
const completionMutationRollback = new Error(
  'rollback T013 completeness mutation',
);

it('T013 commits one complete original, revision, audit, and frozen D-03 SLA', async () => {
  const context = await clientContext();
  const client = await registered(context);
  const formId = randomUUID();
  const assignmentId = randomUUID();
  const policy = `t013-${randomUUID()}`;
  const intentKey = randomUUID();
  const answers = {
    basic: 'basic',
    training: 'training',
    nutrition: 'nutrition',
  };
  const definition = {
    questions: [
      { id: 'basic', sectionId: 'basic', type: 'shortText', required: true },
      {
        id: 'training',
        sectionId: 'training',
        type: 'shortText',
        required: true,
      },
      {
        id: 'nutrition',
        sectionId: 'nutrition',
        type: 'shortText',
        required: true,
      },
    ],
  };

  await expect(
    db.begin(async (tx) => {
      expect(
        (
          await sqlCall(
            tx,
            context.po.userId,
            'approve',
            request(context, client),
          )
        ).status,
      ).toBe('ok');
      await tx`
        insert into app_private.terms_policy_versions(version,policy_kind,status)
        values(${policy},'terms','published')
      `;
      await tx`insert into public.forms(id,workspace_id,name)
        values(${formId},${context.wsA.id},'T013 synthetic submission')`;
      await tx`
        insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
        values(${context.wsA.id},${formId},1,${policy},${tx.json(definition)},'published')
      `;
      await tx`
        insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
        values(${assignmentId},${context.wsA.id},${client.id},${formId},1,${policy},${tx.json(definition)})
      `;
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const save = (revision: number, values: Record<string, string>) =>
        tx`select public.save_form_draft(${context.wsA.id},${assignmentId},${revision},${randomUUID()},${tx.json(values)}) as result`;
      expect((await save(0, {}))[0]?.result).toMatchObject({
        status: 'saved',
        revision: 1,
      });
      const [incomplete] = await tx`
        select public.submit_form_assignment(${context.wsA.id},${assignmentId},1,${randomUUID()}) as result
      `;
      expect(incomplete?.result).toEqual({ status: 'incomplete' });
      await tx`reset role`;
      let completionMutationKilled = false;
      await expect(
        tx.savepoint(async (sp) => {
          await sp.unsafe(`create or replace function app_private.f15_submission_complete(p_snapshot jsonb,p_answers jsonb)
            returns boolean language sql immutable set search_path = '' as $$ select true $$`);
          await sp`set local role authenticated`;
          const [mutated] = await sp`
            select public.submit_form_assignment(${context.wsA.id},${assignmentId},1,${randomUUID()}) as result
          `;
          try {
            expect(mutated?.result).toEqual({ status: 'incomplete' });
          } catch {
            completionMutationKilled = true;
          }
          throw completionMutationRollback;
        }),
      ).rejects.toBe(completionMutationRollback);
      expect(completionMutationKilled).toBe(true);
      await tx`set local role authenticated`;
      expect((await save(1, answers))[0]?.result).toMatchObject({
        status: 'saved',
        revision: 2,
      });

      await tx`reset role`;
      await expect(
        tx.savepoint(async (sp) => {
          await sp.unsafe(`create function app_private.t013_fail_submission_audit() returns trigger
            language plpgsql set search_path = '' as $$ begin
              if new.action='form.submitted' then raise exception 'synthetic audit failure'; end if;
              return new;
            end $$`);
          await sp.unsafe(`create trigger t013_fail_submission_audit
            before insert on public.audit_events for each row
            execute function app_private.t013_fail_submission_audit()`);
          await sp`set local role authenticated`;
          await sp`
            select public.submit_form_assignment(${context.wsA.id},${assignmentId},2,${randomUUID()})
          `;
        }),
      ).rejects.toThrow('synthetic audit failure');
      expect(
        await tx`select
          (select count(*)::int from app_private.form_submissions where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}) as submissions,
          (select count(*)::int from public.form_answer_revisions where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}) as revisions,
          (select count(*)::int from app_private.form_submission_slas where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}) as slas`,
      ).toEqual([{ submissions: 0, revisions: 0, slas: 0 }]);
      await tx`set local role authenticated`;

      const [submitted] = await tx`
        select public.submit_form_assignment(${context.wsA.id},${assignmentId},2,${intentKey}) as result
      `;
      expect(submitted?.result).toMatchObject({
        status: 'submitted',
        revision: 3,
      });
      const result = submitted?.result as {
        submitted_at: string;
        start_date: string;
        day_five_date: string;
        deadline_at: string;
      };
      const expectedSla = calculateCairoD03Deadline(result.submitted_at);
      expect(result).toMatchObject({
        start_date: expectedSla.startDate,
        day_five_date: expectedSla.dayFiveDate,
      });
      expect(new Date(result.deadline_at).toISOString()).toBe(
        expectedSla.deadlineAt,
      );
      expect(
        await tx`select public.submit_form_assignment(${context.wsA.id},${assignmentId},2,${intentKey}) as result`,
      ).toEqual([{ result: submitted?.result }]);
      const correctionKey = randomUUID();
      const correctedAnswers = {
        ...answers,
        nutrition: 'corrected synthetic nutrition',
      };
      const [corrected] = await tx`
        select public.correct_form_answer(
          ${context.wsA.id},${assignmentId},3,${correctionKey},${tx.json(correctedAnswers)},'synthetic correction'
        ) as result
      `;
      expect(corrected?.result).toMatchObject({
        status: 'corrected',
        revision: 4,
        intent_key: correctionKey,
      });
      expect(
        await tx`
        select public.correct_form_answer(
          ${context.wsA.id},${assignmentId},3,${correctionKey},${tx.json(correctedAnswers)},'synthetic correction'
        ) as result
      `,
      ).toEqual([{ result: corrected?.result }]);
      const [history] = await tx`
        select public.read_form_answer(${context.wsA.id},${assignmentId},'history') as result
      `;
      expect(history?.result).toHaveLength(2);
      expect(history?.result[0]).toMatchObject({ revision: 3, answers });
      expect(history?.result[1]).toMatchObject({
        revision: 4,
        answers: correctedAnswers,
      });
      let correctionDeadlineMutationKilled = false;
      const deadlineBeforeMutation = result.deadline_at;
      await expect(
        tx.savepoint(async (sp) => {
          await sp`reset role`;
          const [definitionRow] = await sp`
            select pg_get_functiondef('public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text)'::regprocedure) as body
          `;
          const mutatedDefinition = (definitionRow?.body as string).replace(
            '  return response;',
            `  update app_private.form_submission_slas set deadline_at = deadline_at + interval '1 day'
             where workspace_id = p_workspace_id and assignment_id = p_assignment_id;
  return response;`,
          );
          expect(mutatedDefinition).not.toBe(definitionRow?.body);
          await sp.unsafe(mutatedDefinition);
          await sp`set local role authenticated`;
          const [mutated] = await sp`
            select public.correct_form_answer(
              ${context.wsA.id},${assignmentId},4,${randomUUID()},${sp.json({ ...correctedAnswers, nutrition: 'mutation probe' })},'synthetic mutation'
            ) as result
          `;
          expect(mutated?.result).toMatchObject({
            status: 'corrected',
            revision: 5,
          });
          await sp`reset role`;
          const [sla] = await sp`
            select deadline_at from app_private.form_submission_slas
            where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}
          `;
          try {
            expect(new Date(sla?.deadline_at as string).toISOString()).toBe(
              new Date(deadlineBeforeMutation).toISOString(),
            );
          } catch {
            correctionDeadlineMutationKilled = true;
          }
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(correctionDeadlineMutationKilled).toBe(true);
      expect(
        await tx`select public.submit_form_assignment(${context.wsA.id},${assignmentId},2,${randomUUID()}) as result`,
      ).toEqual([{ result: { status: 'already_submitted' } }]);

      await tx`reset role`;
      const [frozenSla] = await tx`
        select count(*)::int as submissions,
          (select deadline_at from app_private.form_submission_slas where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}) as deadline_at
        from app_private.form_submissions where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}
      `;
      expect(frozenSla?.submissions).toBe(1);
      expect(new Date(frozenSla?.deadline_at as string).toISOString()).toBe(
        new Date(result.deadline_at).toISOString(),
      );
      expect(
        await tx`select
          (select count(*)::int from app_private.form_submissions where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}) as submissions,
          (select count(*)::int from public.form_answer_revisions where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}) as revisions,
          (select count(*)::int from app_private.form_submission_slas where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}) as slas,
          (select count(*)::int from public.audit_events where action='form.submitted' and target_id=${assignmentId}) as audits`,
      ).toEqual([{ submissions: 1, revisions: 2, slas: 1, audits: 1 }]);
      expect(completionMutationKilled).toBe(true);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('T013 concurrent identical submits return one idempotent result and persist one original', async () => {
  const context = await clientContext();
  const client = await registered(context);
  const formId = randomUUID();
  const assignmentId = randomUUID();
  const policy = `t013-race-${randomUUID()}`;
  const intentKey = randomUUID();
  const definition = {
    questions: [
      { id: 'basic', sectionId: 'basic', type: 'shortText', required: true },
      {
        id: 'training',
        sectionId: 'training',
        type: 'shortText',
        required: true,
      },
      {
        id: 'nutrition',
        sectionId: 'nutrition',
        type: 'shortText',
        required: true,
      },
    ],
  };
  const answers = {
    basic: 'ready',
    training: 'strength',
    nutrition: 'balanced',
  };
  const clientDb = sql();
  const first = worker(`t013-submit-a-${randomUUID()}`);
  const second = worker(`t013-submit-b-${randomUUID()}`);
  try {
    const approved = await clientDb.begin((tx) =>
      sqlCall(tx, context.po.userId, 'approve', request(context, client)),
    );
    expect(approved.status).toBe('ok');
    await clientDb`
      insert into app_private.terms_policy_versions(version,policy_kind,status)
      values(${policy},'terms','published')
    `;
    await clientDb`insert into public.forms(id,workspace_id,name)
      values(${formId},${context.wsA.id},'T013 submit race')`;
    await clientDb`
      insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
      values(${context.wsA.id},${formId},1,${policy},${clientDb.json(definition)},'published')
    `;
    await clientDb`
      insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
      values(${assignmentId},${context.wsA.id},${client.id},${formId},1,${policy},${clientDb.json(definition)})
    `;
    await clientDb`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.userId, role: 'authenticated' })},false)`;
    await clientDb`set role authenticated`;
    await clientDb`
      select public.save_form_draft(${context.wsA.id},${assignmentId},0,${randomUUID()},${clientDb.json(answers)})
    `;
    await clientDb`reset role`;

    const submit = (connection: typeof first) =>
      connection.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.userId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const [row] = await tx`
          select public.submit_form_assignment(${context.wsA.id},${assignmentId},1,${intentKey}) as result
        `;
        return row?.result;
      });
    const [resultA, resultB] = await Promise.all([
      submit(first),
      submit(second),
    ]);
    expect(resultA).toMatchObject({ status: 'submitted' });
    expect(resultB).toEqual(resultA);
    expect(
      await clientDb`select
        (select count(*)::int from app_private.form_submissions where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}) as submissions,
        (select count(*)::int from app_private.form_submission_slas where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}) as slas,
        (select count(*)::int from public.form_answer_revisions where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}) as revisions,
        (select count(*)::int from public.audit_events where action='form.submitted' and target_id=${assignmentId}) as audits`,
    ).toEqual([{ submissions: 1, slas: 1, revisions: 1, audits: 1 }]);
  } finally {
    await Promise.all([clientDb.end(), first.end(), second.end()]);
  }
});

it('T013 detects removal of submit row locks and the original-submission uniqueness key', async () => {
  const [functionRow] = await db`
    select pg_get_functiondef('public.submit_form_assignment(uuid,uuid,integer,uuid)'::regprocedure) as body
  `;
  const body = functionRow?.body as string;
  const assignmentLock =
    'where a.workspace_id=p_workspace_id and a.id=p_assignment_id for update';
  const draftLock =
    'where d.workspace_id=p_workspace_id and d.assignment_id=p_assignment_id for update';
  expect(body).toContain(assignmentLock);
  expect(body).toContain(draftLock);
  const lockMutant = body.replaceAll(' for update', '');
  expect(lockMutant).not.toContain(assignmentLock);
  expect(lockMutant).not.toContain(draftLock);

  const [constraint] = await db`
    select pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid='app_private.form_submissions'::regclass and contype='p'
  `;
  expect(constraint?.definition).toMatch(
    /primary key \(workspace_id, assignment_id\)/iu,
  );
});
