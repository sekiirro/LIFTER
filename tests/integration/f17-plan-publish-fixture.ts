import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';

/** Create minimal synthetic F15 state proving a form was submitted. */
export async function seedSubmittedIntake(
  tx: TransactionSql,
  workspaceId: string,
  clientId: string,
) {
  const policy = `f17-intake-${randomUUID()}`;
  const formId = randomUUID();
  const assignmentId = randomUUID();
  const definition = {
    questions: [{ id: 'q1', sectionId: 'intake', type: 'shortText' }],
  };

  await tx`insert into app_private.terms_policy_versions(version, policy_kind, status)
    values(${policy}, 'terms', 'published')`;
  await tx`insert into public.forms(id, workspace_id, name)
    values(${formId}, ${workspaceId}, 'F17 synthetic intake')`;
  await tx`insert into public.form_versions(
    workspace_id, form_id, version_number, terms_policy_version, definition, status
  ) values (
    ${workspaceId}, ${formId}, 1, ${policy}, ${tx.json(definition)}, 'published'
  )`;
  await tx`insert into public.form_assignments(
    id, workspace_id, client_id, form_id, version_number, terms_policy_version, version_snapshot
  ) values (
    ${assignmentId}, ${workspaceId}, ${clientId}, ${formId}, 1, ${policy}, ${tx.json(definition)}
  )`;
  await tx`insert into public.form_answer_revisions(workspace_id, assignment_id, revision, answer_values)
    values(${workspaceId}, ${assignmentId}, 1, ${tx.json({ q1: 'submitted' })})`;
  await tx`insert into app_private.form_submissions(workspace_id, assignment_id, revision, submitted_at)
    values(${workspaceId}, ${assignmentId}, 1, clock_timestamp())`;
  return assignmentId;
}
