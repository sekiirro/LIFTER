import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  clientContext,
  registered,
  sql,
} from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());
const rollback = new Error('rollback F15 synthetic alert fixtures');
const CORE = 'app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer)';

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

it('uses the client-late +24h and +48h clocks, transfers the Trainer stage, and routes no-Trainer cases to both owners', async () => {
  const f = await clientContext();
  const client = await registered(f);
  await expect(
    db.begin(async (tx) => {
      const deadline = '2026-02-01T10:00:00.000Z';
      const assigned = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        deadline,
        f.po.userId,
      );
      const noTrainer = await formAssignment(
        tx,
        f.wsA.id,
        client.id,
        deadline,
        f.po.userId,
      );
      await tx`update app_private.form_alert_schedules
        set trainer_user_id=${f.trainerA.userId}
        where workspace_id=${f.wsA.id} and source_assignment_id=${assigned} and alert_kind='client_late'`;
      const [before] = await tx`select id from app_private.form_alert_schedules
        where workspace_id=${f.wsA.id} and source_assignment_id=${assigned} and alert_kind='client_late'`;
      expect(before?.id).toBeTruthy();
      await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by)
        values(${f.wsA.id},${f.trainerB.userId},${f.po.userId})`;
      await tx`update app_private.form_alert_schedules
        set trainer_user_id=${f.trainerB.userId}
        where workspace_id=${f.wsA.id} and source_assignment_id=${assigned} and alert_kind='client_late'`;

      expect(await core(tx, f.wsA.id, '2026-02-02T09:59:59.999Z')).toEqual({
        status: 'ok',
        enqueued: 0,
      });
      expect(await core(tx, f.wsA.id, '2026-02-02T10:00:00.000Z')).toEqual({
        status: 'ok',
        enqueued: 3,
      });
      const at24 = await tx`select o.stage,o.recipient_user_id,j.kind,j.payload,
          e.details
        from app_private.form_alert_occurrences o
        join public.jobs j on j.id=o.job_id
        join public.audit_events e on e.target_id=o.id and e.action='form.alert_enqueued'
        where o.workspace_id=${f.wsA.id}
        order by o.stage,o.recipient_user_id`;
      expect(at24).toHaveLength(3);
      expect(
        at24.filter((row) => row.stage === 'client_trainer_24h'),
      ).toMatchObject([
        { recipient_user_id: f.trainerB.userId, kind: 'forms.alert' },
      ]);
      expect(
        at24
          .filter((row) => row.stage === 'client_owners_24h')
          .map((row) => row.recipient_user_id)
          .sort(),
      ).toEqual([f.po.userId, f.woA.userId].sort());
      for (const row of at24) {
        expect(
          Object.keys(row.payload as Record<string, unknown>).sort(),
        ).toEqual(['alert_id', 'recipient_id', 'stage']);
        expect(
          Object.keys(row.details as Record<string, unknown>).sort(),
        ).toEqual(['recipient_id', 'schedule_id', 'stage']);
      }

      expect(await core(tx, f.wsA.id, '2026-02-02T10:00:00.000Z')).toEqual({
        status: 'ok',
        enqueued: 0,
      });
      expect(await core(tx, f.wsA.id, '2026-02-03T10:00:00.000Z')).toEqual({
        status: 'ok',
        enqueued: 4,
      });
      const at48 =
        await tx`select stage,recipient_user_id from app_private.form_alert_occurrences
        where workspace_id=${f.wsA.id} and stage='client_owners_48h'`;
      expect(at48).toHaveLength(4);
      expect(at48.map((row) => row.recipient_user_id).sort()).toEqual(
        [f.po.userId, f.woA.userId, f.po.userId, f.woA.userId].sort(),
      );
      const [schedule] =
        await tx`select deadline_at from app_private.form_alert_schedules
        where workspace_id=${f.wsA.id} and source_assignment_id=${assigned} and alert_kind='client_late'`;
      expect(new Date(schedule!.deadline_at as string).toISOString()).toBe(
        deadline,
      );
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
        ${f.wsA.id},${catchUpAssignment},'trainer_late',${d03Deadline}::timestamptz,${f.trainerB.userId}
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
        enqueued: 3,
      });
      const caughtUp = await tx`select stage,recipient_user_id
        from app_private.form_alert_occurrences
        where workspace_id=${f.wsA.id} and schedule_id=${catchUpSchedule!.id}`;
      expect(caughtUp.map((row) => row.recipient_user_id).sort()).toEqual(
        [f.trainerB.userId, f.po.userId, f.woA.userId].sort(),
      );
      expect(await core(tx, f.wsA.id, '2026-03-18T09:00:00.000Z')).toEqual({
        status: 'ok',
        enqueued: 0,
      });
      throw rollback;
    }),
  ).rejects.toBe(rollback);
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
        where workspace_id=${f.wsA.id} and user_id=${f.trainerA.userId} and revoked_at is null`;
      expect(await core(tx, f.wsA.id, '2026-04-02T00:00:00.000Z')).toEqual({
        status: 'ok',
        enqueued: 2,
      });
      const recipients = await tx`select stage,recipient_user_id
        from app_private.form_alert_occurrences where workspace_id=${f.wsA.id}`;
      expect(recipients.map((row) => row.recipient_user_id).sort()).toEqual(
        [f.po.userId, f.woA.userId].sort(),
      );
      expect(await core(tx, f.wsA.id, null)).toEqual({
        status: 'invalid_input',
      });
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});
