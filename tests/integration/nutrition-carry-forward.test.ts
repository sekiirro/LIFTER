import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  NutritionAlternative,
  NutritionDocumentV1,
} from '../../lib/plans/nutrition/types';
import { admin, anonClient, checked } from './harness';
import { clientContext, graph, sql } from './registration-approval-fixture';
import { issue } from './registration-links-fixture';
import type { Context } from './registration-approval-fixture';

let fixture: Context;
let db: ReturnType<typeof sql>;
let primaryFoodId: string;
let altFood1Id: string;
let altFood2Id: string;

async function createAuthClientUser(): Promise<{
  client: SupabaseClient;
  authUserId: string;
}> {
  const email = `t011-client-${randomUUID()}@example.test`;
  const password = `T011-${randomUUID()}-aA1!`;
  const created = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(created.error?.message ?? 'Failed to create client user');
  }
  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(signedIn.error.message);
  return { client, authUserId: created.data.user.id };
}

function makeDoc(
  options: {
    itemId?: string;
    itemName?: string;
    altId?: string;
    altName?: string;
    itemFoodId?: string;
    altFoodId?: string;
    includeItem?: boolean;
  } = {},
): NutritionDocumentV1 {
  const itemId = options.itemId ?? '11111111-1111-4111-8111-111111111111';
  const altId = options.altId ?? '22222222-2222-4222-8222-222222222221';
  const alt: NutritionAlternative = {
    id: altId,
    foodId: options.altFoodId ?? altFood1Id,
    foodVersion: 1,
    quantity: { value: '200', unit: { kind: 'basis', value: 'g' } },
  };
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
        items:
          options.includeItem === false
            ? []
            : [
                {
                  id: itemId,
                  foodId: options.itemFoodId ?? primaryFoodId,
                  foodVersion: 1,
                  quantity: {
                    value: '150',
                    unit: { kind: 'basis', value: 'g' },
                  },
                  note: null,
                  alternatives: [alt],
                },
              ],
      },
    ],
    title: { ar: 'خطة غذائية', en: 'Carry forward' },
    notes: null,
  };
}

async function seedFood(
  tx: TransactionSql,
  nameAr: string,
  nameEn: string,
  kcal: number,
): Promise<string> {
  const id = randomUUID();
  await tx`insert into public.foods (id, created_by, current_version)
    values (${id}, ${fixture.trainerA.userId}, 1)`;
  await tx`insert into public.food_versions (
      food_id, version, payload, created_by, name_ar, name_en, basis,
      product_identity_norm, preparation_identity_norm, weighing_state,
      kcal, protein_g, carbohydrate_g, fat_g, fiber_g
    ) values (
      ${id}, 1, '{}'::jsonb, ${fixture.trainerA.userId}, ${nameAr}, ${nameEn}, 'g',
      ${`t011-food:${id}`}, 'grilled', 'cooked', ${kcal}, 25.00, 10.00, 3.00, null
    )`;
  await tx`insert into public.food_serving_units (
      food_id, food_version, basis, unit_key, label_ar, label_en, basis_qty
    ) values (${id}, 1, 'g', 'g', 'جرام', 'Gram', 1.000)`;
  return id;
}

async function activateSubscription(
  subscriptionId: string,
  activatedAt?: string,
) {
  await db.begin(async (tx) => {
    await tx`alter table public.subscription_activations disable trigger user`;
    await tx`insert into public.subscription_activations (
        workspace_id, subscription_id, activated_at, delivery_event_id, activation_source
      ) values (
        ${fixture.wsA.id}, ${subscriptionId},
        ${activatedAt ?? new Date().toISOString()}::timestamptz,
        ${randomUUID()}, 'renewal'
      ) on conflict (workspace_id, subscription_id) do update
      set activated_at = excluded.activated_at`;
    await tx`alter table public.subscription_activations enable trigger user`;
  });
}

async function publishNutritionPlan(
  clientId: string,
  doc: NutritionDocumentV1,
): Promise<{ planId: string; revisionId: string; subscriptionId: string }> {
  const created = await fixture.trainerA.client.rpc('create_plan_draft', {
    p_workspace_id: fixture.wsA.id,
    p_client_id: clientId,
    p_plan_kind: 'nutrition',
    p_content: doc,
    p_operation_key: randomUUID(),
  });
  expect(created.error).toBeNull();
  const planId = created.data as string;
  const pub = await fixture.trainerA.client.rpc('publish_nutrition_revision', {
    p_plan_id: planId,
    p_expected_draft_version: 1,
    p_expected_published_version: 0,
    p_operation_key: randomUUID(),
  });
  expect(pub.error).toBeNull();
  expect(pub.data).toMatchObject({ status: 'ok', plan_id: planId });
  return {
    planId,
    revisionId: (pub.data as { revision_id: string }).revision_id,
    subscriptionId: (pub.data as { subscription_id: string }).subscription_id,
  };
}

