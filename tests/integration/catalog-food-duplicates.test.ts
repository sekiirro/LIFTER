import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
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
  it('uses the composite near-duplicate GIN path at benchmark volume', async () => {
    const fixtureKey = randomUUID();
    const baseName =
      'catalog benchmark salted almond spread with toasted sesame and date syrup';
    const nearName = `${baseName.slice(0, -1)}x`;
    const fixtureFoods = 9_000;
    const versionsPerFood = 6;
    const fixtureVersions = fixtureFoods * versionsPerFood;
    const fixtureRollback = new Error('T034 benchmark fixture rollback');

    try {
      await db.begin(async (tx) => {
        await tx`set constraints all deferred`;
        await tx`
        insert into public.foods (id, created_by, current_version)
        select md5(${fixtureKey} || ':food:' || n::text)::uuid, ${poId}, ${versionsPerFood}
        from generate_series(1, ${fixtureFoods}) as food(n)
      `;
        await tx`
        insert into public.food_versions (
          food_id, version, payload, created_by, name_en, basis,
          product_identity_norm, preparation_identity_norm, weighing_state,
          kcal, protein_g, carbohydrate_g, fat_g
        )
        select
          md5(${fixtureKey} || ':food:' || food.n::text)::uuid,
          version.n,
          jsonb_build_object('name_en', case
            when version.n = ${versionsPerFood} then ${nearName}
            else 'benchmark food ' || lpad(food.n::text, 5, '0') || ' historical version ' || version.n::text
          end),
          ${poId},
          case
            when version.n = ${versionsPerFood} then ${nearName}
            else 'benchmark food ' || lpad(food.n::text, 5, '0') || ' historical version ' || version.n::text
          end,
          'g',
          'benchmark-product-' || lpad((food.n % 90)::text, 2, '0'),
          'benchmark-preparation',
          'not_applicable',
          100, 5, 10, 2
        from generate_series(1, ${fixtureFoods}) as food(n)
        cross join generate_series(1, ${versionsPerFood}) as version(n)
      `;
        await tx`
        insert into public.food_serving_units (
          food_id, food_version, basis, unit_key, label_en, basis_qty
        )
        select
          md5(${fixtureKey} || ':food:' || food.n::text)::uuid,
          version.n, 'g', 'reference', 'Reference', 100
        from generate_series(1, ${fixtureFoods}) as food(n)
        cross join generate_series(1, ${versionsPerFood}) as version(n)
      `;
        await tx`analyze public.food_versions`;
        await tx`analyze public.foods`;
        await tx`select set_config('pg_trgm.similarity_threshold', '0.90', true)`;
        const explain = await tx`
        explain (analyze, buffers, format json)
        select f.id, v.version
        from public.foods f
        join public.food_versions v on v.food_id = f.id and v.version = f.current_version
        where f.lifecycle_state = 'active'
          and v.basis = 'g'
          and v.product_identity_norm = 'benchmark-product-01'
          and v.preparation_identity_norm = 'benchmark-preparation'
          and v.weighing_state = 'not_applicable'
          and v.name_norm_en_v1 <> ${baseName}
          and v.name_norm_en_v1 OPERATOR(extensions.%) ${baseName}
          and extensions.similarity(v.name_norm_en_v1, ${baseName}) >= 0.90
          and abs(v.kcal - 100) <= greatest(10::numeric, 10::numeric)
          and not exists (
            select 1 from public.catalog_food_name_keys k
            where k.active and k.food_id = f.id and k.lang = 'en'
              and k.name_norm = ${baseName} and k.basis = 'g'
              and k.product_identity_norm = 'benchmark-product-01'
              and k.preparation_identity_norm = 'benchmark-preparation'
              and k.weighing_state = 'not_applicable'
          )
        order by f.id
        limit 50
      `;
        const plan = (
          explain[0]?.['QUERY PLAN'] as { Plan?: Record<string, unknown> }[]
        )?.[0]?.Plan;
        expect(plan).toBeDefined();
        const nodes: Record<string, unknown>[] = [];
        const visit = (node: Record<string, unknown>) => {
          nodes.push(node);
          const children = node['Plans'] as
            Record<string, unknown>[] | undefined;
          children?.forEach(visit);
        };
        visit(plan!);
        const planSummary = nodes.map((node) => ({
          node: node['Node Type'],
          relation: node['Relation Name'],
          index: node['Index Name'],
          indexCond: node['Index Cond'],
          actualRows: node['Actual Rows'],
        }));
        console.info('T034_PLAN_NODES', JSON.stringify(planSummary));
        expect(
          nodes.some(
            (node) =>
              node['Node Type'] === 'Seq Scan' &&
              node['Relation Name'] === 'food_versions',
          ),
        ).toBe(false);
        expect(
          nodes.some(
            (node) =>
              node['Node Type'] === 'Bitmap Index Scan' &&
              node['Index Name'] === 'food_versions_near_duplicate_gin_idx',
          ),
        ).toBe(true);

        const actual = await tx`
        select count(*)::int as versions from public.food_versions
      `;
        expect(actual[0]?.versions).toBeGreaterThanOrEqual(50_000);

        await tx`
          select set_config(
            'request.jwt.claims',
            ${JSON.stringify({ sub: trainerId, role: 'authenticated' })},
            true
          )
        `;
        await tx`select set_config('role', 'authenticated', true)`;
        const durations: number[] = [];
        for (let i = 0; i < 12; i += 1) {
          const started = performance.now();
          const matches = await tx`
            select food_id, version, match_type
            from public.catalog_food_duplicate_candidates(
              ${baseName}, 'en', 'g', 'benchmark-product-01',
              'benchmark-preparation', 'not_applicable', 100
            )
            where match_type = 'near'
          `;
          durations.push(performance.now() - started);
          expect(matches).toHaveLength(50);
        }
        durations.sort((left, right) => left - right);
        const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
        const p50 = durations[Math.ceil(durations.length * 0.5) - 1];
        console.info(
          `T034 fixture=${fixtureFoods} foods/${fixtureVersions} versions; total versions=${actual[0]?.versions}; plan=${JSON.stringify(nodes.map((node) => ({ node: node['Node Type'], relation: node['Relation Name'], index: node['Index Name'], actualRows: node['Actual Rows'] })))}; 12-call p50=${p50?.toFixed(2)}ms p95=${p95?.toFixed(2)}ms`,
        );
        throw fixtureRollback;
      });
    } catch (error) {
      if (error !== fixtureRollback) throw error;
    }
  }, 120_000);

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
