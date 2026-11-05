import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
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

it('T022 exposes only the signed client assignment and audited answer reads', async () => {
  const context = await clientContext();
  const ownClient = await registered(context);
  const otherClient = await registered(context);
  const assignmentId = randomUUID();
  const formId = randomUUID();
  const policy = `t022-${randomUUID()}`;
  const definition = {
    questions: [
      {
        id: 'goal',
        sectionId: 'basic',
        type: 'shortText',
        required: true,
        title: { en: 'Your goal', ar: 'هدفك' },
      },
    ],
  };
  const clientA = worker(`t022-own-${randomUUID()}`);
  const clientB = worker(`t022-foreign-${randomUUID()}`);
  try {
    const [contextReader] = await db`
      select pg_get_functiondef('public.read_form_assignment_context(uuid)'::regprocedure) as body
    `;
    const contextBody = contextReader?.body as string;
    expect(contextBody).toContain('c.auth_user_id=auth.uid()');
    expect(contextBody).toContain("c.approval_state='approved'");
    expect(contextBody).toContain(
      "'relationship_active',c.deactivated_at is null",
    );
    const ownershipMutant = contextBody.replace(
      'and c.auth_user_id=auth.uid()',
      '',
    );
    expect(ownershipMutant).not.toContain('c.auth_user_id=auth.uid()');
    expect(contextBody).not.toBe(ownershipMutant);

    const approvedA = await db.begin((tx) =>
      sqlCall(tx, context.po.userId, 'approve', request(context, ownClient)),
    );
    const approvedB = await db.begin((tx) =>
      sqlCall(tx, context.po.userId, 'approve', request(context, otherClient)),
    );
    expect(approvedA.status).toBe('ok');
    expect(approvedB.status).toBe('ok');
    await db`
      insert into app_private.terms_policy_versions(version,policy_kind,status)
      values(${policy},'terms','published')
    `;
    await db`insert into public.forms(id,workspace_id,name)
      values(${formId},${context.wsA.id},'T022 client route')`;
    await db`
      insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
      values(${context.wsA.id},${formId},1,${policy},${db.json(definition)},'published')
    `;
    await db`
      insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
      values(${assignmentId},${context.wsA.id},${ownClient.id},${formId},1,${policy},${db.json(definition)})
    `;

    const forClient = (connection: typeof clientA, userId: string) =>
      connection.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        if (userId === ownClient.userId)
          await tx`
            select public.save_form_draft(
              ${context.wsA.id},${assignmentId},0,${randomUUID()},${tx.json({ goal: 'synthetic draft answer' })}
            )
          `;
        const [contextResult] = await tx`
          select public.read_form_assignment_context(${assignmentId}) as value
        `;
        const [draftResult] = await tx`
          select public.read_client_form_draft(${assignmentId}) as value
        `;
        const [destinationResult] = await tx`
          select public.read_client_intake_destination() as value
        `;
        return {
          context: contextResult?.value,
          draft: draftResult?.value,
          destination: destinationResult?.value,
        };
      });
    const own = await forClient(clientA, ownClient.userId);
    expect(own.context).toMatchObject({
      workspace_id: context.wsA.id,
      version_snapshot: definition,
      signup_profile: {
        full_name: 'U3 synthetic test',
        date_of_birth: '1990-04-12',
      },
      relationship_active: true,
    });
    expect(own.draft).toEqual({
      status: 'loaded',
      revision: 1,
      answers: { goal: 'synthetic draft answer' },
    });
    expect(own.destination).toEqual({
      status: 'ok',
      assignment_id: assignmentId,
    });

    const foreign = await forClient(clientB, otherClient.userId);
    const missingId = randomUUID();
    const missing = await clientB.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: otherClient.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [contextResult] = await tx`
        select public.read_form_assignment_context(${missingId}) as value
      `;
      const [draftResult] = await tx`
        select public.read_client_form_draft(${missingId}) as value
      `;
      return { context: contextResult?.value, draft: draftResult?.value };
    });
    expect(foreign.context).toBeNull();
    expect(missing.context).toBeNull();
    expect(foreign.draft).toEqual({ status: 'not_found' });
    expect(missing.draft).toEqual({ status: 'not_found' });
    expect(foreign.destination).toEqual({ status: 'ok', assignment_id: null });

    await db`
      insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
      values(${context.wsA.id},${assignmentId},1,${db.json({ goal: 'synthetic answer' })})
    `;
    await db`
      insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
      values(${context.wsA.id},${assignmentId},1,clock_timestamp())
    `;
    const history = await clientA.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: ownClient.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [row] = await tx`
        select public.read_form_answer(${context.wsA.id},${assignmentId},'history') as value
      `;
      return row?.value;
    });
    expect(history).toEqual([
      { revision: 1, answers: { goal: 'synthetic answer' } },
    ]);
    const afterSubmit = await clientA.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: ownClient.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [row] =
        await tx`select public.read_client_intake_destination() as value`;
      return row?.value;
    });
    expect(afterSubmit).toEqual({ status: 'ok', assignment_id: null });
    expect(
      await db`select count(*)::int as count from public.audit_events
        where action='form.answer_viewed' and target_id=${assignmentId}
          and details->>'view'='draft'`,
    ).toEqual([{ count: 1 }]);
    const answerAudits = await db`
      select details::text as details from public.audit_events
      where action='form.answer_viewed' and target_id=${assignmentId}
    `;
    expect(answerAudits).toHaveLength(2);
    expect(
      answerAudits.every((row) => !row.details.includes('synthetic')),
    ).toBe(true);
  } finally {
    await Promise.all([clientA.end(), clientB.end()]);
  }
});
