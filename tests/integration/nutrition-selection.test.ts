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
let seeded: Awaited<ReturnType<typeof graph>>;
let primaryClientAuth: { client: SupabaseClient; authUserId: string };
let primaryFoodId: string;
let altFood1Id: string;
let altFood2Id: string;

async function createAuthClientUser(): Promise<{
  client: SupabaseClient;
  authUserId: string;
}> {
  const email = `t010-client-${randomUUID()}@example.test`;
  const password = `T010-${randomUUID()}-aA1!`;
  const created = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(created.error?.message ?? 'Failed to create client user');
  }
  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signedIn.error) throw new Error(signedIn.error.message);
  return { client, authUserId: created.data.user.id };
}

function makeDocWithAlternatives(includeSecondAlt = true): NutritionDocumentV1 {
  const alts: NutritionAlternative[] = [
    {
      id: '22222222-2222-4222-8222-222222222221',
      foodId: altFood1Id,
      foodVersion: 1,
      quantity: {
        value: '200',
        unit: { kind: 'basis', value: 'g' },
      },
    },
  ];
  if (includeSecondAlt) {
    alts.push({
      id: '22222222-2222-4222-8222-222222222222',
      foodId: altFood2Id,
      foodVersion: 1,
      quantity: {
        value: '180',
        unit: { kind: 'basis', value: 'g' },
      },
    });
  }

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
            id: '11111111-1111-4111-8111-111111111111',
            foodId: primaryFoodId,
            foodVersion: 1,
            quantity: { value: '150', unit: { kind: 'basis', value: 'g' } },
            note: null,
            alternatives: alts,
          },
          {
            id: '11111111-1111-4111-8111-111111111112',
            foodId: primaryFoodId,
            foodVersion: 1,
            quantity: { value: '100', unit: { kind: 'basis', value: 'g' } },
            note: null,
            alternatives: [
              {
                id: '22222222-2222-4222-8222-222222222223',
                foodId: altFood1Id,
                foodVersion: 1,
                quantity: { value: '120', unit: { kind: 'basis', value: 'g' } },
              },
            ],
          },
        ],
      },
    ],
    title: { ar: 'خطة تغذية', en: 'Nutrition Plan' },
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
  await tx`
    insert into public.foods (id, created_by, current_version)
    values (${id}, ${fixture.trainerA.userId}, 1)
  `;
  await tx`
    insert into public.food_versions (
      food_id, version, payload, created_by, name_ar, name_en, basis,
      product_identity_norm, preparation_identity_norm, weighing_state,
      kcal, protein_g, carbohydrate_g, fat_g, fiber_g
    ) values (
      ${id}, 1, '{}'::jsonb, ${fixture.trainerA.userId},
      ${nameAr}, ${nameEn}, 'g',
      ${`food:${id}`}, 'grilled', 'cooked',
      ${kcal}, 25.00, 10.00, 3.00, null
    )
  `;
  await tx`
    insert into public.food_serving_units (
      food_id, food_version, basis, unit_key, label_ar, label_en, basis_qty
    ) values (
      ${id}, 1, 'g', 'g', 'جرام', 'Gram', 1.000
    )
  `;
  return id;
}

async function publishNutritionPlan(
  clientId: string,
  doc: NutritionDocumentV1,
): Promise<{ planId: string; revisionId: string }> {
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
  };
}

async function activateSubscription(
  subscriptionId: string,
  activatedAt?: string,
) {
  await db.begin(async (tx) => {
    await tx`alter table public.subscription_activations disable trigger user`;
    await tx`
      insert into public.subscription_activations (
        workspace_id, subscription_id, activated_at, delivery_event_id, activation_source
      ) values (
        ${fixture.wsA.id},
        ${subscriptionId},
        ${activatedAt ?? new Date().toISOString()}::timestamptz,
        ${randomUUID()},
        'renewal'
      )
      on conflict (workspace_id, subscription_id) do update
        set activated_at = excluded.activated_at
    `;
    await tx`alter table public.subscription_activations enable trigger user`;
  });
}

