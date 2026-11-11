import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import type { JSONValue } from 'postgres';
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
const prewriteBoundsSql = readFileSync(
  new URL(
    '../../supabase/migrations/20261109151501_f15_prewrite_answer_bounds.sql',
    import.meta.url,
  ),
  'utf8',
);

it('T014 appends a client self-correction without changing the original or logging content', async () => {
  const context = await clientContext();
  const client = await registered(context);
  const formId = randomUUID();
  const assignmentId = randomUUID();
  const policy = `t014-${randomUUID()}`;
  const intentKey = randomUUID();
  const originalAnswers = {
    ordinary: 'original',
    mustKeep: 'original required answer',
    health: 'synthetic health value',
    score: 5,
  };
  const correctedAnswers = {
    ordinary: 'corrected',
    mustKeep: 'corrected required answer',
    health: 'updated synthetic health value',
    score: 6,
  };

  let outerError: unknown;
  try {
    await db.begin(async (tx) => {
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
      const definition = {
        questions: [
          { id: 'ordinary', type: 'shortText', charLimit: 10 },
          { id: 'mustKeep', type: 'shortText', required: true, charLimit: 30 },
          { id: 'health', type: 'longText', charLimit: 1000 },
          {
            id: 'score',
            type: 'slider',
            validation: { min: 0, max: 10, step: 1 },
          },
          { id: 'N08', type: 'singleChoice', choices: ['low', 'high'] },
          {
            id: 'N08.foods',
            type: 'multiChoice',
            choices: ['low:eggs', 'high:eggs'],
          },
        ],
      };
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
      const [originalSecurity] =
        await tx`select pg_catalog.pg_get_functiondef('public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text)'::regprocedure) as definition`;
      const securityRollback = new Error('rollback security mutation');
      let securityMutationKilled = false;
      await expect(
        tx.savepoint(async (sp) => {
          await sp`reset role`;
          await sp`alter function public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text) security invoker`;
          const [mutated] =
            await sp`select p.prosecdef from pg_catalog.pg_proc p where p.oid='public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text)'::regprocedure`;
          try {
            expect(mutated?.prosecdef).toBe(true);
          } catch {
            securityMutationKilled = true;
          }
          throw securityRollback;
        }),
      ).rejects.toBe(securityRollback);
      expect(securityMutationKilled).toBe(true);
      const [restoredSecurity] =
        await tx`select pg_catalog.pg_get_functiondef('public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text)'::regprocedure) as definition, (select p.prosecdef from pg_catalog.pg_proc p where p.oid='public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text)'::regprocedure) as prosecdef`;
      expect(restoredSecurity?.definition).toBe(originalSecurity?.definition);
      expect(restoredSecurity?.prosecdef).toBe(true);
      const clearGuard = "and p_answer_values ? (question->>'id')";
      expect(originalSecurity?.definition).toContain(clearGuard);
      const guardMutant = originalSecurity?.definition.replace(
        clearGuard,
        `and false\n      ${clearGuard}`,
      );
      expect(guardMutant).not.toBe(originalSecurity?.definition);
      const guardMutationRollback = new Error(
        'rollback required-answer guard mutation',
      );
      let guardMutationKilled = false;
      await expect(
        tx.savepoint(async (sp) => {
          await sp`reset role`;
          await sp.unsafe(guardMutant!);
          await sp`set local role authenticated`;
          const [attempt] = await sp`
            select public.correct_form_answer(
              ${context.wsA.id},${assignmentId},1,${randomUUID()},
              ${sp.json({ ...correctedAnswers, mustKeep: '' })},'synthetic correction note'
            ) as result
          `;
          try {
            expect(attempt?.result).toEqual({ status: 'invalid' });
          } catch {
            guardMutationKilled = true;
          }
          throw guardMutationRollback;
        }),
      ).rejects.toBe(guardMutationRollback);
      expect(guardMutationKilled).toBe(true);
      const [restoredGuard] = await tx`
        select pg_catalog.pg_get_functiondef('public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text)'::regprocedure) as definition
      `;
      expect(restoredGuard?.definition).toBe(originalSecurity?.definition);
      const [unknownKey] = await tx`
        select public.correct_form_answer(
          ${context.wsA.id},${assignmentId},1,${randomUUID()},
          ${tx.json({ ...correctedAnswers, outside_snapshot: 'synthetic' })},
          'synthetic correction note'
        ) as result
      `;
      expect(unknownKey?.result).toEqual({ status: 'invalid' });
      const [inconsistentBudget] = await tx`
        select public.correct_form_answer(
          ${context.wsA.id},${assignmentId},1,${randomUUID()},
          ${tx.json({ ...correctedAnswers, N08: 'low', 'N08.foods': ['high:eggs'] })},
          'synthetic correction note'
        ) as result
      `;
      expect(inconsistentBudget?.result).toEqual({ status: 'invalid' });
      const expectInvalidCorrection = async (
        values: Record<string, JSONValue>,
      ) => {
        const probeRollback = new Error(
          'rollback T014 invalid correction probe',
        );
        let result: unknown;
        await expect(
          tx.savepoint(async (sp) => {
            const [attempt] = await sp`
              select public.correct_form_answer(
                ${context.wsA.id},${assignmentId},1,${randomUUID()},
                ${sp.json(values)},'synthetic correction note'
              ) as result
            `;
            result = attempt?.result;
            throw probeRollback;
          }),
        ).rejects.toBe(probeRollback);
        expect(result).toEqual({ status: 'invalid' });
      };
      const [clearedRequired] = await tx`
        select public.correct_form_answer(
          ${context.wsA.id},${assignmentId},1,${randomUUID()},
          ${tx.json({ ...correctedAnswers, mustKeep: '' })},'synthetic correction note'
        ) as result
      `;
      expect(clearedRequired?.result).toEqual({ status: 'invalid' });
      await tx`reset role`;
      expect(
        await tx`
        select
          (select count(*)::int from public.form_answer_revisions where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}) as revisions,
          (select count(*)::int from app_private.form_corrections where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}) as corrections,
          (select count(*)::int from app_private.form_correction_intents where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}) as intents,
          (select count(*)::int from public.audit_events where action='form.answer_corrected' and target_id=${assignmentId}) as correction_audits
      `,
      ).toEqual([
        { revisions: 1, corrections: 0, intents: 0, correction_audits: 0 },
      ]);
      await tx`set local role authenticated`;
      await expectInvalidCorrection({ ...correctedAnswers, score: '6' });
      await expectInvalidCorrection({ ...correctedAnswers, score: 11 });
      await expectInvalidCorrection({ ...correctedAnswers, mustKeep: null });
      await expectInvalidCorrection({
        ...correctedAnswers,
        N08: 'not-a-choice',
      });
      const unrelatedRollback = new Error(
        'rollback unrelated-only correction probe',
      );
      let unrelatedResult: unknown;
      let unrelatedStoredAnswers: unknown;
      await expect(
        tx.savepoint(async (sp) => {
          const [attempt] = await sp`
            select public.correct_form_answer(
              ${context.wsA.id},${assignmentId},1,${randomUUID()},
              ${sp.json({ ordinary: 'narrow' })},'synthetic correction note'
            ) as result
          `;
          unrelatedResult = attempt?.result;
          await sp`reset role`;
          const [revision] = await sp`
            select answer_values from public.form_answer_revisions
            where workspace_id=${context.wsA.id} and assignment_id=${assignmentId} and revision=2
          `;
          unrelatedStoredAnswers = revision?.answer_values;
          throw unrelatedRollback;
        }),
      ).rejects.toBe(unrelatedRollback);
      expect(unrelatedResult).toMatchObject({
        status: 'corrected',
        revision: 2,
      });
      expect(unrelatedStoredAnswers).toEqual({
        ...originalAnswers,
        ordinary: 'narrow',
      });
      await tx`reset role`;
      await expect(
        tx.savepoint(async (sp) => {
          await sp`
            insert into public.form_answer_revisions(
              workspace_id,assignment_id,revision,answer_values
            ) values (
              ${context.wsA.id},${assignmentId},2,
              ${sp.json({ ...correctedAnswers, N08: 'low', 'N08.foods': ['high:eggs'] })}
            )
          `;
        }),
      ).rejects.toThrow('invalid_form_answer_snapshot');
      const [overlongNote] = await tx`
        select public.correct_form_answer(
          ${context.wsA.id},${assignmentId},1,${randomUUID()},${tx.json(correctedAnswers)},repeat('🙂',1001)
        ) as result
      `;
      expect(overlongNote?.result).toEqual({ status: 'answer_too_long' });
      const [overCharLimit] = await tx`select public.correct_form_answer(
        ${context.wsA.id},${assignmentId},1,${randomUUID()},${tx.json({ ordinary: 'x'.repeat(11), health: 'safe' })},'synthetic note'
      ) as result`;
      expect(overCharLimit?.result).toEqual({ status: 'answer_too_long' });
      expect(prewriteBoundsSql).toContain(
        "octet_length(entry.value #>> '{}') > 4096",
      );
      await tx`reset role`;
      expect(
        await tx`select count(*)::int as count from public.form_answer_revisions where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}`,
      ).toEqual([{ count: 1 }]);
      await tx`set local role authenticated`;
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
              ${context.wsA.id},${assignmentId},2,${secondIntentKey},${sp.json({ ...correctedAnswers, ordinary: 'rollback' })},'synthetic mutation note'
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
    });
  } catch (error) {
    outerError = error;
  }
  expect(outerError).toBe(rollback);
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
