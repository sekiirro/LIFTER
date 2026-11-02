import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
const concurrentDb = postgres(process.env.DB_URL!, {
  max: 2,
  connect_timeout: 10,
});
let po: Awaited<ReturnType<typeof twoWorkspaceFixture>>['po'];
let trainerA: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerA'];
let trainerB: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerB'];
let wsA: string;
let wsB: string;

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

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  po = fixture.po;
  trainerA = fixture.trainerA;
  trainerB = fixture.trainerB;
  wsA = fixture.wsA.id;
  wsB = fixture.wsB.id;
});

afterAll(async () => Promise.all([db.end(), concurrentDb.end()]));

afterEach(async () => {
  await Promise.all(
    [po, trainerA, trainerB].map(
      ({ userId }) =>
        db`update public.catalog_addition_limits
        set created_at = statement_timestamp() - interval '2 days'
        where creator_user_id = ${userId}`,
    ),
  );
});

function foodRequest(name: string, kcal = 130, confirmNearMatch = false) {
  return {
    name_ar: `طعام ${name}`,
    name_en: name,
    basis: 'g',
    product_identity_norm: 'test-product',
    preparation_identity_norm: 'plain',
    weighing_state: 'not_applicable',
    kcal,
    protein_g: 5,
    carbohydrate_g: 20,
    fat_g: 2,
    fiber_g: null,
    servings: [{ unit_key: 'reference', label_en: '100 g', basis_qty: 100 }],
    confirm_near_match: confirmNearMatch,
  };
}

async function createFood(actorId: string, name: string) {
  const key = randomUUID();
  const response = await asActor(
    actorId,
    (tx) =>
      tx`select public.catalog_create_food(${key}, ${actorId === po.userId ? null : actorId === trainerB.userId ? wsB : wsA}, ${tx.json(foodRequest(name))})`,
  );
  return response[0]?.catalog_create_food as {
    food_id: string;
    version: number;
    warnings: string[];
  };
}

function foodAlternative(
  foodId: string,
  sourcePortion = 100,
  alternativePortion = 100,
  version = 1,
) {
  return {
    alternative_food_id: foodId,
    alternative_version: version,
    source_portion: sourcePortion,
    alternative_portion: alternativePortion,
  };
}

