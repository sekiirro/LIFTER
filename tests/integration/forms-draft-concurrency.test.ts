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

it('T012 resumes a committed draft from another session and resolves concurrent late acknowledgements', async () => {
  const context = await clientContext();
  const client = await registered(context);
  const formId = randomUUID();
  const assignmentId = randomUUID();
  const policy = `t012-race-${randomUUID()}`;
  const writers = [sql(), sql()];
  const reader = sql();

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
      const definition = {
        questions: [{ id: 'q1', sectionId: 'basic', type: 'shortText' }],
      };
      await tx`
        insert into app_private.terms_policy_versions(version,policy_kind,status)
        values(${policy},'terms','published')
      `;
      await tx`insert into public.forms(id,workspace_id,name)
        values(${formId},${context.wsA.id},'T012 cross-session draft')`;
      await tx`
        insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
        values(${context.wsA.id},${formId},1,${policy},${tx.json(definition)},'published')
      `;
      await tx`
        insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
        values(${assignmentId},${context.wsA.id},${client.id},${formId},1,${policy},${tx.json(definition)})
      `;
    });
    const save = (connection: ReturnType<typeof sql>, answer: string) =>
      connection.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.userId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const [row] = await tx`
          select public.save_form_draft(
            ${context.wsA.id},${assignmentId},0,${randomUUID()},${tx.json({ q1: answer })}
          ) as result
        `;
        return row?.result;
      });
    const results = await Promise.all([
      save(writers[0]!, 'draft from device A'),
      save(writers[1]!, 'draft from device B'),
    ]);
    expect(
      results.map((result) => (result as { status: string }).status).sort(),
    ).toEqual(['conflict', 'saved']);

    const resumed = await reader.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [row] = await tx`
        select public.read_form_answer(${context.wsA.id},${assignmentId},'draft') as answer
      `;
      return row?.answer;
    });
    const saved = results.find(
      (result) => (result as { status: string }).status === 'saved',
    ) as { revision: number };
    expect(saved.revision).toBe(1);
    expect(resumed).toEqual({
      q1:
        (results[0] as { status: string }).status === 'saved'
          ? 'draft from device A'
          : 'draft from device B',
    });
    expect(
      await db`select count(*)::int as count from public.audit_events
        where action='form.draft_saved' and target_id=${assignmentId}`,
    ).toEqual([{ count: 1 }]);
  } finally {
    await Promise.all(
      [...writers, reader].map((connection) => connection.end()),
    );
  }
});
