import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  clientContext,
  registered,
  sql,
} from './registration-approval-operations-fixture';
import { withCrashSafeFunctionMutant } from './function-drift-guard';
import { cleanupAlertFixture } from './forms-alert-fixture-cleanup';

const db = sql();
afterAll(() => db.end());
const rollback = new Error('rollback F15 synthetic alert fixtures');

async function expectInvariantFailure(body: () => Promise<void>) {
  let failure: unknown;
  try {
    await body();
  } catch (error) {
    failure = error;
  }
  expect(failure, 'the named invariant must kill the mutant').toBeDefined();
}

async function formAssignment(
  tx: TransactionSql,
  workspaceId: string,
  clientId: string,
  deadlineAt: string | null,
  configuredBy: string,
) {
  const formId = randomUUID();
  const assignmentId = randomUUID();
  const policyId = deadlineAt === null ? null : randomUUID();
  const occurrenceKey = `alert:${assignmentId}`;
  const terms = `alert-${randomUUID()}`;
  await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${terms},'terms','published')`;
  await tx`insert into public.forms(id,workspace_id,name)
    values(${formId},${workspaceId},'Synthetic alert schedule')`;
  await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values(${workspaceId},${formId},1,${terms},${tx.json({ questions: [] })},'published')`;
  if (policyId) {
    await tx`insert into app_private.form_assignment_policies(
        id,workspace_id,form_id,version_number,audience_kind,specific_client_ids,
        trigger_kind,timing,stop_conditions,configured_by
      ) values(
        ${policyId},${workspaceId},${formId},1,'specific_clients',${[clientId]}::uuid[],
        'manual','{"client_deadline_days":3}'::jsonb,'{"frozen":true,"inactive":true}'::jsonb,${configuredBy}
      )`;
    await tx`insert into app_private.form_assignment_occurrences(
        workspace_id,policy_id,occurrence_key,snapshot_at,audience_client_ids,
        version_number,trigger_kind,created_by
      ) values(
        ${workspaceId},${policyId},${occurrenceKey},clock_timestamp(),${[clientId]}::uuid[],
        1,'manual',${configuredBy}
      )`;
  }
  await tx`insert into public.form_assignments(
      id,workspace_id,client_id,form_id,version_number,terms_policy_version,
      version_snapshot,occurrence_key,audience_snapshot_at,client_deadline_at,policy_id,configured_by
    ) values(
      ${assignmentId},${workspaceId},${clientId},${formId},1,${terms},
      ${tx.json({ questions: [] })},${policyId ? occurrenceKey : 'initial'},clock_timestamp(),
      ${deadlineAt}::timestamptz,${policyId},${policyId ? configuredBy : null}
    )`;
  return assignmentId;
}

async function core(
  tx: TransactionSql,
  workspaceId: string,
  evaluationAt: string | null,
  batch = 250,
) {
  const [row] = await tx`
    select app_private.evaluate_forms_alerts_core(${evaluationAt}::timestamptz,${workspaceId}::uuid,${batch}) as result
  `;
  return row!.result as { status: string; enqueued?: number };
}

