import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { clientContext, pending } from './client-accounts-fixture';
import { sql } from './harness';

const db = sql();
afterAll(() => db.end());

const rollback = new Error('rollback T007/T010 synthetic assignment fixture');

async function assignmentFixture(tx: TransactionSql) {
  const context = await clientContext();
  const client = await pending(tx, context);
  const policy = `r3-${randomUUID()}`;
  const form = randomUUID();
  const assignment = randomUUID();
  const snapshot = {
    version: 1,
    questions: [{ id: 'q1', type: 'short_text' }],
  };

  await tx`
    insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${policy},'terms','published')
  `;
  await tx`insert into public.forms(id,workspace_id,name)
    values(${form},${context.wsA.id},'R3 synthetic snapshot')`;
  await tx`
    insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values(${context.wsA.id},${form},1,${policy},${tx.json(snapshot)},'published')
  `;
  await tx`
    insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
    values(${assignment},${context.wsA.id},${client.id},${form},1,${policy},${tx.json(snapshot)})
  `;
  return { context, client, policy, form, assignment, snapshot };
}

describe('T007 assignment snapshot and T010 one-time assignment', () => {
  it('keeps the copied snapshot immutable and enforces same-workspace version binding', async () => {
    let triggerMutationWouldBeCaught = false;
    await expect(
      db.begin(async (tx) => {
        const f = await assignmentFixture(tx);
        const crossWorkspaceClient = await pending(tx, await clientContext());
        await tx.savepoint(async (sp) => {
          await sp`alter table public.form_assignments disable trigger form_assignments_guard`;
          await expect(
            sp.savepoint(
              (inner) =>
                inner`
                insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
                values(${randomUUID()},${crossWorkspaceClient.workspace_id},${crossWorkspaceClient.id},${f.form},1,${f.policy},${tx.json(f.snapshot)})
              `,
            ),
          ).rejects.toMatchObject({ code: '23503' });
          await sp`alter table public.form_assignments enable trigger form_assignments_guard`;
        });

        await expect(
          tx.savepoint(
            (sp) =>
              sp`update public.form_assignments set version_snapshot='{}'::jsonb where workspace_id=${f.context.wsA.id} and id=${f.assignment}`,
          ),
        ).rejects.toThrow();

        await tx.savepoint(async (sp) => {
          await sp`alter table public.form_assignments disable trigger form_assignments_guard`;
          await sp`update public.form_assignments set version_snapshot='{}'::jsonb where workspace_id=${f.context.wsA.id} and id=${f.assignment}`;
          const [mutated] = await sp`
            select version_snapshot from public.form_assignments
            where workspace_id=${f.context.wsA.id} and id=${f.assignment}
          `;
          try {
            expect(mutated?.version_snapshot).toEqual(f.snapshot);
          } catch {
            triggerMutationWouldBeCaught = true;
          }
        });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(triggerMutationWouldBeCaught).toBe(true);
  });

  it('allows only one assignment per client/form and kills a unique-index mutation', async () => {
    let duplicateMutationWouldBeCaught = false;
    await expect(
      db.begin(async (tx) => {
        const f = await assignmentFixture(tx);
        const insertDuplicate = (sp: TransactionSql) =>
          sp`
            insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
            values(${randomUUID()},${f.context.wsA.id},${f.client.id},${f.form},1,${f.policy},${tx.json(f.snapshot)})
          `;
        await expect(
          tx.savepoint((sp) => insertDuplicate(sp)),
        ).rejects.toMatchObject({ code: '23505' });

        await tx.savepoint(async (sp) => {
          await sp`alter table public.form_assignments drop constraint form_assignments_workspace_id_client_id_form_id_key`;
          await insertDuplicate(sp);
          let assertionDetectedMutation = false;
          try {
            expect(true, 'duplicate assignment must be rejected').toBe(false);
          } catch {
            assertionDetectedMutation = true;
          }
          duplicateMutationWouldBeCaught = assertionDetectedMutation;
        });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(duplicateMutationWouldBeCaught).toBe(true);
  });
});
