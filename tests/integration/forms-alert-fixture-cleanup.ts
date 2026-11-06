import type { TransactionSql } from 'postgres';

/** Remove only operational alert rows produced for one synthetic assignment. */
export async function cleanupAlertFixture(
  tx: TransactionSql,
  workspaceId: string,
  assignmentId: string,
) {
  const occurrences = await tx`
    select o.id,o.job_id
    from app_private.form_alert_occurrences o
    join app_private.form_alert_schedules s
      on s.workspace_id=o.workspace_id and s.id=o.schedule_id
    where s.workspace_id=${workspaceId} and s.source_assignment_id=${assignmentId}
  `;
  const occurrenceIds = occurrences.map((row) => row.id);
  const jobIds = occurrences.flatMap((row) => (row.job_id ? [row.job_id] : []));

  await tx`delete from app_private.form_alert_inbox
    where workspace_id=${workspaceId} and source_assignment_id=${assignmentId}`;
  await tx`delete from app_private.form_alert_deliveries
    where workspace_id=${workspaceId} and alert_occurrence_id=any(${occurrenceIds}::uuid[])`;
  await tx`delete from app_private.form_alert_occurrences
    where workspace_id=${workspaceId} and id=any(${occurrenceIds}::uuid[])`;
  await tx`delete from public.jobs where id=any(${jobIds}::uuid[])`;
  await tx`delete from app_private.form_alert_schedules
    where workspace_id=${workspaceId} and source_assignment_id=${assignmentId}`;
}
