import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  computeDocumentValues,
  snapshotMapKey,
  type NutritionSnapshotMap,
} from '../../lib/plans/nutrition/macros';
import type { NutritionDocumentV1 } from '../../lib/plans/nutrition/types';
import { clientContext, graph, sql } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';

let fixture: Context;
let db: ReturnType<typeof sql>;
let seeded: Awaited<ReturnType<typeof graph>>;
let foodId: string;

beforeAll(async () => {
  fixture = await clientContext();
  db = sql();
  seeded = await db.begin(async (tx) => {
    const g = await graph(tx, fixture);
    foodId = randomUUID();
    await tx`
      insert into public.foods (id, created_by, current_version)
      values (${foodId}, ${fixture.trainerA.userId}, 1)
    `;
    await tx`
      insert into public.food_versions (
        food_id, version, payload, created_by, name_ar, name_en, basis,
        product_identity_norm, preparation_identity_norm, weighing_state,
        kcal, protein_g, carbohydrate_g, fat_g, fiber_g
      ) values (
        ${foodId}, 1, '{}'::jsonb, ${fixture.trainerA.userId},
        'دجاج مشوي', 'Grilled Chicken', 'g',
        ${`chicken:${foodId}`}, 'grilled', 'cooked',
        165.0, 31.00, 0.00, 3.60, null
      )
    `;
    await tx`
      insert into public.food_serving_units (
        food_id, food_version, basis, unit_key, label_ar, label_en, basis_qty
      ) values (
        ${foodId}, 1, 'g', 'g', 'جرام', 'Gram', 1.000
      )
    `;
    return g;
  });
});

afterAll(async () => db?.end());

function makeDoc(targetFoodId: string, foodVersion = 1): NutritionDocumentV1 {
  return {
    schemaVersion: 1,
    structure: 'single_day',
    implicitDayTypeId: 'dt-rest',
    dayTypes: [
      {
        id: 'dt-rest',
        name: { ar: 'راحة', en: 'Rest' },
        trainingDay: false,
        targets: null,
      },
    ],
    meals: [
      {
        id: 'm-1',
        name: { ar: 'وجبة ١', en: 'Meal 1' },
        note: null,
        recipeUrl: null,
        items: [
          {
            id: '33333333-3333-4333-8333-333333333331',
            foodId: targetFoodId,
            foodVersion,
            quantity: { value: '150', unit: { kind: 'basis', value: 'g' } },
            note: null,
            alternatives: [],
          },
        ],
      },
    ],
    title: { ar: 'خطة', en: 'Plan' },
    notes: null,
  };
}

async function waitForLockWait(queryText: string) {
  const observer = sql();
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      const [row] = await observer`
        select count(*)::int as count from pg_stat_activity
        where wait_event_type = 'Lock' and query ilike ${`%${queryText}%`}
      `;
      if ((row?.count as number) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`RPC did not reach lock wait: ${queryText}`);
  } finally {
    await observer.end();
  }
}