async function selectAlternative(
  clientAuth: { client: SupabaseClient; authUserId: string },
  revisionId: string,
  itemId = '11111111-1111-4111-8111-111111111111',
  altId = '22222222-2222-4222-8222-222222222221',
) {
  const result = await clientAuth.client.rpc('select_nutrition_alternative', {
    p_plan_version_id: revisionId,
    p_item_id: itemId,
    p_alternative_id: altId,
    p_operation_key: randomUUID(),
  });
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({ status: 'ok', noop: false });
}

async function createClientGraph() {
  const clientAuth = await createAuthClientUser();
  const linkId = checked(await issue(fixture)) as string;
  const g = await db.begin((tx) =>
    graph(tx, fixture, {
      authUserId: clientAuth.authUserId,
      linkId,
    }),
  );
  await activateSubscription(g.subscription);
  return { clientAuth, g };
}

async function publishRevision(
  planId: string,
  doc: NutritionDocumentV1,
): Promise<string> {
  const saved = await fixture.trainerA.client.rpc('save_plan_draft', {
    p_plan_id: planId,
    p_expected_draft_version: 1,
    p_content: doc,
    p_operation_key: randomUUID(),
  });
  expect(saved.error).toBeNull();
  expect(saved.data).toBe(2);
  const published = await fixture.trainerA.client.rpc(
    'publish_nutrition_revision',
    {
      p_plan_id: planId,
      p_expected_draft_version: 2,
      p_expected_published_version: 1,
      p_operation_key: randomUUID(),
    },
  );
  expect(published.error).toBeNull();
  expect(published.data).toMatchObject({ status: 'ok' });
  return (published.data as { revision_id: string }).revision_id;
}

