import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { sql } from './harness';
import {
  clientContext,
  registered,
  request,
  sqlCall,
} from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());
const rollback = new Error('rollback T014 synthetic correction fixture');

it('T014 appends a client self-correction without changing the original or logging content', async () => {
  const context = await clientContext();
  const client = await registered(context);
  const formId = randomUUID();
  const assignmentId = randomUUID();
  const policy = `t014-${randomUUID()}`;
  const intentKey = randomUUID();
  const originalAnswers = {
    ordinary: 'original',
    health: 'synthetic health value',
  };
  const correctedAnswers = {
    ordinary: 'corrected',
    health: 'updated synthetic health value',
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
      const definition = { questions: [{ id: 'ordinary' }, { id: 'health' }] };
      await tx`insert into public.forms(id,workspace_id,name)
        values(${formId},${context.wsA.id},'T014 synthetic corrections')`;
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
        values(${context.wsA.id},${assignmentId},1,${tx.json(originalAnswers)})
      `;
      await tx`
        insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
        values(${context.wsA.id},${assignmentId},1,clock_timestamp())
      `;
      await expect(
        tx.savepoint(async (sp) => {
          await sp`
            update public.form_answer_revisions set answer_values=${sp.json({ ordinary: 'mutated original' })}
            where workspace_id=${context.wsA.id} and assignment_id=${assignmentId} and revision=1
          `;
        }),
      ).rejects.toThrow('form answer revisions are immutable');
      await expect(
        tx.savepoint(async (sp) => {
          await sp`
            delete from public.form_answer_revisions
            where workspace_id=${context.wsA.id} and assignment_id=${assignmentId} and revision=1
          `;
        }),
      ).rejects.toThrow('form answer revisions are immutable');
      let revisionMutationKilled = false;
      await expect(
        tx.savepoint(async (sp) => {
          await sp.unsafe(
            'drop trigger form_answer_revisions_immutable on public.form_answer_revisions',
          );
          const [mutated] = await sp`
            update public.form_answer_revisions
            set answer_values=${sp.json({ ordinary: 'guard mutant' })}
            where workspace_id=${context.wsA.id} and assignment_id=${assignmentId} and revision=1
            returning revision
          `;
          try {
            expect(mutated).toBeUndefined();
          } catch {
            revisionMutationKilled = true;
          }
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(revisionMutationKilled).toBe(true);
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      await expect(
        tx.savepoint(async (sp) => {
          await sp`
            select public.correct_form_answer(
              ${context.wsA.id},${assignmentId},1,${randomUUID()},
              ${sp.json({ ...correctedAnswers, outside_snapshot: 'synthetic' })},
              'synthetic correction note'
            ) as result
          `;
        }),
      ).rejects.toThrow('invalid_form_answer_snapshot');
      const [overlongNote] = await tx`
        select public.correct_form_answer(
          ${context.wsA.id},${assignmentId},1,${randomUUID()},${tx.json(correctedAnswers)},repeat('🙂',1001)
        ) as result
      `;
      expect(overlongNote?.result).toEqual({ status: 'answer_too_long' });
      const [result] = await tx`
        select public.correct_form_answer(
          ${context.wsA.id},${assignmentId},1,${intentKey},${tx.json(correctedAnswers)},'synthetic correction note'
        ) as result
      `;
      expect(result?.result).toEqual({
        status: 'corrected',
        revision: 2,
        intent_key: intentKey,
      });
      expect(
        await tx`
          select public.correct_form_answer(
            ${context.wsA.id},${assignmentId},1,${intentKey},${tx.json(correctedAnswers)},'synthetic correction note'
          ) as result
        `,
      ).toEqual([{ result: result?.result }]);
      const [history] = await tx`
        select public.read_form_answer(${context.wsA.id},${assignmentId},'history') as result
      `;
      expect(history?.result).toHaveLength(2);
      expect(history?.result[0]).toEqual({
        revision: 1,
        answers: originalAnswers,
      });
      expect(history?.result[1]).toMatchObject({
        revision: 2,
        answers: correctedAnswers,
        correction_actor: client.userId,
        correction_note: 'synthetic correction note',
      });
      await tx`reset role`;
      const [correction] = await tx`
        select correction_note from app_private.form_corrections
        where workspace_id=${context.wsA.id} and assignment_id=${assignmentId} and revision=2
      `;
      expect(correction?.correction_note).toBe('synthetic correction note');
      const [audit] = await tx`
        select details::text as details from public.audit_events
        where action='form.answer_corrected' and target_id=${assignmentId}
      `;
      expect(audit?.details).toContain('"revision": 2');
      expect(audit?.details).not.toContain('synthetic');

      const secondIntentKey = randomUUID();
      await expect(
        tx.savepoint(async (sp) => {
          await sp.unsafe(`create function app_private.t014_fail_correction_audit() returns trigger
            language plpgsql set search_path = '' as $$ begin
              if new.action='form.answer_corrected' then raise exception 'synthetic audit outage'; end if;
              return new;
            end $$`);
          await sp.unsafe(`create trigger t014_fail_correction_audit
            before insert on public.audit_events for each row
            execute function app_private.t014_fail_correction_audit()`);
          await sp`set local role authenticated`;
          await sp`
            select public.correct_form_answer(
              ${context.wsA.id},${assignmentId},2,${secondIntentKey},${sp.json({ ...correctedAnswers, ordinary: 'must rollback' })},'synthetic mutation note'
            )
          `;
        }),
      ).rejects.toThrow('synthetic audit outage');
      expect(
        await tx`select count(*)::int as count from public.form_answer_revisions where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}`,
      ).toEqual([{ count: 2 }]);
      expect(
        await tx`select count(*)::int as count from app_private.form_corrections where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}`,
      ).toEqual([{ count: 1 }]);

      for (const sourceKind of ['closure', 'refund', 'deactivation'] as const) {
        await expect(
          tx.savepoint(async (sp) => {
            await sp`
              insert into app_private.form_retention_windows(workspace_id,client_id,source_event_id,source_kind,ended_at)
              values(${context.wsA.id},${client.id},${randomUUID()},${sourceKind},clock_timestamp())
            `;
            await sp`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.userId, role: 'authenticated' })},true)`;
            await sp`set local role authenticated`;
            const [ended] = await sp`
              select public.correct_form_answer(
                ${context.wsA.id},${assignmentId},2,${randomUUID()},${sp.json({ ...correctedAnswers, ordinary: 'after relationship end' })},'synthetic ended note'
              ) as result
            `;
            expect(ended?.result).toEqual({ status: 'relationship_ended' });
            throw rollback;
          }),
        ).rejects.toBe(rollback);
      }
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('T014 keeps Trainer, WO, and PO correction roles pending shared capability reconciliation', async () => {
  const rows = await db`
    select role::text as role,
      app_private.role_has_capability(role,'read_form_answers') as allowed
    from unnest(enum_range(null::public.staff_role)) role
  `;
  expect(rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ role: 'trainer', allowed: true }),
      expect.objectContaining({ role: 'workspace_owner', allowed: true }),
      expect.objectContaining({ role: 'platform_owner', allowed: true }),
      expect.objectContaining({ role: 'sales', allowed: false }),
    ]),
  );
});
