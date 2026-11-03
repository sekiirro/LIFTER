import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { createStaff, sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
let po: Awaited<ReturnType<typeof twoWorkspaceFixture>>['po'];
let trainer: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerA'];
let sales: Awaited<ReturnType<typeof twoWorkspaceFixture>>['salesA'];
let client: Awaited<ReturnType<typeof createStaff>>;
let unknown: Awaited<ReturnType<typeof createStaff>>;
let originWorkspaceId: string;

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  po = fixture.po;
  trainer = fixture.trainerA;
  sales = fixture.salesA;
  client = await createStaff(null, 'catalog-client');
  unknown = await createStaff(null, 'catalog-unknown');
  originWorkspaceId = fixture.wsA.id;
});

afterAll(async () => db.end());

async function withFoodReadFixture<T>(
  actorId: string,
  body: (tx: Tx, foodId: string) => Promise<T>,
) {
  const foodId = randomUUID();
  const rollbackMarker = 'rollback_catalog_projection_fixture';
  let result: T | undefined;
  try {
    await db.begin(async (tx) => {
      await tx`insert into public.foods(id, created_by, origin_workspace_id, current_version)
        values (${foodId}, ${po.userId}, ${originWorkspaceId}, 1)`;
      await tx`insert into public.food_versions(
        food_id, version, payload, created_by, name_en, basis, product_identity_norm,
        preparation_identity_norm, weighing_state, kcal, protein_g, carbohydrate_g, fat_g
      ) values (
        ${foodId}, 1, ${tx.json({ name_en: 'Privacy catalog food', kcal: 111 })}, ${po.userId},
        'Privacy catalog food', 'g', 'privacy-food', 'plain', 'not_applicable', 111, 5, 20, 1
      )`;
      await tx`insert into public.food_serving_units(food_id, food_version, basis, unit_key, label_en, basis_qty)
        values (${foodId}, 1, 'g', 'reference', '100 g', 100)`;
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
      result = await body(tx, foodId);
      throw new Error(rollbackMarker);
    });
  } catch (error) {
    if ((error as Error).message !== rollbackMarker) throw error;
  }
  return result as T;
}

