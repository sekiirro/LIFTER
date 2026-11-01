import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
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

  it('T020: bypassing video host validation makes the invalid-URL assertion fail', async () => {
    const exerciseId = randomUUID();
    const marker = 'rollback_catalog_variation_url_mutation';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.exercises(id, created_by, current_version)
          values (${exerciseId}, ${po.userId}, 1)`;
        await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
          values (${exerciseId}, 1, '{}'::jsonb, ${po.userId})`;
        await tx`create or replace function app_private.catalog_video_url_allowed(p_url text)
          returns boolean language sql immutable security definer set search_path = '' as $$ select true $$`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerA.userId, role: 'authenticated' })}, true)`;
        await expectMutationToBreak(
          async () =>
            expect(
              tx`select public.catalog_write_variation(${wsA}, ${exerciseId}, null, ${randomUUID()}, ${tx.json({ video_url: 'https://attacker.example/video' })})`,
            ).rejects.toMatchObject({
              code: '22023',
              message: 'catalog_variation_invalid',
            }),
          'removing the YouTube/Drive URL allowlist must break the negative payload test',
        );
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    }
  });

  it('T016: removing video host, selected-workspace, or live-membership guards breaks assertions', async () => {
    const exerciseId = randomUUID();
    const marker = 'rollback_catalog_video_resolution_mutation';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.exercises(id, created_by, current_version)
          values (${exerciseId}, ${po.userId}, 1)`;
        await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
          values (${exerciseId}, 1, '{}'::jsonb, ${po.userId})`;
        await tx`insert into public.exercise_variations(workspace_id, exercise_id, created_by, current_version)
          values (${wsA}, ${exerciseId}, ${trainerA.userId}, 1), (${wsB}, ${exerciseId}, ${trainerB.userId}, 1)`;
        await tx`insert into public.exercise_variation_versions(workspace_id, exercise_id, version, payload, created_by)
          values (${wsA}, ${exerciseId}, 1, '{"video_url":"https://evil.example/video"}'::jsonb, ${trainerA.userId}),
            (${wsB}, ${exerciseId}, 1, '{"video_url":"https://youtu.be/abcdefghijk"}'::jsonb, ${trainerB.userId})`;
        await tx`select set_config('role', 'postgres', true)`;
        await tx`create or replace function app_private.catalog_video_url_allowed(p_url text)
          returns boolean language sql immutable security definer set search_path = '' as $$ select true $$`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerA.userId, role: 'authenticated' })}, true)`;
        const unsafeHost =
          await tx`select * from public.catalog_resolve_exercise_video(${exerciseId}, ${wsA})`;
        await expectMutationToBreak(async () => {
          expect(unsafeHost).toHaveLength(0);
        }, 'removing the video host allowlist must break the unsafe-host denial');
        expect(unsafeHost[0]?.video_url).toBe('https://evil.example/video');

        await tx`select set_config('role', 'postgres', true)`;
        await tx`create or replace function app_private.has_workspace_access(ws uuid, cap text default null)
          returns boolean language sql stable security definer set search_path = '' as $$ select true $$`;
        const [resolver] = await tx`
          select pg_get_functiondef('public.catalog_resolve_exercise_video(uuid,uuid)'::regprocedure) as definition
        `;
        if (!resolver?.definition)
          throw new Error('video resolver definition missing');
        const originalResolver = resolver.definition;
        const equalityMutant = resolver.definition.replace(
          'and v.workspace_id = p_workspace_id',
          'and true',
        );
        if (equalityMutant === resolver.definition)
          throw new Error(
            'selected-workspace equality mutation target missing',
          );
        await tx.unsafe(equalityMutant);
        await tx`select set_config('role', 'authenticated', true)`;
        const foreignWorkspace =
          await tx`select * from public.catalog_resolve_exercise_video(${exerciseId}, ${wsB})`;
        await expectMutationToBreak(async () => {
          expect(foreignWorkspace).toHaveLength(0);
        }, 'removing the selected-workspace equality check must break isolation');
        expect(foreignWorkspace.map((row) => row.workspace_id)).toContain(wsA);

        await tx`select set_config('role', 'postgres', true)`;
        await tx.unsafe(originalResolver);
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: po.userId, role: 'authenticated' })}, true)`;
        await tx`update public.workspace_memberships set revoked_at = statement_timestamp(), revoked_by = ${po.userId}
          where workspace_id = ${wsA} and user_id = ${trainerA.userId} and revoked_at is null`;
        await tx`select set_config('role', 'authenticated', true)`;
        const revokedAccess =
          await tx`select * from public.catalog_resolve_exercise_video(${exerciseId}, ${wsA})`;
        await expectMutationToBreak(async () => {
          expect(revokedAccess).toHaveLength(0);
        }, 'removing the current-membership guard must break revocation denial');
        expect(revokedAccess).toHaveLength(1);
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker) throw error;
    }
  });

  it('T021: lifecycle, active-survivor, and cycle guards fail under mutation', async () => {
    const sourceId = randomUUID();
    const targetId = randomUUID();
    const marker = 'rollback_catalog_exercise_lifecycle_mutation';
    try {
      await db.begin(async (tx) => {
        for (const id of [sourceId, targetId]) {
          await tx`insert into public.exercises(id, created_by, current_version)
            values (${id}, ${po.userId}, 1)`;
          await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
            values (${id}, 1, '{}'::jsonb, ${po.userId})`;
        }
        await tx`insert into public.exercise_lifecycle_events(exercise_id, revision, lifecycle_state, actor_user_id)
          values (${sourceId}, 1, 'removed', ${po.userId})`;
        await tx`alter table public.exercise_lifecycle_events disable trigger exercise_lifecycle_events_append_only`;
        await expectMutationToBreak(
          async () =>
            expect(
              tx`update public.exercise_lifecycle_events set lifecycle_state = 'active' where exercise_id = ${sourceId} and revision = 1`,
            ).rejects.toMatchObject({ code: '23514' }),
          'removing lifecycle event immutability must break its no-update assertion',
        );

        await tx`update public.exercises set lifecycle_state = 'removed' where id = ${targetId}`;
        await tx`create or replace function public.catalog_merge_exercise(p_source_id uuid, p_target_id uuid, p_expected_source_revision integer, p_operation_key uuid)
          returns jsonb language sql security definer set search_path = '' as $$ select '{}'::jsonb $$`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: po.userId, role: 'authenticated' })}, true)`;
        await expectMutationToBreak(
          async () =>
            expect(
              tx`select public.catalog_merge_exercise(${sourceId}, ${targetId}, 0, ${randomUUID()})`,
            ).rejects.toMatchObject({ code: '23514' }),
          'removing active-survivor validation must break the merge-state denial',
        );

        await tx`select set_config('role', 'postgres', true)`;
        await tx`update public.exercises set lifecycle_state = 'merged', superseded_by = ${targetId} where id = ${sourceId}`;
        await tx`update public.exercises set lifecycle_state = 'merged', superseded_by = ${sourceId} where id = ${targetId}`;
        const cycle = await tx`
          with recursive chain(start_id, id, superseded_by, path, cycle) as (
            select e.id, e.id, e.superseded_by, array[e.id], false from public.exercises e where e.id in (${sourceId}, ${targetId})
            union all
            select c.start_id, e.id, e.superseded_by, c.path || e.id, e.id = any(c.path)
            from chain c join public.exercises e on e.id = c.superseded_by where c.superseded_by is not null and not c.cycle
          ) select exists(select 1 from chain where cycle) as has_cycle`;
        await expectMutationToBreak(async () => {
          expect(cycle[0]?.has_cycle).toBe(false);
        }, 'removing deterministic merge state checks must break the no-cycle invariant');
        expect(cycle[0]?.has_cycle).toBe(true);
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    }
  });

  it('T025: removing food identity dimensions, near-match bounds, or uniqueness breaks assertions', async () => {
    const baseId = randomUUID();
    const rawId = randomUUID();
    const cookedId = randomUUID();
    const duplicateA = randomUUID();
    const duplicateB = randomUUID();
    const marker = 'rollback_catalog_food_duplicate_mutation';
    const name = 'abcdefghijklmnopqrstuvwxyz'.repeat(4);
    const midSimilarityName = `${name.slice(0, 20)}zz${name.slice(22)}`;
    let stage = 'fixture';
    const makeFood = async (
      tx: postgres.TransactionSql,
      id: string,
      foodName: string,
      state = 'not_applicable',
    ) => {
      await tx`insert into public.foods(id, created_by, current_version) values (${id}, ${po.userId}, 1)`;
      await tx`insert into public.food_versions(
        food_id, version, payload, created_by, name_en, basis, product_identity_norm,
        preparation_identity_norm, weighing_state, kcal, protein_g, carbohydrate_g, fat_g
      ) values (
        ${id}, 1, ${tx.json({ name_en: foodName })}, ${po.userId}, ${foodName}, 'g', 'probe-product', 'plain', ${state}, 100, 5, 10, 2
      )`;
      await tx`insert into public.food_serving_units(food_id, food_version, basis, unit_key, label_en, basis_qty)
        values (${id}, 1, 'g', 'reference', '100 g', 100)`;
    };
    try {
      await db.begin(async (tx) => {
        await makeFood(tx, baseId, name);
        await tx`select app_private.reserve_catalog_food_keys(${baseId}, 1)`;
        const [definition] = await tx`
          select pg_catalog.pg_get_functiondef(
            'public.catalog_food_duplicate_candidates(text,text,text,text,text,text,numeric)'::regprocedure
          ) as sql`;
        if (!definition?.sql)
          throw new Error('duplicate candidate function definition missing');
        stage = 'basis mutation';
        await tx.unsafe(
          definition.sql.replace('and v.basis = p_basis', 'and true'),
        );
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerA.userId, role: 'authenticated' })}, true)`;
        const basisLeak =
          await tx`select food_id from public.catalog_food_duplicate_candidates(
          ${`${name.slice(0, -1)}x`}, 'en', 'ml', 'probe-product', 'plain', 'not_applicable', 100
        )`;
        await expectMutationToBreak(async () => {
          expect(basisLeak).toEqual([]);
        }, 'removing basis equality must break the near-candidate identity assertion');
        stage = 'threshold mutation';
        await tx`select set_config('role', 'postgres', true)`;
        await tx.unsafe(definition.sql.replaceAll('>= 0.90', '>= 0.50'));
        await tx`select set_config('role', 'authenticated', true)`;
        const score = await tx`select extensions.similarity(
          app_private.normalize_ar_en_v1(${name}), app_private.normalize_ar_en_v1(${midSimilarityName})
        ) as value`;
        expect(Number(score[0]?.value)).toBeGreaterThanOrEqual(0.5);
        expect(Number(score[0]?.value)).toBeLessThan(0.9);
        const lowSimilarity =
          await tx`select food_id from public.catalog_food_duplicate_candidates(
          ${midSimilarityName}, 'en', 'g', 'probe-product', 'plain', 'not_applicable', 100
        )`;
        await expectMutationToBreak(async () => {
          expect(lowSimilarity).toEqual([]);
        }, 'lowering the 90% near-match threshold must break its negative assertion');

        stage = 'weighing dimension mutation';
        await tx`select set_config('role', 'postgres', true)`;
        stage = 'uniqueness mutation';
        await tx`drop index public.catalog_food_name_keys_active_identity_uq`;
        await tx`create unique index catalog_food_name_keys_active_identity_uq on public.catalog_food_name_keys(
          lang, name_norm, basis, product_identity_norm, preparation_identity_norm
        ) where active`;
        await makeFood(tx, rawId, 'Raw cooked identity', 'raw');
        await makeFood(tx, cookedId, 'Raw cooked identity', 'cooked');
        await tx`select app_private.reserve_catalog_food_keys(${rawId}, 1)`;
        await expectMutationToBreak(
          async () =>
            expect(
              tx.savepoint(
                (sp) =>
                  sp`select app_private.reserve_catalog_food_keys(${cookedId}, 1)`,
              ),
            ).resolves.toBeDefined(),
          'omitting weighing state from exact uniqueness must reject a distinct raw/cooked identity',
        );

        await tx`drop index public.catalog_food_name_keys_active_identity_uq`;
        await makeFood(tx, duplicateA, 'Uniqueness mutation', 'not_applicable');
        await makeFood(tx, duplicateB, 'Uniqueness mutation', 'not_applicable');
        await tx`select app_private.reserve_catalog_food_keys(${duplicateA}, 1)`;
        await tx`select app_private.reserve_catalog_food_keys(${duplicateB}, 1)`;
        const active =
          await tx`select count(*)::int as owners from public.catalog_food_name_keys
          where name_norm = 'uniqueness mutation' and active`;
        await expectMutationToBreak(async () => {
          expect(active[0]?.owners).toBe(1);
        }, 'removing exact-key uniqueness must break the single-owner race assertion');
        expect(active[0]?.owners).toBe(2);
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message, stage).toBe(marker);
    }
  });

  it('T026: bypassing creator, request-hash, key-lock, or audit guards breaks food RPC contracts', async () => {
    const foodId = randomUUID();
    const hashKey = randomUUID();
    const hashResult = { food_id: randomUUID(), version: 1, warnings: [] };
    const marker = 'rollback_catalog_food_operation_mutation';
    const request = {
      name_ar: 'اختبار تعديل الطعام',
      name_en: `Mutation food ${randomUUID()}`,
      basis: 'g',
      product_identity_norm: 'mutation-product',
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
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.foods(id, created_by, origin_workspace_id, current_version)
          values (${foodId}, ${trainerA.userId}, ${wsA}, 1)`;
        await tx`insert into public.food_versions(
          food_id, version, payload, created_by, name_en, basis, product_identity_norm,
          preparation_identity_norm, weighing_state, kcal, protein_g, carbohydrate_g, fat_g
        ) values (
          ${foodId}, 1, ${tx.json({ name_en: 'Mutation food' })}, ${trainerA.userId},
          'Mutation food', 'g', 'mutation-product', 'plain', 'not_applicable', 120, 5, 20, 2
        )`;
        await tx`insert into public.food_serving_units(food_id, food_version, basis, unit_key, label_en, basis_qty)
          values (${foodId}, 1, 'g', 'reference', '100 g', 100)`;

        await tx`create or replace function public.catalog_version_food(p_food_id uuid, p_expected_version integer, p_operation_key uuid, p_request jsonb)
          returns jsonb language sql security definer set search_path = '' as $$ select '{}'::jsonb $$`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerB.userId, role: 'authenticated' })}, true)`;
        await expectMutationToBreak(
          async () =>
            expect(
              tx`select public.catalog_version_food(${foodId}, 1, ${randomUUID()}, ${tx.json(request)})`,
            ).rejects.toMatchObject({
              code: '42501',
              message: 'not_permitted',
            }),
          'removing creator-or-PO authorization must break non-creator denial',
        );
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerA.userId, role: 'authenticated' })}, true)`;
        await expectMutationToBreak(
          async () =>
            expect(
              tx`select public.catalog_version_food(${foodId}, 0, ${randomUUID()}, ${tx.json(request)})`,
            ).rejects.toMatchObject({ code: '40001' }),
          'removing expected-version CAS must break stale food edit denial',
        );

        await tx`select set_config('role', 'postgres', true)`;
        await tx`insert into app_private.operation_keys(actor_user_id, action, operation_key, request_hash, result)
          values (${trainerA.userId}, 'catalog.food_created', ${hashKey}, ${`sha256:${'a'.repeat(64)}`}, ${tx.json(hashResult)})`;
        await tx`create or replace function app_private.operation_key_result(p_actor_user_id uuid, p_action text, p_operation_key uuid, p_request_hash text)
          returns jsonb language sql security definer set search_path = '' as $$
            select result from app_private.operation_keys where actor_user_id = p_actor_user_id and operation_key = p_operation_key
          $$`;
        await tx`select set_config('role', 'authenticated', true)`;
        await expectMutationToBreak(
          async () =>
            expect(
              tx`select public.catalog_create_food(${hashKey}, ${wsA}, ${tx.json(request)})`,
            ).rejects.toMatchObject({
              code: '23505',
              message: 'operation_key_request_conflict',
            }),
          'removing action/hash binding must break changed-request replay conflict',
        );

        await tx`select set_config('role', 'postgres', true)`;
        await tx`create or replace function app_private.lock_catalog_food_request(p_actor uuid, p_operation_key uuid, p_request jsonb)
          returns void language plpgsql security definer set search_path = '' as $$ begin return; end $$`;
        await tx`create or replace function app_private.reserve_catalog_food_keys(p_food_id uuid, p_version integer)
          returns void language plpgsql security definer set search_path = '' as $$ begin return; end $$`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerA.userId, role: 'authenticated' })}, true)`;
        const before =
          await tx`select count(*)::int as locks from pg_catalog.pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`;
        await tx`select public.catalog_create_food(${randomUUID()}, ${wsA}, ${tx.json(request)})`;
        const after =
          await tx`select count(*)::int as locks from pg_catalog.pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`;
        await expectMutationToBreak(async () => {
          expect(after[0]!.locks).toBeGreaterThan(before[0]!.locks);
        }, 'removing deterministic food key locks must break the in-transaction lock assertion');

        await tx`select set_config('role', 'postgres', true)`;
        await tx`create or replace function app_private.catalog_write_audit(p_actor_user_id uuid, p_action text, p_target_table text, p_target_id uuid, p_workspace_id uuid, p_details jsonb)
          returns bigint language sql security definer set search_path = '' as $$ select 1::bigint $$`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerA.userId, role: 'authenticated' })}, true)`;
        const [auditProbe] = await tx`
          select public.catalog_create_food(${randomUUID()}, ${wsA}, ${tx.json({ ...request, name_en: `Audit mutation ${randomUUID()}`, name_ar: null })}) as result`;
        const auditFoodId = (auditProbe?.result as { food_id: string }).food_id;
        const auditCount =
          await tx`select count(*)::int as events from public.audit_events where target_id = ${auditFoodId}`;
        await expectMutationToBreak(async () => {
          expect(auditCount[0]?.events).toBe(1);
        }, 'bypassing the audit allowlist/writer must break the one-audit assertion');
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    }
  });
});
