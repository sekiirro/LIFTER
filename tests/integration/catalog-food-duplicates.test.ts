import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
const concurrentDb = postgres(process.env.DB_URL!, {
  max: 2,
  connect_timeout: 10,
});
let poId: string;
let trainerId: string;

async function asActor<T>(
  actorId: string,
  body: (tx: postgres.TransactionSql) => Promise<T>,
) {
  return concurrentDb.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
    return body(tx);
  });
}

async function createFood(input: {
  name_en: string;
  name_ar?: string | null;
  basis?: string;
  product?: string;
  preparation?: string;
  weighing?: string;
  kcal?: number;
}) {
  const id = randomUUID();
  const values = {
    name_en: input.name_en,
    name_ar: input.name_ar ?? null,
    basis: input.basis ?? 'g',
    product_identity_norm: input.product ?? 'product-a',
    preparation_identity_norm: input.preparation ?? 'plain',
    weighing_state: input.weighing ?? 'not_applicable',
    kcal: input.kcal ?? 100,
  };
  await db.begin(async (tx) => {
    await tx`insert into public.foods(id, created_by, current_version) values (${id}, ${poId}, 1)`;
    await tx`insert into public.food_versions(
      food_id, version, payload, created_by, name_ar, name_en, basis, product_identity_norm,
      preparation_identity_norm, weighing_state, kcal, protein_g, carbohydrate_g, fat_g
    ) values (
      ${id}, 1, ${tx.json(values)}, ${poId}, ${values.name_ar}, ${values.name_en}, ${values.basis},
      ${values.product_identity_norm}, ${values.preparation_identity_norm}, ${values.weighing_state},
      ${values.kcal}, 5, 10, 2
    )`;
    await tx`insert into public.food_serving_units(food_id, food_version, basis, unit_key, label_en, basis_qty)
      values (${id}, 1, ${values.basis}, 'reference', 'Reference', 100)`;
  });
  return id;
}

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  poId = fixture.po.userId;
  trainerId = fixture.trainerA.userId;
});

afterAll(async () => Promise.all([db.end(), concurrentDb.end()]));

describe('SQL food duplicate detection and exact-key reservations', () => {
  it('uses language, normalized name, basis, product, preparation, and weighing state in exact identity', async () => {
    const foodId = await createFood({
      name_en: 'Catalog rice',
      name_ar: 'أرز',
    });
    await db`select app_private.reserve_catalog_food_keys(${foodId}, 1)`;
    const exact = await asActor(
      trainerId,
      (tx) =>
        tx`select food_id, version, match_type from public.catalog_food_duplicate_candidates(
        'Catalog rice', 'en', 'g', 'product-a', 'plain', 'not_applicable', 100
      )`,
    );
    expect(exact).toEqual([
      { food_id: foodId, version: 1, match_type: 'exact' },
    ]);
    const otherLanguage = await asActor(
      trainerId,
      (tx) =>
        tx`select food_id from public.catalog_food_duplicate_candidates(
        'أرز', 'ar', 'g', 'product-a', 'plain', 'not_applicable', 100
      )`,
    );
    expect(otherLanguage).toEqual([{ food_id: foodId }]);

    for (const dimensions of [
      { basis: 'ml' },
      { product: 'product-b' },
      { preparation: 'roasted' },
      { weighing: 'cooked' },
    ]) {
      const none = await asActor(
        trainerId,
        (tx) =>
          tx`select food_id from public.catalog_food_duplicate_candidates(
          'Catalog rice', 'en', ${dimensions.basis ?? 'g'}, ${dimensions.product ?? 'product-a'},
          ${dimensions.preparation ?? 'plain'}, ${dimensions.weighing ?? 'not_applicable'}, 100
        ) where match_type = 'exact'`,
      );
      expect(none).toEqual([]);
    }
  });

  it('warns for same-identity near matches only at >=90% and within the kcal tolerance', async () => {
    const longName = 'abcdefghijklmnopqrstuvwxyz'.repeat(4);
    const nearName = `${longName.slice(0, -1)}x`;
    const foodId = await createFood({ name_en: longName, kcal: 100 });
    await db`select app_private.reserve_catalog_food_keys(${foodId}, 1)`;
    const near = await asActor(
      trainerId,
      (tx) =>
        tx`select food_id, match_type from public.catalog_food_duplicate_candidates(
        ${nearName}, 'en', 'g', 'product-a', 'plain', 'not_applicable', 109
      )`,
    );
    expect(near).toEqual([{ food_id: foodId, match_type: 'near' }]);
    const outsideTolerance = await asActor(
      trainerId,
      (tx) =>
        tx`select food_id from public.catalog_food_duplicate_candidates(
        ${nearName}, 'en', 'g', 'product-a', 'plain', 'not_applicable', 112
      )`,
    );
    expect(outsideTolerance).toEqual([]);
    const synonym = await asActor(
      trainerId,
      (tx) =>
        tx`select food_id from public.catalog_food_duplicate_candidates(
        'rolled oats', 'en', 'g', 'product-a', 'plain', 'not_applicable', 100
      )`,
    );
    expect(synonym).toEqual([]);
  });

  it('serializes exact-key reservation races and leaves one active owner', async () => {
    const first = await createFood({ name_en: 'Concurrent reserved identity' });
    const second = await createFood({
      name_en: 'Concurrent reserved identity',
    });
    const outcomes = await Promise.allSettled([
      concurrentDb.begin(
        (tx) => tx`select app_private.reserve_catalog_food_keys(${first}, 1)`,
      ),
      concurrentDb.begin(
        (tx) => tx`select app_private.reserve_catalog_food_keys(${second}, 1)`,
      ),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      db`select count(*)::int as active_owners from public.catalog_food_name_keys
        where active and name_norm = 'concurrent reserved identity'`,
    ).resolves.toEqual([{ active_owners: 1 }]);
  });
});