beforeAll(async () => {
  fixture = await clientContext();
  db = sql();
  primaryClientAuth = await createAuthClientUser();
  seeded = await db.begin(async (tx) => {
    const g = await graph(tx, fixture, {
      authUserId: primaryClientAuth.authUserId,
    });
    primaryFoodId = await seedFood(tx, 'صدر دجاج', 'Chicken Breast', 165.0);
    altFood1Id = await seedFood(tx, 'سمك سلمون', 'Salmon Fillet', 208.0);
    altFood2Id = await seedFood(tx, 'لحم بقري', 'Lean Beef', 250.0);
    return g;
  });
  await activateSubscription(seeded.subscription);
});

afterAll(async () => db?.end());

describe('F18 T010 select_nutrition_alternative', () => {
  it('rejects non-UUID item and alternative ids as invalid_selection', async () => {
    const { revisionId } = await publishNutritionPlan(
      seeded.client,
      makeDocWithAlternatives(true),
    );
    const invalidItem = await primaryClientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revisionId,
        p_item_id: 'item-not-uuid',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: randomUUID(),
      },
    );
    expect(invalidItem.error).toBeNull();
    expect(invalidItem.data).toEqual({ status: 'invalid_selection' });

    const invalidAlternative = await primaryClientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revisionId,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: 'alternative-not-uuid',
        p_operation_key: randomUUID(),
      },
    );
    expect(invalidAlternative.error).toBeNull();
    expect(invalidAlternative.data).toEqual({ status: 'invalid_selection' });

    const uppercaseItem = await primaryClientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revisionId,
        p_item_id: 'ABCDEFAB-CDEF-4ABC-8ABC-ABCDEFABCDEF',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: randomUUID(),
      },
    );
    expect(uppercaseItem.error).toBeNull();
    expect(uppercaseItem.data).toEqual({ status: 'invalid_selection' });
  });

  it('audits a verified item but omits an unverified alternative id', async () => {
    const { revisionId } = await publishNutritionPlan(
      seeded.client,
      makeDocWithAlternatives(true),
    );
    const foodName = 'Chicken breast 200g';
    const denied = await primaryClientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revisionId,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: foodName,
        p_operation_key: randomUUID(),
      },
    );
    expect(denied.error).toBeNull();
    expect(denied.data).toEqual({ status: 'invalid_selection' });

    const events = await db`
      select actor_user_id, action, target_table, target_id, workspace_id, details
      from public.audit_events
      where action = 'client.nutrition_select'
        and target_id = ${revisionId}
        and actor_user_id = ${primaryClientAuth.authUserId}
    `;
    expect(events).toHaveLength(1);
    expect(events[0]!.details).toMatchObject({
      revision_id: revisionId,
      item_id: '11111111-1111-4111-8111-111111111111',
      outcome: 'denied',
      reason: 'invalid_selection',
    });
    expect(events[0]!.details).not.toHaveProperty('alternative_id');
    expect(JSON.stringify(events[0])).not.toContain(foodName);
  });

  it('enforces self-only upsert/delete, no-op silence, durable revision counter, idempotency, and audit allowlist', async () => {
    const { planId, revisionId } = await publishNutritionPlan(
      seeded.client,
      makeDocWithAlternatives(true),
    );
    const clientAuth = primaryClientAuth;

    // 1. No-op clear when nothing is selected: writes nothing, counter stays absent (0), 0 audit events
    const auditBeforeNoopClear = await db`
      select count(*)::int as c from public.audit_events
      where workspace_id = ${fixture.wsA.id}
        and action = 'client.nutrition_select'
        and target_id = ${revisionId}
    `;
    const noopClear = await clientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revisionId,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: null,
        p_operation_key: randomUUID(),
      },
    );
    expect(noopClear.error).toBeNull();
    expect(noopClear.data).toEqual({
      status: 'ok',
      selection_revision: 0,
      noop: true,
      selected_alternative_id: null,
    });
    const [selAfterNoopClear] = await db`
      select count(*)::int as c from public.client_nutrition_alternative_selections
      where workspace_id = ${fixture.wsA.id} and plan_version_id = ${revisionId}
    `;
    const [cntAfterNoopClear] = await db`
      select count(*)::int as c from public.client_nutrition_selection_revision_counters
      where workspace_id = ${fixture.wsA.id} and plan_version_id = ${revisionId}
    `;
    const [auditAfterNoopClear] = await db`
      select count(*)::int as c from public.audit_events
      where workspace_id = ${fixture.wsA.id}
        and action = 'client.nutrition_select'
        and target_id = ${revisionId}
    `;
    expect(selAfterNoopClear!.c).toBe(0);
    expect(cntAfterNoopClear!.c).toBe(0);
    expect(auditAfterNoopClear!.c).toBe(auditBeforeNoopClear[0]!.c);

    // 2. Real select: 22222222-2222-4222-8222-222222222221 -> selection_revision = 1, noop = false, 1 row, 1 audit
    const select1Key = randomUUID();
    const select1 = await clientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revisionId,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: select1Key,
      },
    );
    expect(select1.error).toBeNull();
    expect(select1.data).toEqual({
      status: 'ok',
      selection_revision: 1,
      noop: false,
      selected_alternative_id: '22222222-2222-4222-8222-222222222221',
    });

    const [selRow1] = await db`
      select client_id, item_id, alternative_id, created_by
      from public.client_nutrition_alternative_selections
      where workspace_id = ${fixture.wsA.id} and plan_version_id = ${revisionId} and item_id = '11111111-1111-4111-8111-111111111111'
    `;
    expect(selRow1).toMatchObject({
      client_id: seeded.client,
      item_id: '11111111-1111-4111-8111-111111111111',
      alternative_id: '22222222-2222-4222-8222-222222222221',
      created_by: clientAuth.authUserId,
    });

    // 3. Exact replay with same operation_key returns original result without incrementing counter
    const replay1 = await clientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revisionId,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: select1Key,
      },
    );
    expect(replay1.error).toBeNull();
    expect(replay1.data).toEqual(select1.data);

    // 4. Same operation_key with different arguments -> key_conflict + denial audit
    const conflict1 = await clientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revisionId,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222222',
        p_operation_key: select1Key,
      },
    );
    expect(conflict1.error).toBeNull();
    expect(conflict1.data).toEqual({ status: 'key_conflict' });

    // 5. No-op select (already selected 22222222-2222-4222-8222-222222222221 with new key): noop = true, counter stays 1, no new audit
    const auditBeforeNoopSel = await db`
      select count(*)::int as c from public.audit_events
      where workspace_id = ${fixture.wsA.id}
        and action = 'client.nutrition_select'
        and target_id = ${revisionId}
    `;
    const noopSel = await clientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revisionId,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: randomUUID(),
      },
    );
    expect(noopSel.error).toBeNull();
    expect(noopSel.data).toEqual({
      status: 'ok',
      selection_revision: 1,
      noop: true,
      selected_alternative_id: '22222222-2222-4222-8222-222222222221',
    });
    const [auditAfterNoopSel] = await db`
      select count(*)::int as c from public.audit_events
      where workspace_id = ${fixture.wsA.id}
        and action = 'client.nutrition_select'
        and target_id = ${revisionId}
    `;
    expect(auditAfterNoopSel!.c).toBe(auditBeforeNoopSel[0]!.c);

    // 6. Clear deletes selection row, retains and increments durable counter to 2
    const clear1 = await clientAuth.client.rpc('select_nutrition_alternative', {
      p_plan_version_id: revisionId,
      p_item_id: '11111111-1111-4111-8111-111111111111',
      p_alternative_id: null,
      p_operation_key: randomUUID(),
    });
    expect(clear1.error).toBeNull();
    expect(clear1.data).toEqual({
      status: 'ok',
      selection_revision: 2,
      noop: false,
      selected_alternative_id: null,
    });
    const [selAfterClear] = await db`
      select count(*)::int as c from public.client_nutrition_alternative_selections
      where workspace_id = ${fixture.wsA.id} and plan_version_id = ${revisionId}
    `;
    const [cntAfterClear] = await db`
      select selection_revision from public.client_nutrition_selection_revision_counters
      where workspace_id = ${fixture.wsA.id} and plan_version_id = ${revisionId}
    `;
    expect(selAfterClear!.c).toBe(0);
    expect(cntAfterClear!.selection_revision).toBe(2);

    // 7. Reselect after clear advances durable counter to 3 (never resets to 1)
    const reselect = await clientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revisionId,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222222',
        p_operation_key: randomUUID(),
      },
    );
    expect(reselect.error).toBeNull();
    expect(reselect.data).toEqual({
      status: 'ok',
      selection_revision: 3,
      noop: false,
      selected_alternative_id: '22222222-2222-4222-8222-222222222222',
    });

    // 8. Audit allowlist / log-scrub: no food names, macros, quantities, or raw operation keys
    const audits = await db`
      select details::text as details_text, details
      from public.audit_events
      where workspace_id = ${fixture.wsA.id}
        and action = 'client.nutrition_select'
        and target_id = ${revisionId}
    `;
    expect(audits.length).toBeGreaterThanOrEqual(4);
    for (const row of audits) {
      const text = row.details_text as string;
      expect(text).not.toContain('Salmon');
      expect(text).not.toContain('Chicken');
      expect(text).not.toContain('208');
      expect(text).not.toContain(select1Key);
      expect(row.details).toHaveProperty('plan_id', planId);
    }
  });

  it('refuses forged ids, foreign client, coach overwrite, and stale revision with generic failures and denial audits', async () => {
    const { planId, revisionId: rev1Id } = await publishNutritionPlan(
      seeded.client,
      makeDocWithAlternatives(true),
    );
    const clientAuth = primaryClientAuth;

    // Forged plan_version_id
    const forgedRev = await clientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: randomUUID(),
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: randomUUID(),
      },
    );
    expect(forgedRev.error).toBeNull();
    expect(forgedRev.data).toEqual({ status: 'not_permitted' });

    // Forged item_id
    const forgedItem = await clientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: rev1Id,
        p_item_id: '99999999-9999-4999-8999-999999999999',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: randomUUID(),
      },
    );
    expect(forgedItem.error).toBeNull();
    expect(forgedItem.data).toEqual({ status: 'invalid_selection' });

    // Alternative belonging to another item (cross-item forgery)
    const crossItemAlt = await clientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: rev1Id,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222223',
        p_operation_key: randomUUID(),
      },
    );
    expect(crossItemAlt.error).toBeNull();
    expect(crossItemAlt.data).toEqual({ status: 'invalid_selection' });

    // Forged non-v4 operation_key
    const nonV4Key = '00000000-0000-1000-8000-000000000000';
    const badOpKey = await clientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: rev1Id,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: nonV4Key,
      },
    );
    expect(badOpKey.error).toBeNull();
    expect(badOpKey.data).toEqual({ status: 'not_permitted' });

    // Coach / trainer overwrite attempt
    const coachAttempt = await fixture.trainerA.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: rev1Id,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: randomUUID(),
      },
    );
    expect(coachAttempt.error).toBeNull();
    expect(coachAttempt.data).toEqual({ status: 'not_permitted' });

    // Platform owner overwrite attempt
    const poAttempt = await fixture.po.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: rev1Id,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: randomUUID(),
      },
    );
    expect(poAttempt.error).toBeNull();
    expect(poAttempt.data).toEqual({ status: 'not_permitted' });

    // Foreign client attempt
    const foreignLink = checked(await issue(fixture)) as string;
    const foreignAuth = await createAuthClientUser();
    const foreignSeeded = await db.begin(async (tx) =>
      graph(tx, fixture, {
        authUserId: foreignAuth.authUserId,
        linkId: foreignLink,
      }),
    );
    await activateSubscription(foreignSeeded.subscription);

    const foreignAttempt = await foreignAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: rev1Id,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: randomUUID(),
      },
    );
    expect(foreignAttempt.error).toBeNull();
    expect(foreignAttempt.data).toEqual({ status: 'not_permitted' });

    // Caller-supplied client id must never be accepted as authority
    const forgedClientIdAttempt = await foreignAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: rev1Id,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: randomUUID(),
        p_client_id: seeded.client,
      } as never,
    );
    expect(forgedClientIdAttempt.data).not.toMatchObject({ status: 'ok' });

    // Stale revision: publish revision 2, then try selecting on revision 1
    const saved = await fixture.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 1,
      p_content: makeDocWithAlternatives(true),
      p_operation_key: randomUUID(),
    });
    expect(saved.error).toBeNull();
    const pub2 = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 2,
        p_expected_published_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(pub2.error).toBeNull();

    const staleAttempt = await clientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: rev1Id,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: randomUUID(),
      },
    );
    expect(staleAttempt.error).toBeNull();
    expect(staleAttempt.data).toEqual({ status: 'stale_version' });

    // None of the denied attempts wrote any selection row on rev1
    const [selCount] = await db`
      select count(*)::int as c from public.client_nutrition_alternative_selections
      where workspace_id = ${fixture.wsA.id} and plan_version_id = ${rev1Id}
    `;
    expect(selCount!.c).toBe(0);
  });

  it('refuses selection and replay when subscription is expired and blocks direct DML', async () => {
    const expLink = checked(await issue(fixture)) as string;
    const expClientAuth = await createAuthClientUser();
    const expSeeded = await db.begin(async (tx) =>
      graph(tx, fixture, {
        authUserId: expClientAuth.authUserId,
        linkId: expLink,
      }),
    );
    await activateSubscription(expSeeded.subscription);
    const { revisionId } = await publishNutritionPlan(
      expSeeded.client,
      makeDocWithAlternatives(true),
    );

    // Valid selection while active
    const okKey = randomUUID();
    const okRes = await expClientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revisionId,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: okKey,
      },
    );
    expect(okRes.error).toBeNull();
    expect(okRes.data).toMatchObject({ status: 'ok', selection_revision: 1 });

    // Expire subscription by backdating activated_at well past duration_days (61)
    await activateSubscription(expSeeded.subscription, '2020-01-01T00:00:00Z');

    // New selection while expired -> not_permitted
    const expiredNew = await expClientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revisionId,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222222',
        p_operation_key: randomUUID(),
      },
    );
    expect(expiredNew.error).toBeNull();
    expect(expiredNew.data).toEqual({ status: 'not_permitted' });

    // Replay of prior key while expired -> authorization rechecked -> not_permitted
    const expiredReplay = await expClientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revisionId,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: okKey,
      },
    );
    expect(expiredReplay.error).toBeNull();
    expect(expiredReplay.data).toEqual({ status: 'not_permitted' });

    // Direct DML via PostgREST (authenticated client & trainer) is denied
    const directInsertClient = await expClientAuth.client
      .from('client_nutrition_alternative_selections')
      .insert({
        workspace_id: fixture.wsA.id,
        plan_id: randomUUID(),
        plan_version_id: revisionId,
        client_id: expSeeded.client,
        item_id: '11111111-1111-4111-8111-111111111111',
        alternative_id: '22222222-2222-4222-8222-222222222222',
        created_by: expClientAuth.authUserId,
      });
    expect(directInsertClient.error).not.toBeNull();

    const directUpdateTrainer = await fixture.trainerA.client
      .from('client_nutrition_alternative_selections')
      .update({ alternative_id: '22222222-2222-4222-8222-222222222222' })
      .eq('plan_version_id', revisionId);
    expect(directUpdateTrainer.error).not.toBeNull();

    const directDeleteCounter = await expClientAuth.client
      .from('client_nutrition_selection_revision_counters')
      .delete()
      .eq('plan_version_id', revisionId);
    expect(directDeleteCounter.error).not.toBeNull();

    // Direct DML even via SQL (postgres without internal guard) is denied by trigger
    await expect(
      db`
        delete from public.client_nutrition_alternative_selections
        where workspace_id = ${fixture.wsA.id} and plan_version_id = ${revisionId}
      `,
    ).rejects.toThrow();

    await expect(
      db`
        update public.client_nutrition_selection_revision_counters
        set selection_revision = 0
        where workspace_id = ${fixture.wsA.id} and plan_version_id = ${revisionId}
      `,
    ).rejects.toThrow();
  });
});
