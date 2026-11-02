import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
const concurrentDb = postgres(process.env.DB_URL!, {
  max: 2,
  connect_timeout: 10,
});
let po: Awaited<ReturnType<typeof twoWorkspaceFixture>>['po'];
let trainerA: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerA'];
let wsA: string;

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
    name_ar: `طعام ${name}`,
    name_en: name,
    basis: 'g',
    product_identity_norm: 'lifecycle-product',
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

async function createFood(name = `Lifecycle food ${randomUUID()}`) {
  const created = await asActor(
    trainerA.userId,
    (tx) =>
      tx`select public.catalog_create_food(${randomUUID()}, ${wsA}, ${tx.json(foodRequest(name))})`,
  );
  return created[0]?.catalog_create_food as {
    food_id: string;
    version: number;
  };
}

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  po = fixture.po;
  trainerA = fixture.trainerA;
  wsA = fixture.wsA.id;
});

afterAll(async () => Promise.all([db.end(), concurrentDb.end()]));

describe('global food lifecycle and merge RPCs', () => {
  it('removes/restores with immutable lifecycle markers and atomically releases/reclaims exact keys', async () => {
    const name = `Remove restore ${randomUUID()}`;
    const food = await createFood(name);
    const removeKey = randomUUID();
    const responses = await Promise.all(
      [0, 1].map(() =>
        asActor(
          po.userId,
          (tx) =>
            tx`select public.catalog_transition_food(${food.food_id}, 0, 'remove', ${removeKey})`,
        ),
      ),
    );
    expect(responses[0]).toEqual(responses[1]);
    expect(
      (responses[0]![0]?.catalog_transition_food as { lifecycle_state: string })
        .lifecycle_state,
    ).toBe('removed');
    await expect(
      db`select count(*)::int as keys from public.catalog_food_name_keys where food_id = ${food.food_id} and active`,
    ).resolves.toEqual([{ keys: 0 }]);
    await expect(
      asActor(
        trainerA.userId,
        (tx) =>
          tx`select result_id from public.catalog_search('food', ${name}, '{}'::jsonb, null, null)`,
      ),
    ).resolves.toEqual([]);

    const replacement = await createFood(name);
    await expect(
      asActor(
        po.userId,
        (tx) =>
          tx`select public.catalog_transition_food(${food.food_id}, 1, 'restore', ${randomUUID()})`,
      ),
    ).rejects.toMatchObject({
      code: '23505',
      message: 'catalog_food_duplicate',
    });
    await expect(
      db`select lifecycle_state from public.foods where id = ${food.food_id}`,
    ).resolves.toEqual([{ lifecycle_state: 'removed' }]);
    const removedKeys =
      await db`select count(*)::int as keys from public.catalog_food_name_keys where food_id = ${food.food_id} and active`;
    expect(removedKeys).toEqual([{ keys: 0 }]);

    await asActor(
      po.userId,
      (tx) =>
        tx`select public.catalog_transition_food(${replacement.food_id}, 0, 'remove', ${randomUUID()})`,
    );
    const restored = await asActor(
      po.userId,
      (tx) =>
        tx`select public.catalog_transition_food(${food.food_id}, 1, 'restore', ${randomUUID()})`,
    );
    expect(
      (restored[0]?.catalog_transition_food as { lifecycle_state: string })
        .lifecycle_state,
    ).toBe('active');
    await expect(
      db`select count(*)::int as versions from public.food_versions where food_id = ${food.food_id}`,
    ).resolves.toEqual([{ versions: 1 }]);
    await expect(
      db`select count(*)::int as events from public.food_lifecycle_events where food_id = ${food.food_id}`,
    ).resolves.toEqual([{ events: 2 }]);
  });

  it('merges only to active terminal foods, flattens aliases, preserves versions/servings, and replays once', async () => {
    const alias = await createFood(`Food alias ${randomUUID()}`);
    const source = await createFood(`Food source ${randomUUID()}`);
    const intermediate = await createFood(`Food intermediate ${randomUUID()}`);
    const terminal = await createFood(`Food terminal ${randomUUID()}`);
    await asActor(
      po.userId,
      (tx) =>
        tx`select public.catalog_merge_food(${intermediate.food_id}, ${terminal.food_id}, 0, ${randomUUID()})`,
    );
    await asActor(
      po.userId,
      (tx) =>
        tx`select public.catalog_merge_food(${alias.food_id}, ${source.food_id}, 0, ${randomUUID()})`,
    );
    const key = randomUUID();
    const responses = await Promise.all(
      [0, 1].map(() =>
        asActor(
          po.userId,
          (tx) =>
            tx`select public.catalog_merge_food(${source.food_id}, ${intermediate.food_id}, 0, ${key})`,
        ),
      ),
    );
    expect(responses[0]).toEqual(responses[1]);
    const merged =
      await db`select id, lifecycle_state, superseded_by from public.foods
      where id in (${alias.food_id}, ${source.food_id}, ${intermediate.food_id}, ${terminal.food_id}) order by id`;
    expect(merged).toEqual(
      expect.arrayContaining([
        {
          id: alias.food_id,
          lifecycle_state: 'merged',
          superseded_by: terminal.food_id,
        },
        {
          id: source.food_id,
          lifecycle_state: 'merged',
          superseded_by: terminal.food_id,
        },
        {
          id: intermediate.food_id,
          lifecycle_state: 'merged',
          superseded_by: terminal.food_id,
        },
        {
          id: terminal.food_id,
          lifecycle_state: 'active',
          superseded_by: null,
        },
      ]),
    );
    for (const food of [alias, source, intermediate]) {
      await expect(
        asActor(
          trainerA.userId,
          (tx) =>
            tx`select public.catalog_resolve_food_selection(${food.food_id})`,
        ),
      ).resolves.toEqual([
        { catalog_resolve_food_selection: terminal.food_id },
      ]);
      await expect(
        db`select count(*)::int as versions from public.food_versions where food_id = ${food.food_id}`,
      ).resolves.toEqual([{ versions: 1 }]);
      await expect(
        db`select count(*)::int as servings from public.food_serving_units where food_id = ${food.food_id}`,
      ).resolves.toEqual([{ servings: 1 }]);
      await expect(
        db`select count(*)::int as keys from public.catalog_food_name_keys where food_id = ${food.food_id} and active`,
      ).resolves.toEqual([{ keys: 0 }]);
    }
    const unauthorizedSource = await createFood(
      `Unauthorized merge ${randomUUID()}`,
    );
    await expect(
      asActor(
        trainerA.userId,
        (tx) =>
          tx`select public.catalog_merge_food(${unauthorizedSource.food_id}, ${terminal.food_id}, 0, ${randomUUID()})`,
      ),
    ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
  });
});
