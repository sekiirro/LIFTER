import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  computeDocumentValues,
  snapshotMapKey,
  type NutritionSnapshotMap,
} from '../../lib/plans/nutrition/macros';
import {
  NutritionDocumentError,
  validateNutritionDocument,
} from '../../lib/plans/nutrition/schema';
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
    await tx`insert into public.foods (id, created_by, current_version)
      values (${foodId}, ${fixture.trainerA.userId}, 1)`;
    await tx`insert into public.food_versions (
      food_id, version, payload, created_by, name_ar, name_en, basis,
      product_identity_norm, preparation_identity_norm, weighing_state,
      kcal, protein_g, carbohydrate_g, fat_g, fiber_g
    ) values (
      ${foodId}, 1, '{}'::jsonb, ${fixture.trainerA.userId},
      'دجاج مشوي', 'Grilled Chicken', 'g', ${`chicken:${foodId}`},
      'grilled', 'cooked', 165.0, 31.00, 0.00, 3.60, null
    )`;
    await tx`insert into public.food_serving_units (
      food_id, food_version, basis, unit_key, label_ar, label_en, basis_qty
    ) values (${foodId}, 1, 'g', 'g', 'جرام', 'Gram', 1.000)`;
    return g;
  });
});

afterAll(async () => db?.end());

function makeDoc(schemaVersion = 1): NutritionDocumentV1 {
  return {
    schemaVersion: schemaVersion as 1,
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
            id: 'i-1',
            foodId,
            foodVersion: 1,
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

describe('F18 T020 schema and algorithm version freeze', () => {
  it('pins schema and algorithm versions on an immutable revision and rejects unknown schemas', async () => {
    const doc = makeDoc();
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
    const receipt = published.data as { revision_id: string };
    const [row] =
      await db`select schema_version, algorithm_version, document, snapshot_map, computed_values
      from public.nutrition_plan_version_contents
      where workspace_id = ${fixture.wsA.id} and revision_id = ${receipt.revision_id}`;

    expect(row).toMatchObject({
      schema_version: 1,
      algorithm_version: 1,
      document: doc,
    });
    const snapshots = row!.snapshot_map as NutritionSnapshotMap;
    expect(row!.computed_values).toEqual(computeDocumentValues(doc, snapshots));
    expect(
      (row!.computed_values as { totals: { kcal: string } }).totals.kcal,
    ).toBe('247.500');
    expect(Object.keys(snapshots)).toEqual([
      snapshotMapKey(foodId, 1, { kind: 'basis', value: 'g' }),
    ]);

    await expect(db`update public.nutrition_plan_version_contents
      set schema_version = 2 where workspace_id = ${fixture.wsA.id} and revision_id = ${receipt.revision_id}`).rejects.toThrow(
      /nutrition_plan_version_contents_immutable|23514/,
    );
    await expect(db`update public.nutrition_plan_version_contents
      set algorithm_version = 2 where workspace_id = ${fixture.wsA.id} and revision_id = ${receipt.revision_id}`).rejects.toThrow(
      /nutrition_plan_version_contents_immutable|23514/,
    );

    const [stillFrozen] =
      await db`select schema_version, algorithm_version, computed_values
      from public.nutrition_plan_version_contents
      where workspace_id = ${fixture.wsA.id} and revision_id = ${receipt.revision_id}`;
    expect(stillFrozen).toMatchObject({
      schema_version: 1,
      algorithm_version: 1,
      computed_values: row!.computed_values,
    });

    try {
      validateNutritionDocument({ ...doc, schemaVersion: 2 }, {});
      throw new Error('unknown nutrition schema unexpectedly validated');
    } catch (error) {
      expect(error).toBeInstanceOf(NutritionDocumentError);
      expect(error).toMatchObject({ code: 'schema_version' });
    }
    await expect(
      db`select app_private.nutrition_validate_document(${JSON.stringify({ ...doc, schemaVersion: 2 })}::jsonb)`,
    ).rejects.toThrow(/nutrition_invalid_document/);
  });
});