describe('global food create and version RPCs', () => {
  it('stores origin provenance, allows immediate availability, and limits edits to creator or PO', async () => {
    const name = `Food create ${randomUUID()}`;
    const created = await createFood(trainerA.userId, name);
    expect(created.version).toBe(1);
    await expect(
      db`select origin_workspace_id, created_by from public.foods where id = ${created.food_id}`,
    ).resolves.toEqual([
      { origin_workspace_id: wsA, created_by: trainerA.userId },
    ]);
    const poCreated = await createFood(po.userId, `PO food ${randomUUID()}`);
    await expect(
      db`select origin_workspace_id, created_by from public.foods where id = ${poCreated.food_id}`,
    ).resolves.toEqual([{ origin_workspace_id: null, created_by: po.userId }]);
    const update = foodRequest(`${name} revised`, 135);
    const versionKey = randomUUID();
    const versioned = await asActor(
      trainerA.userId,
      (tx) =>
        tx`select public.catalog_version_food(${created.food_id}, 1, ${versionKey}, ${tx.json(update)})`,
    );
    expect(
      (versioned[0]?.catalog_version_food as { version: number }).version,
    ).toBe(2);
    await expect(
      asActor(
        trainerA.userId,
        (tx) =>
          tx`select public.catalog_version_food(${created.food_id}, 1, ${versionKey}, ${tx.json(foodRequest(`${name} changed hash`))})`,
      ),
    ).rejects.toMatchObject({
      code: '23505',
      message: 'operation_key_request_conflict',
    });
    await expect(
      asActor(
        trainerA.userId,
        (tx) =>
          tx`select public.catalog_version_food(${created.food_id}, 1, ${randomUUID()}, ${tx.json(update)})`,
      ),
    ).rejects.toMatchObject({
      code: '40001',
      message: 'catalog_food_version_conflict',
    });
    await expect(
      asActor(
        trainerB.userId,
        (tx) =>
          tx`select public.catalog_version_food(${created.food_id}, 2, ${randomUUID()}, ${tx.json(update)})`,
      ),
    ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
    const versions = await db`
      select version, name_en from public.food_versions where food_id = ${created.food_id} order by version
    `;
    expect(versions).toEqual([
      { version: 1, name_en: name },
      { version: 2, name_en: update.name_en },
    ]);
    const audit = await db`
      select action, workspace_id, details from public.audit_events where target_id = ${created.food_id}
    `;
    expect(audit).toHaveLength(2);
    expect(audit.every((event) => event.workspace_id === null)).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(name);
  });

  it('requires explicit confirmation for near matches and blocks exact duplicates', async () => {
    const name = `${randomUUID()} nutritional oats`;
    await createFood(trainerA.userId, name);
    await expect(
      asActor(
        trainerA.userId,
        (tx) =>
          tx`select public.catalog_create_food(${randomUUID()}, ${wsA}, ${tx.json(foodRequest(`${name}x`))})`,
      ),
    ).rejects.toMatchObject({
      code: '23514',
      message: 'catalog_food_near_match_confirmation_required',
    });
    const confirmed = await asActor(
      trainerA.userId,
      (tx) =>
        tx`select public.catalog_create_food(${randomUUID()}, ${wsA}, ${tx.json(foodRequest(`${name}x`, 130, true))})`,
    );
    expect(
      (confirmed[0]?.catalog_create_food as { version: number }).version,
    ).toBe(1);
    await expect(
      asActor(
        trainerA.userId,
        (tx) =>
          tx`select public.catalog_create_food(${randomUUID()}, ${wsA}, ${tx.json(foodRequest(name))})`,
      ),
    ).rejects.toMatchObject({
      code: '23505',
      message: 'catalog_food_duplicate',
    });
  });

  it('returns identical responses and one effect for concurrent identical creates', async () => {
    const key = randomUUID();
    const name = `Concurrent food ${randomUUID()}`;
    const request = foodRequest(name);
    const responses = await Promise.all(
      [0, 1].map(() =>
        asActor(
          trainerA.userId,
          (tx) =>
            tx`select public.catalog_create_food(${key}, ${wsA}, ${tx.json(request)})`,
        ),
      ),
    );
    expect(responses[0]).toEqual(responses[1]);
    const result = responses[0]![0]?.catalog_create_food as {
      food_id: string;
      version: number;
    };
    expect(result.version).toBe(1);
    await expect(
      db`select count(*)::int as versions from public.food_versions where food_id = ${result.food_id}`,
    ).resolves.toEqual([{ versions: 1 }]);
  });

  it('holds deterministic operation/key advisory locks through the create transaction', async () => {
    const result = await asActor(trainerA.userId, async (tx) => {
      const before =
        await tx`select count(*)::int as locks from pg_catalog.pg_locks
        where locktype = 'advisory' and pid = pg_backend_pid()`;
      await tx`select public.catalog_create_food(${randomUUID()}, ${wsA}, ${tx.json(foodRequest(`Locked food ${randomUUID()}`))})`;
      const after =
        await tx`select count(*)::int as locks from pg_catalog.pg_locks
        where locktype = 'advisory' and pid = pg_backend_pid()`;
      return Number(after[0]?.locks) - Number(before[0]?.locks);
    });
    expect(result).toBeGreaterThan(0);
  });

  it('returns identical responses and one appended version for concurrent identical edits', async () => {
    const name = `Concurrent version ${randomUUID()}`;
    const created = await createFood(trainerA.userId, name);
    const key = randomUUID();
    const update = foodRequest(`${name} updated`);
    const responses = await Promise.all(
      [0, 1].map(() =>
        asActor(
          trainerA.userId,
          (tx) =>
            tx`select public.catalog_version_food(${created.food_id}, 1, ${key}, ${tx.json(update)})`,
        ),
      ),
    );
    expect(responses[0]).toEqual(responses[1]);
    expect(
      (responses[0]![0]?.catalog_version_food as { version: number }).version,
    ).toBe(2);
    await expect(
      db`select count(*)::int as versions from public.food_versions where food_id = ${created.food_id}`,
    ).resolves.toEqual([{ versions: 2 }]);
  });

  it('creates immutable serving-equivalent food defaults and binds replay to them', async () => {
    const targetA = await createFood(
      trainerA.userId,
      `Alternative A ${randomUUID()}`,
    );
    const targetB = await createFood(
      trainerA.userId,
      `Alternative B ${randomUUID()}`,
    );
    const name = `Defaults source ${randomUUID()}`;
    const request = foodRequest(name);
    const alternatives = [foodAlternative(targetA.food_id, 100, 100)];
    const key = randomUUID();
    const create = async (items: ReturnType<typeof foodAlternative>[]) =>
      asActor(
        trainerA.userId,
        (tx) =>
          tx`select public.catalog_create_food(
          ${key}, ${wsA}, ${tx.json(request)}, ${tx.json(items)}
        )`,
      );
    const first = await create(alternatives);
    const created = first[0]?.catalog_create_food as {
      food_id: string;
      version: number;
    };
    expect(created.version).toBe(1);
    await expect(create(alternatives)).resolves.toEqual(first);
    await expect(
      create([foodAlternative(targetB.food_id)]),
    ).rejects.toMatchObject({
      code: '23505',
      message: 'operation_key_request_conflict',
    });
    await expect(
      db`select food_id, food_version, position, alternative_food_id, alternative_version,
        source_portion, alternative_portion
        from public.food_default_alternatives where food_id = ${created.food_id}`,
    ).resolves.toEqual([
      {
        food_id: created.food_id,
        food_version: 1,
        position: 1,
        alternative_food_id: targetA.food_id,
        alternative_version: 1,
        source_portion: '100.000',
        alternative_portion: '100.000',
      },
    ]);
  });

  it('versions own a separate immutable alternative list and replay once', async () => {
    const source = await createFood(
      po.userId,
      `Version defaults ${randomUUID()}`,
    );
    const oldTarget = await createFood(
      po.userId,
      `Old alternative ${randomUUID()}`,
    );
    const newTarget = await createFood(
      po.userId,
      `New alternative ${randomUUID()}`,
    );
    const versionKey = randomUUID();
    const request = foodRequest(`Version defaults updated ${randomUUID()}`);
    const alternatives = [foodAlternative(newTarget.food_id, 100, 100)];
    const version = async () =>
      asActor(
        po.userId,
        (tx) =>
          tx`select public.catalog_version_food(
          ${source.food_id}, 1, ${versionKey}, ${tx.json(request)}, ${tx.json(alternatives)}
        )`,
      );
    const first = await version();
    expect(
      (first[0]?.catalog_version_food as { version: number }).version,
    ).toBe(2);
    await expect(version()).resolves.toEqual(first);
    await expect(
      asActor(
        po.userId,
        (tx) =>
          tx`select public.catalog_version_food(
          ${source.food_id}, 1, ${versionKey}, ${tx.json(request)},
          ${tx.json([foodAlternative(oldTarget.food_id)])}
        )`,
      ),
    ).rejects.toMatchObject({
      code: '23505',
      message: 'operation_key_request_conflict',
    });
    await expect(
      db`select food_version, alternative_food_id from public.food_default_alternatives
        where food_id = ${source.food_id} order by food_version, position`,
    ).resolves.toEqual([
      {
        food_version: 2,
        alternative_food_id: newTarget.food_id,
      },
    ]);
  });

  it('rejects invalid alternative sets and rolls a partial version back atomically', async () => {
    const source = await createFood(po.userId, `Atomic source ${randomUUID()}`);
    const valid = await createFood(po.userId, `Atomic target ${randomUUID()}`);
    const inactive = await createFood(
      po.userId,
      `Inactive target ${randomUUID()}`,
    );
    const historical = await createFood(
      po.userId,
      `Historical target ${randomUUID()}`,
    );
    const historicalUpdate = foodRequest(
      `Historical target current ${randomUUID()}`,
    );
    await asActor(
      po.userId,
      (tx) =>
        tx`select public.catalog_version_food(
        ${historical.food_id}, 1, ${randomUUID()}, ${tx.json(historicalUpdate)}, '[]'::jsonb
      )`,
    );
    await db`update public.foods set lifecycle_state = 'removed' where id = ${inactive.food_id}`;
    const createWith = (items: ReturnType<typeof foodAlternative>[]) =>
      asActor(
        po.userId,
        (tx) =>
          tx`select public.catalog_create_food(
          ${randomUUID()}, null, ${tx.json(foodRequest(`Rejected ${randomUUID()}`))}, ${tx.json(items)}
        )`,
      );
    const four = await Promise.all(
      [0, 1, 2, 3].map((index) =>
        createFood(po.userId, `Four alt ${index} ${randomUUID()}`),
      ),
    );
    await expect(
      createWith(four.map((food) => foodAlternative(food.food_id))),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      createWith([foodAlternative(randomUUID())]),
    ).rejects.toMatchObject({
      code: '22023',
      message: 'catalog_food_alternatives_invalid',
    });
    await expect(
      createWith([foodAlternative(inactive.food_id)]),
    ).rejects.toMatchObject({
      code: '22023',
      message: 'catalog_food_alternatives_invalid',
    });
    await expect(
      createWith([foodAlternative(historical.food_id, 100, 100, 1)]),
    ).rejects.toMatchObject({
      code: '22023',
      message: 'catalog_food_alternatives_invalid',
    });
    await expect(
      createWith([
        foodAlternative(valid.food_id),
        foodAlternative(valid.food_id),
      ]),
    ).rejects.toMatchObject({
      code: '22023',
      message: 'catalog_food_alternatives_invalid',
    });

    const update = foodRequest(`Atomic source version ${randomUUID()}`);
    const key = randomUUID();
    await expect(
      asActor(
        po.userId,
        (tx) =>
          tx`select public.catalog_version_food(
          ${source.food_id}, 1, ${key}, ${tx.json(update)},
          ${tx.json([
            foodAlternative(valid.food_id),
            foodAlternative(source.food_id),
          ])}
        )`,
      ),
    ).rejects.toMatchObject({
      code: '22023',
      message: 'catalog_food_alternatives_invalid',
    });
    await expect(
      db`select current_version from public.foods where id = ${source.food_id}`,
    ).resolves.toEqual([{ current_version: 1 }]);
    await expect(
      db`select count(*)::int as rows from public.food_versions where food_id = ${source.food_id} and version = 2`,
    ).resolves.toEqual([{ rows: 0 }]);
    await expect(
      db`select count(*)::int as rows from public.food_default_alternatives where food_id = ${source.food_id}`,
    ).resolves.toEqual([{ rows: 0 }]);
  });

  it('normalizes case, whitespace, and Unicode in duplicate identity keys and locks', async () => {
    const name = `Normalized identity ${randomUUID()}`;
    const firstRequest = {
      ...foodRequest(name),
      product_identity_norm: '  Café   Rice ',
      preparation_identity_norm: ' PLAIN\tPREP ',
    };
    await asActor(
      po.userId,
      (tx) =>
        tx`select public.catalog_create_food(${randomUUID()}, null, ${tx.json(firstRequest)}, '[]'::jsonb)`,
    );
    const equivalent = {
      ...foodRequest(name),
      product_identity_norm: 'cafe\u0301 rice',
      preparation_identity_norm: 'plain prep',
    };
    await expect(
      asActor(
        trainerB.userId,
        (tx) =>
          tx`select public.catalog_create_food(${randomUUID()}, ${wsB}, ${tx.json(equivalent)}, '[]'::jsonb)`,
      ),
    ).rejects.toMatchObject({
      code: '23505',
      message: 'catalog_food_duplicate',
    });
  });
});
