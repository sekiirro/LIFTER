import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readyAndPublishPlan } from '../../lib/plans/ready-and-publish';
import { portalFixture, type PortalFixture } from './client-portal-fixture';

// F22 T011 (FR-003; SC-003; S57-PO-11): the productivity-unit recipient on
// first activation, now that the F11 responsible-Trainer assignment exists.
// F22 adds no unit writer; F19 T021 resolves the recipient inside the
// activation transaction through app_private.current_assigned_trainer.
let p: PortalFixture;

beforeAll(async () => {
  p = await portalFixture();
});
afterAll(async () => p?.close());

function request(planId: string) {
  return {
    planId,
    expectedDraftVersion: 1,
    expectedPublishedRevision: 0,
    operationKey: randomUUID(),
  };
}

async function deliver(
  client: Parameters<typeof readyAndPublishPlan>[0],
  planId: string,
) {
  return readyAndPublishPlan(client, request(planId), p.planKind(planId));
}

async function units(clientId: string) {
  return p.db`select recipient_trainer_user_id, unit_count
    from public.productivity_units
    where workspace_id=${p.fixture.wsA.id} and client_id=${clientId}`;
}

describe('F22 first-activation unit recipient with the F11 assignment (T011)', () => {
  it('credits the assigned Trainer, resolved at activation time, when a non-Trainer completes the pair', async () => {
    const client = await p.makeClient({ activate: false, label: 'assigned' });
    const workout = await p.createDraft(client.clientId, 'workout', 'F22 aw');
    // Created by the completing publisher (F19 contributor rule).
    const nutrition = await p.createDraft(
      client.clientId,
      'nutrition',
      'F22 an',
      p.fixture.po.client,
    );
    expect(await deliver(p.fixture.trainerA.client, workout)).toMatchObject({
      status: 'ok',
    });
    // Assigned after the first delivery and before activation.
    const assignment = await p.fixture.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: p.fixture.wsA.id,
        p_client_id: client.clientId,
        p_trainer_user_id: p.fixture.trainerA.userId,
      },
    );
    expect(assignment.data).toMatchObject({ status: 'ok' });
    expect(await deliver(p.fixture.po.client, nutrition)).toMatchObject({
      status: 'ok',
    });
    const rows = await units(client.clientId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipient_trainer_user_id: p.fixture.trainerA.userId,
      unit_count: 1,
    });
    expect(rows[0]!.recipient_trainer_user_id).not.toBe(p.fixture.po.userId);
  });

  it('credits the completing Trainer when no Trainer is assigned and adds no unit for a later assignment or revision', async () => {
    const client = await p.makeClient({ activate: false, label: 'unassigned' });
    const workout = await p.createDraft(client.clientId, 'workout', 'F22 uw');
    const nutrition = await p.createDraft(
      client.clientId,
      'nutrition',
      'F22 un',
    );
    await deliver(p.fixture.trainerA.client, workout);
    await deliver(p.fixture.trainerA.client, nutrition);
    const first = await units(client.clientId);
    expect(first).toHaveLength(1);
    expect(first[0]!.recipient_trainer_user_id).toBe(p.fixture.trainerA.userId);
    // A later assignment and a later revision never add another unit.
    await p.fixture.po.client.rpc('assign_client_responsible_trainer', {
      p_workspace_id: p.fixture.wsA.id,
      p_client_id: client.clientId,
      p_trainer_user_id: p.fixture.trainerA.userId,
    });
    const draftVersion = await p.revise(workout, 1, 'F22 uw2');
    expect(
      await readyAndPublishPlan(
        p.fixture.trainerA.client,
        {
          planId: workout,
          expectedDraftVersion: draftVersion,
          expectedPublishedRevision: 1,
          operationKey: randomUUID(),
        },
        'workout',
      ),
    ).toMatchObject({ status: 'ok' });
    expect(await units(client.clientId)).toHaveLength(1);
  });

  it('refuses a foreign-workspace Trainer as responsible Trainer and writes no assignment or unit for it', async () => {
    const client = await p.makeClient({ activate: false, label: 'foreign' });
    const refused = await p.fixture.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: p.fixture.wsA.id,
        p_client_id: client.clientId,
        p_trainer_user_id: p.fixture.trainerB.userId,
      },
    );
    expect(refused.data).toEqual({ status: 'not_permitted' });
    const [row] = await p.db`select count(*)::int as count
      from public.client_trainer_assignments
      where workspace_id=${p.fixture.wsA.id} and client_id=${client.clientId}`;
    expect(row!.count).toBe(0);
    // Activation then falls back to the completing Trainer of workspace A.
    const workout = await p.createDraft(client.clientId, 'workout', 'F22 fw');
    const nutrition = await p.createDraft(
      client.clientId,
      'nutrition',
      'F22 fn',
    );
    await deliver(p.fixture.trainerA.client, workout);
    await deliver(p.fixture.trainerA.client, nutrition);
    const rows = await units(client.clientId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.recipient_trainer_user_id).toBe(p.fixture.trainerA.userId);
    expect(rows[0]!.recipient_trainer_user_id).not.toBe(
      p.fixture.trainerB.userId,
    );
  });
});
