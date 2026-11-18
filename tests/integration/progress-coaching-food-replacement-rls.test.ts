import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient } from './harness';
import {
  ITEM_ONE_ALT,
  setupFoodReplacement,
  type FoodReplacementFixture,
} from './progress-coaching-food-replacement-fixture';

// Spec 023 T032 (FR-019, FR-020, constitution I): two-wall authorization for every
// food replacement read and write, across roles and workspaces. A denial is the same
// for a foreign, unknown or unauthorized caller.

let x: FoodReplacementFixture;
let revisionId: string;
let requestId: string;

beforeAll(async () => {
  x = await setupFoodReplacement();
  ({ revisionId } = await x.publish(x.doc()));
  const created = await x.client.client.rpc('submit_food_replacement_request', {
    p_plan_version_id: revisionId,
    p_item_id: ITEM_ONE_ALT,
    p_request_text: 'RLS probe request',
  });
  expect(created.data).toMatchObject({ status: 'created' });
  requestId = (created.data as { request_id: string }).request_id;
});
afterAll(async () => x?.db.end());

const approveArgs = () => ({
  p_request_id: requestId,
  p_food_id: x.foods.replacement,
  p_food_version: 1,
  p_quantity: { value: '120', unit: { kind: 'basis', value: 'g' } },
  p_replace_alternative_id: null,
  p_expected_draft_version: 1,
  p_operation_key: randomUUID(),
});

async function stillOpenAndUntouched() {
  const [row] = await x.db`
    select status, prepared_alternative_id from public.food_replacement_requests where id = ${requestId}`;
  expect(row).toMatchObject({ status: 'open', prepared_alternative_id: null });
}

