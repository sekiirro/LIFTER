import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient } from './harness';
import {
  asUser,
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

// F22 T008 (FR-001, FR-010): staff Ready & Publish through F19 across roles and
// workspaces. Activation/productivity (FR-002/FR-003) stay BLOCKED on F19 T021.
let p: PortalFixture;
let client: PortalClient;

beforeAll(async () => {
  p = await portalFixture();
  client = await p.makeClient({ activate: false, label: 'publish auth' });
});
afterAll(async () => p?.close());

const publishArgs = (planId: string) => ({
  p_plan_id: planId,
  p_expected_draft_version: 1,
  p_expected_published_version: 0,
  p_operation_key: randomUUID(),
});

async function deliveryCount(planId: string) {
  const [row] =
    await p.db`select count(*)::int as count from public.plan_deliveries where plan_id=${planId}`;
  return row!.count as number;
}

describe('F22 Ready & Publish authorization (T008)', () => {
  it('refuses Sales, foreign-workspace staff, clients and anonymous callers without writes', async () => {
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
  });

  it('delivers once for Workspace Owner and Platform Owner and is independent per kind', async () => {
    const workout = await p.createDraft(client.clientId, 'workout', 'F22 wo');
    const nutrition = await p.createDraft(
      client.clientId,
      'nutrition',
      'F22 po',
    );
    const byOwner = await p.fixture.woA.client.rpc(
      'ready_and_publish_plan',
      publishArgs(workout),
    );
    expect(byOwner.data).toMatchObject({ status: 'ok', revision_number: 1 });
    expect(await deliveryCount(workout)).toBe(1);
    expect(await deliveryCount(nutrition)).toBe(0);
    const byPo = await p.fixture.po.client.rpc(
      'ready_and_publish_plan',
      publishArgs(nutrition),
    );
    expect(byPo.data).toMatchObject({ status: 'ok', revision_number: 1 });
    expect(await deliveryCount(nutrition)).toBe(1);
  });

  it('returns the original receipt for an exact retry and writes no second delivery', async () => {
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
