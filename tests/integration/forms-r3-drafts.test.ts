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
      const definition = { questions: [{ id: 'q1', type: 'short_text' }] };
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

      const save = (
        expectedRevision: number,
        key: string,
        values: Record<string, string>,
      ) =>
        tx`select public.save_form_draft(${context.wsA.id},${assignmentId},${expectedRevision},${key},${tx.json(values)}) as result`;
      const first = (await save(0, selectionKey, { q1: 'first draft' }))[0]
        ?.result;
      expect(first).toMatchObject({ status: 'saved', revision: 1 });
      expect(await save(0, selectionKey, { q1: 'first draft' })).toEqual([
        { result: first },
      ]);
      expect(await save(0, changedKey, { q1: 'changed intent' })).toEqual([
        {
          result: expect.objectContaining({ status: 'conflict', revision: 1 }),
        },
      ]);
      expect(await save(0, staleKey, { q1: 'stale write' })).toEqual([
        {
          result: expect.objectContaining({ status: 'conflict', revision: 1 }),
        },
      ]);
      await tx`reset role`;
      expect(
        await tx`select count(*)::int as count from public.audit_events
          where action='form.draft_saved' and target_id=${assignmentId}`,
      ).toEqual([{ count: 1 }]);
      await tx`set local role authenticated`;

      const second = (await save(1, nextKey, { q1: 'second draft' }))[0]
        ?.result;
      expect(second).toMatchObject({ status: 'saved', revision: 2 });
      expect(await save(1, lateKey, { q1: 'late acknowledgement' })).toEqual([
        {
          result: expect.objectContaining({ status: 'conflict', revision: 2 }),
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
