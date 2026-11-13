import { afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { sql } from './registration-approval-operations-fixture';
import { withFormsPolicyF13Fixtures } from './forms-policy-fixtures';

const db = sql();
afterAll(() => db.end());

async function createForm(tx: TransactionSql, workspaceId: string) {
  const terms = `renewal-${randomUUID()}`;
  const formId = randomUUID();
  await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${terms},'terms','published')`;
  await tx`insert into public.forms(id,workspace_id,name) values(${formId},${workspaceId},'Renewal assignment')`;
  await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values(${workspaceId},${formId},1,${terms},${tx.json({ questions: [] })},'published')`;
  return formId;
}

async function configureRenewalPolicy(
  tx: TransactionSql,
  actor: string,
  workspaceId: string,
  formId: string,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: actor, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select public.configure_intake_assignment_policy(
        ${workspaceId},${formId},1,'all_active_clients','{}'::uuid[],'renewal',
        '{"client_deadline_days":3}'::jsonb,'{"frozen":true,"inactive":true}'::jsonb
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
  occurrenceKey: string,
  evaluationDate: string,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: actor, role: 'authenticated' })},true)`;
  const [row] = await tx`
    select app_private.materialize_intake_assignment_occurrence_core(
      ${workspaceId},${formId},${occurrenceKey},${evaluationDate}::date
    ) as result
  `;
  return row!.result as { status: string; count?: number };
}

it('delivers early-paid renewals on the current F13 service start, including freeze reflow and missed-day retry', async () => {
  await withFormsPolicyF13Fixtures(async (tx, f, scenarios) => {
    const formId = await createForm(tx, f.wsA.id);
    await configureRenewalPolicy(tx, f.po.userId, f.wsA.id, formId);
    const earlyKey = scenarios.earlyPaidRenewal.occurrenceKey;
    const earlyServiceStart = scenarios.earlyPaidRenewal.serviceStart;
    const reflowKey = scenarios.reflowedRenewal.occurrenceKey;
    const reflowServiceStart = scenarios.reflowedRenewal.serviceStart;
    const missedKey = scenarios.missedRenewal.occurrenceKey;
    const missedServiceStart = scenarios.missedRenewal.serviceStart;
    if (
      !earlyKey ||
      !earlyServiceStart ||
      !reflowKey ||
      !reflowServiceStart ||
      !missedKey ||
      !missedServiceStart
    )
      throw new Error(
        'Renewal fixture is missing its occurrence key or service start',
      );
    const [todayRow] = await tx`
      select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today
    `;
    const today = todayRow!.today as string;

    const early = await materializeAt(
      tx,
      f.po.userId,
      f.wsA.id,
      formId,
      earlyKey,
      today,
    );
    expect(early).toEqual({ status: 'not_found' });
    const [noEarlyOccurrence] = await tx`
      select count(*)::int as count from app_private.form_assignment_occurrences
      where workspace_id=${f.wsA.id} and occurrence_key=${earlyKey}
    `;
    expect(noEarlyOccurrence!.count).toBe(0);

    const startDate = earlyServiceStart;
    const missed = await materializeAt(
      tx,
      f.po.userId,
      f.wsA.id,
      formId,
      earlyKey,
      startDate,
    );
    expect(missed).toMatchObject({ status: 'materialized', count: 1 });
    const laterDate = (
      await tx`
      select (${startDate}::date+2)::text as date
    `
    )[0]!.date as string;
    const laterReplay = await materializeAt(
      tx,
      f.po.userId,
      f.wsA.id,
      formId,
      earlyKey,
      laterDate,
    );
    // Replay is date-independent once the one renewal occurrence is recorded.
    expect(laterReplay).toEqual({ status: 'already_materialized', count: 0 });

    const missedLaterDate = (
      await tx`
      select (${missedServiceStart}::date+1)::text as date
    `
    )[0]!.date as string;
    expect(
      await materializeAt(
        tx,
        f.po.userId,
        f.wsA.id,
        formId,
        missedKey,
        missedLaterDate,
      ),
    ).toMatchObject({ status: 'materialized', count: 1 });
    const missedReplayDate = (
      await tx`
      select (${missedServiceStart}::date+2)::text as date
    `
    )[0]!.date as string;
    expect(
      await materializeAt(
        tx,
        f.po.userId,
        f.wsA.id,
        formId,
        missedKey,
        missedReplayDate,
      ),
    ).toEqual({ status: 'already_materialized', count: 0 });

    const day10 = (
      await tx`
      select (${reflowServiceStart}::date-5)::text as date
    `
    )[0]!.date as string;
    const earlyReflow = await materializeAt(
      tx,
      f.po.userId,
      f.wsA.id,
      formId,
      reflowKey,
      day10,
    );
    expect(earlyReflow).toEqual({ status: 'not_found' });
    const reflowStart = await materializeAt(
      tx,
      f.po.userId,
      f.wsA.id,
      formId,
      reflowKey,
      reflowServiceStart,
    );
    expect(reflowStart).toMatchObject({ status: 'materialized', count: 1 });

    const assignmentRows = await tx`
      select occurrence_key,
        (client_deadline_at at time zone 'Africa/Cairo')::date::text as deadline
      from public.form_assignments where workspace_id=${f.wsA.id} and form_id=${formId}
      order by occurrence_key
    `;
    expect(assignmentRows).toHaveLength(3);
    for (const row of assignmentRows) {
      const evaluationDate =
        row.occurrence_key === earlyKey
          ? startDate
          : row.occurrence_key === missedKey
            ? missedLaterDate
            : reflowServiceStart;
      const due = await tx`
        select (${evaluationDate}::date+3)::text as date
      `;
      expect(row.deadline).toBe(due[0]!.date);
    }
  });
});
