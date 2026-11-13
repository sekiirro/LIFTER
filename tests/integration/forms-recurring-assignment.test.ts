import { afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { sql } from './registration-approval-operations-fixture';
import {
  changePolicyFixtureFreeze,
  withFormsPolicyF13Fixtures,
} from './forms-policy-fixtures';

const db = sql();
afterAll(() => db.end());

async function createForm(tx: TransactionSql, workspaceId: string) {
  const terms = `recurring-${randomUUID()}`;
  const formId = randomUUID();
  await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${terms},'terms','published')`;
  await tx`insert into public.forms(id,workspace_id,name)
    values(${formId},${workspaceId},'Recurring assignment')`;
  await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values(${workspaceId},${formId},1,${terms},${tx.json({ questions: [] })},'published')`;
  return formId;
}

async function configureRecurring(
  tx: TransactionSql,
  actor: string,
  workspaceId: string,
  formId: string,
  clientIds: string[],
  start: string,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: actor, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select public.configure_intake_assignment_policy(
        ${workspaceId},${formId},1,'specific_clients',${clientIds}::uuid[],'recurring',
        ${tx.json({ recurrence_interval_days: 2, recurrence_starts_on: start, client_deadline_days: 3 })},
        '{"frozen":true,"inactive":true}'::jsonb
      ) as result
    `;
    expect(row!.result).toEqual({ status: 'configured' });
  } finally {
    await tx`reset role`;
  }
}

async function materializeAt(
  tx: TransactionSql,
  actor: string,
  workspaceId: string,
  formId: string,
  date: string,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: actor, role: 'authenticated' })},true)`;
  const [row] = await tx`
    select app_private.materialize_intake_assignment_occurrence_core(
      ${workspaceId},${formId},${`recurring:${date}`},${date}::date
    ) as result
  `;
  return row!.result as { status: string; count?: number };
}

it('skips frozen and expired recurring clients without catch-up and assigns each eligible date independently', async () => {
  await withFormsPolicyF13Fixtures(async (tx, f, scenarios) => {
    const formId = await createForm(tx, f.wsA.id);
    const [dateRow] = await tx`
      select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today
    `;
    const today = dateRow!.today as string;
    await configureRecurring(
      tx,
      f.po.userId,
      f.wsA.id,
      formId,
      [
        scenarios.recurringActive.clientId,
        scenarios.recurringFreeze.clientId,
        scenarios.expiredSubscription.clientId,
      ],
      today,
    );

    const freezeId = await changePolicyFixtureFreeze(
      tx,
      f,
      scenarios.recurringFreeze,
      'apply',
      0,
    );
    const firstDate = await materializeAt(
      tx,
      f.po.userId,
      f.wsA.id,
      formId,
      today,
    );
    expect(firstDate).toMatchObject({ status: 'materialized', count: 1 });
    const [firstAudience] = await tx`
      select audience_client_ids from app_private.form_assignment_occurrences o
      join app_private.form_assignment_policies p on p.id=o.policy_id
      where p.workspace_id=${f.wsA.id} and p.form_id=${formId} and o.occurrence_key=${`recurring:${today}`}
    `;
    expect(firstAudience!.audience_client_ids).toEqual([
      scenarios.recurringActive.clientId,
    ]);

    await changePolicyFixtureFreeze(
      tx,
      f,
      scenarios.recurringFreeze,
      'remove',
      1,
      freezeId,
    );
    expect(
      await materializeAt(tx, f.po.userId, f.wsA.id, formId, today),
    ).toEqual({
      status: 'already_materialized',
      count: 0,
    });

    const tomorrow = (await tx`select (${today}::date+1)::text as date`)[0]!
      .date as string;
    expect(
      await materializeAt(tx, f.po.userId, f.wsA.id, formId, tomorrow),
    ).toEqual({
      status: 'not_found',
    });
    const nextEligible = (await tx`select (${today}::date+2)::text as date`)[0]!
      .date as string;
    expect(
      await materializeAt(tx, f.po.userId, f.wsA.id, formId, nextEligible),
    ).toMatchObject({
      status: 'materialized',
      count: 2,
    });
    const followingEligible = (
      await tx`select (${today}::date+4)::text as date`
    )[0]!.date as string;
    expect(
      await materializeAt(tx, f.po.userId, f.wsA.id, formId, followingEligible),
    ).toMatchObject({
      status: 'materialized',
      count: 2,
    });

    const assignments = await tx`
      select client_id,occurrence_key,
        (client_deadline_at at time zone 'Africa/Cairo')::date::text as deadline
      from public.form_assignments where workspace_id=${f.wsA.id} and form_id=${formId}
      order by client_id,occurrence_key
    `;
    expect(assignments).toHaveLength(5);
    expect(
      assignments.filter(
        (row) => row.client_id === scenarios.recurringActive.clientId,
      ),
    ).toHaveLength(3);
    expect(
      assignments.filter(
        (row) => row.client_id === scenarios.recurringFreeze.clientId,
      ),
    ).toHaveLength(2);
    expect(
      assignments.some(
        (row) => row.client_id === scenarios.expiredSubscription.clientId,
      ),
    ).toBe(false);
    for (const row of assignments) {
      const date = String(row.occurrence_key).slice('recurring:'.length);
      const [expected] = await tx`select (${date}::date+3)::text as date`;
      expect(row.deadline).toBe(expected!.date);
    }
    expect(assignments.map((row) => row.occurrence_key)).toContain(
      `recurring:${today}`,
    );
    expect(assignments.map((row) => row.occurrence_key)).toContain(
      `recurring:${nextEligible}`,
    );
    expect(assignments.map((row) => row.occurrence_key)).toContain(
      `recurring:${followingEligible}`,
    );
  });
});
