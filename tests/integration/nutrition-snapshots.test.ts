import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  computeDocumentValues,
  snapshotMapKey,
  type NutritionSnapshotMap,
  type ServingSnapshotEntry,
} from '../../lib/plans/nutrition/macros';
import type { NutritionDocumentV1 } from '../../lib/plans/nutrition/types';
import { clientContext, graph, sql } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';

let fixture: Context;
let db: ReturnType<typeof sql>;
let seeded: Awaited<ReturnType<typeof graph>>;
let foodId: string;
let retiredFoodId: string;

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
        'شوفان', 'Oats', 'g',
        ${`oats:${foodId}`}, 'dry', 'raw',
        389.0, 16.89, 66.27, 6.90, 10.60
      )
    `;
    // Both catalog serving unitKey='g' (basis_qty=100) and 'scoop:large' (basis_qty=40.500)
    await tx`
      insert into public.food_serving_units (
        food_id, food_version, basis, unit_key, label_ar, label_en, basis_qty
      ) values
        (${foodId}, 1, 'g', 'g', '١٠٠ جرام', '100g Serving', 100.000),
        (${foodId}, 1, 'g', 'scoop:large', 'مكيال كبير', 'Large Scoop', 40.500)
    `;

    // A food that is later removed/merged in public.foods, but whose food_versions(1) remains immutable
    retiredFoodId = randomUUID();
    await tx`
      insert into public.foods (id, created_by, current_version, lifecycle_state)
      values (${retiredFoodId}, ${fixture.trainerA.userId}, 1, 'removed')
    `;
    await tx`
      insert into public.food_versions (
        food_id, version, payload, created_by, name_ar, name_en, basis,
        product_identity_norm, preparation_identity_norm, weighing_state,
        kcal, protein_g, carbohydrate_g, fat_g, fiber_g
      ) values (
        ${retiredFoodId}, 1, '{}'::jsonb, ${fixture.trainerA.userId},
        'حليب', 'Milk', 'ml',
        ${`milk:${retiredFoodId}`}, 'pasteurized', 'not_applicable',
        61.0, 3.15, 4.80, 3.25, null
      )
    `;
    await tx`
      insert into public.food_serving_units (
        food_id, food_version, basis, unit_key, label_ar, label_en, basis_qty
      ) values (
        ${retiredFoodId}, 1, 'ml', 'cup', 'كوب', 'Cup', 240.000
      )
    `;

    return g;
  });
});

afterAll(async () => db?.end());

describe('F18 T022 per-version tagged-unit snapshot build', () => {
  it('keeps basis g and serving g distinct, snapshots multiple servings & alternatives with exact fixed-scale strings, and resolves retired/merged food versions', async () => {
    const doc: NutritionDocumentV1 = {
      schemaVersion: 1,
      structure: 'single_day',
      implicitDayTypeId: 'dt-1',
      dayTypes: [
        {
          id: 'dt-1',
          name: { ar: 'تمرين', en: 'Training' },
          trainingDay: true,
          targets: null,
        },
      ],
      meals: [
        {
          id: 'm-1',
          name: { ar: 'فطار', en: 'Breakfast' },
          note: null,
          recipeUrl: null,
          items: [
            {
              id: '33333333-3333-4333-8333-333333333361',
              foodId,
              foodVersion: 1,
              quantity: { value: '50', unit: { kind: 'basis', value: 'g' } },
              note: null,
              alternatives: [
                {
                  id: '77777777-7777-4777-8777-777777777777',
                  foodId: retiredFoodId,
                  foodVersion: 1,
                  quantity: {
                    value: '1',
                    unit: { kind: 'serving', unitKey: 'cup' },
                  },
                },
              ],
            },
            {
              id: '33333333-3333-4333-8333-333333333362',
              foodId,
              foodVersion: 1,
              quantity: {
                value: '1',
                unit: { kind: 'serving', unitKey: 'g' },
              },
              note: null,
              alternatives: [],
            },
            {
              id: '33333333-3333-4333-8333-333333333363',
              foodId,
              foodVersion: 1,
              quantity: {
                value: '2',
                unit: { kind: 'serving', unitKey: 'scoop:large' },
              },
              note: null,
              alternatives: [],
            },
          ],
        },
      ],
      title: null,
      notes: null,
    };

    const created = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'nutrition',
      p_content: doc,
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();
    const planId = created.data as string;

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
    const revisionId = (published.data as { revision_id: string }).revision_id;

    const [row] = await db`
      select snapshot_map, computed_values
      from public.nutrition_plan_version_contents
      where workspace_id = ${fixture.wsA.id} and revision_id = ${revisionId}
    `;
    const snapshotMap = row!.snapshot_map as NutritionSnapshotMap;

    const basisKey = snapshotMapKey(foodId, 1, { kind: 'basis', value: 'g' });
    const servingGKey = snapshotMapKey(foodId, 1, {
      kind: 'serving',
      unitKey: 'g',
    });
    const scoopKey = snapshotMapKey(foodId, 1, {
      kind: 'serving',
      unitKey: 'scoop:large',
    });
    const retiredCupKey = snapshotMapKey(retiredFoodId, 1, {
      kind: 'serving',
      unitKey: 'cup',
    });

    expect(basisKey).not.toBe(servingGKey);
    expect(Object.keys(snapshotMap).sort()).toEqual(
      [basisKey, servingGKey, scoopKey, retiredCupKey].sort(),
    );

    // Exact fixed-scale strings, zero float round-trip
    expect(snapshotMap[basisKey]).toMatchObject({
      kind: 'basis',
      foodId,
      version: 1,
      basis: 'g',
      per100: {
        kcal: '389.0',
        protein: '16.89',
        carbs: '66.27',
        fat: '6.90',
        fiber: '10.60',
      },
    });

    const servingG = snapshotMap[servingGKey] as ServingSnapshotEntry;
    expect(servingG.kind).toBe('serving');
    expect(servingG.snapshot.serving.basisQuantity).toBe('100.000');

    const scoop = snapshotMap[scoopKey] as ServingSnapshotEntry;
    expect(scoop.kind).toBe('serving');
    expect(scoop.snapshot.serving.basisQuantity).toBe('40.500');

    const retiredCup = snapshotMap[retiredCupKey] as ServingSnapshotEntry;
    expect(retiredCup.kind).toBe('serving');
    expect(retiredCup.snapshot.basis).toBe('ml');
    expect(retiredCup.snapshot.serving.basisQuantity).toBe('240.000');
    expect(retiredCup.snapshot.fiber).toBeNull();

    expect(row!.computed_values).toEqual(
      computeDocumentValues(doc, snapshotMap),
    );
  });

  it('aborts publish on a wrong food version', async () => {
    const doc: NutritionDocumentV1 = {
      schemaVersion: 1,
      structure: 'single_day',
      implicitDayTypeId: 'dt-1',
      dayTypes: [
        {
          id: 'dt-1',
          name: { ar: 'راحة', en: 'Rest' },
          trainingDay: false,
          targets: null,
        },
      ],
      meals: [
        {
          id: 'm-1',
          name: { ar: 'وجبة', en: 'Meal' },
          note: null,
          recipeUrl: null,
          items: [
            {
              id: '33333333-3333-4333-8333-333333333331',
              foodId,
              foodVersion: 2, // wrong version (only v1 exists)
              quantity: { value: '100', unit: { kind: 'basis', value: 'g' } },
              note: null,
              alternatives: [],
            },
          ],
        },
      ],
      title: null,
      notes: null,
    };

    const created = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'nutrition',
      p_content: doc,
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();

    const res = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: created.data as string,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(res.error).not.toBeNull();
  });
});