async function readSelection(revisionId: string) {
  const [row] = await db`
    select client_id, item_id, alternative_id, created_by
    from public.client_nutrition_alternative_selections
    where workspace_id = ${fixture.wsA.id} and plan_version_id = ${revisionId}
  `;
  return row;
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

beforeAll(async () => {
  fixture = await clientContext();
  db = sql();
  await db.begin(async (tx) => {
    primaryFoodId = await seedFood(tx, 'صدر دجاج', 'Chicken Breast', 165.0);
    altFood1Id = await seedFood(tx, 'سمك سلمون', 'Salmon Fillet', 208.0);
    altFood2Id = await seedFood(tx, 'لحم بقري', 'Lean Beef', 250.0);
  });
});

afterAll(async () => db?.end());

describe('F18 T011 publish selection carry-forward', () => {
  it('carries a selection when stable item and alternative ids survive edits', async () => {
    const { clientAuth, g } = await createClientGraph();
    const { planId, revisionId } = await publishNutritionPlan(
      g.client,
      makeDoc(),
    );
    await selectAlternative(clientAuth, revisionId);

    const nextDoc = makeDoc();
    nextDoc.meals![0]!.items[0]!.quantity.value = '175';
    nextDoc.meals![0]!.items[0]!.note = 'Updated quantity and note';
    const nextRevisionId = await publishRevision(planId, nextDoc);

    expect(await readSelection(nextRevisionId)).toMatchObject({
      client_id: g.client,
      item_id: '11111111-1111-4111-8111-111111111111',
      alternative_id: '22222222-2222-4222-8222-222222222221',
      created_by: clientAuth.authUserId,
    });
    const [counter] = await db`
      select selection_revision from public.client_nutrition_selection_revision_counters
      where workspace_id = ${fixture.wsA.id} and plan_version_id = ${nextRevisionId}
    `;
    expect(counter?.selection_revision).toBe(1);
    const [publishAudit] = await db`
      select details from public.audit_events
      where workspace_id = ${fixture.wsA.id} and action = 'plan.nutrition_publish'
        and target_id = ${nextRevisionId}
    `;
    expect(publishAudit?.details).toMatchObject({
      changed_fields: ['document', 'selection'],
    });
  });

  it('does not carry selections across a removed item or replaced food reference', async () => {
    const cases = [
      { old: makeDoc(), next: makeDoc({ includeItem: false }) },
      {
        old: makeDoc(),
        // Replacing either food reference receives new stable item/alternative ids.
        next: makeDoc({
          itemId: '33333333-3333-4333-8333-333333333333',
          itemName: 'Item 1',
          altId: '44444444-4444-4444-8444-444444444444',
          altName: 'Alternative 1',
          itemFoodId: altFood2Id,
          altFoodId: altFood2Id,
        }),
      },
    ];
    for (const { old, next } of cases) {
      const { clientAuth, g } = await createClientGraph();
      const { planId, revisionId } = await publishNutritionPlan(g.client, old);
      await selectAlternative(clientAuth, revisionId);
      const nextRevisionId = await publishRevision(planId, next);
      expect(await readSelection(nextRevisionId)).toBeUndefined();
      const [counter] = await db`
        select count(*)::int as count from public.client_nutrition_selection_revision_counters
        where workspace_id = ${fixture.wsA.id} and plan_version_id = ${nextRevisionId}
      `;
      expect(counter?.count).toBe(0);
    }
  });

  it('does not carry a row after the client has been deauthorized', async () => {
    const { clientAuth, g } = await createClientGraph();
    const { planId, revisionId } = await publishNutritionPlan(
      g.client,
      makeDoc(),
    );
    await selectAlternative(clientAuth, revisionId);
    await db.begin(async (tx) => {
      await tx`alter table public.clients disable trigger f12_client_transition`;
      await tx`alter table public.clients disable trigger f15_client_retention_fact`;
      await tx`update public.clients set deactivated_at = clock_timestamp(), deactivation_reason = 'refund'
        where workspace_id = ${fixture.wsA.id} and id = ${g.client}`;
      await tx`alter table public.clients enable trigger f15_client_retention_fact`;
      await tx`alter table public.clients enable trigger f12_client_transition`;
    });

    const saved = await fixture.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 1,
      p_content: makeDoc(),
      p_operation_key: randomUUID(),
    });
    expect(saved.error).toBeNull();
    const publication = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 2,
        p_expected_published_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(publication.error).toBeNull();
    expect(publication.data).toMatchObject({ status: 'ok' });
    const nextRevisionId = (publication.data as { revision_id: string })
      .revision_id;
    expect(await readSelection(nextRevisionId)).toBeUndefined();
  });

  it('serializes a concurrent selection and publish without a mixed revision', async () => {
    const { clientAuth, g } = await createClientGraph();
    const { planId, revisionId } = await publishNutritionPlan(
      g.client,
      makeDoc(),
    );
    await selectAlternative(clientAuth, revisionId);
    const saved = await fixture.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 1,
      p_content: makeDoc(),
      p_operation_key: randomUUID(),
    });
    expect(saved.error).toBeNull();

    let publish!: Awaited<ReturnType<typeof fixture.trainerA.client.rpc>>;
    let select!: Awaited<ReturnType<typeof clientAuth.client.rpc>>;
    let publishPromise!: Promise<void>;
    let selectPromise!: Promise<void>;
    await db.begin(async (tx) => {
      await tx`select 1 from public.plan_roots where workspace_id = ${fixture.wsA.id}
        and id = ${planId} for update`;
      publishPromise = Promise.resolve().then(async () => {
        publish = await fixture.trainerA.client.rpc(
          'publish_nutrition_revision',
          {
            p_plan_id: planId,
            p_expected_draft_version: 2,
            p_expected_published_version: 1,
            p_operation_key: randomUUID(),
          },
        );
      });
      await waitForLockWait('publish_nutrition_revision');
      selectPromise = Promise.resolve().then(async () => {
        select = await clientAuth.client.rpc('select_nutrition_alternative', {
          p_plan_version_id: revisionId,
          p_item_id: '11111111-1111-4111-8111-111111111111',
          p_alternative_id: '22222222-2222-4222-8222-222222222222',
          p_operation_key: randomUUID(),
        });
      });
      await waitForLockWait('select_nutrition_alternative');
    });
    await Promise.all([publishPromise, selectPromise]);
    expect(publish.error).toBeNull();
    expect(publish.data).toMatchObject({ status: 'ok' });
    expect(select.error).toBeNull();
    expect(select.data).toMatchObject({ status: 'stale_version' });

    const nextRevisionId = (publish.data as { revision_id: string })
      .revision_id;
    const carried = await readSelection(nextRevisionId);
    expect(carried).toMatchObject({
      client_id: g.client,
      item_id: '11111111-1111-4111-8111-111111111111',
      alternative_id: '22222222-2222-4222-8222-222222222221',
      created_by: clientAuth.authUserId,
    });
  });
});
