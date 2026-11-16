import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NutritionDocumentV1 } from '../../lib/plans/nutrition/types';
import { admin, createStaff } from './harness';
import { clientContext, graph, sql } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';

let fixture: Context;
let db: ReturnType<typeof sql>;
let seeded: Awaited<ReturnType<typeof graph>>;
let foodId: string;
let trainer2: Awaited<ReturnType<typeof createStaff>>;

beforeAll(async () => {
  fixture = await clientContext();
  db = sql();

  // Create a second staff trainer in wsA for multi-contributor editing
  trainer2 = await createStaff('trainer', 'trainer-a2');
  const membershipRes = await admin().from('workspace_memberships').insert({
    workspace_id: fixture.wsA.id,
    user_id: trainer2.userId,
    granted_by: fixture.po.userId,
  });
  if (membershipRes.error) {
    throw new Error(
      `Failed to create trainer2 membership: ${membershipRes.error.message}`,
    );
  }

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

function makeDoc(
  targetFoodId: string,
  foodVersion = 1,
  note?: string,
): NutritionDocumentV1 {
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
        note: note ?? null,
        recipeUrl: null,
        items: [
          {
            id: '33333333-3333-4333-8333-333333333371',
            foodId: targetFoodId,
            foodVersion,
            quantity: { value: '150', unit: { kind: 'basis', value: 'g' } },
            note: null,
            alternatives: [],
          },
        ],
      },
    ],
    title: { ar: 'خطة تغذية', en: 'Nutrition Plan' },
    notes: null,
  };
}

