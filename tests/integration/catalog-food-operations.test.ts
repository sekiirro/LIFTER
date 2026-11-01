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
let trainerB: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerB'];
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

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  po = fixture.po;
  trainerA = fixture.trainerA;
  trainerB = fixture.trainerB;
  wsA = fixture.wsA.id;
});

afterAll(async () => Promise.all([db.end(), concurrentDb.end()]));

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
      tx`select public.catalog_create_food(${key}, ${actorId === po.userId ? null : wsA}, ${tx.json(foodRequest(name))})`,
  );
  return response[0]?.catalog_create_food as {
    food_id: string;
    version: number;
    warnings: string[];
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
    const result = responses[0][0]?.catalog_create_food as {
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
      (responses[0][0]?.catalog_version_food as { version: number }).version,
    ).toBe(2);
    await expect(
      db`select count(*)::int as versions from public.food_versions where food_id = ${created.food_id}`,
    ).resolves.toEqual([{ versions: 2 }]);
  });
});
