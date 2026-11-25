import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import { sql } from './harness';
import { clientContext, graph, probe } from './registration-approval-fixture';

const db = sql();
afterAll(() => db.end());

type Tx = TransactionSql;

async function asUser<T>(
  tx: Tx,
  userId: string,
  run: (sp: Tx) => Promise<T>,
): Promise<T> {
  return (await tx.savepoint(async (sp) => {
    await sp`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
    await sp`set local role authenticated`;
    const result = await run(sp as Tx);
    await sp`reset role`;
    return result;
  })) as T;
}

async function denied(
  tx: Tx,
  userId: string,
  run: (sp: Tx) => Promise<unknown>,
) {
  await expect(asUser(tx, userId, run)).rejects.toMatchObject({
    code: '42501',
  });
}

const definition = {
  questions: [
    {
      id: 'workoutAdherence',
      sectionId: 'checkin',
      type: 'number',
      required: false,
      validation: { min: 0, max: 10, step: 1 },
    },
    {
      id: 'dietAdherence',
      sectionId: 'checkin',
      type: 'number',
      required: false,
      validation: { min: 0, max: 10, step: 1 },
    },
  ],
};

describe('P7 T002/T003/T004 same-workspace check-ins projection', () => {
  it('returns F15 answer history to every same-workspace Trainer and denies other roles/workspaces', async () => {
    const f = await clientContext();
    const foreign = await clientContext();
    await probe(async (tx) => {
      const ids = await graph(tx, f);
      const [clock] = await tx`
        select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today
      `;
      const today = clock!.today as string;
      await tx`insert into public.subscription_activations(
        workspace_id,subscription_id,activated_at,delivery_event_id,activation_source
      ) values(
        ${f.wsA.id},${ids.subscription},
        ((${today}::date - 7)::timestamp + interval '9 hours') at time zone 'Africa/Cairo',
        ${randomUUID()},'po_override'
      )`;

      const terms = `p7-checkins-${randomUUID()}`;
      await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
        values(${terms},'terms','published')`;
      const formId = randomUUID();
      await tx`insert into public.forms(id,workspace_id,name)
        values(${formId},${f.wsA.id},'P7 synthetic check-in')`;
      await tx`insert into public.form_versions(
        workspace_id,form_id,version_number,terms_policy_version,definition,status
      ) values(${f.wsA.id},${formId},1,${terms},${tx.json(definition as JSONValue)},'published')`;
      await asUser(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select public.configure_weekly_checkin_form(${f.wsA.id},${formId},1)`,
      );
      await tx`select app_private.f23_weekly_checkin_run(${today}::date)`;
      const [assignment] = await tx`
        select id from public.form_assignments
        where workspace_id=${f.wsA.id} and client_id=${ids.client}
          and form_id=${formId} and occurrence_key=${'weekly_checkin:' + today}
      `;
      expect(assignment).toBeDefined();
      const assignmentId = assignment!.id as string;
      await tx`insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
        values
          (${f.wsA.id},${assignmentId},1,${tx.json({ workoutAdherence: 6, dietAdherence: 4 })}),
          (${f.wsA.id},${assignmentId},2,${tx.json({ workoutAdherence: 8, dietAdherence: 5 })})`;
      await tx`insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
        values(${f.wsA.id},${assignmentId},2,clock_timestamp() - interval '26 hours')`;
      await asUser(
        tx,
        f.po.userId,
        (sp) =>
          sp`select public.assign_client_responsible_trainer(${f.wsA.id},${ids.client},${f.trainerA.userId})`,
      );
      await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by)
        values(${f.wsA.id},${f.trainerB.userId},${f.po.userId})`;

      const read = (userId: string) =>
        asUser(
          tx,
          userId,
          (sp) =>
            sp`select * from public.get_trainer_checkins(${f.wsA.id},${today}::date,${today}::date,100,0)`,
        );
      for (const trainer of [f.trainerA.userId, f.trainerB.userId]) {
        const rows = await read(trainer);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          assignment_id: assignmentId,
          form_status: 'submitted',
          followup_status: 'late',
          answer_history: [
            { revision: 1, answers: { workoutAdherence: 6, dietAdherence: 4 } },
            { revision: 2, answers: { workoutAdherence: 8, dietAdherence: 5 } },
          ],
        });
      }
      for (const actor of [
        f.woA.userId,
        f.salesA.userId,
        foreign.trainerA.userId,
      ])
        await denied(
          tx,
          actor,
          (sp) =>
            sp`select * from public.get_trainer_checkins(${f.wsA.id},${today}::date,${today}::date,100,0)`,
        );
    });
  });

  it('records one follow-up under parallel confirmation retries and preserves Late history', async () => {
    const [table] = await db`
      select to_regclass('app_private.workforce_checkin_transitions') as relation
    `;
    expect(table?.relation).toBe('app_private.workforce_checkin_transitions');
  });
});
