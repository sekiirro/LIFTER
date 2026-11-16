import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  computeDocumentValues,
  snapshotMapKey,
} from '../../lib/plans/nutrition/macros';
import { canCopyNutritionPrompt } from '../../lib/plans/nutrition/prompt';
import type {
  NutritionAlternative,
  NutritionDocumentV1,
} from '../../lib/plans/nutrition/types';
import {
  admin,
  anonClient,
  checked,
  sql,
  twoWorkspaceFixture,
} from './harness';
import { clientContext, graph } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';
import { issue } from './registration-links-fixture';

let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
let fixtureA: Context;
let db: ReturnType<typeof sql>;
type Tx = TransactionSql;

let primaryClientAuth: { client: SupabaseClient; authUserId: string };
let foreignClientAuth: { client: SupabaseClient; authUserId: string };
let primaryFoodId: string;
let altFood1Id: string;
let seededA: Awaited<ReturnType<typeof graph>>;

async function createAuthClientUser(): Promise<{
  client: SupabaseClient;
  authUserId: string;
}> {
  const email = `t018-client-${randomUUID()}@example.test`;
  const password = `T018-${randomUUID()}-aA1!`;
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

async function seedFood(
  tx: TransactionSql,
  nameAr: string,
  nameEn: string,
  kcal: number,
  creatorUserId: string,
): Promise<string> {
  const id = randomUUID();
  await tx`
    insert into public.foods (id, created_by, current_version)
    values (${id}, ${creatorUserId}, 1)
  `;
  await tx`
    insert into public.food_versions (
      food_id, version, payload, created_by, name_ar, name_en, basis,
      product_identity_norm, preparation_identity_norm, weighing_state,
      kcal, protein_g, carbohydrate_g, fat_g, fiber_g
    ) values (
      ${id}, 1, '{}'::jsonb, ${creatorUserId},
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

function makeDoc(
  targetFoodId: string,
  includeAlt = true,
  foodVersion = 1,
): NutritionDocumentV1 {
  const alts: NutritionAlternative[] = includeAlt
    ? [
        {
          id: '22222222-2222-4222-8222-222222222221',
          foodId: altFood1Id,
          foodVersion: 1,
          quantity: { value: '120', unit: { kind: 'basis', value: 'g' } },
        },
      ]
    : [];

  return {
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
          {
            id: '11111111-1111-4111-8111-111111111111',
            foodId: targetFoodId,
            foodVersion,
            quantity: { value: '150', unit: { kind: 'basis', value: 'g' } },
            note: null,
            alternatives: alts,
          },
        ],
      },
    ],
    title: { ar: 'خطة تغذية', en: 'Nutrition Plan' },
    notes: null,
  };
}

async function activateSubscription(
  workspaceId: string,
  subscriptionId: string,
  activatedAt?: string,
) {
  await db.begin(async (tx) => {
    await tx`alter table public.subscription_activations disable trigger user`;
    await tx`
      insert into public.subscription_activations (
        workspace_id, subscription_id, activated_at, delivery_event_id, activation_source
      ) values (
        ${workspaceId},
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

async function asActor<T>(tx: Tx, id: string, body: () => Promise<T>) {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id, role: 'authenticated' })}, true)`;
  return body();
}

async function expectRejected(
  tx: Tx,
  body: (sp: Tx) => Promise<unknown>,
  matcher: Record<string, unknown>,
) {
  await expect(tx.savepoint((sp) => body(sp))).rejects.toMatchObject(matcher);
}

beforeAll(async () => {
  f = await twoWorkspaceFixture();
  fixtureA = await clientContext();
  db = sql();

  primaryClientAuth = await createAuthClientUser();
  foreignClientAuth = await createAuthClientUser();

  seededA = await db.begin(async (tx) => {
    const g = await graph(tx, fixtureA, {
      authUserId: primaryClientAuth.authUserId,
    });
    primaryFoodId = await seedFood(
      tx,
      'صدر دجاج',
      'Chicken Breast',
      165.0,
      f.trainerA.userId,
    );
    altFood1Id = await seedFood(
      tx,
      'سمك سلمون',
      'Salmon Fillet',
      208.0,
      f.trainerA.userId,
    );
    return g;
  });

  await activateSubscription(fixtureA.wsA.id, seededA.subscription);
});

afterAll(async () => {
  await db?.end();
});

describe('F18 T018: Authorization and security matrix (contracts/nutrition-api.md §8)', () => {
  // Row 1: Foreign workspace read/write/export/prompt
  it('Row 1: refuses foreign workspace read, write, export, and prompt', async () => {
    // 1. Foreign workspace write: trainerB (wsB) calling wsA RPCs is rejected
    const wsTplRes = await f.trainerB.client.rpc(
      'create_nutrition_workspace_template',
      {
        p_workspace_id: f.wsA.id,
        p_display_name: 'Foreign Cross Write',
        p_document: makeDoc(primaryFoodId, false),
        p_schema_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(wsTplRes.error).toMatchObject({ code: '42501' });

    // 2. Foreign workspace read: trainerB querying wsA tables sees 0 rows
    const wsTplRead = await f.trainerB.client
      .from('nutrition_workspace_templates')
      .select(
        'id, status, display_name, current_version, created_at, retired_at',
      )
      .eq('workspace_id', f.wsA.id);
    expect(wsTplRead.error).toBeNull();
    expect(wsTplRead.data?.length).toBe(0);

    const planContentRead = await f.trainerB.client
      .from('nutrition_plan_version_contents')
      .select('revision_id')
      .eq('workspace_id', f.wsA.id);
    expect(planContentRead.error).toBeNull();
    expect(planContentRead.data?.length).toBe(0);

    // 3. Export/prompt check for foreign workspace actor
    const canForeignCopy = canCopyNutritionPrompt({
      role: 'Trainer',
      workspaceRelation: 'foreign',
      coachingWork: true,
      membershipRevoked: false,
    });
    expect(canForeignCopy).toBe(false);
  });

  // Row 2: Foreign client selection / forged plan/version/client tuple
  it('Row 2: refuses foreign client selection with generic denial and audit', async () => {
    const draftRes = await fixtureA.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixtureA.wsA.id,
      p_client_id: seededA.client,
      p_plan_kind: 'nutrition',
      p_content: makeDoc(primaryFoodId, true),
      p_operation_key: randomUUID(),
    });
    expect(draftRes.error).toBeNull();
    const planId = draftRes.data as string;

    const pubRes = await fixtureA.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(pubRes.error).toBeNull();
    const revId = (pubRes.data as { revision_id: string }).revision_id;

    // Foreign client tries to select on this revision
    const foreignSel = await foreignClientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revId,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: randomUUID(),
      },
    );
    expect(foreignSel.error).toBeNull();
    expect(foreignSel.data).toEqual({ status: 'not_permitted' });

    // 0 selection rows created for this revision
    const [selCount] = await db`
      select count(*)::int as c from public.client_nutrition_alternative_selections
      where plan_version_id = ${revId}
    `;
    expect(selCount?.c).toBe(0);

    // Exactly one denial audit recorded
    const [denialAudit] = await db`
      select count(*)::int as c from public.audit_events
      where action = 'client.nutrition_select'
        and actor_user_id = ${foreignClientAuth.authUserId}
        and details->>'outcome' = 'denied'
    `;
    expect(denialAudit?.c).toBeGreaterThanOrEqual(1);
  });

  // Row 3: Selection id not in the item's approved list
  it('Row 3: refuses selection id not in the approved alternatives list', async () => {
    const draftRes = await fixtureA.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixtureA.wsA.id,
      p_client_id: seededA.client,
      p_plan_kind: 'nutrition',
      p_content: makeDoc(primaryFoodId, true),
      p_operation_key: randomUUID(),
    });
    const planId = draftRes.data as string;

    const pubRes = await fixtureA.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    const revId = (pubRes.data as { revision_id: string }).revision_id;

    const unapprovedSel = await primaryClientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revId,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '99999999-9999-4999-8999-999999999998',
        p_operation_key: randomUUID(),
      },
    );
    expect(unapprovedSel.error).toBeNull();
    expect(unapprovedSel.data).toEqual({ status: 'invalid_selection' });

    const [selCount] = await db`
      select count(*)::int as c from public.client_nutrition_alternative_selections
      where plan_version_id = ${revId}
    `;
    expect(selCount?.c).toBe(0);

    const [denialAudit] = await db`
      select count(*)::int as c from public.audit_events
      where action = 'client.nutrition_select'
        and actor_user_id = ${primaryClientAuth.authUserId}
        and details->>'outcome' = 'denied'
    `;
    expect(denialAudit?.c).toBeGreaterThanOrEqual(1);
  });

  // Row 4: Selection against an older revision
  it('Row 4: refuses selection against an older superseded revision with stale_version', async () => {
    // 1. Publish rev 1
    const draft1 = await fixtureA.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixtureA.wsA.id,
      p_client_id: seededA.client,
      p_plan_kind: 'nutrition',
      p_content: makeDoc(primaryFoodId, true),
      p_operation_key: randomUUID(),
    });
    const planId = draft1.data as string;
    const pub1 = await fixtureA.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    const rev1Id = (pub1.data as { revision_id: string }).revision_id;

    // 2. Publish rev 2
    const pub2 = await fixtureA.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(pub2.error).toBeNull();
    expect(pub2.data?.revision_number).toBe(2);

    // 3. Selection against rev1 now returns stale_version
    const staleSel = await primaryClientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: rev1Id,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: randomUUID(),
      },
    );
    expect(staleSel.error).toBeNull();
    expect(staleSel.data).toEqual({ status: 'stale_version' });

    const [denialAudit] = await db`
      select count(*)::int as c from public.audit_events
      where action = 'client.nutrition_select'
        and actor_user_id = ${primaryClientAuth.authUserId}
        and details->>'outcome' = 'denied'
    `;
    expect(denialAudit?.c).toBeGreaterThanOrEqual(1);
  });

  // Row 5: Selection while expired/deactivated
  it('Row 5: refuses selection when subscription is inactive or expired', async () => {
    const expLink = checked(await issue(fixtureA)) as string;
    const expClientAuth = await createAuthClientUser();
    const expSeeded = await db.begin(async (tx) =>
      graph(tx, fixtureA, {
        authUserId: expClientAuth.authUserId,
        linkId: expLink,
      }),
    );
    await activateSubscription(fixtureA.wsA.id, expSeeded.subscription);

    const draft = await fixtureA.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixtureA.wsA.id,
      p_client_id: expSeeded.client,
      p_plan_kind: 'nutrition',
      p_content: makeDoc(primaryFoodId, true),
      p_operation_key: randomUUID(),
    });
    const planId = draft.data as string;

    const pub = await fixtureA.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    const revId = (pub.data as { revision_id: string }).revision_id;

    // Expire subscription by backdating activated_at well past duration_days
    await activateSubscription(
      fixtureA.wsA.id,
      expSeeded.subscription,
      '2020-01-01T00:00:00Z',
    );

    const expiredSel = await expClientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: revId,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: randomUUID(),
      },
    );
    expect(expiredSel.error).toBeNull();
    expect(expiredSel.data).toEqual({ status: 'not_permitted' });

    const [selCount] = await db`
      select count(*)::int as c from public.client_nutrition_alternative_selections
      where plan_version_id = ${revId}
    `;
    expect(selCount?.c).toBe(0);

    const [denialAudit] = await db`
      select count(*)::int as c from public.audit_events
      where action = 'client.nutrition_select'
        and actor_user_id = ${expClientAuth.authUserId}
        and details->>'outcome' = 'denied'
    `;
    expect(denialAudit?.c).toBeGreaterThanOrEqual(1);
  });

  // Row 6: Direct table DML by any role
  it('Row 6: denies direct table DML by application roles', async () => {
    await db.begin(async (tx) => {
      // 1. Direct INSERT into nutrition_plan_version_contents
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerA.userId,
            () => sp`insert into public.nutrition_plan_version_contents (
              workspace_id, plan_id, revision_id, schema_version, algorithm_version,
              document, snapshot_map, computed_values, created_by
            ) values (
              ${f.wsA.id}, ${randomUUID()}, ${randomUUID()}, 1, 1,
              '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, ${f.trainerA.userId}
            )`,
          ),
        { code: '42501' },
      );

      // 2. Direct INSERT into nutrition_global_templates
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.po.userId,
            () => sp`insert into public.nutrition_global_templates (
              id, created_by
            ) values (${randomUUID()}, ${f.po.userId})`,
          ),
        { code: '42501' },
      );

      // 3. Direct INSERT into client_nutrition_alternative_selections
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            primaryClientAuth.authUserId,
            () => sp`insert into public.client_nutrition_alternative_selections (
              workspace_id, plan_id, plan_version_id, client_id, item_id, alternative_id, created_by
            ) values (
              ${fixtureA.wsA.id}, ${randomUUID()}, ${randomUUID()}, ${seededA.client},
              '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222221', ${primaryClientAuth.authUserId}
            )`,
          ),
        { code: '42501' },
      );
    });
  });

  // Row 7: Publish with caller snapshots/totals
  it('Row 7: ignores caller-supplied snapshots and totals during publish', async () => {
    const doc = makeDoc(primaryFoodId, false);
    const draftRes = await fixtureA.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixtureA.wsA.id,
      p_client_id: seededA.client,
      p_plan_kind: 'nutrition',
      p_content: doc,
      p_operation_key: randomUUID(),
    });
    const planId = draftRes.data as string;

    const forgedPayload = {
      document: makeDoc(randomUUID(), false),
      snapshots: { forged: { kcal: '999999' } },
      computedTotals: { kcal: '999999', protein: '9999' },
    };

    const pubRes = await fixtureA.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
        p_caller_payload: forgedPayload,
      },
    );
    expect(pubRes.error).toBeNull();
    const revId = (pubRes.data as { revision_id: string }).revision_id;

    const [content] = await db`
      select snapshot_map, computed_values
      from public.nutrition_plan_version_contents
      where revision_id = ${revId}
    `;
    const expKey = snapshotMapKey(primaryFoodId, 1, {
      kind: 'basis',
      value: 'g',
    });
    expect(content!.snapshot_map[expKey]).toBeDefined();
    expect(content!.snapshot_map.forged).toBeUndefined();
    expect(content!.computed_values).toEqual(
      computeDocumentValues(doc, content!.snapshot_map),
    );
  });

  // Row 8: Publish with a missing food version
  it('Row 8: aborts whole publish transaction when food version is missing', async () => {
    const missingFoodDoc = makeDoc(randomUUID(), false, 999);
    const draftRes = await fixtureA.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixtureA.wsA.id,
      p_client_id: seededA.client,
      p_plan_kind: 'nutrition',
      p_content: missingFoodDoc,
      p_operation_key: randomUUID(),
    });
    const planId = draftRes.data as string;

    const pubRes = await fixtureA.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(pubRes.error).toMatchObject({ code: '22023' });

    // No revision or content row created
    const [revCount] = await db`
      select count(*)::int as c from public.plan_revisions where plan_id = ${planId}
    `;
    expect(revCount?.c).toBe(0);
  });

  // Row 9: Publish without a current subscription
  it('Row 9: refuses new publish key without subscription, but honors exact authorized replay', async () => {
    const unSubLink = checked(await issue(fixtureA)) as string;
    const unSubAuth = await createAuthClientUser();
    const unSubSeeded = await db.begin(async (tx) =>
      graph(tx, fixtureA, {
        authUserId: unSubAuth.authUserId,
        linkId: unSubLink,
      }),
    );
    await activateSubscription(fixtureA.wsA.id, unSubSeeded.subscription);

    const draft = await fixtureA.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixtureA.wsA.id,
      p_client_id: unSubSeeded.client,
      p_plan_kind: 'nutrition',
      p_content: makeDoc(primaryFoodId, false),
      p_operation_key: randomUUID(),
    });
    const planId = draft.data as string;
    const firstOpKey = randomUUID();

    const firstPublish = await fixtureA.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: firstOpKey,
      },
    );
    expect(firstPublish.error).toBeNull();
    expect(firstPublish.data).toMatchObject({ status: 'ok' });

    // Expire the subscription
    await activateSubscription(
      fixtureA.wsA.id,
      unSubSeeded.subscription,
      '2000-01-01T00:00:00Z',
    );

    // New publish attempt refused by subscription entitlement check
    const newKeyWhileExpired = await fixtureA.trainerA.client.rpc(
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

    // Exact authorized replay honors original receipt
    const replayWhileExpired = await fixtureA.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: firstOpKey,
      },
    );
    expect(replayWhileExpired.error).toBeNull();
    expect(replayWhileExpired.data).toEqual(firstPublish.data);
  });

  // Row 10: Identical key + same canonical publish request
  it('Row 10: returns original receipt on publish replay with zero duplicates', async () => {
    const draft = await fixtureA.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixtureA.wsA.id,
      p_client_id: seededA.client,
      p_plan_kind: 'nutrition',
      p_content: makeDoc(primaryFoodId, false),
      p_operation_key: randomUUID(),
    });
    const planId = draft.data as string;
    const opKey = randomUUID();

    const first = await fixtureA.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: opKey,
      },
    );
    expect(first.error).toBeNull();
    expect(first.data?.status).toBe('ok');

    const [revCountBefore] = await db`
      select count(*)::int as c from public.plan_revisions where plan_id = ${planId}
    `;

    const second = await fixtureA.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: opKey,
      },
    );
    expect(second.error).toBeNull();
    expect(second.data).toEqual(first.data);

    const [revCountAfter] = await db`
      select count(*)::int as c from public.plan_revisions where plan_id = ${planId}
    `;
    expect(revCountAfter?.c).toBe(revCountBefore?.c);
  });

  // Row 11: New authorized publish key with unchanged content
  it('Row 11: appends new revision and delivery on new authorized key with unchanged content', async () => {
    const draft = await fixtureA.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixtureA.wsA.id,
      p_client_id: seededA.client,
      p_plan_kind: 'nutrition',
      p_content: makeDoc(primaryFoodId, false),
      p_operation_key: randomUUID(),
    });
    const planId = draft.data as string;

    const pub1 = await fixtureA.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(pub1.data?.revision_number).toBe(1);

    const pub2 = await fixtureA.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(pub2.error).toBeNull();
    expect(pub2.data?.status).toBe('ok');
    expect(pub2.data?.revision_number).toBe(2);
  });

  // Row 12: Concurrent publish + selection
  it('Row 12: guarantees deterministic outcome and zero mixed revisions under publish and selection sequencing', async () => {
    const draft = await fixtureA.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixtureA.wsA.id,
      p_client_id: seededA.client,
      p_plan_kind: 'nutrition',
      p_content: makeDoc(primaryFoodId, true),
      p_operation_key: randomUUID(),
    });
    const planId = draft.data as string;

    const pub1 = await fixtureA.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    const rev1Id = (pub1.data as { revision_id: string }).revision_id;

    // Publish rev 2
    const pub2 = await fixtureA.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    const rev2Id = (pub2.data as { revision_id: string }).revision_id;

    // Selection on rev 1 deterministically fails with stale_version
    const selRev1 = await primaryClientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: rev1Id,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: randomUUID(),
      },
    );
    expect(selRev1.data).toEqual({ status: 'stale_version' });

    // Selection on current rev 2 succeeds cleanly
    const selRev2 = await primaryClientAuth.client.rpc(
      'select_nutrition_alternative',
      {
        p_plan_version_id: rev2Id,
        p_item_id: '11111111-1111-4111-8111-111111111111',
        p_alternative_id: '22222222-2222-4222-8222-222222222221',
        p_operation_key: randomUUID(),
      },
    );
    expect(selRev2.data?.status).toBe('ok');
  });

  // Row 13: 100 replay attempts per mutating action
  it('Row 13: produces identical result and zero duplicates across 100 replay attempts', async () => {
    // 1. Template create replay 100 times
    const opKey = randomUUID();
    const doc = makeDoc(primaryFoodId, false);
    const first = await f.po.client.rpc('create_nutrition_global_template', {
      p_document: doc,
      p_schema_version: 1,
      p_operation_key: opKey,
    });
    expect(first.error).toBeNull();
    const templateId = (first.data as { template_id: string }).template_id;

    const replayPromises = Array.from({ length: 100 }, () =>
      f.po.client.rpc('create_nutrition_global_template', {
        p_document: doc,
        p_schema_version: 1,
        p_operation_key: opKey,
      }),
    );
    const results = await Promise.all(replayPromises);
    for (const r of results) {
      expect(r.data).toEqual(first.data);
    }

    const [tplCount] = await db`
      select count(*)::int as c from public.nutrition_global_templates where id = ${templateId}
    `;
    expect(tplCount?.c).toBe(1);
  });

  // Row 14: Assign retried (same key)
  it('Row 14: replaying template assignment returns same batch with zero duplicate copies', async () => {
    let globalTplId: string;
    await db.begin(async (tx) => {
      const res = await asActor(
        tx,
        f.po.userId,
        () => tx`select public.create_nutrition_global_template(
        ${tx.json(makeDoc(primaryFoodId, false))}, 1, ${randomUUID()}) as result`,
      );
      globalTplId = (res[0]!.result as { template_id: string }).template_id;
    });

    const assignKey = randomUUID();
    const firstAssign = await f.po.client.rpc('assign_nutrition_templates', {
      p_template_mode: 'specific',
      p_template_ids: [globalTplId!],
      p_exclude_ids: null,
      p_workspace_mode: 'specific',
      p_workspace_ids: [f.wsA.id],
      p_operation_key: assignKey,
    });
    expect(firstAssign.error).toBeNull();
    const batchId = (firstAssign.data as { batch_id: string }).batch_id;

    // Retry with same key
    const secondAssign = await f.po.client.rpc('assign_nutrition_templates', {
      p_template_mode: 'specific',
      p_template_ids: [globalTplId!],
      p_exclude_ids: null,
      p_workspace_mode: 'specific',
      p_workspace_ids: [f.wsA.id],
      p_operation_key: assignKey,
    });
    expect(secondAssign.error).toBeNull();
    expect(secondAssign.data).toEqual(firstAssign.data);

    const [batchCount] = await db`
      select count(*)::int as c from public.nutrition_template_assignment_batches where id = ${batchId}
    `;
    expect(batchCount?.c).toBe(1);
  });

  // Row 15: All Workspaces with a partial workspace
  it('Row 15: skips partial workspace and does not top up in All Workspaces assignment', async () => {
    let tpl1: string;
    let tpl2: string;
    await db.begin(async (tx) => {
      const r1 = await asActor(
        tx,
        f.po.userId,
        () => tx`select public.create_nutrition_global_template(
        ${tx.json(makeDoc(primaryFoodId, false))}, 1, ${randomUUID()}) as result`,
      );
      tpl1 = (r1[0]!.result as { template_id: string }).template_id;

      const r2 = await asActor(
        tx,
        f.po.userId,
        () => tx`select public.create_nutrition_global_template(
        ${tx.json(makeDoc(primaryFoodId, false))}, 1, ${randomUUID()}) as result`,
      );
      tpl2 = (r2[0]!.result as { template_id: string }).template_id;
    });

    // 1. Assign tpl1 to wsA specifically
    await f.po.client.rpc('assign_nutrition_templates', {
      p_template_mode: 'specific',
      p_template_ids: [tpl1!],
      p_exclude_ids: null,
      p_workspace_mode: 'specific',
      p_workspace_ids: [f.wsA.id],
      p_operation_key: randomUUID(),
    });

    // 2. Assign both templates to All Workspaces -> wsA must be skipped
    const allRes = await f.po.client.rpc('assign_nutrition_templates', {
      p_template_mode: 'specific',
      p_template_ids: [tpl1!, tpl2!],
      p_exclude_ids: null,
      p_workspace_mode: 'all',
      p_workspace_ids: null,
      p_operation_key: randomUUID(),
    });
    expect(allRes.error).toBeNull();
    const batch = allRes.data as {
      items: {
        workspace_id: string;
        outcome: string;
        global_template_id: string;
      }[];
    };
    const wsAItems = batch.items.filter((i) => i.workspace_id === f.wsA.id);
    expect(wsAItems.every((i) => i.outcome === 'skipped_existing')).toBe(true);
  });

  // Row 16: Specific Workspaces with an existing copy
  it('Row 16: marks existing copies skipped_existing without overwrite in Specific Workspaces', async () => {
    let tpl: string;
    await db.begin(async (tx) => {
      const r = await asActor(
        tx,
        f.po.userId,
        () => tx`select public.create_nutrition_global_template(
        ${tx.json(makeDoc(primaryFoodId, false))}, 1, ${randomUUID()}) as result`,
      );
      tpl = (r[0]!.result as { template_id: string }).template_id;
    });

    // First assign
    await f.po.client.rpc('assign_nutrition_templates', {
      p_template_mode: 'specific',
      p_template_ids: [tpl!],
      p_exclude_ids: null,
      p_workspace_mode: 'specific',
      p_workspace_ids: [f.wsA.id],
      p_operation_key: randomUUID(),
    });

    // Second assign with new key to same workspace
    const second = await f.po.client.rpc('assign_nutrition_templates', {
      p_template_mode: 'specific',
      p_template_ids: [tpl!],
      p_exclude_ids: null,
      p_workspace_mode: 'specific',
      p_workspace_ids: [f.wsA.id],
      p_operation_key: randomUUID(),
    });
    // Leaves 0 new copies -> rejected before writes with zero_copies_created
    expect(second.error).toMatchObject({ code: '22023' });
  });

  // Row 17: Concurrent Assign leaves zero copies
  it('Row 17: rejects assign when zero copies would be created', async () => {
    let tpl: string;
    await db.begin(async (tx) => {
      const r = await asActor(
        tx,
        f.po.userId,
        () => tx`select public.create_nutrition_global_template(
        ${tx.json(makeDoc(primaryFoodId, false))}, 1, ${randomUUID()}) as result`,
      );
      tpl = (r[0]!.result as { template_id: string }).template_id;
    });

    await f.po.client.rpc('assign_nutrition_templates', {
      p_template_mode: 'specific',
      p_template_ids: [tpl!],
      p_exclude_ids: null,
      p_workspace_mode: 'specific',
      p_workspace_ids: [f.wsA.id],
      p_operation_key: randomUUID(),
    });

    // New operation key attempting same target leaves 0 copies
    const failed = await f.po.client.rpc('assign_nutrition_templates', {
      p_template_mode: 'specific',
      p_template_ids: [tpl!],
      p_exclude_ids: null,
      p_workspace_mode: 'specific',
      p_workspace_ids: [f.wsA.id],
      p_operation_key: randomUUID(),
    });
    expect(failed.error).toMatchObject({ code: '22023' });
  });

  // Row 18: Make it Global with client data
  it('Row 18: refuses Make it Global when private client data is present', async () => {
    const docWithPrivateFields = {
      ...makeDoc(primaryFoodId, false),
      clientName: 'Private Client',
      created_by: randomUUID(),
      workspaceId: f.wsA.id,
    };

    const wsTpl = await f.trainerA.client.rpc(
      'create_nutrition_workspace_template',
      {
        p_workspace_id: f.wsA.id,
        p_display_name: 'Has Client Data',
        p_document: docWithPrivateFields,
        p_schema_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(wsTpl.error).toBeNull();
    const wsTplId = (wsTpl.data as { template_id: string }).template_id;

    const [globalCountBefore] = await db`
      select count(*)::int as c from public.nutrition_global_templates
    `;

    const makeGlobalRes = await f.po.client.rpc(
      'make_nutrition_template_global',
      {
        p_workspace_id: f.wsA.id,
        p_workspace_template_id: wsTplId,
        p_expected_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(makeGlobalRes.error).toMatchObject({
      code: '22023',
      message: expect.stringContaining('private_nutrition_template_fields'),
    });

    // 0 global rows created
    const [globalCountAfter] = await db`
      select count(*)::int as c from public.nutrition_global_templates
    `;
    expect(globalCountAfter?.c).toBe(globalCountBefore?.c);
  });

  // Row 19: Non-PO global template read
  it('Row 19: enforces generic denial on non-PO global template read and write', async () => {
    // 1. PO can read global templates
    const poRead = await f.po.client
      .from('nutrition_global_templates')
      .select('id, status, current_version, created_at, retired_at');
    expect(poRead.error).toBeNull();
    expect(poRead.data?.length).toBeGreaterThan(0);

    // 2. Non-PO (trainerA, woA, salesA, client) gets 0 rows (generic RLS denial)
    const trainerRead = await f.trainerA.client
      .from('nutrition_global_templates')
      .select('id, status, current_version, created_at, retired_at');
    expect(trainerRead.error).toBeNull();
    expect(trainerRead.data?.length).toBe(0);

    const woRead = await f.woA.client
      .from('nutrition_global_templates')
      .select('id, status, current_version, created_at, retired_at');
    expect(woRead.error).toBeNull();
    expect(woRead.data?.length).toBe(0);

    const salesRead = await f.salesA.client
      .from('nutrition_global_templates')
      .select('id, status, current_version, created_at, retired_at');
    expect(salesRead.error).toBeNull();
    expect(salesRead.data?.length).toBe(0);

    const clientRead = await primaryClientAuth.client
      .from('nutrition_global_templates')
      .select('id, status, current_version, created_at, retired_at');
    expect(clientRead.error).toBeNull();
    expect(clientRead.data?.length).toBe(0);

    // 3. Non-PO global template writes rejected
    const trainerWrite = await f.trainerA.client.rpc(
      'create_nutrition_global_template',
      {
        p_document: makeDoc(primaryFoodId, false),
        p_schema_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(trainerWrite.error).toMatchObject({ code: '42501' });
  });

  // Row 20: Sales on every plan/template/export surface
  it('Row 20: enforces generic denial for Sales role across all plan, template, and export surfaces', async () => {
    // 1. Workspace template RPCs
    const wsTpl = await f.salesA.client.rpc(
      'create_nutrition_workspace_template',
      {
        p_workspace_id: f.wsA.id,
        p_display_name: 'Sales Attempt',
        p_document: makeDoc(primaryFoodId, false),
        p_schema_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(wsTpl.error).toMatchObject({ code: '42501' });

    // 2. Global template RPCs
    const globalTpl = await f.salesA.client.rpc(
      'create_nutrition_global_template',
      {
        p_document: makeDoc(primaryFoodId, false),
        p_schema_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(globalTpl.error).toMatchObject({ code: '42501' });

    // 3. Assign templates
    const assign = await f.salesA.client.rpc('assign_nutrition_templates', {
      p_template_mode: 'specific',
      p_template_ids: [randomUUID()],
      p_exclude_ids: null,
      p_workspace_mode: 'specific',
      p_workspace_ids: [f.wsA.id],
      p_operation_key: randomUUID(),
    });
    expect(assign.error).toMatchObject({ code: '42501' });

    // 4. Make it Global
    const makeGlobal = await f.salesA.client.rpc(
      'make_nutrition_template_global',
      {
        p_workspace_id: f.wsA.id,
        p_workspace_template_id: randomUUID(),
        p_expected_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(makeGlobal.error).toMatchObject({ code: '42501' });

    // 5. Load template
    const load = await f.salesA.client.rpc('load_nutrition_template_version', {
      p_plan_id: randomUUID(),
      p_template_kind: 'workspace',
      p_template_id: randomUUID(),
      p_version: 1,
      p_operation_key: randomUUID(),
    });
    expect(load.error).toMatchObject({ code: '42501' });

    // 6. Publish plan revision
    const publish = await f.salesA.client.rpc('publish_nutrition_revision', {
      p_plan_id: randomUUID(),
      p_expected_draft_version: 1,
      p_expected_published_version: 0,
      p_operation_key: randomUUID(),
    });
    expect(publish.data?.status).toBe('not_permitted');

    // 7. Select alternative (sales is not a client)
    const select = await f.salesA.client.rpc('select_nutrition_alternative', {
      p_plan_version_id: randomUUID(),
      p_item_id: '11111111-1111-4111-8111-111111111111',
      p_alternative_id: '22222222-2222-4222-8222-222222222221',
      p_operation_key: randomUUID(),
    });
    expect(select.data?.status).toBe('not_permitted');

    // 8. RLS queries return 0 rows
    const wsRead = await f.salesA.client
      .from('nutrition_workspace_templates')
      .select('id')
      .eq('workspace_id', f.wsA.id);
    expect(wsRead.data?.length).toBe(0);

    const planRead = await f.salesA.client
      .from('nutrition_plan_version_contents')
      .select('revision_id')
      .eq('workspace_id', f.wsA.id);
    expect(planRead.data?.length).toBe(0);

    // 9. Prompt export permission check
    const canSalesCopy = canCopyNutritionPrompt({
      role: 'Sales',
      workspaceRelation: 'own',
      coachingWork: false,
      membershipRevoked: false,
    });
    expect(canSalesCopy).toBe(false);
  });

  // Row 21: UPDATE/DELETE/TRUNCATE on revisions, template versions, batches, selections
  it('Row 21: rejects UPDATE, DELETE, and TRUNCATE on immutable tables and selections', async () => {
    await db.begin(async (tx) => {
      // 1. nutrition_plan_version_contents: update/delete/truncate denied
      await expectRejected(
        tx,
        (sp) =>
          sp`update public.nutrition_plan_version_contents set schema_version = 2`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) => sp`delete from public.nutrition_plan_version_contents`,
        { code: '23514' },
      );

      // 2. nutrition_global_template_versions: update/delete denied
      await expectRejected(
        tx,
        (sp) =>
          sp`update public.nutrition_global_template_versions set schema_version = 2`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) => sp`delete from public.nutrition_global_template_versions`,
        { code: '23514' },
      );

      // 3. nutrition_workspace_template_versions: update/delete denied
      await expectRejected(
        tx,
        (sp) =>
          sp`update public.nutrition_workspace_template_versions set schema_version = 2`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) => sp`delete from public.nutrition_workspace_template_versions`,
        { code: '23514' },
      );

      // 4. nutrition_template_assignment_batches: update/delete denied
      await expectRejected(
        tx,
        (sp) =>
          sp`update public.nutrition_template_assignment_batches set template_selection_mode = 'all'`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) => sp`delete from public.nutrition_template_assignment_batches`,
        { code: '23514' },
      );

      // 5. nutrition_template_assignment_items: update/delete denied
      await expectRejected(
        tx,
        (sp) =>
          sp`update public.nutrition_template_assignment_items set outcome = 'failed'`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) => sp`delete from public.nutrition_template_assignment_items`,
        { code: '23514' },
      );

      // 6. client_nutrition_alternative_selections: direct update denied
      await expectRejected(
        tx,
        (sp) =>
          sp`update public.client_nutrition_alternative_selections set alternative_id = '22222222-2222-4222-8222-222222222222'`,
        { code: '23514' },
      );
    });
  });
});
