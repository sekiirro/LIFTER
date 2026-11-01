import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { admin, checked, sql } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
let creatorId: string;

beforeAll(async () => {
  const created = await admin().auth.admin.createUser({
    email: `catalog-alternatives-${randomUUID()}@example.test`,
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

async function createFood(tx: Tx, basis = 'g') {
  const id = randomUUID();
  await tx`insert into public.foods (id, created_by, current_version) values (${id}, ${creatorId}, 1)`;
  await tx`insert into public.food_versions (
      food_id, version, payload, created_by, name_en, basis, product_identity_norm,
      preparation_identity_norm, weighing_state, kcal, protein_g, carbohydrate_g, fat_g
    ) values (
      ${id}, 1, '{}'::jsonb, ${creatorId}, 'Alternative fixture', ${basis},
      ${`fixture:${id}`}, 'not_applicable', 'not_applicable', 100, 10, 10, 2
    )`;
  await tx`insert into public.food_serving_units (food_id, food_version, basis, unit_key, label_en, basis_qty)
    values (${id}, 1, ${basis}, 'reference', 'Reference', 100)`;
  return id;
}

async function addAlternative(
  tx: Tx,
  source: string,
  target: string,
  position: number,
  sourcePortion = 100,
  alternativePortion = 100,
) {
  await tx`insert into public.food_alternatives (
      food_id, food_version, position, source_basis, source_portion,
      alternative_food_id, alternative_version, alternative_basis, alternative_portion
    ) values (
      ${source}, 1, ${position}, 'g', ${sourcePortion}, ${target}, 1, 'g', ${alternativePortion}
    )`;
}

describe('curated food alternatives', () => {
  it('caps each immutable food version at three validated alternatives', async () => {
    await expect(
      db.begin(async (tx) => {
        const source = await createFood(tx);
        const targets = await Promise.all([
          createFood(tx),
          createFood(tx),
          createFood(tx),
          createFood(tx),
        ]);
        await addAlternative(tx, source, targets[0]!, 1);
        await addAlternative(tx, source, targets[1]!, 2);
        await addAlternative(tx, source, targets[2]!, 3);
        await addAlternative(tx, source, targets[3]!, 4);
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects zero, negative, cross-basis and self portions', async () => {
    await expect(
      db.begin(async (tx) => {
        const source = await createFood(tx);
        const target = await createFood(tx);
        await addAlternative(tx, source, target, 1, 0, 100);
      }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.begin(async (tx) => {
        const source = await createFood(tx);
        const target = await createFood(tx);
        await addAlternative(tx, source, target, 1, 100, -1);
      }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.begin(async (tx) => {
        const source = await createFood(tx, 'g');
        const target = await createFood(tx, 'ml');
        await tx`insert into public.food_alternatives (
          food_id, food_version, position, source_basis, source_portion,
          alternative_food_id, alternative_version, alternative_basis, alternative_portion
        ) values (${source}, 1, 1, 'g', 100, ${target}, 1, 'g', 100)`;
      }),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      db.begin(async (tx) => {
        const source = await createFood(tx);
        await addAlternative(tx, source, source, 1);
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('keeps plan portion overrides outside the catalog defaults', async () => {
    const rollbackMarker = 'rollback_catalog_alternative_override';
    try {
      await db.begin(async (tx) => {
        const source = await createFood(tx);
        const target = await createFood(tx);
        await addAlternative(tx, source, target, 1, 100, 150);
        const before =
          await tx`select * from public.food_alternatives where food_id = ${source}`;
        await expect(
          tx.savepoint(async (sp) => {
            await sp`select set_config('role', 'authenticated', true)`;
            await sp`update public.food_alternatives set alternative_portion = 200 where food_id = ${source}`;
          }),
        ).rejects.toMatchObject({ code: '42501' });
        const after =
          await tx`select * from public.food_alternatives where food_id = ${source}`;
        expect(after).toEqual(before);
        throw new Error(rollbackMarker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(rollbackMarker);
    }
  });
});
