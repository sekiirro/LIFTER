import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient } from './harness';
import {
  asUser,
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

// F22 T008 (FR-001, FR-002, FR-003, FR-010): staff Ready & Publish through F19
// across roles and workspaces, including the F19 T021 completing-delivery rule
// (no F11 assignment yet: only a Trainer publisher may complete the first pair).
let p: PortalFixture;

beforeAll(async () => {
  p = await portalFixture();
});
afterAll(async () => p?.close());

const publishArgs = (planId: string, operationKey = randomUUID()) => ({
  p_plan_id: planId,
  p_expected_draft_version: 1,
  p_expected_published_version: 0,
  p_operation_key: operationKey,
});

async function deliveryCount(planId: string) {
  const [row] =
    await p.db`select count(*)::int as count from public.plan_deliveries where plan_id=${planId}`;
  return row!.count as number;
}

async function activationCount(client: PortalClient) {
  const [row] = await p.db`select
      (select count(*)::int from public.subscription_activations
        where workspace_id=${p.fixture.wsA.id} and subscription_id=${client.subscriptionId}) as activations,
      (select count(*)::int from public.productivity_units
        where workspace_id=${p.fixture.wsA.id} and client_id=${client.clientId}) as units`;
  return row!;
}

describe('F22 Ready & Publish authorization (T008)', () => {
  it('refuses Sales, foreign-workspace staff, clients and anonymous callers without writes', async () => {
    const client = await p.makeClient({ activate: false, label: 'deny' });
    const planId = await p.createDraft(client.clientId, 'workout', 'F22 auth');
    for (const actor of [p.fixture.salesA, p.fixture.trainerB]) {
      const denied = await actor.client.rpc(
        'ready_and_publish_plan',
        publishArgs(planId),
      );
      expect(denied.error).toBeNull();
      expect(denied.data).toEqual({ status: 'not_permitted' });
    }
    const asClient = await p.db.begin((tx) =>
      asUser(tx, client.authUserId, async (inner) => {
        const args = publishArgs(planId);
        const [row] = await inner`select public.ready_and_publish_plan(
          ${args.p_plan_id}::uuid, 1, 0, ${args.p_operation_key}::uuid) as value`;
        return row!.value;
      }),
    );
    expect(asClient).toEqual({ status: 'not_permitted' });
    const anon = await anonClient().rpc(
      'ready_and_publish_plan',
      publishArgs(planId),
    );
    expect(anon.error).not.toBeNull();
    expect(await deliveryCount(planId)).toBe(0);
    expect(await activationCount(client)).toEqual({
      activations: 0,
      units: 0,
    });
  });

  it('lets Workspace Owner and Platform Owner deliver a non-completing first plan', async () => {
    const byOwner = await p.makeClient({ activate: false, label: 'wo' });
    const byPo = await p.makeClient({ activate: false, label: 'po' });
    const workout = await p.createDraft(byOwner.clientId, 'workout', 'F22 wo');
    const nutrition = await p.createDraft(byPo.clientId, 'nutrition', 'F22 po');
    const owner = await p.fixture.woA.client.rpc(
      'ready_and_publish_plan',
      publishArgs(workout),
    );
    expect(owner.data).toMatchObject({ status: 'ok', revision_number: 1 });
    const po = await p.fixture.po.client.rpc(
      'ready_and_publish_plan',
      publishArgs(nutrition),
    );
    expect(po.data).toMatchObject({ status: 'ok', revision_number: 1 });
    expect(await deliveryCount(workout)).toBe(1);
    expect(await deliveryCount(nutrition)).toBe(1);
    expect(await activationCount(byOwner)).toEqual({
      activations: 0,
      units: 0,
    });
    expect(await activationCount(byPo)).toEqual({ activations: 0, units: 0 });
  });

  it('refuses a non-Trainer completing publisher without writes, then a Trainer completes once', async () => {
    const client = await p.makeClient({ activate: false, label: 'complete' });
    const workout = await p.createDraft(client.clientId, 'workout', 'F22 cw');
    const nutrition = await p.createDraft(
      client.clientId,
      'nutrition',
      'F22 cn',
    );
    const first = await p.fixture.woA.client.rpc(
      'ready_and_publish_plan',
      publishArgs(workout),
    );
    expect(first.data).toMatchObject({ status: 'ok' });
    for (const actor of [p.fixture.woA, p.fixture.po]) {
      const refused = await actor.client.rpc(
        'ready_and_publish_plan',
        publishArgs(nutrition),
      );
      expect(refused.data).toEqual({ status: 'not_permitted' });
    }
    expect(await deliveryCount(nutrition)).toBe(0);
    expect(await activationCount(client)).toEqual({
      activations: 0,
      units: 0,
    });
    const completed = await p.fixture.trainerA.client.rpc(
      'ready_and_publish_plan',
      publishArgs(nutrition),
    );
    expect(completed.data).toMatchObject({ status: 'ok' });
    expect(await activationCount(client)).toEqual({
      activations: 1,
      units: 1,
    });
  });

  it('returns the original receipt for an exact retry and writes no second delivery', async () => {
    const client = await p.makeClient({ activate: false, label: 'retry' });
    const planId = await p.createDraft(
      client.clientId,
      'nutrition',
      'F22 retry',
    );
    const args = publishArgs(planId);
    const first = await p.fixture.trainerA.client.rpc(
      'ready_and_publish_plan',
      args,
    );
    const retry = await p.fixture.trainerA.client.rpc(
      'ready_and_publish_plan',
      args,
    );
    expect(first.data).toMatchObject({ status: 'ok' });
    expect(retry.data).toEqual(first.data);
    expect(await deliveryCount(planId)).toBe(1);
  });
});
