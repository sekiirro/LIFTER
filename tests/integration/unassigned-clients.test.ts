import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { graph, clientContext, sql } from './registration-approval-fixture';
import { pending } from './client-accounts-fixture';
import { checked, issue } from './registration-links-fixture';
import type { Context } from './registration-approval-fixture';

let db: ReturnType<typeof sql>;
beforeAll(() => {
  db = sql();
});
afterAll(async () => db?.end());

async function approvedClient(context: Context) {
  const link = checked(await issue(context)) as string;
  return db.begin((tx) => graph(tx, { ...context, link }));
}

async function unassignedIds(
  actor: Context['po'],
  workspaceId: string,
): Promise<string[]> {
  const result = await actor.client.rpc('unassigned_clients', {
    p_workspace_id: workspaceId,
  });
  if (result.error) throw new Error(result.error.message);
  const payload = result.data as { status: string; client_ids?: string[] };
  expect(payload.status).toBe('ok');
  return payload.client_ids ?? [];
}

describe('F11 T061 unassigned-client read', () => {
  it('allows the Platform Owner and own-workspace Workspace Owner to read approved unassigned clients', async () => {
    const context = await clientContext();
    const ids = await approvedClient(context);
    const foreignContext = await clientContext();
    const foreign = await approvedClient(foreignContext);
    const [alertsBefore] = await db`
      select count(*)::int as count from app_private.form_alert_occurrences`;

    expect(await unassignedIds(context.po, context.wsA.id)).toContain(
      ids.client,
    );
    const ownWorkspaceIds = await unassignedIds(context.woA, context.wsA.id);
    expect(ownWorkspaceIds).toContain(ids.client);
    expect(ownWorkspaceIds).not.toContain(foreign.client);
    const [alertsAfter] = await db`
      select count(*)::int as count from app_private.form_alert_occurrences`;
    expect(alertsAfter).toEqual(alertsBefore);
  });

  it('refuses Trainer, Sales, client, pending client and other-workspace Workspace Owner with no data', async () => {
    const context = await clientContext();
    const ids = await approvedClient(context);
    const pendingLink = checked(await issue(context)) as string;
    const pendingClient = await db.begin((tx) =>
      pending(tx, context, { registration_link_id: pendingLink }),
    );
    const deniedActors = [
      context.trainerA,
      context.salesA,
      context.actors.client,
      context.actors.woB,
    ];

    for (const actor of deniedActors) {
      const result = await actor.client.rpc('unassigned_clients', {
        p_workspace_id: context.wsA.id,
      });
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ status: 'not_permitted' });
    }
    const [approvedClientAccount] = await db`
      select auth_user_id from public.clients where id=${ids.client}`;
    const approvedClientDenial = await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: approvedClientAccount!.auth_user_id, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [result] = await tx`
        select public.unassigned_clients(${context.wsA.id}) as result`;
      return result!.result;
    });
    expect(approvedClientDenial).toEqual({ status: 'not_permitted' });
    const pendingDenial = await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: pendingClient.auth_user_id, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [result] = await tx`
        select public.unassigned_clients(${context.wsA.id}) as result`;
      return result!.result;
    });
    expect(pendingDenial).toEqual({ status: 'not_permitted' });
    const unauthorizedInvalidInput = await context.trainerA.client.rpc(
      'unassigned_clients',
      { p_workspace_id: null },
    );
    expect(unauthorizedInvalidInput.error).toBeNull();
    expect(unauthorizedInvalidInput.data).toEqual({
      status: 'not_permitted',
    });

    const ownerOtherWorkspace = await context.actors.woB.client.rpc(
      'unassigned_clients',
      { p_workspace_id: context.wsB.id },
    );
    expect(ownerOtherWorkspace.error).toBeNull();
    expect(ownerOtherWorkspace.data).toEqual({ status: 'ok', client_ids: [] });

    const [counts] = await db`
      select count(*) filter(where id=${ids.client})::int as approved,
        count(*) filter(where id=${pendingClient.id})::int as pending
      from public.clients where workspace_id=${context.wsA.id}`;
    expect(counts).toEqual({ approved: 1, pending: 1 });
  });

  it('lists never-assigned clients, excludes active assignments and pending approvals', async () => {
    const context = await clientContext();
    const neverAssigned = await approvedClient(context);
    const assigned = await approvedClient(context);
    const pendingLink = checked(await issue(context)) as string;
    const pendingClient = await db.begin((tx) =>
      pending(tx, context, { registration_link_id: pendingLink }),
    );
    const assignment = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: assigned.client,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(assignment.data).toMatchObject({ status: 'ok' });

    const ids = await unassignedIds(context.woA, context.wsA.id);
    expect(ids).toContain(neverAssigned.client);
    expect(ids).not.toContain(assigned.client);
    expect(ids).not.toContain(pendingClient.id);
  });

  it('lists clients again when the assigned Trainer membership is revoked or role changes', async () => {
    for (const departure of ['revoked', 'role'] as const) {
      const context = await clientContext();
      const ids = await approvedClient(context);
      const assignment = await context.po.client.rpc(
        'assign_client_responsible_trainer',
        {
          p_workspace_id: context.wsA.id,
          p_client_id: ids.client,
          p_trainer_user_id: context.trainerA.userId,
        },
      );
      expect(assignment.data).toMatchObject({ status: 'ok' });

      if (departure === 'revoked') {
        const changed = await context.po.client
          .from('workspace_memberships')
          .update({
            revoked_at: new Date().toISOString(),
            revoked_by: context.po.userId,
          })
          .eq('workspace_id', context.wsA.id)
          .eq('user_id', context.trainerA.userId);
        expect(changed.error).toBeNull();
      } else {
        const changed = await context.po.client
          .from('staff_profiles')
          .update({ role: 'sales' })
          .eq('user_id', context.trainerA.userId);
        expect(changed.error).toBeNull();
      }

      expect(await unassignedIds(context.po, context.wsA.id)).toContain(
        ids.client,
      );
    }
  });

  it('keeps the unassigned read read-only for Workspace Owners', async () => {
    const context = await clientContext();
    const ids = await approvedClient(context);
    const insert = await context.woA.client
      .from('client_trainer_assignments')
      .insert({
        workspace_id: context.wsA.id,
        client_id: ids.client,
        trainer_user_id: context.trainerA.userId,
        assignment_source: 'po_manual',
        assigned_by: context.woA.userId,
      });
    expect(insert.error).not.toBeNull();

    const assignment = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: ids.client,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(assignment.data).toMatchObject({ status: 'ok' });

    const update = await context.woA.client
      .from('client_trainer_assignments')
      .update({ ended_at: new Date().toISOString() })
      .eq('workspace_id', context.wsA.id)
      .eq('client_id', ids.client);
    const remove = await context.woA.client
      .from('client_trainer_assignments')
      .delete()
      .eq('workspace_id', context.wsA.id)
      .eq('client_id', ids.client);
    expect(update.error).not.toBeNull();
    expect(remove.error).not.toBeNull();
  });

  it('excludes deletion_pending, release_pending, and released clients from unassigned_clients', async () => {
    const context = await clientContext();
    const ids = await approvedClient(context);

    for (const deletionState of [
      'deletion_pending',
      'release_pending',
      'released',
    ] as const) {
      await db.begin(async (tx) => {
        await tx`select set_config('app.deletion_transition_proof', ${`s56-r12-${deletionState}`}, true)`;
        await tx`
          update public.clients
          set deletion_state = ${deletionState}
          where id = ${ids.client}
        `;
      });
      const read = await context.po.client.rpc('unassigned_clients', {
        p_workspace_id: context.wsA.id,
      });
      expect(read.error).toBeNull();
      const rows = (read.data as Array<{ client_id: string }>) ?? [];
      expect(rows.some((row) => row.client_id === ids.client)).toBe(false);
    }
  });
});
