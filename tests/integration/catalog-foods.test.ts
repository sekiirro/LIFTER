import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { admin, checked, sql } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
let creatorId: string;
const rollbackMarker = 'rollback_catalog_food_fixture';

beforeAll(async () => {
  const created = await admin().auth.admin.createUser({
    email: `catalog-food-${randomUUID()}@example.test`,
    password: `Catalog-${randomUUID()}-aA1!`,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error(created.error?.message ?? 'Catalog fixture user missing');
  creatorId = created.data.user.id;
  checked(
    await admin()
      .from('staff_profiles')
      .insert({ user_id: creatorId, role: 'trainer' }),
  );
});

afterAll(async () => db.end());

type FoodVersion = {
  name_ar?: string | null;
  name_en?: string | null;
  basis?: string | null;
  product_identity_norm?: string | null;
  preparation_identity_norm?: string | null;
  weighing_state?: string | null;
  kcal?: number | null;
  protein_g?: number | null;
  carbohydrate_g?: number | null;
  fat_g?: number | null;
  fiber_g?: number | null;
};

const validVersion: Required<FoodVersion> = {
  name_ar: 'أرز أبيض',
  name_en: 'White rice',
  basis: 'g',
  product_identity_norm: 'rice:white:brand-a',
  preparation_identity_norm: 'boiled',
  weighing_state: 'cooked',
  kcal: 130,
  protein_g: 2.7,
  carbohydrate_g: 28.2,
  fat_g: 0.3,
  fiber_g: null,
};

async function insertVersion(
  tx: Tx,
  data: FoodVersion = {},
  serving: { basis?: string; basis_qty?: number } | null = {
    basis: 'g',
    basis_qty: 100,
  },
) {
  const foodId = randomUUID();
  const value = { ...validVersion, ...data };
  await tx`insert into public.foods (id, created_by, current_version)
    values (${foodId}, ${creatorId}, 1)`;
  await tx`insert into public.food_versions (
      food_id, version, payload, name_ar, name_en, basis, product_identity_norm,
      preparation_identity_norm, weighing_state, kcal, protein_g, carbohydrate_g, fat_g, fiber_g, created_by
    ) values (
      ${foodId}, 1, '{}'::jsonb, ${value.name_ar}, ${value.name_en}, ${value.basis},
      ${value.product_identity_norm}, ${value.preparation_identity_norm}, ${value.weighing_state},
      ${value.kcal}, ${value.protein_g}, ${value.carbohydrate_g}, ${value.fat_g}, ${value.fiber_g}, ${creatorId}
    )`;
  if (serving)
    await tx`insert into public.food_serving_units (food_id, food_version, basis, unit_key, label_en, basis_qty)
      values (${foodId}, 1, ${serving.basis ?? value.basis}, 'reference', 'Reference serving', ${serving.basis_qty ?? 100})`;
  return foodId;
}

async function withRolledBackFixture<T>(body: (tx: Tx) => Promise<T>) {
  let result: T | undefined;
  try {
    await db.begin(async (tx) => {
      result = await body(tx);
      await tx`set constraints all immediate`;
      throw new Error(rollbackMarker);
    });
  } catch (error) {
    if ((error as Error).message !== rollbackMarker) throw error;
  }
  return result as T;
}

describe('global food version nutrition and servings', () => {
  it('accepts valid g and ml versions with optional fiber and matching positive servings', async () => {
    await withRolledBackFixture(async (tx) => {
      await insertVersion(tx);
      await insertVersion(
        tx,
        {
          ...validVersion,
          name_ar: null,
          name_en: 'Milk',
          basis: 'ml',
          product_identity_norm: 'milk:whole',
          preparation_identity_norm: 'not_applicable',
          weighing_state: 'not_applicable',
          fiber_g: null,
        },
        { basis: 'ml', basis_qty: 250 },
      );
    });
  });

  it('requires a valid basis, at least one localized name and all required identity/nutrition values', async () => {
    for (const invalid of [
      { basis: 'oz' },
      { name_ar: null, name_en: null },
      { product_identity_norm: null },
      { preparation_identity_norm: null },
      { weighing_state: null },
      { weighing_state: 'steamed' },
      { kcal: null },
      { protein_g: null },
      { carbohydrate_g: null },
      { fat_g: null },
      { kcal: -0.1 },
      { kcal: 1_000_000 },
      { protein_g: -0.01 },
      { protein_g: 100_000 },
      { carbohydrate_g: -0.01 },
      { fat_g: -0.01 },
      { fiber_g: -0.01 },
      { kcal: Number.POSITIVE_INFINITY },
      { protein_g: 80, carbohydrate_g: 80, fat_g: 0 },
    ] satisfies FoodVersion[]) {
      await expect(
        db.begin(async (tx) => {
          await insertVersion(tx, invalid);
          await tx`set constraints all immediate`;
        }),
      ).rejects.toBeDefined();
    }
  });

  it('requires at least one positive serving in the food version basis', async () => {
    await expect(
      db.begin(async (tx) => {
        await insertVersion(tx, {}, null);
        await tx`set constraints all immediate`;
      }),
    ).rejects.toBeDefined();
    await expect(
      db.begin(async (tx) => {
        await insertVersion(tx, {}, { basis: 'g', basis_qty: 0 });
        await tx`set constraints all immediate`;
      }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.begin(async (tx) => {
        await insertVersion(tx, {}, { basis: 'ml', basis_qty: 50 });
        await tx`set constraints all immediate`;
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('accepts macro values that total exactly 100 grams', async () => {
    await withRolledBackFixture(async (tx) => {
      await insertVersion(tx, { protein_g: 40, carbohydrate_g: 40, fat_g: 20 });
    });
  });
});
