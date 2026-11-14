import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient } from './harness';
import { probe } from './registration-approval-fixture';
import {
  asUser,
  clientRead,
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

// F22 T013/T014 (FR-004..FR-007, FR-010; SC-004..SC-006). Synthetic data only.
let p: PortalFixture;
let active: PortalClient;
let unactivated: PortalClient;
let other: PortalClient;
let workoutPlan: string;
let nutritionPlan: string;
let draftPlan: string;
let unactivatedPlan: string;
let otherPlan: string;

beforeAll(async () => {
  p = await portalFixture();
  active = await p.makeClient({ activate: true, label: 'active' });
  unactivated = await p.makeClient({ activate: false, label: 'awaiting' });
  other = await p.makeClient({ activate: true, label: 'other' });

  workoutPlan = await p.createDraft(active.clientId, 'workout', 'F22 rev 1');
  await p.publish(workoutPlan, 1, 0);
  await p.revise(workoutPlan, 1, 'F22 rev 2');
  await p.publish(workoutPlan, 2, 1);
  nutritionPlan = await p.createDraft(active.clientId, 'nutrition', 'F22 n1');
  await p.publish(nutritionPlan, 1, 0);
  draftPlan = await p.createDraft(active.clientId, 'nutrition', 'F22 draft');
  unactivatedPlan = await p.createDraft(
    unactivated.clientId,
    'workout',
    'F22 u',
  );
  await p.publish(unactivatedPlan, 1, 0);
  otherPlan = await p.createDraft(other.clientId, 'workout', 'F22 other');
  await p.publish(otherPlan, 1, 0);
});
afterAll(async () => p?.close());

describe('F22 client portal projection (T013)', () => {
  it('lists every own delivered plan once at its latest revision, excluding drafts', async () => {
    const overview = await clientRead(p.db, active.authUserId, 'overview');
    expect(overview.status).toBe('ok');
    const plans = overview.plans as Array<Record<string, unknown>>;
    expect(plans.map((plan) => plan.plan_id).sort()).toEqual(
      [workoutPlan, nutritionPlan].sort(),
    );
    expect(plans.find((plan) => plan.plan_id === workoutPlan)).toMatchObject({
      plan_kind: 'workout',
      revision_number: 2,
    });
    const ids = JSON.stringify(overview);
    expect(ids).not.toContain(draftPlan);
    expect(ids).not.toContain(otherPlan);
    expect(ids).not.toContain(unactivatedPlan);
    expect(overview.subscription).toMatchObject({ status: 'active' });
    expect(
      (overview.subscription as { effective_end_exclusive: string })
        .effective_end_exclusive,
    ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // No internal or staff-only identifiers leave the boundary.
    expect(ids).not.toContain(active.subscriptionId);
    expect(ids).not.toContain(p.fixture.trainerA.userId);
    expect(ids).not.toContain('delivery_id');
    expect(ids).not.toContain('content');
  });

  it('selects the latest revision by default and any other delivered revision on request', async () => {
    const latest = await clientRead(p.db, active.authUserId, {
      planId: workoutPlan,
      revision: null,
    });
    expect(latest).toMatchObject({
      status: 'ok',
      plan: {
        plan_id: workoutPlan,
        revision_number: 2,
        content: { document: { title: 'F22 rev 2' } },
      },
    });
    expect(
      (latest.revisions as Array<{ revision_number: number }>).map(
        (r) => r.revision_number,
      ),
    ).toEqual([2, 1]);
    const older = await clientRead(p.db, active.authUserId, {
      planId: workoutPlan,
      revision: 1,
    });
    expect(older).toMatchObject({
      status: 'ok',
      plan: {
        revision_number: 1,
        content: { document: { title: 'F22 rev 1' } },
      },
    });
    expect(JSON.stringify(older)).not.toContain(p.fixture.trainerA.userId);
  });

  it('returns one generic not_found for unknown revisions, drafts, foreign and random plans', async () => {
    for (const call of [
      { planId: workoutPlan, revision: 3 },
      { planId: draftPlan, revision: null },
      { planId: otherPlan, revision: null },
      { planId: unactivatedPlan, revision: null },
      { planId: randomUUID(), revision: null },
    ])
      expect(
        await clientRead(p.db, active.authUserId, call),
        JSON.stringify(call),
      ).toEqual({ status: 'not_found' });
  });

  it('keeps clients separate: another client never sees these plans', async () => {
    const overview = await clientRead(p.db, other.authUserId, 'overview');
    expect(overview.status).toBe('ok');
    expect(
      (overview.plans as Array<{ plan_id: string }>).map((x) => x.plan_id),
    ).toEqual([otherPlan]);
  });
});

describe('F22 F13 entitlement and restricted projection (T013/T015)', () => {
  it('hides delivered plans and exposes only status/end date while F13 is not active', async () => {
    const overview = await clientRead(p.db, unactivated.authUserId, 'overview');
    expect(overview).toEqual({
      status: 'restricted',
      subscription: {
        status: 'awaiting_activation',
        effective_end_exclusive: null,
      },
    });
    const plan = await clientRead(p.db, unactivated.authUserId, {
      planId: unactivatedPlan,
      revision: null,
    });
    expect(plan).toEqual(overview);
  });

  it('re-evaluates entitlement on each read: a freeze restricts plan content immediately', async () => {
    await probe(async (tx) => {
      const applied = await asUser(
        tx,
        p.fixture.trainerA.userId,
        async (inner) => {
          const [row] =
            await inner`select public.subscription_freeze_operation(${inner.json(
              {
                action: 'apply',
                workspace_id: p.fixture.wsA.id,
                client_id: active.clientId,
                subscription_id: active.subscriptionId,
                duration_days: 5,
                expected_revision: 0,
                request_key: randomUUID(),
              },
            )}) as receipt`;
          return row!.receipt as { status: string };
        },
      );
      expect(applied.status).toBe('applied');
      const read = await asUser(tx, active.authUserId, async (inner) => {
        const [row] =
          await inner`select public.client_portal_plan(${workoutPlan}::uuid,null::integer) as value`;
        return row!.value as Record<string, unknown>;
      });
      expect(read).toMatchObject({
        status: 'restricted',
        subscription: { status: 'frozen' },
      });
      expect(Object.keys(read).sort()).toEqual(['status', 'subscription']);
    });
  });
});

describe('F22 plan read authorization across roles (T014)', () => {
  it('gives staff, Platform Owner and anonymous callers no client projection', async () => {
    for (const staff of [
      p.fixture.trainerA,
      p.fixture.woA,
      p.fixture.salesA,
      p.fixture.po,
      p.fixture.trainerB,
    ]) {
      const overview = await staff.client.rpc('client_portal_overview');
      expect(overview.error).toBeNull();
      expect(overview.data).toEqual({ status: 'invalid' });
      const plan = await staff.client.rpc('client_portal_plan', {
        p_plan_id: workoutPlan,
        p_revision_number: null,
      });
      expect(plan.data).toEqual({ status: 'invalid' });
    }
    const anon = await anonClient().rpc('client_portal_overview');
    expect(anon.data ?? null).toBeNull();
    expect(anon.error).not.toBeNull();
  });
});
