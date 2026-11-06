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
const rollback = new Error('rollback T012 synthetic autosave fixture');
const boundRollback = new Error('rollback T012 database-bound mutation');

it('T012 acknowledges drafts, binds retries, rejects stale and late writes', async () => {
  const context = await clientContext();
  const client = await registered(context);
  const formId = randomUUID();
  const assignmentId = randomUUID();
  const policy = `t012-${randomUUID()}`;
  const selectionKey = randomUUID();
  const changedKey = randomUUID();
  const staleKey = randomUUID();
  const nextKey = randomUUID();
  const lateKey = randomUUID();
  let staleMutationKilled = false;

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
      const definition = {
        questions: Array.from({ length: 60 }, (_, index) => ({
          id: index === 0 ? 'q1' : `q${index + 1}`,
          type: index === 0 ? 'shortText' : 'short_text',
          ...(index === 0 ? { charLimit: 20 } : {}),
        })),
      };
      await tx`
        insert into app_private.terms_policy_versions(version,policy_kind,status)
        values(${policy},'terms','published')
      `;
      await tx`insert into public.forms(id,workspace_id,name)
        values(${formId},${context.wsA.id},'T012 synthetic draft')`;
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

      const [definitionRow] = await tx`
        select pg_catalog.pg_get_functiondef(
          'public.save_form_draft(uuid,uuid,integer,uuid,jsonb)'::regprocedure
        ) as definition
      `;
      const originalDefinition = definitionRow!.definition as string;
      let baselinePassed = false;
      await expect(
        tx.savepoint(async (sp) => {
          const [baseline] = await sp`
            select public.save_form_draft(
              ${context.wsA.id},${assignmentId},0,${randomUUID()},${sp.json({ q1: 'baseline draft' })}
            ) as result`;
          expect(baseline?.result).toEqual({
            status: 'saved',
            revision: 1,
            intent_key: expect.any(String),
          });
          baselinePassed = true;
          throw boundRollback;
        }),
      ).rejects.toBe(boundRollback);
      expect(
        baselinePassed,
        'unmutated draft save must pass before mutants',
      ).toBe(true);
      await tx`reset role`;
      const [draftState] = await tx`
        select coalesce(revision, 0)::int as revision
        from public.form_answer_drafts
        where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}
      `;
      const currentRevision = draftState?.revision ?? 0;
      await tx`set local role authenticated`;
      const boundMutants = [
        {
          name: 'total payload',
          pattern: /octet_length\(p_answer_values::text\) > 262144/,
          expected: 'payload_too_large',
          values: Object.fromEntries(
            Array.from({ length: 220 }, (_, index) => [
              `q${index + 1}`,
              Array.from({ length: 1200 }, () => 'x'),
            ]),
          ),
        },
        {
          name: 'single answer bytes',
          pattern: /octet_length\(e\.value #>> '\{\}'\) > 4096/,
          expected: 'answer_too_long',
          values: { q2: 'é'.repeat(2049) },
        },
        {
          name: 'per-question character count',
          pattern: /max_chars is not null and answer_chars > max_chars/,
          expected: 'answer_too_long',
          values: { q1: 'x'.repeat(21) },
        },
      ] as const;
      for (const mutant of boundMutants) {
        let boundBaselinePassed = false;
        await expect(
          tx.savepoint(async (sp) => {
            await sp`reset role`;
            await sp`set local role authenticated`;
            const [baseline] = await sp`
              select public.save_form_draft(
                ${context.wsA.id},${assignmentId},${currentRevision},${randomUUID()},${sp.json(mutant.values)}
              ) as result
            `;
            expect(
              baseline?.result,
              `${mutant.name} bound baseline`,
            ).toMatchObject({ status: mutant.expected });
            boundBaselinePassed = true;
            throw boundRollback;
          }),
        ).rejects.toBe(boundRollback);
        expect(boundBaselinePassed, `${mutant.name} unmutated baseline`).toBe(
          true,
        );
        let mutationKilled = false;
        await expect(
          tx.savepoint(async (sp) => {
            await sp`reset role`;
            const changed = originalDefinition.replace(mutant.pattern, 'false');
            expect(changed, mutant.name).not.toBe(originalDefinition);
            await sp.unsafe(changed);
            await sp`grant execute on function public.save_form_draft(uuid,uuid,integer,uuid,jsonb) to authenticated`;
            await sp`set local role authenticated`;
            const [result] = await sp`
              select public.save_form_draft(
                ${context.wsA.id},${assignmentId},${currentRevision},${randomUUID()},${sp.json(mutant.values)}
              ) as result
            `;
            try {
              expect(result?.result).toMatchObject({ status: mutant.expected });
            } catch {
              mutationKilled = true;
            }
            throw boundRollback;
          }),
        ).rejects.toBe(boundRollback);
        expect(mutationKilled, `${mutant.name} bound mutant`).toBe(true);
      }

      await tx`reset role`;
      await tx`delete from app_private.form_draft_intents
        where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}`;
      await tx`delete from public.form_answer_drafts
        where workspace_id=${context.wsA.id} and assignment_id=${assignmentId}`;
      const [auditBaseline] = await tx`
        select count(*)::int as count from public.audit_events
        where action='form.draft_saved' and target_id=${assignmentId}
      `;
      const auditCountBeforeStableFlow = auditBaseline?.count ?? 0;
      await tx`set local role authenticated`;

      const save = (
        expectedRevision: number,
        key: string,
        values: Record<string, string>,
      ) =>
        tx`select public.save_form_draft(${context.wsA.id},${assignmentId},${expectedRevision},${key},${tx.json(values)}) as result`;
      const first = (await save(0, selectionKey, { q1: 'first draft' }))[0]
        ?.result;
      expect(first).toEqual({
        status: 'saved',
        revision: 1,
        intent_key: selectionKey,
      });
      expect(await save(0, selectionKey, { q1: 'first draft' })).toEqual([
        { result: first },
      ]);
      let alteredIntentBaselinePassed = false;
      await expect(
        tx.savepoint(async (sp) => {
          const [initial] = await sp`
            select public.save_form_draft(
              ${context.wsA.id},${assignmentId},0,${selectionKey},${sp.json({ q1: 'first draft' })}
            ) as result
          `;
          expect(
            initial?.result,
            'altered-intent baseline first write',
          ).toMatchObject({
            status: 'saved',
            revision: 1,
          });
          const [replay] = await sp`
            select public.save_form_draft(
              ${context.wsA.id},${assignmentId},0,${selectionKey},${sp.json({ q1: 'altered intent' })}
            ) as result
          `;
          expect(replay?.result).toMatchObject({
            status: 'conflict',
            revision: 1,
          });
          alteredIntentBaselinePassed = true;
          throw boundRollback;
        }),
      ).rejects.toBe(boundRollback);
      expect(
        alteredIntentBaselinePassed,
        'unmutated altered-intent replay baseline',
      ).toBe(true);
      let intentMutationKilled = false;
      await expect(
        tx.savepoint(async (sp) => {
          await sp`reset role`;
          const changed = originalDefinition.replace(
            /if found then\s+if prior\.request_hash=request_hash then return prior\.result; end if;\s+return jsonb_build_object\('status','conflict','revision',current_revision\);\s+end if;/,
            'if found then return prior.result; end if;',
          );
          expect(changed).not.toBe(originalDefinition);
          await sp.unsafe(changed);
          await sp`grant execute on function public.save_form_draft(uuid,uuid,integer,uuid,jsonb) to authenticated`;
          await sp`set local role authenticated`;
          const [result] = await sp`
            select public.save_form_draft(
              ${context.wsA.id},${assignmentId},0,${selectionKey},${sp.json({ q1: 'altered intent' })}
            ) as result
          `;
          try {
            expect(result?.result).toMatchObject({ status: 'conflict' });
          } catch {
            intentMutationKilled = true;
          }
          throw boundRollback;
        }),
      ).rejects.toBe(boundRollback);
      expect(intentMutationKilled, 'altered-intent replay mutant').toBe(true);

      expect(await save(0, changedKey, { q1: 'changed intent' })).toEqual([
        {
          result: { status: 'conflict', revision: 1 },
        },
      ]);
      expect(await save(0, staleKey, { q1: 'stale write' })).toEqual([
        {
          result: { status: 'conflict', revision: 1 },
        },
      ]);
      await tx`reset role`;
      expect(
        await tx`select count(*)::int as count from public.audit_events
          where action='form.draft_saved' and target_id=${assignmentId}`,
      ).toEqual([{ count: auditCountBeforeStableFlow + 1 }]);
      await tx`set local role authenticated`;

      let auditMutationKilled = false;
      await expect(
        tx.savepoint(async (sp) => {
          await sp`reset role`;
          const changed = originalDefinition.replace(
            /insert into public\.audit_events\s*\([^;]*\)\s*values\s*\(\s*auth\.uid\(\)\s*,\s*'form\.draft_saved'[\s\S]*?\);/i,
            '  null;',
          );
          expect(changed).not.toBe(originalDefinition);
          await sp.unsafe(changed);
          await sp`grant execute on function public.save_form_draft(uuid,uuid,integer,uuid,jsonb) to authenticated`;
          await sp`set local role authenticated`;
          const [result] = await sp`
            select public.save_form_draft(
              ${context.wsA.id},${assignmentId},1,${randomUUID()},${sp.json({ q1: 'audit mutant' })}
            ) as result
          `;
          await sp`reset role`;
          const [count] = await sp`
            select count(*)::int as count from public.audit_events
            where action='form.draft_saved' and target_id=${assignmentId}
          `;
          try {
            expect(
              result?.result,
              'audit omission mutant allows save',
            ).toMatchObject({ status: 'saved' });
            expect(count?.count).toBe(auditCountBeforeStableFlow + 2);
          } catch {
            auditMutationKilled = true;
          }
          throw boundRollback;
        }),
      ).rejects.toBe(boundRollback);
      expect(auditMutationKilled, 'draft audit omission mutant').toBe(true);

      const second = (await save(1, nextKey, { q1: 'second draft' }))[0]
        ?.result;
      expect(second).toEqual({
        status: 'saved',
        revision: 2,
        intent_key: nextKey,
      });
      expect(await save(1, lateKey, { q1: 'late acknowledgement' })).toEqual([
        {
          result: { status: 'conflict', revision: 2 },
        },
      ]);
      expect(
        await tx`select public.read_form_answer(${context.wsA.id},${assignmentId},'draft') as answer`,
      ).toEqual([{ answer: { q1: 'second draft' } }]);

      await tx`reset role`;
      await tx.savepoint(async (sp) => {
        await sp.unsafe(`create or replace function public.save_form_draft(
          p_workspace_id uuid,p_assignment_id uuid,p_expected_revision integer,p_intent_key uuid,p_answer_values jsonb
        ) returns jsonb language plpgsql security definer set search_path = '' as $$
        begin
          update public.form_answer_drafts set revision=revision+1,answer_values=p_answer_values,updated_at=clock_timestamp()
          where workspace_id=p_workspace_id and assignment_id=p_assignment_id;
          return jsonb_build_object('status','saved','revision',p_expected_revision+1);
        end $$`);
        await sp`grant execute on function public.save_form_draft(uuid,uuid,integer,uuid,jsonb) to authenticated`;
        await sp`set local role authenticated`;
        const mutated = await sp`select public.save_form_draft(
          ${context.wsA.id},${assignmentId},1,${randomUUID()},${sp.json({ q1: 'mutated stale overwrite' })}
        ) as result`;
        try {
          expect(mutated[0]?.result).toMatchObject({
            status: 'conflict',
            revision: 2,
          });
        } catch {
          staleMutationKilled = true;
        }
      });
      throw rollback;
    }),
  ).rejects.toBe(rollback);
  expect(staleMutationKilled).toBe(true);
});