describe('reads (RLS)', () => {
  it('lets the owning client, the workspace trainer and the owner read the request', async () => {
    for (const actor of [
      x.client.client,
      x.f.trainerA.client,
      x.f.woA.client,
    ]) {
      const { data, error } = await actor
        .from('food_replacement_requests')
        .select('id, status')
        .eq('id', requestId);
      expect(error).toBeNull();
      expect(data).toEqual([{ id: requestId, status: 'open' }]);
    }
  });

  it('hides it from another client, Sales and a foreign-workspace trainer', async () => {
    for (const actor of [
      x.otherClient.client,
      x.f.salesA.client,
      x.f.trainerB.client,
    ]) {
      const { data, error } = await actor
        .from('food_replacement_requests')
        .select('id')
        .eq('id', requestId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it('denies an anonymous caller', async () => {
    const { data, error } = await anonClient()
      .from('food_replacement_requests')
      .select('id')
      .eq('id', requestId);
    expect(error ?? data?.length === 0).toBeTruthy();
    expect(data ?? []).toEqual([]);
  });
});

describe('direct writes are not granted to anyone', () => {
  it('refuses insert, update and delete through the API for every role', async () => {
    for (const actor of [
      x.client.client,
      x.f.trainerA.client,
      x.f.woA.client,
      x.f.salesA.client,
      x.f.trainerB.client,
    ]) {
      const insert = await actor.from('food_replacement_requests').insert({
        workspace_id: x.f.wsA.id,
        client_id: x.clientId,
        plan_id: randomUUID(),
        plan_version_id: revisionId,
        item_id: ITEM_ONE_ALT,
        request_text: 'forged',
        requested_by: x.client.authUserId,
      });
      expect(insert.error).not.toBeNull();
      const update = await actor
        .from('food_replacement_requests')
        .update({ status: 'approved' })
        .eq('id', requestId);
      expect(update.error).not.toBeNull();
      const del = await actor
        .from('food_replacement_requests')
        .delete()
        .eq('id', requestId);
      expect(del.error).not.toBeNull();
    }
    await stillOpenAndUntouched();
  });
});

describe('operations (app wall plus database wall)', () => {
  it('denies submit to staff, another client and a foreign-workspace trainer', async () => {
    for (const actor of [
      x.f.trainerA.client,
      x.f.woA.client,
      x.f.salesA.client,
      x.f.trainerB.client,
      x.otherClient.client,
    ]) {
      const result = await actor.rpc('submit_food_replacement_request', {
        p_plan_version_id: revisionId,
        p_item_id: ITEM_ONE_ALT,
        p_request_text: 'not mine',
      });
      expect(result.error?.code).toBe('42501');
    }
    const anon = await anonClient().rpc('submit_food_replacement_request', {
      p_plan_version_id: revisionId,
      p_item_id: ITEM_ONE_ALT,
      p_request_text: 'anonymous',
    });
    expect(anon.error).not.toBeNull();
  });

  it('denies cancel to another client, staff and a foreign-workspace trainer', async () => {
    for (const actor of [
      x.otherClient.client,
      x.f.trainerA.client,
      x.f.salesA.client,
      x.f.trainerB.client,
    ]) {
      const result = await actor.rpc('cancel_food_replacement_request', {
        p_request_id: requestId,
      });
      expect(result.error?.code).toBe('42501');
    }
    // An unknown id is indistinguishable from a foreign one.
    const unknown = await x.client.client.rpc(
      'cancel_food_replacement_request',
      {
        p_request_id: randomUUID(),
      },
    );
    expect(unknown.error?.code).toBe('42501');
    await stillOpenAndUntouched();
  });

  it('denies reject and approve to clients, Sales and a foreign-workspace trainer', async () => {
    for (const actor of [
      x.client.client,
      x.otherClient.client,
      x.f.salesA.client,
      x.f.trainerB.client,
    ]) {
      const rejected = await actor.rpc('reject_food_replacement_request', {
        p_request_id: requestId,
      });
      expect(rejected.error?.code).toBe('42501');
      const approved = await actor.rpc(
        'approve_food_replacement_request',
        approveArgs(),
      );
      expect(approved.error?.code).toBe('42501');
    }
    const unknown = await x.f.trainerA.client.rpc(
      'reject_food_replacement_request',
      {
        p_request_id: randomUUID(),
      },
    );
    expect(unknown.error?.code).toBe('42501');
    await stillOpenAndUntouched();
    // No draft was touched by the denied approvals.
    const [draft] = await x.db`
      select draft_version from public.plan_drafts
      where plan_id = (select plan_id from public.food_replacement_requests where id = ${requestId})`;
    expect(Number(draft!.draft_version)).toBe(1);
  });

  it('denies the free-text selection to a foreign client at the F18 wall and writes no request', async () => {
    const result = await x.otherClient.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revisionId,
        p_item_id: ITEM_ONE_ALT,
        p_alternative_id: null,
        p_operation_key: randomUUID(),
      },
    );
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ status: 'not_permitted' });
  });

  it('does not expose request text or ids in the audit log', async () => {
    const rows = await x.db`
      select details from public.audit_events
      where action like 'progress.food_replacement_%' and target_id = ${requestId}`;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows)
      expect(JSON.stringify(row.details)).not.toContain('RLS probe request');
  });
});

describe('timeline wall for the new events', () => {
  it('shows the events to the client and trainer, and denies Sales and foreign staff', async () => {
    const args = { p_workspace_id: x.f.wsA.id, p_client_id: x.clientId };
    for (const actor of [x.client.client, x.f.trainerA.client]) {
      const result = await actor.rpc('client_progress_timeline', args);
      expect(result.error).toBeNull();
      expect(
        (result.data as { events: { event_type: string }[] }).events.map(
          (event) => event.event_type,
        ),
      ).toContain('replacementOpen');
    }
    for (const actor of [
      x.f.salesA.client,
      x.f.trainerB.client,
      x.otherClient.client,
    ])
      expect(
        (await actor.rpc('client_progress_timeline', args)).error?.code,
      ).toBe('42501');
  });
});