describe('F18 T017 / S60-R43 Contributor Attribution', () => {
  it('records immutable workspace-scoped contributors with two-staff edit and avoids missing contributors', async () => {
    // Trainer A creates draft version 1
    const doc1 = makeDoc(foodId, 1, 'Draft v1 note by Trainer A');
    const created = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'nutrition',
      p_content: doc1,
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();
    const planId = created.data as string;

    // Second staff (trainer2) edits/saves draft version 2
    const doc2 = makeDoc(foodId, 1, 'Draft v2 note edited by Trainer 2');
    const saved = await trainer2.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 1,
      p_content: doc2,
      p_operation_key: randomUUID(),
    });
    expect(saved.error).toBeNull();
    expect(saved.data).toBe(2);

    // Trainer A publishes revision 1
    const pubRes = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: planId,
        p_expected_draft_version: 2,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(pubRes.error).toBeNull();
    expect(pubRes.data).toMatchObject({
      status: 'ok',
      plan_id: planId,
      revision_number: 1,
    });
    const receipt1 = pubRes.data as { revision_id: string };

    // Query public.plan_revision_contributors for revision 1
    const contributorsRev1 = await db`
      select workspace_id, plan_id, revision_id, user_id, first_contributed_at
      from public.plan_revision_contributors
      where revision_id = ${receipt1.revision_id}
      order by user_id
    `;

    // Must contain BOTH Trainer A and Trainer 2 (neither missing)
    expect(contributorsRev1.length).toBe(2);
    const userIds1 = contributorsRev1.map((r) => r.user_id).sort();
    const expectedUserIds1 = [fixture.trainerA.userId, trainer2.userId].sort();
    expect(userIds1).toEqual(expectedUserIds1);

    for (const row of contributorsRev1) {
      expect(row.workspace_id).toBe(fixture.wsA.id);
      expect(row.plan_id).toBe(planId);
      expect(row.revision_id).toBe(receipt1.revision_id);
      expect(row.first_contributed_at).toBeDefined();
    }

    // Now test draft contributors consumption / clearing across revisions:
    // Only Trainer 2 edits draft to version 3
    const doc3 = makeDoc(foodId, 1, 'Draft v3 note edited only by Trainer 2');
    const saved2 = await trainer2.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 2,
      p_content: doc3,
      p_operation_key: randomUUID(),
    });
    expect(saved2.error).toBeNull();
    expect(saved2.data).toBe(3);

    // Trainer 2 publishes revision 2
    const pubRes2 = await trainer2.client.rpc('publish_nutrition_revision', {
      p_plan_id: planId,
      p_expected_draft_version: 3,
      p_expected_published_version: 1,
      p_operation_key: randomUUID(),
    });
    expect(pubRes2.error).toBeNull();
    const receipt2 = pubRes2.data as { revision_id: string };

    // Query contributors for revision 2: ONLY Trainer 2 should be present
    const contributorsRev2 = await db`
      select workspace_id, plan_id, revision_id, user_id, first_contributed_at
      from public.plan_revision_contributors
      where revision_id = ${receipt2.revision_id}
    `;
    expect(contributorsRev2.length).toBe(1);
    expect(contributorsRev2[0]!.user_id).toBe(trainer2.userId);
    expect(contributorsRev2[0]!.workspace_id).toBe(fixture.wsA.id);
  });

  it('rejects mutable contributor rows (UPDATE, DELETE, TRUNCATE and client DML)', async () => {
    // Fetch an existing contributor row
    const [row] = await db`
      select revision_id, user_id, workspace_id
      from public.plan_revision_contributors
      limit 1
    `;
    expect(row).toBeDefined();

    // 1. Direct SQL UPDATE rejected by trigger
    await expect(
      db`
        update public.plan_revision_contributors
        set first_contributed_at = now() - interval '1 hour'
        where revision_id = ${row!.revision_id} and user_id = ${row!.user_id}
      `,
    ).rejects.toThrow(/plan_revision_contributors_immutable|23514/);

    // 2. Direct SQL DELETE rejected by trigger
    await expect(
      db`
        delete from public.plan_revision_contributors
        where revision_id = ${row!.revision_id} and user_id = ${row!.user_id}
      `,
    ).rejects.toThrow(/plan_revision_contributors_immutable|23514/);

    // 3. Direct SQL TRUNCATE rejected by trigger
    await expect(
      db`truncate table public.plan_revision_contributors`,
    ).rejects.toThrow(/plan_revision_contributors_immutable|23514/);

    // 4. Authenticated client DML denied
    const clientInsert = await fixture.trainerA.client
      .from('plan_revision_contributors')
      .insert({
        workspace_id: row!.workspace_id,
        plan_id: randomUUID(),
        revision_id: row!.revision_id,
        user_id: fixture.trainerA.userId,
      });
    expect(clientInsert.error).not.toBeNull();

    const clientUpdate = await fixture.trainerA.client
      .from('plan_revision_contributors')
      .update({ first_contributed_at: new Date().toISOString() })
      .eq('revision_id', row!.revision_id);
    expect(clientUpdate.error).not.toBeNull();

    const clientDelete = await fixture.trainerA.client
      .from('plan_revision_contributors')
      .delete()
      .eq('revision_id', row!.revision_id);
    expect(clientDelete.error).not.toBeNull();
  });

  it('rejects foreign-workspace contributor rows via composite FK and isolates via RLS', async () => {
    const [existingRow] = await db`
      select workspace_id, plan_id, revision_id, user_id
      from public.plan_revision_contributors
      where workspace_id = ${fixture.wsA.id}
      limit 1
    `;
    expect(existingRow).toBeDefined();

    // 1. Foreign-workspace contributor insert rejected by composite FK:
    // Trying to insert a row pointing to wsA's revision_id with workspace_id = wsB.id
    await expect(
      db`
        insert into public.plan_revision_contributors (
          workspace_id, plan_id, revision_id, user_id, first_contributed_at
        ) values (
          ${fixture.wsB.id}, ${existingRow!.plan_id}, ${existingRow!.revision_id},
          ${fixture.trainerB.userId}, now()
        )
      `,
    ).rejects.toThrow(/violates foreign key constraint|23503/);

    // 2. RLS read scoping: Trainer B in wsB cannot select wsA's contributors
    const trainerBRead = await fixture.trainerB.client
      .from('plan_revision_contributors')
      .select('*')
      .eq('revision_id', existingRow!.revision_id);
    expect(trainerBRead.error).toBeNull();
    expect(trainerBRead.data).toEqual([]);

    // But Trainer A in wsA CAN read wsA's contributors
    const trainerARead = await fixture.trainerA.client
      .from('plan_revision_contributors')
      .select('*')
      .eq('revision_id', existingRow!.revision_id);
    expect(trainerARead.error).toBeNull();
    expect(trainerARead.data!.length).toBeGreaterThan(0);
  });

  it('verifies RLS enabled and forced on public.plan_revision_contributors', async () => {
    const [tableInfo] = await db`
      select relrowsecurity, relforcerowsecurity
      from pg_catalog.pg_class
      where oid = 'public.plan_revision_contributors'::regclass
    `;
    expect(tableInfo).toEqual({
      relrowsecurity: true,
      relforcerowsecurity: true,
    });
  });
});
