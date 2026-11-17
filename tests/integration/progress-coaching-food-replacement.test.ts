import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ALT_A,
  ALT_B,
  ALT_C,
  ALT_D,
  ITEM_NO_ALTS,
  ITEM_ONE_ALT,
  ITEM_THREE_ALTS,
  setupFoodReplacement,
  type FoodReplacementFixture,
} from './progress-coaching-food-replacement-fixture';

// Spec 023 T031 (FR-018, FR-019..FR-025, SC-007, SC-008) and T041 (FR-026, FR-028):
// free selection, request lifecycle, approval into an F19 draft within the max-3 cap,
// manual publish, stale-close, timeline projection, and the preserved F18 rules.

let x: FoodReplacementFixture;

beforeAll(async () => {
  x = await setupFoodReplacement();
});
afterAll(async () => x?.db.end());

const quantity = { value: '120', unit: { kind: 'basis', value: 'g' } };

async function submit(planVersionId: string, itemId: string, text: string) {
  return x.client.client.rpc('submit_food_replacement_request', {
    p_plan_version_id: planVersionId,
    p_item_id: itemId,
    p_request_text: text,
  });
}

async function approve(
  requestId: string,
  expectedDraftVersion: number,
  options: { replace?: string | null; key?: string; foodId?: string } = {},
) {
  return x.f.trainerA.client.rpc('approve_food_replacement_request', {
    p_request_id: requestId,
    p_food_id: options.foodId ?? x.foods.replacement,
    p_food_version: 1,
    p_quantity: quantity,
    p_replace_alternative_id: options.replace ?? null,
    p_expected_draft_version: expectedDraftVersion,
    p_operation_key: options.key ?? randomUUID(),
  });
}

async function requestRow(id: string) {
  const [row] = await x.db`
    select status, prepared_alternative_id, prepared_draft_version, resolved_at, resolved_by, request_text
    from public.food_replacement_requests where id = ${id}`;
  return row!;
}

async function draftAlternatives(planId: string, itemId: string) {
  const [row] = await x.db`
    select content from public.plan_drafts where plan_id = ${planId}`;
  const items = (
    row!.content as {
      meals: { items: { id: string; alternatives: { id: string }[] }[] }[];
    }
  ).meals.flatMap((meal) => meal.items);
  return items.find((item) => item.id === itemId)!.alternatives;
}

async function revisionCount(planId: string) {
  const [row] = await x.db`
    select count(*)::int as c from public.plan_revisions where plan_id = ${planId}`;
  return row!.c as number;
}

async function publishDraft(
  planId: string,
  draftVersion: number,
  publishedVersion: number,
) {
  const result = await x.f.trainerA.client.rpc('publish_nutrition_revision', {
    p_plan_id: planId,
    p_expected_draft_version: draftVersion,
    p_expected_published_version: publishedVersion,
    p_operation_key: randomUUID(),
  });
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({ status: 'ok' });
  return (result.data as { revision_id: string }).revision_id;
}

async function timelineTypes() {
  const result = await x.client.client.rpc('client_progress_timeline', {
    p_workspace_id: x.f.wsA.id,
    p_client_id: x.clientId,
  });
  expect(result.error).toBeNull();
  return (
    result.data as { events: { event_type: string; reference_id: string }[] }
  ).events;
}

describe('free selection of an existing alternative (FR-018)', () => {
  it('creates no request and no revision', async () => {
    const { planId, revisionId } = await x.publish(x.doc());
    const before = await revisionCount(planId);
    const selected = await x.client.client.rpc('select_nutrition_alternative', {
      p_plan_version_id: revisionId,
      p_item_id: ITEM_ONE_ALT,
      p_alternative_id: ALT_A,
      p_operation_key: randomUUID(),
    });
    expect(selected.error).toBeNull();
    expect(selected.data).toMatchObject({ status: 'ok', noop: false });
    const [requests] = await x.db`
      select count(*)::int as c from public.food_replacement_requests where plan_id = ${planId}`;
    expect(requests!.c).toBe(0);
    expect(await revisionCount(planId)).toBe(before);
  });
});

