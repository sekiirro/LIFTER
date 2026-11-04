import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { sql } from './harness';
import { clientContext } from './registration-approval-operations-fixture';
import { graph } from './registration-approval-fixture';

const db = sql();
afterAll(() => db.end());
const rollback = new Error('rollback S33 correction context fixture');

it('authorizes client and read-capable staff correction context without exposing foreign assignments', async () => {
  const context = await clientContext();
  const formId = randomUUID();
  const assignmentId = randomUUID();
  const terms = `s33-correction-context-${randomUUID()}`;
  const definition = { questions: [{ id: 'q1', type: 'shortText' }] };

  await expect(
    db.begin(async (tx) => {
      const approved = await graph(tx, context);
      const [client] = await tx`select auth_user_id from public.clients where id=${approved.client}`;
      await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
        values(${terms},'terms','published')`;
      await tx`insert into public.forms(id,workspace_id,name)
        values(${formId},${context.wsA.id},'S33 correction context')`;
      await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
        values(${context.wsA.id},${formId},1,${terms},${tx.json(definition)},'published')`;
      await tx`insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
        values(${assignmentId},${context.wsA.id},${approved.client},${formId},1,${terms},${tx.json(definition)})`;

      for (const [label, actor] of [
        ['client', client!.auth_user_id as string],
        ['workspace trainer', context.trainerA.userId],
      ] as const) {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: actor, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const [allowed] = await tx`
          select public.read_form_correction_context(${assignmentId}) as context
        `;
        expect(allowed?.context, label).toEqual({
          workspace_id: context.wsA.id,
          version_snapshot: definition,
        });
        await tx`reset role`;
      }

      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: context.trainerB.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [denied] = await tx`
        select public.read_form_correction_context(${assignmentId}) as context
      `;
      expect(denied?.context).toBeNull();
      await tx`reset role`;
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});
