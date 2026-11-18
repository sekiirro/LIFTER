import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TransactionSql } from 'postgres';
import { expect } from 'vitest';
import type { NutritionDocumentV1 } from '../../lib/plans/nutrition/types';
import { admin, anonClient, checked, sql } from './harness';
import { clientContext, graph } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';
import { issue } from './registration-links-fixture';

// Spec 023 US3 shared fixture: a trainer-published F18 nutrition plan for a client
// with an active subscription, a second client of the same workspace, and the foods
// used for new alternatives. Everything is synthetic.

export const ITEM_ONE_ALT = '11111111-1111-4111-8111-111111111111';
export const ITEM_THREE_ALTS = '11111111-1111-4111-8111-111111111112';
export const ITEM_NO_ALTS = '11111111-1111-4111-8111-111111111113';
export const ALT_A = '22222222-2222-4222-8222-222222222221';
export const ALT_B = '22222222-2222-4222-8222-222222222222';
export const ALT_C = '22222222-2222-4222-8222-222222222223';
export const ALT_D = '22222222-2222-4222-8222-222222222224';

export type AuthClient = { client: SupabaseClient; authUserId: string };

export type FoodReplacementFixture = {
  f: Context;
  db: ReturnType<typeof sql>;
  client: AuthClient;
  otherClient: AuthClient;
  clientId: string;
  otherClientId: string;
  foods: { primary: string; alt1: string; alt2: string; replacement: string };
  publish: (doc: NutritionDocumentV1) => Promise<{
    planId: string;
    revisionId: string;
  }>;
  doc: (variant?: 'default' | 'without-item-one') => NutritionDocumentV1;
};

async function createAuthClientUser(): Promise<AuthClient> {
  const email = `f23-client-${randomUUID()}@example.test`;
  const password = `F23-${randomUUID()}-aA1!`;
  const created = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error(created.error?.message ?? 'Failed to create client user');
  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(signedIn.error.message);
  return { client, authUserId: created.data.user.id };
}

async function seedFood(
  tx: TransactionSql,
  creator: string,
  nameEn: string,
  kcal: number,
): Promise<string> {
  const id = randomUUID();
  await tx`insert into public.foods (id, created_by, current_version) values (${id}, ${creator}, 1)`;
  await tx`
    insert into public.food_versions (
      food_id, version, payload, created_by, name_ar, name_en, basis,
      product_identity_norm, preparation_identity_norm, weighing_state,
      kcal, protein_g, carbohydrate_g, fat_g, fiber_g
    ) values (
      ${id}, 1, '{}'::jsonb, ${creator}, ${nameEn}, ${nameEn}, 'g',
      ${`food:${id}`}, 'grilled', 'cooked', ${kcal}, 25.00, 10.00, 3.00, null
    )`;
  await tx`
    insert into public.food_serving_units (
      food_id, food_version, basis, unit_key, label_ar, label_en, basis_qty
    ) values (${id}, 1, 'g', 'g', 'جرام', 'Gram', 1.000)`;
  return id;
}

async function activate(
  db: ReturnType<typeof sql>,
  workspaceId: string,
  subscriptionId: string,
) {
  await db.begin(async (tx) => {
    await tx`alter table public.subscription_activations disable trigger user`;
    await tx`
      insert into public.subscription_activations (
        workspace_id, subscription_id, activated_at, delivery_event_id, activation_source
      ) values (${workspaceId}, ${subscriptionId}, now(), ${randomUUID()}, 'renewal')
      on conflict (workspace_id, subscription_id) do update set activated_at = excluded.activated_at`;
    await tx`alter table public.subscription_activations enable trigger user`;
  });
}

export async function setupFoodReplacement(): Promise<FoodReplacementFixture> {
  const f = await clientContext();
  const db = sql();
  const client = await createAuthClientUser();
  const otherClient = await createAuthClientUser();
  const otherLink = checked(await issue(f)) as string;
  const foods = {} as FoodReplacementFixture['foods'];
  const seeded = await db.begin(async (tx) => {
    const own = await graph(tx, f, { authUserId: client.authUserId });
    const other = await graph(tx, f, {
      authUserId: otherClient.authUserId,
      linkId: otherLink,
    });
    foods.primary = await seedFood(tx, f.trainerA.userId, 'Chicken', 165);
    foods.alt1 = await seedFood(tx, f.trainerA.userId, 'Salmon', 208);
    foods.alt2 = await seedFood(tx, f.trainerA.userId, 'Beef', 250);
    foods.replacement = await seedFood(tx, f.trainerA.userId, 'Tuna', 132);
    return { own, other };
  });
  await activate(db, f.wsA.id, seeded.own.subscription);

  const alt = (id: string, foodId: string, value: string) => ({
    id,
    foodId,
    foodVersion: 1,
    quantity: { value, unit: { kind: 'basis' as const, value: 'g' as const } },
  });
  const item = (
    id: string,
    alternatives: ReturnType<typeof alt>[],
    value = '150',
  ) => ({
    id,
    foodId: foods.primary,
    foodVersion: 1,
    quantity: { value, unit: { kind: 'basis' as const, value: 'g' as const } },
    note: null,
    alternatives,
  });
  const doc = (
    variant: 'default' | 'without-item-one' = 'default',
  ): NutritionDocumentV1 => ({
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
    meals: [
      {
        id: 'meal-1',
        name: { ar: 'وجبة', en: 'Meal' },
        note: null,
        recipeUrl: null,
        items: [
          ...(variant === 'default'
            ? [item(ITEM_ONE_ALT, [alt(ALT_A, foods.alt1, '200')])]
            : []),
          item(ITEM_THREE_ALTS, [
            alt(ALT_B, foods.alt1, '180'),
            alt(ALT_C, foods.alt2, '170'),
            alt(ALT_D, foods.alt1, '160'),
          ]),
          item(ITEM_NO_ALTS, [], '100'),
        ],
      },
    ],
    title: { ar: 'خطة', en: 'Plan' },
    notes: null,
  });

  const publish = async (document: NutritionDocumentV1) => {
    const created = await f.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: f.wsA.id,
      p_client_id: seeded.own.client,
      p_plan_kind: 'nutrition',
      p_content: document,
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();
    const planId = created.data as string;
    const published = await f.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(published.error).toBeNull();
    expect(published.data).toMatchObject({ status: 'ok', plan_id: planId });
    return {
      planId,
      revisionId: (published.data as { revision_id: string }).revision_id,
    };
  };

  return {
    f,
    db,
    client,
    otherClient,
    clientId: seeded.own.client,
    otherClientId: seeded.other.client,
    foods,
    publish,
    doc,
  };
}