describe('request lifecycle (FR-019, FR-020, FR-021, FR-024, SC-008)', () => {
  it('opens one request per food, keeps alternatives visible, and audits ids only', async () => {
    const { planId, revisionId } = await x.publish(x.doc());
    const [beforeRow] = await x.db`
      select document from public.nutrition_plan_version_contents where revision_id = ${revisionId}`;
    await x.client.client.rpc('select_nutrition_alternative', {
      p_plan_version_id: revisionId,
      p_item_id: ITEM_ONE_ALT,
      p_alternative_id: ALT_A,
      p_operation_key: randomUUID(),
    });

    const text = 'Please add tuna as another option';
    const created = await submit(revisionId, ITEM_ONE_ALT, text);
    expect(created.error).toBeNull();
    expect(created.data).toMatchObject({ status: 'created' });
    const requestId = (created.data as { request_id: string }).request_id;

    const again = await submit(revisionId, ITEM_ONE_ALT, 'A second request');
    expect(again.data).toEqual({
      status: 'already_open',
      request_id: requestId,
    });
    const [open] = await x.db`
      select count(*)::int as c from public.food_replacement_requests
      where plan_id = ${planId} and item_id = ${ITEM_ONE_ALT} and status = 'open'`;
    expect(open!.c).toBe(1);

    // FR-024: the plan document and the client selection are untouched by a pending request.
    const [afterRow] = await x.db`
      select document from public.nutrition_plan_version_contents where revision_id = ${revisionId}`;
    expect(afterRow!.document).toEqual(beforeRow!.document);
    const [selection] = await x.db`
      select alternative_id from public.client_nutrition_alternative_selections
      where plan_version_id = ${revisionId} and item_id = ${ITEM_ONE_ALT}`;
    expect(selection!.alternative_id).toBe(ALT_A);
    expect(await revisionCount(planId)).toBe(1);

    const audit = await x.db`
      select details from public.audit_events
      where action = 'progress.food_replacement_opened' and target_id = ${requestId}`;
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0]!.details)).not.toContain(text);
    expect(audit[0]!.details).toMatchObject({
      client_id: x.clientId,
      item_id: ITEM_ONE_ALT,
      outcome: 'open',
    });
  });

  it('applies the F15 text limits and rejects unknown targets', async () => {
    const { revisionId } = await x.publish(x.doc());
    for (const text of ['', '   ', 'a'.repeat(1001)])
      expect((await submit(revisionId, ITEM_ONE_ALT, text)).data).toEqual({
        status: 'invalid',
      });
    expect((await submit(revisionId, 'not-a-uuid', 'ok')).data).toEqual({
      status: 'invalid',
    });
    expect((await submit(revisionId, randomUUID(), 'ok')).data).toEqual({
      status: 'invalid',
    });
    const exact = await submit(revisionId, ITEM_NO_ALTS, 'a'.repeat(1000));
    expect(exact.data).toMatchObject({ status: 'created' });
  });

  it('cancels an open request, allows a new one, and offers no text edit (FR-020)', async () => {
    const { revisionId } = await x.publish(x.doc());
    const first = await submit(revisionId, ITEM_ONE_ALT, 'First wording');
    const firstId = (first.data as { request_id: string }).request_id;
    const cancelled = await x.client.client.rpc(
      'cancel_food_replacement_request',
      {
        p_request_id: firstId,
      },
    );
    expect(cancelled.data).toEqual({ status: 'cancelled' });
    expect((await requestRow(firstId)).status).toBe('cancelled');
    expect(
      (
        await x.client.client.rpc('cancel_food_replacement_request', {
          p_request_id: firstId,
        })
      ).data,
    ).toEqual({ status: 'not_open' });

    const second = await submit(revisionId, ITEM_ONE_ALT, 'Second wording');
    expect(second.data).toMatchObject({ status: 'created' });
    expect((second.data as { request_id: string }).request_id).not.toBe(
      firstId,
    );
    // The original text can never change, even by the table owner.
    await expect(
      x.db`update public.food_replacement_requests set request_text = 'edited' where id = ${firstId}`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('refuses a request against a revision that is no longer the latest delivered one', async () => {
    const { planId, revisionId } = await x.publish(x.doc());
    // A second published revision makes the first stale for new requests.
    await x.f.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 1,
      p_content: x.doc('without-item-one'),
      p_operation_key: randomUUID(),
    });
    await publishDraft(planId, 2, 1);
    expect((await submit(revisionId, ITEM_ONE_ALT, 'late')).data).toEqual({
      status: 'stale_version',
    });
  });
});

