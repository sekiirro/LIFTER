import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, checked, sql } from './harness';

const db = sql();
let actorId: string;

beforeAll(async () => {
  const created = await admin().auth.admin.createUser({
    email: `catalog-search-${randomUUID()}@example.test`,
    password: `Catalog-${randomUUID()}-aA1!`,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error(created.error?.message ?? 'catalog search actor missing');
  actorId = created.data.user.id;
  checked(
    await admin().from('staff_profiles').insert({
      user_id: actorId,
      role: 'platform_owner',
      display_name: 'Platform Owner',
    }),
  );
});

afterAll(async () => {
  await db.end();
  if (actorId) await admin().auth.admin.deleteUser(actorId);
});

describe('normalized, indexed and bounded catalog search', () => {
  it('matches the TypeScript Arabic/English normalization rules in SQL', async () => {
    const results = await db`
      select app_private.normalize_ar_en_v1('أَكْلٌ مُغَذٍّ ـ ة ى') as normalized
    `;
    expect(results[0]?.normalized).toBe('اكل مغذ  ه ي');
  });

  it('uses stored normalized names and trigram indexes for all searchable scopes', async () => {
    const indexes = await db`
      select tablename, indexname, indexdef from pg_indexes
      where schemaname = 'public' and indexname = any(${[
        'exercise_versions_name_norm_ar_trgm_idx',
        'exercise_versions_name_norm_en_trgm_idx',
        'food_versions_name_norm_ar_trgm_idx',
        'food_versions_name_norm_en_trgm_idx',
        'workspace_exercise_versions_name_norm_ar_trgm_idx',
        'workspace_exercise_versions_name_norm_en_trgm_idx',
      ]})
    `;
    expect(indexes).toHaveLength(6);
    expect(indexes.every((row) => row.indexdef.includes('gin_trgm_ops'))).toBe(
      true,
    );
    expect(indexes.every((row) => row.indexdef.includes('USING gin'))).toBe(
      true,
    );
  });

  it('applies exercise filters, stable cursor ordering, and a page size capped at 50', async () => {
    const ids = Array.from(
      { length: 56 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    );
    const fixtures = ids.map((id, index) => ({
      id,
      actor: actorId,
      version: 1,
      name_en: `Dumbbell press ${index + 1}`,
      name_ar: `ضغط دمبل ${index + 1}`,
      muscleGroup: index === 55 ? 'back' : 'chest',
      equipment: index === 55 ? 'barbell' : 'dumbbell',
    }));
    const rollbackMarker = 'rollback_catalog_search_fixture';
    let page: Array<{ result_id: string }> = [];
    let next: Array<{ result_id: string }> = [];
    let capped: Array<{ result_id: string }> = [];
    try {
      await db.begin(async (tx) => {
        for (const fixture of fixtures) {
          await tx`insert into public.exercises(id, created_by, current_version)
            values (${fixture.id}, ${fixture.actor}, ${fixture.version})`;
          await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
            values (${fixture.id}, ${fixture.version}, ${tx.json({
              name_ar: fixture.name_ar,
              name_en: fixture.name_en,
              muscleGroup: fixture.muscleGroup,
              equipment: fixture.equipment,
            })}, ${fixture.actor})`;
        }
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
        const pageFilters = {
          muscle_group: 'chest',
          equipment: 'dumbbell',
          page_size: 7,
        };
        const filterType =
          await tx`select jsonb_typeof(${tx.json(pageFilters)}) as type`;
        expect(filterType[0]?.type).toBe('object');
        page = (await tx`select result_id from public.catalog_search(
          'exercise','dumbbell',${tx.json(pageFilters)},null,null
        )`) as unknown as typeof page;
        next = (await tx`select result_id from public.catalog_search(
          'exercise','dumbbell','{}'::jsonb,${ids[6]!},null
        )`) as unknown as typeof next;
        capped = (await tx`select result_id from public.catalog_search(
          'exercise','dumbbell',${tx.json({ page_size: 500 })},null,null
        )`) as unknown as typeof capped;
        expect(page).toHaveLength(7);
        expect(page.map((row) => row.result_id)).toEqual(ids.slice(0, 7));
        expect(next.map((row) => row.result_id)).toEqual(ids.slice(7));
        expect(capped).toHaveLength(50);
        throw new Error(rollbackMarker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(rollbackMarker);
    }
  });

  it('filters foods by g/ml basis without mixing units', async () => {
    const ids = [randomUUID(), randomUUID()];
    const rollbackMarker = 'rollback_catalog_food_search_fixture';
    let rows: Array<{ result_id: string }> = [];
    try {
      await db.begin(async (tx) => {
        for (const [index, id] of ids.entries()) {
          const basis = index === 0 ? 'g' : 'ml';
          await tx`insert into public.foods(id, created_by, current_version)
            values (${id}, ${actorId}, 1)`;
          await tx`insert into public.food_versions(
            food_id, version, payload, created_by, name_en, basis, product_identity_norm,
            preparation_identity_norm, weighing_state, kcal, protein_g, carbohydrate_g, fat_g
          ) values (
            ${id}, 1, ${tx.json({ name_en: 'Milk' })}, ${actorId}, 'Milk', ${basis},
            'milk', 'plain', 'not_applicable', 60, 3, 5, 2
          )`;
          await tx`insert into public.food_serving_units(
            food_id, food_version, basis, unit_key, label_en, basis_qty
          ) values (${id}, 1, ${basis}, 'reference', '100', 100)`;
        }
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
        rows = (await tx`select result_id from public.catalog_search(
          'food', 'milk', ${tx.json({ basis: 'ml', page_size: 10 })}, null, null
        )`) as unknown as typeof rows;
        expect(rows.map((row) => row.result_id)).toEqual([ids[1]]);
        throw new Error(rollbackMarker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(rollbackMarker);
    }
  });

  it('pins the SQL normalizer and index contract in a forward migration', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20261106103000_catalog_search_indexes.sql',
      ),
      'utf8',
    );
    expect(source).toContain('normalize_ar_en_v1');
    expect(source).toContain('gin_trgm_ops');
    expect(source).toContain('Stable ordering');
  });
});