it('notifies only PO and WO at the client deadline, regardless of Trainer assignment', async () => {
  const f = await clientContext();
  const client = await registered(f);
  await expect(
    db.begin(async (tx) => {
      const deadline = '2026-02-01T10:00:00.000Z';
      const assignment = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        deadline,
        f.po.userId,
      );
      await tx`update app_private.form_alert_schedules set trainer_user_id=${f.trainerA.userId}
      where workspace_id=${f.wsA.id} and source_assignment_id=${assignment} and alert_kind='client_late'`;
      expect(await core(tx, f.wsA.id, '2026-02-01T09:59:59.999Z')).toEqual({
        status: 'ok',
        enqueued: 0,
      });
      expect(await core(tx, f.wsA.id, deadline)).toEqual({
        status: 'ok',
        enqueued: 2,
      });
      const rows = await tx`select o.stage,o.recipient_user_id,j.kind,j.payload
      from app_private.form_alert_occurrences o join public.jobs j on j.id=o.job_id
      where o.workspace_id=${f.wsA.id} order by o.recipient_user_id`;
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.recipient_user_id).sort()).toEqual(
        [f.po.userId, f.woA.userId].sort(),
      );
      expect(
        rows.every(
          (row) =>
            row.stage === 'client_owners_immediate' &&
            row.kind === 'forms.alert',
        ),
      ).toBe(true);
      expect(
        rows.every(
          (row) =>
            Object.keys(row.payload as Record<string, unknown>)
              .sort()
              .join(',') === 'alert_id,recipient_id,stage',
        ),
      ).toBe(true);
      expect(await core(tx, f.wsA.id, '2026-02-02T10:00:00.000Z')).toEqual({
        status: 'ok',
        enqueued: 0,
      });
      expect(await core(tx, f.wsA.id, '2026-02-03T10:00:00.000Z')).toEqual({
        status: 'ok',
        enqueued: 0,
      });
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('keeps D-03 Trainer-late Q4 stages independent, supports seven-day catch-up, and suppresses on-time delivery', async () => {
  const f = await clientContext();
  const client = await registered(f);
  await expect(
    db.begin(async (tx) => {
      const assignment = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        null,
        f.po.userId,
      );
      const d03Deadline = '2026-03-10T09:00:00.000Z';
      await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by)
        values(${f.wsA.id},${f.trainerB.userId},${f.po.userId})`;
      const onTimeAssignment = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        null,
        f.po.userId,
      );
      const catchUpAssignment = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        null,
        f.po.userId,
      );
      const [trainer] = await tx`insert into app_private.form_alert_schedules(
        workspace_id,source_assignment_id,alert_kind,deadline_at,trainer_user_id
      ) values(
        ${f.wsA.id},${assignment},'trainer_late',${d03Deadline}::timestamptz,${f.trainerA.userId}
      ) returning id`;
      await tx`insert into app_private.form_alert_schedules(
        workspace_id,source_assignment_id,alert_kind,deadline_at,trainer_user_id,delivered_at
      ) values(
        ${f.wsA.id},${onTimeAssignment},'trainer_late',${d03Deadline}::timestamptz,
        ${f.trainerA.userId},${d03Deadline}::timestamptz
      )`;
      const [catchUpSchedule] =
        await tx`insert into app_private.form_alert_schedules(
        workspace_id,source_assignment_id,alert_kind,deadline_at,trainer_user_id
      ) values(
        ${f.wsA.id},${catchUpAssignment},'trainer_late','2026-03-20T09:00:00.000Z'::timestamptz,${f.trainerB.userId}
      ) returning id`;
      expect(await core(tx, f.wsA.id, '2026-03-10T08:59:59.999Z')).toEqual({
        status: 'ok',
        enqueued: 0,
      });
      expect(await core(tx, f.wsA.id, d03Deadline)).toEqual({
        status: 'ok',
        enqueued: 1,
      });
      const initial =
        await tx`select stage,recipient_user_id from app_private.form_alert_occurrences
        where workspace_id=${f.wsA.id} and schedule_id=${trainer!.id}`;
      expect(initial).toEqual([
        { stage: 'trainer_initial', recipient_user_id: f.trainerA.userId },
      ]);
      expect(await core(tx, f.wsA.id, '2026-03-11T09:00:00.000Z')).toEqual({
        status: 'ok',
        enqueued: 2,
      });
      const owners =
        await tx`select stage,recipient_user_id from app_private.form_alert_occurrences
        where workspace_id=${f.wsA.id} and schedule_id=${trainer!.id} and stage='trainer_owners_24h'`;
      expect(owners.map((row) => row.recipient_user_id).sort()).toEqual(
        [f.po.userId, f.woA.userId].sort(),
      );
      expect(await core(tx, f.wsA.id, '2026-03-16T09:00:00.000Z')).toEqual({
        status: 'ok',
        enqueued: 0,
      });
      expect(await core(tx, f.wsA.id, '2026-03-26T09:00:00.000Z')).toEqual({
        status: 'ok',
        enqueued: 3,
      });
      const caughtUp = await tx`select stage,recipient_user_id
        from app_private.form_alert_occurrences
        where workspace_id=${f.wsA.id} and schedule_id=${catchUpSchedule!.id}`;
      expect(caughtUp.map((row) => row.recipient_user_id).sort()).toEqual(
        [f.trainerB.userId, f.po.userId, f.woA.userId].sort(),
      );
      expect(await core(tx, f.wsA.id, '2026-03-28T09:00:00.000Z')).toEqual({
        status: 'ok',
        enqueued: 0,
      });
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('skips finished client-late schedules before taking a bounded evaluator batch', async () => {
  const f = await clientContext();
  const client = await registered(f);
  await expect(
    db.begin(async (tx) => {
      const submittedAssignment = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        '2026-04-01T00:00:00.000Z',
        f.po.userId,
      );
      const completedStageAssignment = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        '2026-04-02T00:00:00.000Z',
        f.po.userId,
      );
      for (const assignmentId of [
        submittedAssignment,
        completedStageAssignment,
      ]) {
        await tx`update app_private.form_alert_schedules
          set trainer_user_id=${f.trainerA.userId}
          where workspace_id=${f.wsA.id} and source_assignment_id=${assignmentId}
            and alert_kind='client_late'`;
      }
      await tx`insert into public.form_answer_revisions(
        workspace_id,assignment_id,revision,answer_values
      ) values(${f.wsA.id},${submittedAssignment},1,${tx.json({})})`;
      await tx`insert into app_private.form_submissions(
        workspace_id,assignment_id,revision,submitted_at
      ) values(${f.wsA.id},${submittedAssignment},1,'2026-04-01T01:00:00Z')`;
      const [finishedSchedule] = await tx`
        select id from app_private.form_alert_schedules
        where workspace_id=${f.wsA.id} and source_assignment_id=${completedStageAssignment}
          and alert_kind='client_late'
      `;
      await tx`
        insert into app_private.form_alert_occurrences(
          workspace_id,schedule_id,stage,recipient_user_id,job_id,enqueued_at
        ) values
          (${f.wsA.id},${finishedSchedule?.id},'client_owners_immediate',${f.po.userId},null,'2026-04-04T00:00:00Z'),
          (${f.wsA.id},${finishedSchedule?.id},'client_owners_immediate',${f.woA.userId},null,'2026-04-04T00:00:00Z')
      `;

      const staleTrainerAssignment = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        null,
        f.po.userId,
      );
      await tx`insert into app_private.form_alert_schedules(
        workspace_id,source_assignment_id,alert_kind,deadline_at,trainer_user_id
      ) values(
        ${f.wsA.id},${staleTrainerAssignment},'trainer_late','2026-04-01T00:00:00Z',${f.trainerA.userId}
      )`;
      const trainerAssignment = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        null,
        f.po.userId,
      );
      const [trainerSchedule] = await tx`
        insert into app_private.form_alert_schedules(
          workspace_id,source_assignment_id,alert_kind,deadline_at,trainer_user_id
        ) values(
          ${f.wsA.id},${trainerAssignment},'trainer_late','2026-04-10T00:00:00Z',${f.trainerA.userId}
        ) returning id
      `;
      const result = await core(tx, f.wsA.id, '2026-04-12T00:00:00Z', 1);
      expect(result.status).toBe('ok');
      const occurrence = await tx`
        select id from app_private.form_alert_occurrences
        where workspace_id=${f.wsA.id} and schedule_id=${trainerSchedule?.id}
      `;
      expect(occurrence.length).toBeGreaterThan(0);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('does not let a trainer schedule with all due stages enqueued consume the batch', async () => {
  const f = await clientContext();
  const client = await registered(f);
  await expect(
    db.begin(async (tx) => {
      const trainerAssignment = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        null,
        f.po.userId,
      );
      const [trainerSchedule] = await tx`
        insert into app_private.form_alert_schedules(
          workspace_id,source_assignment_id,alert_kind,deadline_at,trainer_user_id
        ) values(
          ${f.wsA.id},${trainerAssignment},'trainer_late','2026-05-01T00:00:00Z',${f.trainerA.userId}
        ) returning id`;
      await tx`insert into app_private.form_alert_occurrences(
        workspace_id,schedule_id,stage,recipient_user_id,job_id,enqueued_at
      ) values
        (${f.wsA.id},${trainerSchedule!.id},'trainer_initial',${f.trainerA.userId},null,'2026-05-01T00:00:00Z'),
        (${f.wsA.id},${trainerSchedule!.id},'trainer_owners_24h',${f.po.userId},null,'2026-05-02T00:00:00Z'),
        (${f.wsA.id},${trainerSchedule!.id},'trainer_owners_24h',${f.woA.userId},null,'2026-05-02T00:00:00Z')`;

      const clientAssignment = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        '2026-05-03T00:00:00Z',
        f.po.userId,
      );
      const result = await core(tx, f.wsA.id, '2026-05-03T00:00:00Z', 1);
      expect(result).toEqual({ status: 'ok', enqueued: 2 });
      const clientOccurrences = await tx`
        select stage,recipient_user_id from app_private.form_alert_occurrences
        where workspace_id=${f.wsA.id} and schedule_id=(
          select id from app_private.form_alert_schedules
          where workspace_id=${f.wsA.id} and source_assignment_id=${clientAssignment}
            and alert_kind='client_late'
        ) order by recipient_user_id`;
      expect(clientOccurrences).toHaveLength(2);
      const newTrainerOccurrences = await tx`
        select id from app_private.form_alert_occurrences
        where workspace_id=${f.wsA.id} and schedule_id=${trainerSchedule!.id}
          and enqueued_at='2026-05-03T00:00:00Z'`;
      expect(newTrainerOccurrences).toHaveLength(0);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('treats an already-deactivated client without a retention row as ended', async () => {
  const f = await clientContext();
  const client = await registered(f);
  await expect(
    db.begin(async (tx) => {
      const assignment = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        '2026-05-01T00:00:00Z',
        f.po.userId,
      );
      await tx`alter table public.clients disable trigger f12_client_transition`;
      await tx`alter table public.clients disable trigger f15_client_retention_fact`;
      await tx`update public.clients set deactivated_at='2026-05-02T00:00:00Z',deactivation_reason='refund'
        where workspace_id=${f.wsA.id} and id=${client.id}`;
      await tx`alter table public.clients enable trigger f15_client_retention_fact`;
      await tx`alter table public.clients enable trigger f12_client_transition`;
      const [active] = await tx`
        select app_private.f15_client_alert_lifecycle_active(${f.wsA.id},${assignment}) as active`;
      expect(active?.active).toBe(false);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('kills a lifecycle mutant that ignores client deactivation', async () => {
  await withCrashSafeFunctionMutant(
    'app_private.f15_client_alert_lifecycle_active(uuid,uuid)',
    (source) => source.replace('and c.deactivated_at is null', 'and true'),
    async () => {
      const f = await clientContext();
      const client = await registered(f);
      let assertionFailed = false;
      await expect(
        db.begin(async (tx) => {
          const assignment = await formAssignment(
            tx,
            f.wsA.id,
            client.id,
            '2026-05-01T00:00:00Z',
            f.po.userId,
          );
          await tx`alter table public.clients disable trigger f12_client_transition`;
          await tx`alter table public.clients disable trigger f15_client_retention_fact`;
          await tx`update public.clients set deactivated_at='2026-05-02T00:00:00Z',deactivation_reason='refund'
            where workspace_id=${f.wsA.id} and id=${client.id}`;
          await tx`alter table public.clients enable trigger f15_client_retention_fact`;
          await tx`alter table public.clients enable trigger f12_client_transition`;
          const [active] = await tx`
            select app_private.f15_client_alert_lifecycle_active(${f.wsA.id},${assignment}) as active`;
          try {
            expect(active?.active).toBe(false);
          } catch {
            assertionFailed = true;
          }
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(
        assertionFailed,
        'the deactivation invariant must kill the mutant',
      ).toBe(true);
    },
  );
});

it('rechecks recipient authorization at enqueue time and returns a safe error for invalid evaluation input', async () => {
  const f = await clientContext();
  const client = await registered(f);
  await expect(
    db.begin(async (tx) => {
      const deadline = '2026-04-01T00:00:00.000Z';
      const assignment = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        deadline,
        f.po.userId,
      );
      await tx`update app_private.form_alert_schedules
        set trainer_user_id=${f.trainerA.userId}
        where workspace_id=${f.wsA.id} and source_assignment_id=${assignment} and alert_kind='client_late'`;
      await tx`update public.workspace_memberships
        set revoked_at=clock_timestamp(),revoked_by=${f.po.userId}
        where workspace_id=${f.wsA.id} and user_id=${f.woA.userId} and revoked_at is null`;
      expect(await core(tx, f.wsA.id, '2026-04-02T00:00:00.000Z')).toEqual({
        status: 'ok',
        enqueued: 1,
      });
      const recipients = await tx`select stage,recipient_user_id
        from app_private.form_alert_occurrences where workspace_id=${f.wsA.id}`;
      expect(recipients).toEqual([
        { stage: 'client_owners_immediate', recipient_user_id: f.po.userId },
      ]);
      expect(await core(tx, f.wsA.id, null)).toEqual({
        status: 'invalid_input',
      });
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('waits for concurrent workspace-owner revocation and excludes the recipient at enqueue', async () => {
  const f = await clientContext();
  const client = await registered(f);
  const assignment = await db.begin(async (tx) =>
    formAssignment(
      tx,
      f.wsA.id,
      client.id,
      '2026-04-10T00:00:00.000Z',
      f.po.userId,
    ),
  );
  await db`update app_private.form_alert_schedules
    set trainer_user_id=${f.trainerA.userId}
    where workspace_id=${f.wsA.id} and source_assignment_id=${assignment}`;

  const revoker = sql();
  const evaluator = sql();
  const observer = sql();
  let releaseRevocation!: () => void;
  let releaseCommit!: () => void;
  const revocationLocked = new Promise<void>((resolve) => {
    releaseRevocation = resolve;
  });
  const evaluatorBlocked = new Promise<void>((resolve) => {
    releaseCommit = resolve;
  });
  const hold = revoker.begin(async (tx) => {
    await tx`update public.workspace_memberships
      set revoked_at=clock_timestamp(),revoked_by=${f.po.userId}
      where workspace_id=${f.wsA.id} and user_id=${f.woA.userId} and revoked_at is null`;
    releaseRevocation();
    await evaluatorBlocked;
  });
  let evaluationFinished = false;
  try {
    await revocationLocked;
    const [session] = await evaluator`select pg_backend_pid() as pid`;
    expect(session).toBeDefined();
    const pid = session!.pid;
    const evaluation = evaluator`
      select app_private.evaluate_forms_alerts_core(
        '2026-04-11T00:00:00Z'::timestamptz,${f.wsA.id}::uuid,250
      ) as result
    `
      .execute()
      .finally(() => {
        evaluationFinished = true;
      });
    await expect
      .poll(
        async () => {
          const [activity] = await observer`
            select wait_event_type,wait_event
            from pg_catalog.pg_stat_activity where pid=${pid}
          `;
          if (activity?.wait_event_type === 'Lock') return 'lock';
          return evaluationFinished ? 'finished' : null;
        },
        { timeout: 5000 },
      )
      .toBe('lock');
    releaseCommit();
    await hold;
    const [result] = await evaluation;
    expect(result!.result).toEqual({ status: 'ok', enqueued: 1 });
    const [fallback] = await db`
      select app_private.evaluate_forms_alerts_core(
        '2026-04-11T00:00:00Z'::timestamptz,${f.wsA.id}::uuid,250
      ) as result`;
    expect(fallback!.result).toEqual({ status: 'ok', enqueued: 0 });
    const recipients = await db`select stage,recipient_user_id
      from app_private.form_alert_occurrences
      where workspace_id=${f.wsA.id} and schedule_id=(
        select id from app_private.form_alert_schedules where source_assignment_id=${assignment}
      )`;
    expect(recipients).toEqual([
      { stage: 'client_owners_immediate', recipient_user_id: f.po.userId },
    ]);
  } finally {
    releaseCommit();
    await hold.catch(() => undefined);
    await db.begin((tx) => cleanupAlertFixture(tx, f.wsA.id, assignment));
    await revoker.end();
    await evaluator.end();
    await observer.end();
  }
});

it('cancels client-late alert rows immediately when a client relationship ends', async () => {
  const f = await clientContext();
  const client = await registered(f);
  await expect(
    db.begin(async (tx) => {
      const assignment = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        '2026-04-10T00:00:00.000Z',
        f.po.userId,
      );
      const evaluated = await core(tx, f.wsA.id, '2026-04-12T00:00:00.000Z');
      expect(evaluated).toEqual({ status: 'ok', enqueued: 2 });
      const [before] = await tx`
        select count(*)::int as count from app_private.form_alert_inbox
        where source_assignment_id=${assignment}
      `;
      expect(before?.count).toBeGreaterThan(0);
      const occurrences = await tx`
        select o.id from app_private.form_alert_occurrences o
        join app_private.form_alert_schedules s
          on s.workspace_id=o.workspace_id and s.id=o.schedule_id
        where s.workspace_id=${f.wsA.id} and s.source_assignment_id=${assignment}
      `;
      const occurrenceIds = occurrences.map((row) => row.id as string);
      const deliveries = await tx`
        select id from app_private.form_alert_deliveries
        where alert_occurrence_id=any(${occurrenceIds}::uuid[])
      `;
      const deliveryIds = deliveries.map((row) => row.id as string);
      const jobs = await tx`
        select id from public.jobs
        where kind='forms.alert' and payload->>'alert_id'=any(${occurrenceIds}::text[])
      `;
      const jobIds = jobs.map((row) => row.id as string);

      await tx`
        insert into app_private.form_retention_windows(
          workspace_id,client_id,source_event_id,source_kind,ended_at
        ) values(${f.wsA.id},${client.id},${randomUUID()},'closure',clock_timestamp())
      `;
      const [lifecycle] = await tx`
        select app_private.f15_client_alert_lifecycle_active(
          ${f.wsA.id},${assignment}
        ) as active
      `;
      expect(lifecycle?.active).toBe(false);

      const [inboxAfter] = await tx`
        select count(*)::int as count from app_private.form_alert_inbox
        where source_assignment_id=${assignment}
      `;
      expect(
        inboxAfter?.count,
        'relationship end removes existing inbox rows',
      ).toBe(0);
      const [deliveriesAfter] = await tx`
        select count(*)::int as count from app_private.form_alert_deliveries
        where id=any(${deliveryIds}::uuid[])
      `;
      expect(
        deliveriesAfter?.count,
        'relationship end removes deliveries',
      ).toBe(0);
      const [occurrencesAfter] = await tx`
        select count(*)::int as count from app_private.form_alert_occurrences
        where id=any(${occurrenceIds}::uuid[])
      `;
      expect(
        occurrencesAfter?.count,
        'relationship end removes occurrences',
      ).toBe(0);
      const [jobsAfter] = await tx`
        select count(*)::int as count from public.jobs where id=any(${jobIds}::uuid[])
      `;
      expect(jobsAfter?.count, 'relationship end removes jobs').toBe(0);
      const [schedulesAfter] = await tx`
        select count(*)::int as count from app_private.form_alert_schedules
        where source_assignment_id=${assignment} and alert_kind='client_late'
      `;
      expect(schedulesAfter?.count, 'relationship end removes schedules').toBe(
        0,
      );
      expect(
        await core(tx, f.wsA.id, '2026-04-13T00:00:00.000Z'),
      ).toMatchObject({
        status: 'ok',
      });
      const [inboxAfterReevaluation] = await tx`
        select count(*)::int as count from app_private.form_alert_inbox
        where source_assignment_id=${assignment}
      `;
      expect(
        inboxAfterReevaluation?.count,
        'reevaluation does not recreate client-late alerts',
      ).toBe(0);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('keeps the evaluator lifecycle check when cancellation was unavailable', async () => {
  await withCrashSafeFunctionMutant(
    'app_private.cancel_f15_client_alerts(uuid,uuid)',
    (definition) =>
      definition.replace(
        /as\s+(\$[a-z_]*\$)[\s\S]*?\1/i,
        'as $function$ begin return; end; $function$',
      ),
    async () => {
      const f = await clientContext();
      const client = await registered(f);
      await expect(
        db.begin(async (tx) => {
          const assignment = await formAssignment(
            tx,
            f.wsA.id,
            client.id,
            '2026-04-10T00:00:00.000Z',
            f.po.userId,
          );
          await tx`
            insert into app_private.form_retention_windows(
              workspace_id,client_id,source_event_id,source_kind,ended_at
            ) values(${f.wsA.id},${client.id},${randomUUID()},'refund',clock_timestamp())
          `;
          const [schedule] = await tx`
            select id from app_private.form_alert_schedules
            where source_assignment_id=${assignment} and alert_kind='client_late'
          `;
          expect(schedule?.id).toBeTruthy();
          expect(await core(tx, f.wsA.id, '2026-04-12T00:00:00.000Z')).toEqual({
            status: 'ok',
            enqueued: 0,
          });
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    },
  );
});

it('S41-PO-12 limits client-late catch-up to seven days and suppresses legacy owner notices', async () => {
  const f = await clientContext();
  const client = await registered(f);
  await expect(
    db.begin(async (tx) => {
      const now = '2026-04-20T00:00:00.000Z';
      const old = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        '2026-04-01T00:00:00.000Z',
        f.po.userId,
      );
      const legacy = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        '2026-04-17T00:00:00.000Z',
        f.po.userId,
      );
      const eligible = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        '2026-04-15T00:00:00.000Z',
        f.po.userId,
      );
      await tx`insert into app_private.form_alert_occurrences(workspace_id,schedule_id,stage,recipient_user_id,enqueued_at) select workspace_id,id,'client_owners_24h',${f.woA.userId},${now}::timestamptz from app_private.form_alert_schedules where workspace_id=${f.wsA.id} and source_assignment_id=${legacy} and alert_kind='client_late'`;
      const result = await core(tx, f.wsA.id, now);
      expect(result.status).toBe('ok');
      const schedules =
        await tx`select id,source_assignment_id from app_private.form_alert_schedules where workspace_id=${f.wsA.id} and source_assignment_id in (${old},${legacy},${eligible})`;
      const scheduleByAssignment = new Map(
        schedules.map((row) => [row.source_assignment_id, row.id]),
      );
      const immediate =
        await tx`select distinct schedule_id from app_private.form_alert_occurrences where workspace_id=${f.wsA.id} and stage='client_owners_immediate'`;
      expect(immediate.map((row) => row.schedule_id)).toEqual([
        scheduleByAssignment.get(eligible),
      ]);
      expect(immediate.map((row) => row.schedule_id)).not.toContain(
        scheduleByAssignment.get(old),
      );
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('mutation: removing the client-late catch-up bound is caught', async () => {
  const f = await clientContext();
  const client = await registered(f);
  await withCrashSafeFunctionMutant(
    'app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer)',
    (definition) =>
      definition.replace(
        "s.deadline_at + interval '7 days' >= p_evaluation_at",
        'true',
      ),
    async () => {
      await expectInvariantFailure(async () =>
        db.begin(async (tx) => {
          const old = await formAssignment(
            tx,
            f.wsA.id,
            client.id,
            '2026-04-01T00:00:00.000Z',
            f.po.userId,
          );
          await core(tx, f.wsA.id, '2026-04-20T00:00:00.000Z');
          const occurrences =
            await tx`select o.id from app_private.form_alert_occurrences o join app_private.form_alert_schedules s on s.workspace_id=o.workspace_id and s.id=o.schedule_id where s.source_assignment_id=${old} and o.stage='client_owners_immediate'`;
          expect(occurrences).toHaveLength(0);
          throw rollback;
        }),
      );
    },
  );
});

it('mutation: removing legacy owner-stage suppression is caught', async () => {
  const f = await clientContext();
  const client = await registered(f);
  await withCrashSafeFunctionMutant(
    'app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer)',
    (definition) =>
      definition.replace(
        "legacy.stage in ('client_owners_24h','client_owners_48h')",
        "legacy.stage in ('no_legacy_stage')",
      ),
    async () => {
      await expectInvariantFailure(async () =>
        db.begin(async (tx) => {
          const now = '2026-04-20T00:00:00.000Z';
          const assignment = await formAssignment(
            tx,
            f.wsA.id,
            client.id,
            '2026-04-17T00:00:00.000Z',
            f.po.userId,
          );
          await tx`insert into app_private.form_alert_occurrences(workspace_id,schedule_id,stage,recipient_user_id,enqueued_at) select workspace_id,id,'client_owners_24h',${f.woA.userId},${now}::timestamptz from app_private.form_alert_schedules where workspace_id=${f.wsA.id} and source_assignment_id=${assignment} and alert_kind='client_late'`;
          await core(tx, f.wsA.id, now);
          const immediate =
            await tx`select 1 from app_private.form_alert_occurrences o join app_private.form_alert_schedules s on s.workspace_id=o.workspace_id and s.id=o.schedule_id where s.source_assignment_id=${assignment} and o.stage='client_owners_immediate'`;
          expect(immediate).toHaveLength(0);
          throw rollback;
        }),
      );
    },
  );
});