describe('approval into a draft within the max-3 cap (FR-022, FR-023, SC-007)', () => {
  it('prepares a draft, never publishes, and closes as approved only after the manual publish', async () => {
    const { planId, revisionId } = await x.publish(x.doc());
    const created = await submit(revisionId, ITEM_ONE_ALT, 'Add tuna please');
    const requestId = (created.data as { request_id: string }).request_id;
    const key = randomUUID();

    const approved = await approve(requestId, 1, { key });
    expect(approved.error).toBeNull();
    expect(approved.data).toMatchObject({
      status: 'prepared',
      draft_version: 2,
    });
    const alternativeId = (approved.data as { alternative_id: string })
      .alternative_id;

    // No auto-publish: still one revision, the request is still open, the draft carries the alternative.
    expect(await revisionCount(planId)).toBe(1);
    const prepared = await requestRow(requestId);
    expect(prepared.status).toBe('open');
    expect(prepared.prepared_alternative_id).toBe(alternativeId);
    const draftAlts = await draftAlternatives(planId, ITEM_ONE_ALT);
    expect(draftAlts.map((a) => a.id)).toEqual([ALT_A, alternativeId]);

    // Exact replay is idempotent; a different approval of the same request is refused.
    const replay = await approve(requestId, 1, { key });
    expect(replay.data).toMatchObject({
      status: 'prepared',
      draft_version: 2,
      replay: true,
    });
    expect((await approve(requestId, 2)).data).toEqual({
      status: 'already_prepared',
    });

    // Manual Ready & Publish closes the request as approved-via-published-revision.
    const revision2 = await publishDraft(planId, 2, 1);
    const closed = await requestRow(requestId);
    expect(closed.status).toBe('approved');
    expect(closed.resolved_at).not.toBeNull();
    expect(closed.resolved_by).toBe(x.f.trainerA.userId);
    const [publishedRow] = await x.db`
      select document from public.nutrition_plan_version_contents where revision_id = ${revision2}`;
    const item = (
      publishedRow!.document as {
        meals: { items: { id: string; alternatives: { id: string }[] }[] }[];
      }
    ).meals[0]!.items.find((entry) => entry.id === ITEM_ONE_ALT)!;
    expect(item.alternatives.map((a) => a.id)).toEqual([ALT_A, alternativeId]);

    const events = await timelineTypes();
    expect(
      events
        .filter((e) => e.reference_id === requestId)
        .map((e) => e.event_type),
    ).toEqual(['replacementOpen', 'replacementApproved']);
  });

  it('never exceeds three alternatives: refuses a fourth and replaces in place when asked', async () => {
    const { planId, revisionId } = await x.publish(x.doc());
    const created = await submit(revisionId, ITEM_THREE_ALTS, 'Another option');
    const requestId = (created.data as { request_id: string }).request_id;

    expect((await approve(requestId, 1)).data).toEqual({
      status: 'cap_reached',
    });
    expect(
      (await approve(requestId, 1, { replace: randomUUID() })).data,
    ).toEqual({ status: 'invalid_replace' });
    // Refusals leave the draft untouched.
    expect(
      (await draftAlternatives(planId, ITEM_THREE_ALTS)).map((a) => a.id),
    ).toEqual([ALT_B, ALT_C, ALT_D]);
    const [draft] =
      await x.db`select draft_version from public.plan_drafts where plan_id = ${planId}`;
    expect(Number(draft!.draft_version)).toBe(1);

    const replaced = await approve(requestId, 1, { replace: ALT_C });
    expect(replaced.data).toMatchObject({ status: 'prepared' });
    const alternativeId = (replaced.data as { alternative_id: string })
      .alternative_id;
    expect(
      (await draftAlternatives(planId, ITEM_THREE_ALTS)).map((a) => a.id),
    ).toEqual([ALT_B, alternativeId, ALT_D]);
  });

  it('rejects an invalid alternative food and a stale draft version without changing the draft', async () => {
    const { planId, revisionId } = await x.publish(x.doc());
    const created = await submit(revisionId, ITEM_NO_ALTS, 'Something else');
    const requestId = (created.data as { request_id: string }).request_id;
    expect(
      (await approve(requestId, 1, { foodId: randomUUID() })).data,
    ).toEqual({
      status: 'invalid_alternative',
    });
    expect((await approve(requestId, 7)).data).toMatchObject({
      status: 'stale_version',
    });
    expect(await draftAlternatives(planId, ITEM_NO_ALTS)).toEqual([]);
    expect((await requestRow(requestId)).prepared_alternative_id).toBeNull();
  });

  it('clears a stale preparation when the published revision omits the alternative', async () => {
    const { planId, revisionId } = await x.publish(x.doc());
    const created = await submit(revisionId, ITEM_NO_ALTS, 'Option please');
    const requestId = (created.data as { request_id: string }).request_id;
    await approve(requestId, 1);
    // The trainer drops the prepared alternative from the draft and publishes.
    const saved = await x.f.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 2,
      p_content: x.doc(),
      p_operation_key: randomUUID(),
    });
    expect(saved.error).toBeNull();
    await publishDraft(planId, 3, 1);
    const row = await requestRow(requestId);
    expect(row.status).toBe('open');
    expect(row.prepared_alternative_id).toBeNull();
  });
});

