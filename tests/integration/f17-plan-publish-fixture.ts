import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';

/** Create minimal synthetic F15 state proving a form was submitted. */
export async function seedSubmittedIntake(
  tx: TransactionSql,
  workspaceId: string,
  clientId: string,
  options: {
    subscriptionId?: string;
    authoritative?: boolean;
    occurrenceKey?: string;
    configuredBy?: string;
    deadlineAt?: Date;
  } = {},
) {
  const policy = `f17-intake-${randomUUID()}`;
  const formId = randomUUID();
  const assignmentId = randomUUID();
  const assignmentPolicyId = randomUUID();
  const occurrenceKey = options.occurrenceKey ?? `initial:${clientId}`;
  const definition = {
    questions: [{ id: 'q1', sectionId: 'intake', type: 'shortText' }],
  };
  const [workspace] = await tx`
    select created_by from public.workspaces where id=${workspaceId}
  `;
  const configuredBy = options.configuredBy ?? workspace!.created_by;
  const subscriptionId = options.subscriptionId;

  await tx`insert into app_private.terms_policy_versions(version, policy_kind, status)
    values(${policy}, 'terms', 'published')`;
  await tx`insert into public.forms(id, workspace_id, name)
    values(${formId}, ${workspaceId}, 'F17 synthetic intake')`;
  await tx`insert into public.form_versions(
    workspace_id, form_id, version_number, terms_policy_version, definition, status
  ) values (
    ${workspaceId}, ${formId}, 1, ${policy}, ${tx.json(definition)}, 'published'
  )`;
  if (options.authoritative) {
    if (!subscriptionId || !options.deadlineAt) {
      throw new Error(
        'authoritative intake fixture requires subscriptionId and deadlineAt',
      );
    }
    await tx`insert into app_private.form_assignment_policies(
      id,workspace_id,form_id,version_number,audience_kind,specific_client_ids,
      trigger_kind,timing,stop_conditions,configured_by
    ) values (
      ${assignmentPolicyId},${workspaceId},${formId},1,'specific_clients',
      array[${clientId}]::uuid[],'onboarding','{"client_deadline_days":3}'::jsonb,
      '{"frozen":true,"inactive":true}'::jsonb,${configuredBy}
    )`;
    await tx`insert into app_private.form_assignment_occurrences(
      workspace_id,policy_id,occurrence_key,snapshot_at,audience_client_ids,
      version_number,trigger_kind,created_by
    ) values (
      ${workspaceId},${assignmentPolicyId},${occurrenceKey},clock_timestamp(),
      array[${clientId}]::uuid[],1,'onboarding',${configuredBy}
    )`;
  }
  await tx`insert into public.form_assignments(
    id, workspace_id, client_id, form_id, version_number, terms_policy_version,
    version_snapshot,occurrence_key,policy_id,configured_by,client_deadline_at
  ) values (
    ${assignmentId}, ${workspaceId}, ${clientId}, ${formId}, 1, ${policy}, ${tx.json(definition)},
    ${options.authoritative ? occurrenceKey : 'initial'},
    ${options.authoritative ? assignmentPolicyId : null},${options.authoritative ? configuredBy : null},
    ${options.deadlineAt?.toISOString() ?? null}
  )`;
  await tx`insert into public.form_answer_revisions(workspace_id, assignment_id, revision, answer_values)
    values(${workspaceId}, ${assignmentId}, 1, ${tx.json({ q1: 'submitted' })})`;
  await tx`insert into app_private.form_submissions(workspace_id, assignment_id, revision, submitted_at)
    values(${workspaceId}, ${assignmentId}, 1, clock_timestamp())`;
  if (options.authoritative && subscriptionId) {
    await tx`insert into app_private.form_assignment_consumptions(
      workspace_id,client_id,form_id,subscription_id,assignment_id
    ) values (
      ${workspaceId},${clientId},${formId},${subscriptionId},${assignmentId}
    )`;
  }
  return assignmentId;
}
