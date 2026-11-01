import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, sql, twoWorkspaceFixture } from './harness';

const db = sql();
let po: Awaited<ReturnType<typeof twoWorkspaceFixture>>['po'];
let trainerA: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerA'];
let trainerB: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerB'];
let wsA: string;
let wsB: string;

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  po = fixture.po;
  trainerA = fixture.trainerA;
  trainerB = fixture.trainerB;
  wsA = fixture.wsA.id;
  wsB = fixture.wsB.id;
});

afterAll(async () => db.end());

async function expectMutationToBreak<T>(body: () => Promise<T>, label: string) {
  let assertionFailure: unknown;
  try {
    await body();
  } catch (error) {
    assertionFailure = error;
  }
  expect(assertionFailure, label).toBeDefined();
}

describe('F16 mutation probes', () => {
  it('T011: action/hash rebinding and sensitive audit data violate the contract', async () => {
    const created = await admin().auth.admin.createUser({
      email: `catalog-mutation-key-${randomUUID()}@example.test`,
      password: `Catalog-${randomUUID()}-aA1!`,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      throw new Error(created.error?.message ?? 'mutation actor missing');
    const actor = created.data.user.id;
    const key = randomUUID();
    const hash = `sha256:${'a'.repeat(64)}`;
    const marker = 'rollback_catalog_operation_mutation';
    try {
      try {
        await db.begin(async (tx) => {
          await tx`insert into app_private.operation_keys(
            actor_user_id, action, operation_key, request_hash, result
          ) values (${actor}, 'catalog.food_created', ${key}, ${hash}, '{"ok":true}'::jsonb)`;
          await expect(
            tx.savepoint(
              (sp) => sp`
            select app_private.operation_key_result(${actor}, 'catalog.food_versioned', ${key}, ${hash})
          `,
            ),
          ).rejects.toThrow('operation_key_request_conflict');
          await expect(
            tx.savepoint(
              (sp) => sp`
            select app_private.operation_key_result(${actor}, 'catalog.food_created', ${key}, ${`sha256:${'b'.repeat(64)}`})
          `,
            ),
          ).rejects.toThrow('operation_key_request_conflict');
          await expect(
            tx.savepoint(
              (sp) => sp`
            select app_private.catalog_write_audit(
              ${actor}, 'catalog.food_created', 'foods', ${randomUUID()}, null,
              ${tx.json({ operation_key: key })}
            )
          `,
            ),
          ).rejects.toThrow('catalog_audit_contract_violation');
          throw new Error(marker);
        });
      } catch (error) {
        expect((error as Error).message).toBe(marker);
      }
    } finally {
      await db`delete from app_private.operation_keys where actor_user_id = ${actor}`;
      await admin().auth.admin.deleteUser(actor);
    }
  });

  it('T012: direct DML grants and widened helper EXECUTE fail privilege assertions', async () => {
    const marker = 'rollback_catalog_privilege_mutation';
    try {
      await db.begin(async (tx) => {
        await tx`grant insert on public.exercises to authenticated`;
        const [tableGrant] = await tx`
          select has_table_privilege('authenticated', 'public.exercises', 'INSERT') as allowed
        `;
        await expectMutationToBreak(async () => {
          expect(tableGrant?.allowed).toBe(false);
        }, 'authenticated INSERT grant must break the denial assertion');

        await tx`grant execute on function app_private.catalog_write_audit(uuid,text,text,uuid,uuid,jsonb) to authenticated`;
        const [functionGrant] = await tx`
          select has_function_privilege('authenticated',
            'app_private.catalog_write_audit(uuid,text,text,uuid,uuid,jsonb)', 'EXECUTE') as allowed
        `;
        await expectMutationToBreak(async () => {
          expect(functionGrant?.allowed).toBe(false);
        }, 'widened helper EXECUTE must break the denial assertion');
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    }
  });

  it('T013: removing a global RLS predicate exposes a row that the role matrix denies', async () => {
    const created = await admin().auth.admin.createUser({
      email: `catalog-mutation-rls-${randomUUID()}@example.test`,
      password: `Catalog-${randomUUID()}-aA1!`,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      throw new Error(created.error?.message ?? 'RLS mutation actor missing');
    const actor = created.data.user.id;
    const exerciseId = randomUUID();
    const marker = 'rollback_catalog_rls_mutation';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.exercises(id, created_by, current_version)
          values (${exerciseId}, ${po.userId}, 1)`;
        await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
          values (${exerciseId}, 1, '{"name_en":"mutation probe"}'::jsonb, ${po.userId})`;
        await tx`alter policy exercises_global_read on public.exercises using (true)`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actor, role: 'authenticated' })}, true)`;
        const visible =
          await tx`select id from public.exercises where id = ${exerciseId}`;
        await expectMutationToBreak(async () => {
          expect(visible).toHaveLength(0);
        }, 'removing the global RLS predicate must break the denied-role assertion');
        expect(visible).toHaveLength(1);
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    } finally {
      await admin().auth.admin.deleteUser(actor);
    }
  });

  it('T013: removing the workspace predicate exposes a foreign workspace row', async () => {
    const foreign = await admin().auth.admin.createUser({
      email: `catalog-mutation-tenant-${randomUUID()}@example.test`,
      password: `Catalog-${randomUUID()}-aA1!`,
      email_confirm: true,
    });
    if (foreign.error || !foreign.data.user)
      throw new Error(
        foreign.error?.message ?? 'tenant mutation actor missing',
      );
    const actor = foreign.data.user.id;
    const exerciseId = randomUUID();
    const marker = 'rollback_catalog_tenant_mutation';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.workspace_exercises(workspace_id, id, created_by, current_version)
          values (${wsB}, ${exerciseId}, ${trainerB.userId}, 1)`;
        await tx`insert into public.workspace_exercise_versions(workspace_id, workspace_exercise_id, version, payload, created_by)
          values (${wsB}, ${exerciseId}, 1, '{"name_en":"foreign mutation probe"}'::jsonb, ${trainerB.userId})`;
        await tx`alter policy workspace_exercises_scope_read on public.workspace_exercises using (true)`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actor, role: 'authenticated' })}, true)`;
        const visible =
          await tx`select workspace_id, id from public.workspace_exercises where id = ${exerciseId}`;
        await expectMutationToBreak(async () => {
          expect(visible).toHaveLength(0);
        }, 'removing the tenant predicate must break the foreign-scope denial assertion');
        expect(visible).toHaveLength(1);
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    } finally {
      await admin().auth.admin.deleteUser(actor);
    }
  });

  it('T014: removing the page cap or a trigram index breaks search assertions', async () => {
    const ids = Array.from(
      { length: 56 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    );
    const marker = 'rollback_catalog_search_mutation';
    let stage = 'fixture';
    try {
      await db.begin(async (tx) => {
        for (const id of ids) {
          await tx`insert into public.exercises(id, created_by, current_version)
            values (${id}, ${po.userId}, 1)`;
          await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
            values (${id}, 1, ${tx.json({ name_en: 'Dumbbell mutation probe' })}, ${po.userId})`;
        }
        stage = 'read-definition';
        const [functionDef] = await tx`
          select pg_get_functiondef('public.catalog_search(text,text,jsonb,text,uuid)'::regprocedure) as definition
        `;
        if (!functionDef?.definition)
          throw new Error('catalog_search definition missing');
        const mutant = functionDef.definition.replace(
          /page_limit\s*:=\s*least\(greatest\(\(filters\s*->>\s*'page_size'\)::integer,\s*1\),\s*50\)/i,
          "page_limit := greatest((filters->>'page_size')::integer, 1)",
        );
        if (mutant === functionDef.definition)
          throw new Error('page cap mutation target missing');
        stage = 'replace-page-cap';
        await tx.unsafe(mutant);
        stage = 'query-mutated-cap';
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: po.userId, role: 'authenticated' })}, true)`;
        const rows = await tx`select result_id from public.catalog_search(
          'exercise', 'dumbbell', ${tx.json({ page_size: 500 })}, null, null
        )`;
        await expectMutationToBreak(async () => {
          expect(rows).toHaveLength(50);
        }, 'removing the page cap must break the 50-row assertion');
        expect(rows).toHaveLength(56);

        const orderingMutant = functionDef.definition.replaceAll(
          'order by e.id',
          'order by e.id desc',
        );
        if (orderingMutant === functionDef.definition)
          throw new Error('stable-order mutation target missing');
        stage = 'replace-order';
        await tx`select set_config('role', 'postgres', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: po.userId, role: 'authenticated' })}, true)`;
        await tx.unsafe(orderingMutant);
        await tx`select set_config('role', 'authenticated', true)`;
        stage = 'query-mutated-order';
        const reversed = await tx`select result_id from public.catalog_search(
          'exercise', 'dumbbell', ${tx.json({ page_size: 7 })}, null, null
        )`;
        await expectMutationToBreak(async () => {
          expect(reversed.map((row) => row.result_id)).toEqual(ids.slice(0, 7));
        }, 'removing stable ascending order must break the cursor order assertion');
        expect(reversed[0]?.result_id).toBe(ids[55]);
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker)
        throw new Error(
          `Mutation failed at ${stage}: ${(error as Error).message}`,
        );
    }

    const indexMarker = 'rollback_catalog_search_index_mutation';
    try {
      await db.begin(async (tx) => {
        await tx`drop index public.exercise_versions_name_norm_ar_trgm_idx`;
        const indexes = await tx`
          select indexname from pg_indexes where schemaname = 'public'
            and indexname like '%name_norm%trgm_idx'
        `;
        await expectMutationToBreak(async () => {
          expect(indexes).toHaveLength(6);
        }, 'removing a normalized trigram index must break the index assertion');
        expect(indexes).toHaveLength(5);
        throw new Error(indexMarker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(indexMarker);
    }
  });

  it('T015: removing PO provenance masking breaks every non-PO projection assertion', async () => {
    const foodId = randomUUID();
    const marker = 'rollback_catalog_projection_mutation';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.foods(id, created_by, origin_workspace_id, current_version)
          values (${foodId}, ${po.userId}, ${wsA}, 1)`;
        await tx`insert into public.food_versions(
          food_id, version, payload, created_by, name_en, basis, product_identity_norm,
          preparation_identity_norm, weighing_state, kcal, protein_g, carbohydrate_g, fat_g
        ) values (
          ${foodId}, 1, ${tx.json({ name_en: 'Mask mutation probe' })}, ${po.userId},
          'Mask mutation probe', 'g', 'mask-probe', 'plain', 'not_applicable', 90, 5, 10, 2
        )`;
        await tx`insert into public.food_serving_units(food_id, food_version, basis, unit_key, label_en, basis_qty)
          values (${foodId}, 1, 'g', 'reference', '100 g', 100)`;
        await tx.unsafe(`
          create or replace function app_private.is_platform_owner() returns boolean
          language sql stable security definer set search_path = '' as $$ select true $$
        `);
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerA.userId, role: 'authenticated' })}, true)`;
        const identity = await tx`select created_by, origin_workspace_id
          from public.catalog_foods_safe where id = ${foodId}`;
        const version = await tx`select created_by, origin_workspace_id
          from public.catalog_food_versions_safe where food_id = ${foodId}`;
        const search =
          await tx`select result_created_by, result_origin_workspace_id
          from public.catalog_search('food', 'mask mutation', '{}'::jsonb, null, null)`;
        const detail =
          await tx`select created_by, origin_workspace_id from public.catalog_food_detail(${foodId}, 1)`;
        const history =
          await tx`select created_by, origin_workspace_id from public.catalog_food_history(${foodId})`;
        const exported = await tx`select created_by, origin_workspace_id
          from public.catalog_food_export_safe where food_id = ${foodId}`;
        const projections = [
          identity[0]?.created_by,
          identity[0]?.origin_workspace_id,
          version[0]?.created_by,
          version[0]?.origin_workspace_id,
          search[0]?.result_created_by,
          search[0]?.result_origin_workspace_id,
          detail[0]?.created_by,
          detail[0]?.origin_workspace_id,
          history[0]?.created_by,
          history[0]?.origin_workspace_id,
          exported[0]?.created_by,
          exported[0]?.origin_workspace_id,
        ];
        await expectMutationToBreak(async () => {
          expect(projections.every((value) => value === null)).toBe(true);
        }, 'removing PO masking must break the non-PO projection assertion');
        expect(projections).toContain(po.userId);
        expect(projections).toContain(wsA);
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    }
  });

  it('T018: bypassing PO, CAS, or append-only guards breaks each negative contract', async () => {
    const exerciseId = randomUUID();
    const request = {
      name_ar: 'اختبار الطفرة',
      name_en: 'Mutation exercise',
      primary_muscle_code: 'chest',
      secondary_muscle_codes: [],
      equipment_codes: ['barbell'],
      defaults: {},
    };
    const marker = 'rollback_catalog_exercise_mutations';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.exercises(id, created_by, current_version)
          values (${exerciseId}, ${po.userId}, 1)`;
        await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
          values (${exerciseId}, 1, ${tx.json(request)}, ${po.userId})`;
        await tx`create or replace function public.catalog_create_exercise(p_operation_key uuid, p_request jsonb)
          returns jsonb language sql security definer set search_path = '' as $$ select '{}'::jsonb $$`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerA.userId, role: 'authenticated' })}, true)`;
        await expectMutationToBreak(
          async () =>
            expect(
              tx`select public.catalog_create_exercise(${randomUUID()}, ${tx.json(request)})`,
            ).rejects.toMatchObject({ code: '42501' }),
          'removing the SQL PO guard must break the denied-role assertion',
        );

        await tx`select set_config('role', 'postgres', true)`;
        await tx`create or replace function public.catalog_version_exercise(p_exercise_id uuid, p_expected_version integer, p_operation_key uuid, p_request jsonb)
          returns jsonb language sql security definer set search_path = '' as $$
            select jsonb_build_object('exercise_id', $1, 'version', 2)
          $$`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: po.userId, role: 'authenticated' })}, true)`;
        await expectMutationToBreak(
          async () =>
            expect(
              tx`select public.catalog_version_exercise(${exerciseId}, 0, ${randomUUID()}, ${tx.json(request)})`,
            ).rejects.toMatchObject({ code: '40001' }),
          'removing expected-version CAS must break the stale-write assertion',
        );

        await tx`select set_config('role', 'postgres', true)`;
        await tx`alter table public.exercise_versions disable trigger exercise_versions_append_only`;
        await expectMutationToBreak(
          async () =>
            expect(
              tx`update public.exercise_versions set payload = '{}'::jsonb where exercise_id = ${exerciseId} and version = 1`,
            ).rejects.toMatchObject({ code: '23514' }),
          'removing append-only protection must break the immutability assertion',
        );
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    }
  });

  it('T019: removing workspace membership and tenant checks breaks both denial assertions', async () => {
    const request = {
      name_ar: 'اختبار النطاق',
      name_en: 'Workspace scope mutation',
      primary_muscle_code: 'chest',
      secondary_muscle_codes: [],
      equipment_codes: ['barbell'],
      defaults: {},
    };
    const marker = 'rollback_catalog_workspace_scope_mutation';
    try {
      await db.begin(async (tx) => {
        await tx`create or replace function app_private.has_workspace_access(ws uuid, cap text default null)
          returns boolean language sql stable security definer set search_path = '' as $$ select true $$`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerA.userId, role: 'authenticated' })}, true)`;
        await expectMutationToBreak(
          async () =>
            expect(
              tx`select public.catalog_write_workspace_exercise(${wsB}, null, null, ${randomUUID()}, ${tx.json(request)})`,
            ).rejects.toMatchObject({
              code: '42501',
              message: 'not_permitted',
            }),
          'removing the current workspace tenant predicate must break foreign-scope denial',
        );
        await tx`select set_config('role', 'postgres', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: po.userId, role: 'authenticated' })}, true)`;
        await tx`update public.workspace_memberships set revoked_at = now(), revoked_by = ${po.userId}
          where workspace_id = ${wsA} and user_id = ${trainerA.userId} and revoked_at is null`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerA.userId, role: 'authenticated' })}, true)`;
        await expectMutationToBreak(
          async () =>
            expect(
              tx`select public.catalog_write_workspace_exercise(${wsA}, null, null, ${randomUUID()}, ${tx.json(request)})`,
            ).rejects.toMatchObject({
              code: '42501',
              message: 'not_permitted',
            }),
          'removing current-membership recheck must break revoked-actor denial',
        );
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    }
  });
});