describe('global food provenance privacy projections', () => {
  it('defaults food detail to the current version and preserves explicit history reads', async () => {
    const result = await withFoodReadFixture(po.userId, async (tx, foodId) => {
      await tx`select set_config('role', 'postgres', true)`;
      await tx`insert into public.food_versions(
        food_id, version, payload, created_by, name_en, basis, product_identity_norm,
        preparation_identity_norm, weighing_state, kcal, protein_g, carbohydrate_g, fat_g
      ) values (
        ${foodId}, 2, ${tx.json({ name_en: 'Current projection', kcal: 222 })}, ${po.userId},
        'Current projection', 'g', 'projection-current', 'plain', 'not_applicable', 222, 5, 20, 1
      )`;
      await tx`insert into public.food_serving_units(food_id, food_version, basis, unit_key, label_en, basis_qty)
        values (${foodId}, 2, 'g', 'reference', '100 g', 100)`;
      await tx`update public.foods set current_version = 2 where id = ${foodId}`;
      await tx`select set_config('role', 'authenticated', true)`;
      const current =
        await tx`select version, name_en from public.catalog_food_detail(${foodId})`;
      const historical =
        await tx`select version, name_en from public.catalog_food_detail(${foodId}, 1)`;
      return { current, historical };
    });
    expect(result.current).toEqual([
      { version: 2, name_en: 'Current projection' },
    ]);
    expect(result.historical).toEqual([
      { version: 1, name_en: 'Privacy catalog food' },
    ]);
  });

  it('global_food_provenance_masking_non_po', async () => {
    const projections = await withFoodReadFixture(
      trainer.userId,
      async (tx, foodId) => {
        const identity = await tx`select created_by, origin_workspace_id
        from public.catalog_foods_safe where id = ${foodId}`;
        const version = await tx`select created_by, origin_workspace_id
        from public.catalog_food_versions_safe where name_en = 'Privacy catalog food'`;
        const search =
          await tx`select result_created_by, result_origin_workspace_id, result_payload
        from public.catalog_search('food', 'privacy catalog', '{}'::jsonb, null, null)`;
        const detail =
          await tx`select created_by as result_created_by, origin_workspace_id as result_origin_workspace_id
        from public.catalog_food_detail(${foodId}, 1)`;
        const history =
          await tx`select created_by as result_created_by, origin_workspace_id as result_origin_workspace_id
        from public.catalog_food_history(${foodId})`;
        const exported = await tx`select created_by, origin_workspace_id
        from public.catalog_food_export_safe where food_id = ${foodId}`;
        return { identity, version, search, detail, history, exported };
      },
    );
    expect(projections.identity[0]?.created_by).toBeNull();
    expect(projections.identity[0]?.origin_workspace_id).toBeNull();
    expect(projections.version[0]?.created_by).toBeNull();
    expect(projections.version[0]?.origin_workspace_id).toBeNull();
    expect(projections.search[0]?.result_created_by).toBeNull();
    expect(projections.search[0]?.result_origin_workspace_id).toBeNull();
    expect(projections.search[0]?.result_payload).not.toHaveProperty(
      'created_by',
    );
    expect(projections.search[0]?.result_payload).not.toHaveProperty(
      'origin_workspace_id',
    );
    expect(projections.detail[0]?.result_created_by).toBeNull();
    expect(projections.detail[0]?.result_origin_workspace_id).toBeNull();
    expect(projections.history[0]?.result_created_by).toBeNull();
    expect(projections.history[0]?.result_origin_workspace_id).toBeNull();
    expect(projections.exported[0]?.created_by).toBeNull();
    expect(projections.exported[0]?.origin_workspace_id).toBeNull();
  });

  it('global_food_provenance_po_governance_read', async () => {
    const projections = await withFoodReadFixture(
      po.userId,
      async (tx, foodId) => {
        const identity = await tx`select id, created_by, origin_workspace_id
        from public.catalog_foods_safe where id = ${foodId}`;
        const version = await tx`select created_by, origin_workspace_id
        from public.catalog_food_versions_safe where name_en = 'Privacy catalog food'`;
        const search =
          await tx`select result_created_by, result_origin_workspace_id
        from public.catalog_search('food', 'privacy catalog', '{}'::jsonb, null, null)`;
        const detail =
          await tx`select created_by as result_created_by, origin_workspace_id as result_origin_workspace_id
        from public.catalog_food_detail(${foodId}, 1)`;
        const history =
          await tx`select created_by as result_created_by, origin_workspace_id as result_origin_workspace_id
        from public.catalog_food_history(${foodId})`;
        const exported = await tx`select created_by, origin_workspace_id
        from public.catalog_food_export_safe where food_id = ${foodId}`;
        return { identity, version, search, detail, history, exported };
      },
    );
    expect(projections.identity[0]?.created_by).toBe(po.userId);
    expect(projections.identity[0]?.origin_workspace_id).toBe(
      originWorkspaceId,
    );
    expect(projections.version[0]?.created_by).toBe(po.userId);
    expect(projections.version[0]?.origin_workspace_id).toBe(originWorkspaceId);
    expect(projections.search[0]?.result_created_by).toBe(po.userId);
    expect(projections.search[0]?.result_origin_workspace_id).toBe(
      originWorkspaceId,
    );
    expect(projections.detail[0]?.result_created_by).toBe(po.userId);
    expect(projections.detail[0]?.result_origin_workspace_id).toBe(
      originWorkspaceId,
    );
    expect(projections.history[0]?.result_created_by).toBe(po.userId);
    expect(projections.history[0]?.result_origin_workspace_id).toBe(
      originWorkspaceId,
    );
    expect(projections.exported[0]?.created_by).toBe(po.userId);
    expect(projections.exported[0]?.origin_workspace_id).toBe(
      originWorkspaceId,
    );
  });

  it('denies every T001 read-denial role on search, detail and history', async () => {
    const parity = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'tests/fixtures/catalog-role-parity.sql.json'),
        'utf8',
      ),
    ) as { operations: Array<Record<string, string> & { operation: string }> };
    const expectation = parity.operations.find(
      (row) => row.operation === 'Read global catalog/search/history',
    );
    expect(expectation).toBeDefined();
    for (const actor of [
      { userId: sales.userId, state: 'Sales' },
      { userId: client.userId, state: 'Client' },
      { userId: unknown.userId, state: 'Unknown/unauthenticated' },
    ]) {
      expect(expectation?.[actor.state]).toMatch(/^Deny/);
      await withFoodReadFixture(actor.userId, async (tx, foodId) => {
        await expect(
          tx.savepoint(
            (sp) => sp`
          select * from public.catalog_search('food', 'privacy', '{}'::jsonb, null, null)
        `,
          ),
        ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
        await expect(
          tx.savepoint(
            (sp) => sp`
          select * from public.catalog_food_detail(${foodId}, 1)
        `,
          ),
        ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
        await expect(
          tx.savepoint(
            (sp) => sp`
          select * from public.catalog_food_history(${foodId})
        `,
          ),
        ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
        const exported =
          await tx`select food_id from public.catalog_food_export_safe where food_id = ${foodId}`;
        expect(exported).toHaveLength(0);
      });
    }
  });

  it('uses safe views for detail, history, search and export projections', () => {
    const contract = readFileSync(
      resolve(
        process.cwd(),
        'specs/016-exercise-food-catalogs/contracts/catalog-api.md',
      ),
      'utf8',
    );
    expect(contract).toContain('global_food_provenance_masking_non_po');
    expect(contract).toContain('global_food_provenance_po_governance_read');
    expect(contract).toContain(
      'projection nulls or omits both `created_by` and `origin_workspace_id`',
    );
  });
});
