import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readyAndPublishPlan } from '../../lib/plans/ready-and-publish';
import {
  clientRead,
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

// F22 T007 (FR-001, FR-002, FR-003; SC-001..SC-003): first-plan delivery through
// the F22 Ready & Publish adapter consumes the F19 T021 activation transaction
// unchanged, and the F22 client portal reflects the activation on the next read.
// F19's own suite (f19-plan-activation.test.ts) owns rollback and legacy cases.
let p: PortalFixture;

beforeAll(async () => {
  p = await portalFixture();
});
afterAll(async () => p?.close());

/** The F22 adapter routed by the kind of the plan made by the fixture. */
function publishVia(
  client: Parameters<typeof readyAndPublishPlan>[0],
  request: ReturnType<typeof publishRequest>,
) {
  return readyAndPublishPlan(client, request, p.planKind(request.planId));
}

async function counts(client: PortalClient) {
  const [row] = await p.db`
    select
      (select count(*)::int from public.plan_deliveries
        where workspace_id=${p.fixture.wsA.id} and client_id=${client.clientId}) as deliveries,
      (select count(*)::int from public.subscription_activations
        where workspace_id=${p.fixture.wsA.id} and subscription_id=${client.subscriptionId}) as activations,
      (select count(*)::int from public.productivity_units
        where workspace_id=${p.fixture.wsA.id} and client_id=${client.clientId}) as units`;
  return row!;
}

function publishRequest(planId: string, operationKey = randomUUID()) {
  return {
    planId,
    expectedDraftVersion: 1,
    expectedPublishedRevision: 0,
    operationKey,
  };
}

describe('F22 first-plan delivery and activation (T007)', () => {
  it('delivers each first plan independently and activates once on the completing delivery', async () => {
    const client = await p.makeClient({ activate: false, label: 'split' });
    const workout = await p.createDraft(client.clientId, 'workout', 'F22 w');
    const first = await publishVia(
      p.fixture.trainerA.client,
      publishRequest(workout),
    );
    expect(first).toMatchObject({ status: 'ok' });
    expect(await counts(client)).toEqual({
      deliveries: 1,
      activations: 0,
      units: 0,
    });
    // One delivery does not activate: the portal stays restricted.
    expect(await clientRead(p.db, client.authUserId, 'overview')).toEqual({
      status: 'restricted',
      subscription: {
        status: 'awaiting_activation',
        effective_end_exclusive: null,
        overdue: false,
      },
    });

    const nutrition = await p.createDraft(
      client.clientId,
      'nutrition',
      'F22 n',
    );
    const completing = await publishVia(
      p.fixture.trainerA.client,
      publishRequest(nutrition),
    );
    expect(completing).toMatchObject({ status: 'ok' });
    expect(await counts(client)).toEqual({
      deliveries: 2,
      activations: 1,
      units: 1,
    });
    const [activation] = await p.db`
      select a.activation_source, u.recipient_trainer_user_id
      from public.subscription_activations a
      join public.productivity_units u
        on u.workspace_id=a.workspace_id and u.activation_id=a.id
      where a.workspace_id=${p.fixture.wsA.id} and a.subscription_id=${client.subscriptionId}`;
    expect(activation).toEqual({
      activation_source: 'plan_deliveries',
      recipient_trainer_user_id: p.fixture.trainerA.userId,
    });

    // The next portal read reflects the F13 activation and lists both plans.
    const overview = await clientRead(p.db, client.authUserId, 'overview');
    expect(overview.status).toBe('ok');
    expect(overview.subscription).toMatchObject({ status: 'active' });
    expect(
      (overview.subscription as { effective_end_exclusive: unknown })
        .effective_end_exclusive,
    ).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(
      (overview.plans as Array<{ plan_id: string }>)
        .map((plan) => plan.plan_id)
        .sort(),
    ).toEqual([workout, nutrition].sort());
    // No activation, delivery or unit internals reach the client.
    const serialized = JSON.stringify(overview);
    for (const hidden of [
      'activation',
      'delivery',
      'subscription_id',
      p.fixture.trainerA.userId,
    ])
      expect(serialized).not.toContain(hidden);
  });

  it('replays a lost completing response and concurrent duplicates without a second delivery, activation or unit', async () => {
    const client = await p.makeClient({ activate: false, label: 'replay' });
    const workout = await p.createDraft(client.clientId, 'workout', 'F22 rw');
    await publishVia(p.fixture.trainerA.client, publishRequest(workout));
    const nutrition = await p.createDraft(
      client.clientId,
      'nutrition',
      'F22 rn',
    );
    const request = publishRequest(nutrition);
    const concurrent = await Promise.all([
      publishVia(p.fixture.trainerA.client, request),
      publishVia(p.fixture.trainerA.client, request),
    ]);
    const ok = concurrent.filter((result) => result.status === 'ok');
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const result of concurrent)
      expect(['ok', 'unavailable']).toContain(result.status);
    const retried = await publishVia(p.fixture.trainerA.client, request);
    expect(retried).toEqual(ok[0]);
    expect(await counts(client)).toEqual({
      deliveries: 2,
      activations: 1,
      units: 1,
    });
  });

  it('adds no activation or unit for a later revision of a delivered first plan', async () => {
    const client = await p.makeClient({ activate: false, label: 'later' });
    const workout = await p.createDraft(client.clientId, 'workout', 'F22 lw');
    await publishVia(p.fixture.trainerA.client, publishRequest(workout));
    const nutrition = await p.createDraft(
      client.clientId,
      'nutrition',
      'F22 ln',
    );
    await publishVia(p.fixture.trainerA.client, publishRequest(nutrition));
    const draftVersion = await p.revise(workout, 1, 'F22 lw2');
    const later = await publishVia(p.fixture.trainerA.client, {
      planId: workout,
      expectedDraftVersion: draftVersion,
      expectedPublishedRevision: 1,
      operationKey: randomUUID(),
    });
    expect(later).toMatchObject({
      status: 'ok',
      receipt: { revisionNumber: 2 },
    });
    expect(await counts(client)).toEqual({
      deliveries: 3,
      activations: 1,
      units: 1,
    });
  });

  it('PO override gives an eligible new client its one unit; later deliveries add none (US1 #4, S57-PO-11)', async () => {
    const client = await p.makeClient({ activate: false, label: 'override' });
    const overridden = await p.fixture.po.client.rpc(
      'override_activate_subscription',
      {
        p_workspace_id: p.fixture.wsA.id,
        p_subscription_id: client.subscriptionId,
        p_recipient_trainer_user_id: p.fixture.trainerA.userId,
        p_operation_key: randomUUID(),
      },
    );
    expect(overridden.error).toBeNull();
    expect(overridden.data).toMatchObject({
      status: 'ok',
      activation_source: 'po_override',
    });
    expect(await counts(client)).toEqual({
      deliveries: 0,
      activations: 1,
      units: 1,
    });
    // The portal reflects the override activation on the next read.
    const overview = await clientRead(p.db, client.authUserId, 'overview');
    expect(overview).toMatchObject({
      status: 'ok',
      subscription: { status: 'active' },
      plans: [],
    });
    for (const kind of ['workout', 'nutrition'] as const) {
      const plan = await p.createDraft(client.clientId, kind, `F22 o ${kind}`);
      expect(
        await publishVia(p.fixture.trainerA.client, publishRequest(plan)),
      ).toMatchObject({ status: 'ok' });
    }
    expect(await counts(client)).toEqual({
      deliveries: 2,
      activations: 1,
      units: 1,
    });
  });
});
