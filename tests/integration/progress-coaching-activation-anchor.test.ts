import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientContext, graph, sql } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';
import { seedSubmittedIntake } from './f17-plan-publish-fixture';

// Spec 023 T009/T013 on the real F19 T021 path: the weekly check-in anchor is the
// client's first activation, which ready_and_publish_plan now writes atomically when
// the first workout/nutrition pair is delivered (activation_source plan_deliveries).

let db: ReturnType<typeof sql>;

beforeAll(async () => {
  db = sql();
});
afterAll(async () => db?.end());

// F17 workout document (schema_version 1) with no days.
const workoutContent = { schema_version: 1, days: [], notes: 'F23 workout' };
// Minimal valid F18 document (no meals, so no catalog food is needed).
const nutritionDocument = {
  schemaVersion: 1,
  structure: 'single_day',
  implicitDayTypeId: 'dt-1',
  dayTypes: [
    {
      id: 'dt-1',
      name: { ar: 'يوم', en: 'Day' },
      trainingDay: true,
      targets: null,
    },
  ],
  meals: [],
  title: { ar: 'خطة', en: 'F23 nutrition' },
  notes: null,
};

async function deliver(
  client: Context['trainerA']['client'],
  workspaceId: string,
  clientId: string,
  kind: 'workout' | 'nutrition',
) {
  const created = await client.rpc('create_plan_draft', {
    p_workspace_id: workspaceId,
    p_client_id: clientId,
    p_plan_kind: kind,
    p_content: kind === 'nutrition' ? nutritionDocument : workoutContent,
    p_operation_key: randomUUID(),
  });
  if (created.error || typeof created.data !== 'string')
    throw new Error(
      `Plan draft failed: ${created.error?.code ?? 'missing id'}`,
    );
  // F18: nutrition revisions publish only through publish_nutrition_revision; the generic
  // ready_and_publish_plan refuses nutrition plans.
  return client.rpc(
    kind === 'nutrition'
      ? 'publish_nutrition_revision'
      : 'ready_and_publish_plan',
    {
      p_plan_id: created.data,
      p_expected_draft_version: 1,
      p_expected_published_version: 0,
      p_operation_key: randomUUID(),
    },
  );
}

describe('spec 023 first-activation check-in anchor (F19 T021)', () => {
  it('anchors the 7-day cycle on the activation written by the completing first delivery', async () => {
    const context = await clientContext();
    const seeded = await db.begin((tx) => graph(tx, context));
    const ws = context.wsA.id;

    // One delivery kind alone does not activate, so no check-in can be due yet.
    const first = await deliver(
      context.trainerA.client,
      ws,
      seeded.client,
      'nutrition',
    );
    expect(first.data).toMatchObject({ status: 'ok' });
    const [pending] = await db`select
      app_private.f23_client_checkin_anchor(${ws},${seeded.client}) as anchor`;
    expect(pending!.anchor).toBeNull();

    // F17 gate: a workout delivery requires a submitted F15 intake for the client.
    await db.begin((tx) => seedSubmittedIntake(tx, ws, seeded.client));
    const completing = await deliver(
      context.trainerA.client,
      ws,
      seeded.client,
      'workout',
    );
    expect(completing.data).toMatchObject({ status: 'ok' });
    const [activation] = await db`
      select a.activation_source,
        (a.activated_at at time zone 'Africa/Cairo')::date::text as activated_on,
        app_private.f23_client_checkin_anchor(${ws},${seeded.client})::text as anchor
      from public.subscription_activations a
      where a.workspace_id=${ws} and a.subscription_id=${seeded.subscription}`;
    expect(activation!.activation_source).toBe('plan_deliveries');
    expect(activation!.anchor).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(activation!.anchor).toBe(activation!.activated_on);

    // FR-001: first check-in on day 7, then every 7 days; nothing on other days.
    const anchor = activation!.anchor as string;
    const [days] = await db`select
      app_private.f23_checkin_due_index(${ws},${seeded.client},${anchor}::date) as day0,
      app_private.f23_checkin_due_index(${ws},${seeded.client},${anchor}::date + 6) as day6,
      app_private.f23_checkin_due_index(${ws},${seeded.client},${anchor}::date + 7) as day7,
      app_private.f23_checkin_due_index(${ws},${seeded.client},${anchor}::date + 13) as day13,
      app_private.f23_checkin_due_index(${ws},${seeded.client},${anchor}::date + 14) as day14`;
    expect(days).toEqual({
      day0: null,
      day6: null,
      day7: 1,
      day13: null,
      day14: 2,
    });

    // FR-029: both first deliveries appear once on the timeline for coaching staff.
    const timeline = await context.trainerA.client.rpc(
      'client_progress_timeline',
      { p_workspace_id: ws, p_client_id: seeded.client },
    );
    expect(timeline.error).toBeNull();
    const events = (
      timeline.data as { events: { event_type: string; plan_kind: string }[] }
    ).events
      .filter((event) => event.event_type === 'firstDelivery')
      .map((event) => event.plan_kind)
      .sort();
    expect(events).toEqual(['nutrition', 'workout']);

    // Foreign-workspace and Sales sessions cannot read the anchored client's timeline.
    for (const client of [context.trainerB.client, context.salesA.client]) {
      const denied = await client.rpc('client_progress_timeline', {
        p_workspace_id: ws,
        p_client_id: seeded.client,
      });
      expect(denied.error?.code).toBe('42501');
    }
  });
});