describe('rejection and stale-close (FR-025, FR-027)', () => {
  it('rejects an open request once and lets the client ask again', async () => {
    const { revisionId } = await x.publish(x.doc());
    const created = await submit(revisionId, ITEM_ONE_ALT, 'Please');
    const requestId = (created.data as { request_id: string }).request_id;
    const rejected = await x.f.trainerA.client.rpc(
      'reject_food_replacement_request',
      {
        p_request_id: requestId,
      },
    );
    expect(rejected.data).toEqual({ status: 'rejected' });
    expect(
      (
        await x.f.trainerA.client.rpc('reject_food_replacement_request', {
          p_request_id: requestId,
        })
      ).data,
    ).toEqual({ status: 'not_open' });
    expect(
      (await submit(revisionId, ITEM_ONE_ALT, 'Again')).data,
    ).toMatchObject({
      status: 'created',
    });
    expect(
      (await timelineTypes())
        .filter((e) => e.reference_id === requestId)
        .map((e) => e.event_type),
    ).toEqual(['replacementOpen', 'replacementRejected']);
  });

  it('closes an open request as stale when a newer published revision removes the food', async () => {
    const { planId, revisionId } = await x.publish(x.doc());
    const created = await submit(
      revisionId,
      ITEM_ONE_ALT,
      'About the first item',
    );
    const requestId = (created.data as { request_id: string }).request_id;
    const saved = await x.f.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 1,
      p_content: x.doc('without-item-one'),
      p_operation_key: randomUUID(),
    });
    expect(saved.error).toBeNull();
    await publishDraft(planId, 2, 1);
    const row = await requestRow(requestId);
    expect(row.status).toBe('stale_closed');
    expect(row.resolved_at).not.toBeNull();
    expect(
      (await timelineTypes())
        .filter((e) => e.reference_id === requestId)
        .map((e) => e.event_type),
    ).toEqual(['replacementOpen', 'replacementStale']);
    // Nothing stays open for this plan after the stale-close.
    const [open] = await x.db`
      select count(*)::int as c from public.food_replacement_requests
      where plan_id = ${planId} and status = 'open'`;
    expect(open!.c).toBe(0);
  });

  it('does not close an unrelated request that still has its food (no false stale)', async () => {
    const { planId, revisionId } = await x.publish(x.doc());
    const created = await submit(revisionId, ITEM_NO_ALTS, 'Keep this open');
    const requestId = (created.data as { request_id: string }).request_id;
    await x.f.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 1,
      p_content: x.doc('without-item-one'),
      p_operation_key: randomUUID(),
    });
    await publishDraft(planId, 2, 1);
    expect((await requestRow(requestId)).status).toBe('open');
  });
});

describe('F18 mapping and fallback preserved, no SLA escalation (FR-026, FR-028, T041)', () => {
  it('keeps untouched items and selections, recomputes totals only through F18 publish, and schedules no alerts', async () => {
    const countAlerts = async () => {
      const [row] = await x.db`
        select (select count(*) from app_private.form_alert_schedules)::int as schedules,
               (select count(*) from app_private.form_alert_occurrences)::int as occurrences`;
      return row;
    };
    const alertsBefore = await countAlerts();
    const { planId, revisionId } = await x.publish(x.doc());
    const [baseline] = await x.db`
      select computed_values, snapshot_map from public.nutrition_plan_version_contents
      where revision_id = ${revisionId}`;
    // The client keeps a selection on an item the approval does not touch.
    await x.client.client.rpc('select_nutrition_alternative', {
      p_plan_version_id: revisionId,
      p_item_id: ITEM_THREE_ALTS,
      p_alternative_id: ALT_B,
      p_operation_key: randomUUID(),
    });
    const created = await submit(revisionId, ITEM_ONE_ALT, 'Tuna option');
    const requestId = (created.data as { request_id: string }).request_id;
    await approve(requestId, 1);

    // Until publish, the published revision is bit-for-bit unchanged.
    const [unchanged] = await x.db`
      select computed_values, snapshot_map from public.nutrition_plan_version_contents
      where revision_id = ${revisionId}`;
    expect(unchanged!.computed_values).toEqual(baseline!.computed_values);
    expect(unchanged!.snapshot_map).toEqual(baseline!.snapshot_map);

    const revision2 = await publishDraft(planId, 2, 1);
    const [published] = await x.db`
      select snapshot_map, document from public.nutrition_plan_version_contents
      where revision_id = ${revision2}`;
    // Every food reference of the previous revision stays in the new snapshot map (F18 mapping).
    for (const key of Object.keys(baseline!.snapshot_map as object))
      expect(Object.keys(published!.snapshot_map as object)).toContain(key);
    // F18 carry-forward keeps the selection on the untouched item (fallback rules stay F18's).
    const [carried] = await x.db`
      select alternative_id from public.client_nutrition_alternative_selections
      where plan_version_id = ${revision2} and item_id = ${ITEM_THREE_ALTS}`;
    expect(carried?.alternative_id).toBe(ALT_B);

    expect(await countAlerts()).toEqual(alertsBefore);
  });
});