describe('F18 T009 publish_nutrition_revision', () => {
  it('rejects non-UUID item ids while publishing the nutrition document', async () => {
    const doc = makeDoc(foodId, 1);
    doc.meals![0]!.items[0]!.id = 'item-not-uuid';
    const created = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'nutrition',
      p_content: doc,
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();

    const published = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: created.data as string,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(published.error).toMatchObject({ code: '22023' });
  });

  it('rejects non-UUID alternative ids while publishing the nutrition document', async () => {
    const doc = makeDoc(foodId, 1);
    doc.meals![0]!.items[0]!.alternatives = [
      {
        id: 'alternative-not-uuid',
        foodId,
        foodVersion: 1,
        quantity: { value: '150', unit: { kind: 'basis', value: 'g' } },
      },
    ];
    const created = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'nutrition',
      p_content: doc,
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();

    const published = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: created.data as string,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(published.error).toMatchObject({ code: '22023' });
  });

  it('publishes one atomic revision + content + delivery + audit and ignores caller snapshots/totals', async () => {
    const doc = makeDoc(foodId, 1);
    const created = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'nutrition',
      p_content: doc,
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();
    const planId = created.data as string;

    const opKey = randomUUID();
    const forgedPayload = {
      document: makeDoc(randomUUID(), 99),
      snapshots: { forged: { kind: 'basis', per100: { kcal: '9999' } } },
      computedTotals: { kcal: '999999', protein: '0', carbs: '0', fat: '0' },
    };

    const res = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: opKey,
        p_caller_payload: forgedPayload,
      },
    );
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({
      status: 'ok',
      plan_id: planId,
      revision_number: 1,
    });
    const receipt = res.data as {
      status: string;
      plan_id: string;
      revision_id: string;
      revision_number: number;
      delivery_id: string;
      subscription_id: string;
    };

    const [contentRow] = await db`
      select schema_version, algorithm_version, document, snapshot_map, computed_values
      from public.nutrition_plan_version_contents
      where workspace_id = ${fixture.wsA.id} and revision_id = ${receipt.revision_id}
    `;
    expect(contentRow).toBeDefined();
    expect(contentRow!.schema_version).toBe(1);
    expect(contentRow!.algorithm_version).toBe(1);
    expect(contentRow!.document).toEqual(doc);

    const expectedKey = snapshotMapKey(foodId, 1, {
      kind: 'basis',
      value: 'g',
    });
    const snapshotMap = contentRow!.snapshot_map as NutritionSnapshotMap;
    expect(Object.keys(snapshotMap)).toEqual([expectedKey]);
    expect(snapshotMap).not.toHaveProperty('forged');

    const expectedComputed = computeDocumentValues(doc, snapshotMap);
    expect(contentRow!.computed_values).toEqual(expectedComputed);

    const [deliveryRow] = await db`
      select id, revision_id from public.plan_deliveries
      where workspace_id = ${fixture.wsA.id} and id = ${receipt.delivery_id}
    `;
    expect(deliveryRow?.revision_id).toBe(receipt.revision_id);

    const auditRows = await db`
      select action, details from public.audit_events
      where workspace_id = ${fixture.wsA.id}
        and action = 'plan.nutrition_publish'
        and target_id = ${receipt.revision_id}
    `;
    expect(auditRows).toHaveLength(1);

    // Exact replay returns original receipt without duplicate revision, content, delivery, or audit
    const replay = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: opKey,
      },
    );
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(receipt);

    const revCount = await db`
      select count(*)::int as n from public.plan_revisions
      where workspace_id = ${fixture.wsA.id} and plan_id = ${planId}
    `;
    expect(revCount[0]!.n).toBe(1);

    const auditAfterReplay = await db`
      select count(*)::int as n from public.audit_events
      where workspace_id = ${fixture.wsA.id}
        and action = 'plan.nutrition_publish'
        and target_id = ${receipt.revision_id}
    `;
    expect(auditAfterReplay[0]!.n).toBe(1);

    // Key conflict with same operation_key and different expected_published_version
    const conflict = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 1,
        p_operation_key: opKey,
      },
    );
    expect(conflict.error).toBeNull();
    expect(conflict.data).toMatchObject({ status: 'key_conflict' });

    // New authorized key with unchanged content appends revision 2 + delivery 2
    const res2 = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(res2.error).toBeNull();
    expect(res2.data).toMatchObject({
      status: 'ok',
      plan_id: planId,
      revision_number: 2,
    });
    expect((res2.data as { revision_id: string }).revision_id).not.toBe(
      receipt.revision_id,
    );
    expect((res2.data as { delivery_id: string }).delivery_id).not.toBe(
      receipt.delivery_id,
    );
  });

  it('rejects stale expected revision (CAS) without creating a revision or content', async () => {
    const created = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'nutrition',
      p_content: makeDoc(foodId, 1),
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();
    const planId = created.data as string;

    const stale = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 2,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(stale.error).toBeNull();
    expect(stale.data).toMatchObject({ status: 'stale_version' });

    const [revs] = await db`
      select count(*)::int as n from public.plan_revisions
      where workspace_id = ${fixture.wsA.id} and plan_id = ${planId}
    `;
    expect(revs!.n).toBe(0);
  });

  it('denies unauthorized callers (sales, client, foreign workspace) and workout plans', async () => {
    const created = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'nutrition',
      p_content: makeDoc(foodId, 1),
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();
    const planId = created.data as string;

    for (const actorClient of [
      fixture.salesA.client,
      fixture.trainerB.client,
    ]) {
      const denied = await actorClient.rpc('publish_nutrition_revision', {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      });
      expect(denied.error).toBeNull();
      expect(denied.data).toMatchObject({ status: 'not_permitted' });
    }

    const workoutCreated = await fixture.trainerA.client.rpc(
      'create_plan_draft',
      {
        p_workspace_id: fixture.wsA.id,
        p_client_id: seeded.client,
        p_plan_kind: 'workout',
        p_content: { schema_version: 1, days: [] },
        p_operation_key: randomUUID(),
      },
    );
    expect(workoutCreated.error).toBeNull();
    const workoutRes = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: workoutCreated.data as string,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(workoutRes.error).toBeNull();
    expect(workoutRes.data).toMatchObject({ status: 'not_permitted' });
  });

  it('aborts the entire transaction with no revision or delivery when a food version is missing', async () => {
    const created = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'nutrition',
      p_content: makeDoc(foodId, 999),
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();
    const planId = created.data as string;

    const failed = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(failed.error).not.toBeNull();

    const [revs] = await db`
      select count(*)::int as n from public.plan_revisions
      where workspace_id = ${fixture.wsA.id} and plan_id = ${planId}
    `;
    expect(revs!.n).toBe(0);

    const [deliveries] = await db`
      select count(*)::int as n from public.plan_deliveries
      where workspace_id = ${fixture.wsA.id} and plan_id = ${planId}
    `;
    expect(deliveries!.n).toBe(0);
  });

  it('refuses a new publish without a current subscription, but still returns an exact authorized replay', async () => {
    const expiredFixture = await clientContext();
    const subCtx = await db.begin((tx) => graph(tx, expiredFixture));
    const created = await expiredFixture.trainerA.client.rpc(
      'create_plan_draft',
      {
        p_workspace_id: expiredFixture.wsA.id,
        p_client_id: subCtx.client,
        p_plan_kind: 'nutrition',
        p_content: makeDoc(foodId, 1),
        p_operation_key: randomUUID(),
      },
    );
    expect(created.error).toBeNull();
    const planId = created.data as string;

    const firstKey = randomUUID();
    const firstPublish = await expiredFixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: firstKey,
      },
    );
    expect(firstPublish.error).toBeNull();
    expect(firstPublish.data).toMatchObject({ status: 'ok' });

    // Expire the subscription by recording a backdated po_override activation
    await db`
      insert into public.subscription_activations (
        workspace_id, subscription_id, activated_at, delivery_event_id, activation_source
      ) values (
        ${expiredFixture.wsA.id}, ${subCtx.subscription}, '2000-01-01T00:00:00Z',
        ${randomUUID()}, 'po_override'
      )
    `;

    const newKeyWhileExpired = await expiredFixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(newKeyWhileExpired.error).toBeNull();
    expect(newKeyWhileExpired.data).toMatchObject({ status: 'not_permitted' });

    const replayWhileExpired = await expiredFixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 1,
        p_operation_key: firstKey,
      },
    );
    // Exact authorized replay with matching expected_published_version=0 returns original receipt
    const replayExact = await expiredFixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: firstKey,
      },
    );
    expect(replayExact.error).toBeNull();
    expect(replayExact.data).toEqual(firstPublish.data);
    // Different expected_published_version on same key returns key_conflict
    expect(replayWhileExpired.data).toMatchObject({ status: 'key_conflict' });
  });

  it('serializes concurrent publish + replay via client lock (two-order pg_stat_activity check)', async () => {
    const created = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'nutrition',
      p_content: makeDoc(foodId, 1),
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();
    const planId = created.data as string;

    const opKey = randomUUID();
    let first!: Awaited<ReturnType<typeof fixture.trainerA.client.rpc>>;
    let rpcPromise!: Promise<void>;

    // Order 1: hold client row lock inside tx, then launch RPC so it blocks on lock wait
    await db.begin(async (tx) => {
      await tx`
        select 1 from public.clients
        where workspace_id = ${fixture.wsA.id} and id = ${seeded.client}
        for update
      `;
      rpcPromise = Promise.resolve().then(async () => {
        first = await fixture.trainerA.client.rpc(
          'publish_nutrition_revision',
          {
            p_plan_id: planId,
            p_expected_draft_version: 1,
            p_expected_published_version: 0,
            p_operation_key: opKey,
          },
        );
      });
      await waitForLockWait('publish_nutrition_revision');
    });
    await rpcPromise;
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ status: 'ok' });

    // Order 2: concurrent publish with same key returns identical receipt, 1 revision total
    const secondCalls = await Promise.all([
      fixture.trainerA.client.rpc('publish_nutrition_revision', {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: opKey,
      }),
      fixture.trainerA.client.rpc('publish_nutrition_revision', {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: opKey,
      }),
    ]);
    expect(secondCalls[0]!.data).toEqual(first.data);
    expect(secondCalls[1]!.data).toEqual(first.data);

    const [revs] = await db`
      select count(*)::int as n from public.plan_revisions
      where workspace_id = ${fixture.wsA.id} and plan_id = ${planId}
    `;
    expect(revs!.n).toBe(1);
  });

  it('refuses direct ready_and_publish_plan on a nutrition plan with zero writes while publish_nutrition_revision still succeeds', async () => {
    const doc = makeDoc(foodId, 1);
    const created = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'nutrition',
      p_content: doc,
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();
    const planId = created.data as string;

    const snapshotCounts = async () => {
      const [row] = await db`
        select
          (select count(*)::int from public.plan_revisions where workspace_id = ${fixture.wsA.id} and plan_id = ${planId}) as revisions,
          (select count(*)::int from public.plan_deliveries where workspace_id = ${fixture.wsA.id} and plan_id = ${planId}) as deliveries,
          (select count(*)::int from public.nutrition_plan_version_contents where workspace_id = ${fixture.wsA.id} and plan_id = ${planId}) as contents,
          (select count(*)::int from public.subscription_activations where workspace_id = ${fixture.wsA.id}) as activations,
          (select count(*)::int from public.productivity_units where workspace_id = ${fixture.wsA.id}) as units,
          (select count(*)::int from app_private.plan_delivery_operations where workspace_id = ${fixture.wsA.id} and plan_id = ${planId}) as operations,
          (select count(*)::int from public.audit_events where workspace_id = ${fixture.wsA.id}) as audits
      `;
      return row!;
    };

    const before = await snapshotCounts();

    const refused = await fixture.trainerA.client.rpc(
      'ready_and_publish_plan',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(refused.error).toBeNull();
    expect(refused.data).toEqual({ status: 'not_permitted' });

    const after = await snapshotCounts();
    expect(after).toEqual(before);

    const published = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(published.error).toBeNull();
    expect(published.data).toMatchObject({ status: 'ok' });
  });
});
