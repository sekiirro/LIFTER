import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
const concurrentDb = postgres(process.env.DB_URL!, {
  max: 4,
  connect_timeout: 10,
});
let trainerA: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerA'];
let trainerB: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerB'];
let wsA: string;
let wsB: string;
let po: Awaited<ReturnType<typeof twoWorkspaceFixture>>['po'];

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

function foodRequest(name: string) {
  return {
    name_ar: `Ø·Ø¹Ø§Ù… ${name}`,
    name_en: name,
    basis: 'g',
    product_identity_norm: 'limit-product',
    preparation_identity_norm: 'plain',
    weighing_state: 'not_applicable',
    kcal: 120,
    protein_g: 5,
    carbohydrate_g: 20,
    fat_g: 2,
    fiber_g: null,
    servings: [{ unit_key: 'reference', label_en: '100 g', basis_qty: 100 }],
    confirm_near_match: false,
  };
}

async function createFood(actorId: string, operationKey: string, name: string) {
  const workspaceId =
    actorId === po.userId ? null : actorId === trainerA.userId ? wsA : wsB;
  return asActor(
    actorId,
    (tx) =>
      tx`select public.catalog_create_food(${operationKey}, ${workspaceId}, ${tx.json(foodRequest(name))})`,
  );
}

async function seedFoods(
  tx: postgres.TransactionSql,
  actorId: string,
  count: number,
  olderThanDay = false,
) {
  await tx`
    with inserted as (
      insert into public.foods(id, created_by, origin_workspace_id, current_version, created_at)
      select gen_random_uuid(), ${actorId}, null, 1,
        case when ${olderThanDay} then statement_timestamp() - interval '25 hours' else statement_timestamp() end
      from generate_series(1, ${count})
      returning id
    ), versions as (
      insert into public.food_versions(
        food_id, version, payload, created_by, name_en, basis, product_identity_norm,
        preparation_identity_norm, weighing_state, kcal, protein_g, carbohydrate_g, fat_g
      )
      select id, 1, '{}'::jsonb, ${actorId}, 'limit fixture ' || id::text, 'g',
        'limit-fixture', 'plain', 'not_applicable', 120, 5, 20, 2 from inserted
      returning food_id
    )
    insert into public.food_serving_units(food_id, food_version, basis, unit_key, label_en, basis_qty)
    select food_id, 1, 'g', 'reference', '100 g', 100 from versions
  `;
}

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  po = fixture.po;
  trainerA = fixture.trainerA;
  trainerB = fixture.trainerB;
  wsA = fixture.wsA.id;
  wsB = fixture.wsB.id;
});

afterAll(async () => Promise.all([db.end(), concurrentDb.end()]));

beforeEach(async () => {
  await db`update public.catalog_addition_limits
    set created_at = statement_timestamp() - interval '25 hours'`;
});

describe('D16-10 food addition limits', () => {
  it('allows exactly ten creator additions, keeps replay quota-neutral, then rejects the eleventh', async () => {
    const actor = trainerA.userId;
    const requests = Array.from({ length: 10 }, (_, index) => ({
      key: randomUUID(),
      name: `Creator cap ${index} ${randomUUID()}`,
    }));
    const firstRequest = requests[0]!;
    const first = await createFood(actor, firstRequest.key, firstRequest.name);
    for (const request of requests.slice(1))
      await createFood(actor, request.key, request.name);
    const replay = await createFood(actor, firstRequest.key, firstRequest.name);
    expect(replay).toEqual(first);
    await expect(
      createFood(actor, randomUUID(), `Creator cap 11 ${randomUUID()}`),
    ).rejects.toMatchObject({
      code: '23514',
      message: 'catalog_food_creator_limit',
    });
    await expect(
      db`select count(*)::int as count from public.foods where created_by = ${actor} and created_at >= now() - interval '24 hours'`,
    ).resolves.toEqual([{ count: 10 }]);
  });

  it('serializes concurrent additions at the creator boundary', async () => {
    const actor = trainerB.userId;
    const seed = Array.from({ length: 9 }, (_, index) => ({
      key: randomUUID(),
      name: `Concurrent cap seed ${index} ${randomUUID()}`,
    }));
    for (const item of seed) await createFood(actor, item.key, item.name);
    const concurrent = [0, 1].map(() => ({
      key: randomUUID(),
      name: `Concurrent cap race ${randomUUID()}`,
    }));
    const outcomes = await Promise.allSettled(
      concurrent.map((item) => createFood(actor, item.key, item.name)),
    );
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(1);
    const denied = outcomes.find(
      (outcome) => outcome.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(denied.reason).toMatchObject({
      code: '23514',
      message: 'catalog_food_creator_limit',
    });
    await expect(
      db`select count(*)::int as count from public.foods where created_by = ${actor} and created_at >= now() - interval '24 hours'`,
    ).resolves.toEqual([{ count: 10 }]);
  });

  it('accepts the 100th platform addition and rejects the 101st', async () => {
    await db`update public.catalog_addition_limits
      set created_at = statement_timestamp() - interval '25 hours'`;
    const count =
      await db`select count(*)::int as count from public.catalog_addition_limits where created_at >= now() - interval '24 hours'`;
    const missing = 99 - Number(count[0]?.count);
    expect(missing).toBeGreaterThanOrEqual(0);
    await expect(
      concurrentDb.begin(async (tx) => {
        await seedFoods(tx, trainerA.userId, missing);
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: po.userId, role: 'authenticated' })}, true)`;
        const first =
          await tx`select public.catalog_create_food(${randomUUID()}, null, ${tx.json(foodRequest(`Platform 100 ${randomUUID()}`))})`;
        expect(first).toHaveLength(1);
        await tx`select public.catalog_create_food(${randomUUID()}, null, ${tx.json(foodRequest(`Platform 101 ${randomUUID()}`))})`;
      }),
    ).rejects.toMatchObject({
      code: '23514',
      message: 'catalog_food_platform_limit',
    });
  });

  it('accepts active identity 10,000 and rejects 10,001 transactionally', async () => {
    const count =
      await db`select count(*)::int as count from public.foods where lifecycle_state = 'active'`;
    const missing = 9999 - Number(count[0]?.count);
    expect(missing).toBeGreaterThanOrEqual(0);
    await expect(
      concurrentDb.begin(async (tx) => {
        await seedFoods(tx, trainerA.userId, missing, true);
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: po.userId, role: 'authenticated' })}, true)`;
        const first =
          await tx`select public.catalog_create_food(${randomUUID()}, null, ${tx.json(foodRequest(`Active 10000 ${randomUUID()}`))})`;
        expect(first).toHaveLength(1);
        await tx`select public.catalog_create_food(${randomUUID()}, null, ${tx.json(foodRequest(`Active 10001 ${randomUUID()}`))})`;
      }),
    ).rejects.toMatchObject({
      code: '23514',
      message: 'catalog_food_active_limit',
    });
  });
});
