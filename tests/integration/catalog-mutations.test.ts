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

async function expectMutationToBreak<T>(
  body: () => Promise<T>,
  label: string,
  reportFailure = false,
) {
  let assertionFailure: unknown;
  try {
    await body();
  } catch (error) {
    assertionFailure = error;
  }
  if (reportFailure && assertionFailure)
    console.info(
      `[expected mutant failure] ${label}: ${(assertionFailure as Error).message.split('\n')[0]}`,
    );
  expect(assertionFailure, label).toBeDefined();
}

async function insertMutationFood(
  tx: postgres.TransactionSql,
  actorId: string,
  name = `Mutation food ${randomUUID()}`,
) {
  const foodId = randomUUID();
  await tx`insert into public.foods(id, created_by, current_version)
    values (${foodId}, ${actorId}, 1)`;
  await tx`insert into public.food_versions(
      food_id, version, payload, created_by, name_en, basis, product_identity_norm,
      preparation_identity_norm, weighing_state, kcal, protein_g, carbohydrate_g, fat_g
    ) values (
      ${foodId}, 1, '{}'::jsonb, ${actorId}, ${name}, 'g', ${`product:${foodId}`},
      'plain', 'not_applicable', 100, 10, 10, 2
    )`;
  await tx`insert into public.food_serving_units(
      food_id, food_version, basis, unit_key, label_en, basis_qty
    ) values (${foodId}, 1, 'g', 'reference', '100 g', 100)`;
  return foodId;
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
          select pg_get_functiondef('app_private.catalog_search_pre_cutover(text,text,jsonb,text,uuid)'::regprocedure) as definition
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
      default_rest_time: 90,
      default_rir: 2,
      default_reps: 8,
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

  it('T050: canonical precedence, legacy reads, and workspace authorization mutants break assertions', async () => {
    const exerciseId = randomUUID();
    const canonicalUrl = 'https://youtu.be/canonicalmut';
    const overrideUrl = 'https://youtu.be/overridemut';
    const legacyUrl = 'https://youtu.be/legacymut';
    const rollback = 'rollback_catalog_video_t050_mutations';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.exercises(id, created_by, current_version)
          values (${exerciseId}, ${po.userId}, 1)`;
        await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
          values (${exerciseId}, 1, ${tx.json({
            name_en: 'T050 mutation',
            name_ar: 'تمرين',
            primary_muscle_code: 'chest',
            equipment_codes: ['barbell'],
            video_url: canonicalUrl,
          })}, ${po.userId})`;
        await tx`insert into public.exercise_variations(workspace_id, exercise_id, created_by, current_version)
          values (${wsA}, ${exerciseId}, ${trainerA.userId}, 1)`;
        await tx`insert into public.exercise_variation_versions(workspace_id, exercise_id, version, payload, created_by)
          values (${wsA}, ${exerciseId}, 1, ${tx.json({ video_url: legacyUrl })}, ${trainerA.userId})`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerA.userId, role: 'authenticated' })}, true)`;
        await tx`select public.catalog_write_exercise_override(
          ${wsA}, ${exerciseId}, 0, ${randomUUID()}, ${tx.json({ video_url: overrideUrl })}
        )`;

        await tx`select set_config('role', 'postgres', true)`;
        const [resolver] = await tx`select pg_catalog.pg_get_functiondef(
          'app_private.catalog_resolve_exercise_video(uuid,uuid,boolean)'::regprocedure
        ) as definition`;
        if (!resolver?.definition)
          throw new Error('T050 internal resolver missing');
        const original = resolver.definition as string;
        const precedenceMutant = original.replace(
          'coalesce(override_video, canonical_video)',
          'coalesce(canonical_video, override_video)',
        );
        if (precedenceMutant === original)
          throw new Error('T050 precedence mutation target missing');
        await tx.unsafe(precedenceMutant);
        await tx`select set_config('role', 'authenticated', true)`;
        const [wrongPrecedence] =
          await tx`select variation from public.catalog_exercise_detail(${exerciseId}, ${wsA})`;
        await expectMutationToBreak(
          async () => {
            expect(wrongPrecedence?.variation).toMatchObject({
              video_url: overrideUrl,
              source: 'override',
            });
          },
          'T050 must reject canonical-before-override precedence',
          true,
        );
        await tx`select set_config('role', 'postgres', true)`;
        await tx.unsafe(original);

        const legacyMutant = original
          .replace(
            'public.exercise_overrides o',
            'public.exercise_variations o',
          )
          .replace(
            'public.exercise_override_versions v',
            'public.exercise_variation_versions v',
          );
        if (legacyMutant === original)
          throw new Error('T050 legacy-source mutation target missing');
        await tx.unsafe(legacyMutant);
        await tx`select set_config('role', 'authenticated', true)`;
        const [legacyResult] =
          await tx`select variation from public.catalog_exercise_detail(${exerciseId}, ${wsA})`;
        await expectMutationToBreak(
          async () => {
            expect(legacyResult?.variation).toMatchObject({
              video_url: overrideUrl,
              source: 'override',
            });
          },
          'T050 must reject legacy exercise_variations as a Video source',
          true,
        );
        await tx`select set_config('role', 'postgres', true)`;
        await tx.unsafe(original);

        const accessMutant = original.replace(
          "or (not p_plan_authorized and (auth.uid() is null\n      or not app_private.catalog_can_read_global()\n      or (not app_private.is_platform_owner()\n        and not app_private.has_workspace_access(p_workspace_id, 'coaching_work'))))",
          'or false',
        );
        if (accessMutant === original)
          throw new Error(
            'T050 workspace authorization mutation target missing',
          );
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerB.userId, role: 'authenticated' })}, true)`;
        await expect(
          tx.savepoint(
            (sp) =>
              sp`select * from app_private.catalog_resolve_exercise_video(${exerciseId}, ${wsA}, false)`,
          ),
        ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
        await tx.unsafe(accessMutant);
        const [baseline] =
          await tx`select * from app_private.catalog_resolve_exercise_video(${exerciseId}, ${wsA}, false)`;
        await expectMutationToBreak(
          async () => {
            expect(baseline).toBeUndefined();
          },
          'T050 must reject video resolution for an unauthorized workspace',
          true,
        );
        await tx.unsafe(original);
        throw new Error(rollback);
      });
    } catch (error) {
      if ((error as Error).message !== rollback) throw error;
    }
  });

  it('T006: removing a taxonomy seed or adding a catalog seed breaks clean-seed assertions', async () => {
    const removedSeedMarker = 'rollback_catalog_taxonomy_seed_mutation';
    try {
      await db.begin(async (tx) => {
        const [seed] = await tx`
          select id from public.taxonomy_terms where kind = 'muscle_group' and code = 'chest'
        `;
        if (!seed?.id) throw new Error('chest taxonomy seed missing');
        await tx`alter table public.taxonomy_term_versions disable trigger taxonomy_term_versions_append_only`;
        await tx`delete from public.taxonomy_term_versions where term_id = ${seed.id}`;
        await tx`delete from public.taxonomy_terms where id = ${seed.id}`;
        const codes = await tx`
          select code from public.taxonomy_terms where kind = 'muscle_group'
        `;
        await expectMutationToBreak(
          async () => expect(codes.map((row) => row.code)).toContain('chest'),
          'removing the chest taxonomy seed must break the exact taxonomy assertion',
          true,
        );
        expect(codes.map((row) => row.code)).not.toContain('chest');
        throw new Error(removedSeedMarker);
      });
    } catch (error) {
      if ((error as Error).message !== removedSeedMarker) throw error;
    }

    const addedSeedMarker = 'rollback_catalog_content_seed_mutation';
    try {
      await db.begin(async (tx) => {
        const [baseline] =
          await tx`select count(*)::int as count from public.exercises`;
        const exerciseId = randomUUID();
        await tx`insert into public.exercises(id, created_by, current_version)
          values (${exerciseId}, ${po.userId}, 1)`;
        await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
          values (${exerciseId}, 1, '{"name_en":"catalog seed mutant"}'::jsonb, ${po.userId})`;
        const [row] =
          await tx`select count(*)::int as count from public.exercises`;
        await expectMutationToBreak(
          async () => expect(row?.count).toBe(baseline?.count),
          'adding an exercise seed must break the clean-catalog baseline assertion',
          true,
        );
        expect(row?.count).toBe((baseline?.count ?? 0) + 1);
        throw new Error(addedSeedMarker);
      });
    } catch (error) {
      if ((error as Error).message !== addedSeedMarker) throw error;
    }
  });

  it('T007: disabling append-only and provenance triggers breaks immutable-data assertions', async () => {
    const marker = 'rollback_catalog_identity_immutability_mutation';
    try {
      await db.begin(async (tx) => {
        await tx`alter table public.food_versions disable trigger food_versions_append_only`;
        await tx`alter table public.foods disable trigger foods_provenance_immutable`;
        const foodId = await insertMutationFood(tx, po.userId);
        await expectMutationToBreak(
          async () =>
            expect(
              tx`update public.food_versions set payload = '{"mutated":true}'::jsonb where food_id = ${foodId} and version = 1`,
            ).rejects.toMatchObject({ code: '23514' }),
          'disabling the food-version append-only trigger must break the immutable-version assertion',
          true,
        );

        await expectMutationToBreak(
          async () =>
            expect(
              tx`update public.foods set created_by = ${trainerA.userId} where id = ${foodId}`,
            ).rejects.toMatchObject({ code: '23514' }),
          'disabling provenance protection must break the immutable creator assertion',
          true,
        );
        await expectMutationToBreak(
          async () =>
            expect(
              tx`update public.foods set origin_workspace_id = ${wsB} where id = ${foodId}`,
            ).rejects.toMatchObject({ code: '23514' }),
          'disabling provenance protection must break the immutable origin assertion',
          true,
        );
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker) throw error;
    }
  });

  it('T008: dropping the workspace composite owner FK breaks the tenant-binding assertion', async () => {
    const marker = 'rollback_catalog_composite_fk_mutation';
    const workspaceExerciseId = randomUUID();
    try {
      await db.begin(async (tx) => {
        const [compositeFk] = await tx`
          select c.conname as name from pg_catalog.pg_constraint c
          where c.conrelid = 'public.workspace_exercise_versions'::regclass
            and c.contype = 'f'
            and pg_catalog.pg_get_constraintdef(c.oid) like 'FOREIGN KEY (workspace_id, workspace_exercise_id)%'
        `;
        if (!compositeFk?.name)
          throw new Error('workspace composite FK missing');
        await tx.unsafe(
          `alter table public.workspace_exercise_versions drop constraint "${String(compositeFk.name).replaceAll('"', '""')}"`,
        );
        await tx`insert into public.workspace_exercises(workspace_id, id, created_by, current_version)
          values (${wsA}, ${workspaceExerciseId}, ${trainerA.userId}, 1)`;
        await tx`insert into public.workspace_exercise_versions(workspace_id, workspace_exercise_id, version, payload, created_by)
          values (${wsA}, ${workspaceExerciseId}, 1, '{}'::jsonb, ${trainerA.userId})`;
        await expectMutationToBreak(
          async () =>
            expect(
              tx`insert into public.workspace_exercise_versions(workspace_id, workspace_exercise_id, version, payload, created_by)
                values (${wsB}, ${workspaceExerciseId}, 1, '{}'::jsonb, ${trainerB.userId})`,
            ).rejects.toMatchObject({ code: '23503' }),
          'dropping the composite workspace owner FK must break the cross-tenant version assertion',
          true,
        );
        const foreign = await tx`select workspace_id, workspace_exercise_id
          from public.workspace_exercise_versions where workspace_id = ${wsB} and workspace_exercise_id = ${workspaceExerciseId}`;
        expect(foreign).toHaveLength(1);
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker) throw error;
    }
  });

  it('T009: dropping each food-version and serving check breaks its invalid-payload assertion', async () => {
    const versionChecks: Array<{
      name: string;
      values: {
        basis?: string;
        product?: string;
        preparation?: string;
        state?: string;
        kcal?: number;
        protein?: number;
        carbohydrate?: number;
        fat?: number;
        fiber?: number;
        names?: boolean;
      };
    }> = [
      { name: 'food_versions_basis_check', values: { basis: 'oz' } },
      {
        name: 'food_versions_product_identity_norm_check',
        values: { product: '' },
      },
      {
        name: 'food_versions_preparation_identity_norm_check',
        values: { preparation: '' },
      },
      {
        name: 'food_versions_weighing_state_check',
        values: { state: 'steamed' },
      },
      { name: 'food_versions_kcal_check', values: { kcal: -1 } },
      { name: 'food_versions_protein_g_check', values: { protein: -1 } },
      {
        name: 'food_versions_carbohydrate_g_check',
        values: { carbohydrate: -1 },
      },
      { name: 'food_versions_fat_g_check', values: { fat: -1 } },
      { name: 'food_versions_fiber_g_check', values: { fiber: -1 } },
      { name: 'food_versions_name_language_check', values: { names: true } },
      {
        name: 'food_versions_macro_sum_check',
        values: { protein: 40, carbohydrate: 40, fat: 30 },
      },
    ];
    for (const probe of versionChecks) {
      const marker = `rollback_${probe.name}_mutation`;
      try {
        await db.begin(async (tx) => {
          await tx.unsafe(
            `alter table public.food_versions drop constraint ${probe.name}`,
          );
          const foodId = randomUUID();
          await tx`insert into public.foods(id, created_by, current_version)
            values (${foodId}, ${po.userId}, 1)`;
          const values = probe.values;
          const basis = values.basis ?? 'g';
          const nameAr = 'names' in values ? null : 'اختبار';
          const nameEn =
            'names' in values ? null : `Check mutation ${probe.name}`;
          const product = values.product ?? `product:${foodId}`;
          const preparation = values.preparation ?? 'plain';
          const weighingState = values.state ?? 'not_applicable';
          const kcal = values.kcal ?? 100;
          const protein = values.protein ?? 10;
          const carbohydrate = values.carbohydrate ?? 10;
          const fat = values.fat ?? 2;
          const fiber = values.fiber ?? null;
          await expectMutationToBreak(
            async () =>
              expect(
                tx`insert into public.food_versions(
                  food_id, version, payload, created_by, name_ar, name_en, basis,
                  product_identity_norm, preparation_identity_norm, weighing_state,
                  kcal, protein_g, carbohydrate_g, fat_g, fiber_g
                ) values (
                  ${foodId}, 1, '{}'::jsonb, ${po.userId}, ${nameAr}, ${nameEn}, ${basis},
                  ${product}, ${preparation}, ${weighingState}, ${kcal}, ${protein},
                  ${carbohydrate}, ${fat}, ${fiber}
                )`,
              ).rejects.toMatchObject({ code: '23514' }),
            `dropping ${probe.name} must break its food-version check assertion`,
            true,
          );
          throw new Error(marker);
        });
      } catch (error) {
        if ((error as Error).message !== marker) throw error;
      }
    }

    const basisMarker = 'rollback_food_serving_units_basis_check_mutation';
    try {
      await db.begin(async (tx) => {
        await tx`alter table public.food_serving_units drop constraint food_serving_units_basis_check`;
        const [constraint] = await tx`
          select c.conname as name from pg_catalog.pg_constraint c
          where c.conrelid = 'public.food_serving_units'::regclass
            and c.conname = 'food_serving_units_basis_check'
        `;
        await expectMutationToBreak(
          async () => expect(constraint).toBeDefined(),
          'dropping food_serving_units_basis_check must break the schema guard assertion',
          true,
        );
        const foodId = await insertMutationFood(tx, po.userId);
        await expect(
          tx`insert into public.food_serving_units(
            food_id, food_version, basis, unit_key, label_en, basis_qty
          ) values (${foodId}, 1, 'oz', 'invalid-basis', 'Invalid basis', 100)`,
        ).rejects.toMatchObject({ code: '23503' });
        throw new Error(basisMarker);
      });
    } catch (error) {
      if ((error as Error).message !== basisMarker) throw error;
    }

    const servingChecks = [
      {
        name: 'food_serving_units_unit_key_check',
        basis: 'g',
        unit: '',
        qty: 100,
        labels: true,
      },
      {
        name: 'food_serving_units_basis_qty_check',
        basis: 'g',
        unit: 'zero',
        qty: 0,
        labels: true,
      },
      {
        name: 'food_serving_units_check',
        basis: 'g',
        unit: 'unnamed',
        qty: 100,
        labels: false,
      },
    ];
    for (const probe of servingChecks) {
      const marker = `rollback_${probe.name}_mutation`;
      try {
        await db.begin(async (tx) => {
          await tx.unsafe(
            `alter table public.food_serving_units drop constraint ${probe.name}`,
          );
          const foodId = await insertMutationFood(tx, po.userId);
          const badLabel = probe.labels ? 'Reference' : null;
          await expectMutationToBreak(
            async () =>
              expect(
                tx`insert into public.food_serving_units(
                  food_id, food_version, basis, unit_key, label_en, basis_qty
                ) values (
                  ${foodId}, 1, ${probe.basis}, ${probe.unit}, ${badLabel}, ${probe.qty}
                )`,
              ).rejects.toMatchObject({ code: '23514' }),
            `dropping ${probe.name} must break its serving check assertion`,
            true,
          );
          throw new Error(marker);
        });
      } catch (error) {
        if ((error as Error).message !== marker) throw error;
      }
    }
  });

  it('T010: dropping alternatives cardinality and portion checks breaks negative assertions', async () => {
    const probes = [
      {
        constraint: 'food_alternatives_position_check',
        position: 4,
        sourcePortion: 100,
        alternativePortion: 100,
      },
      {
        constraint: 'food_alternatives_source_portion_check',
        position: 1,
        sourcePortion: 0,
        alternativePortion: 100,
      },
      {
        constraint: 'food_alternatives_alternative_portion_check',
        position: 1,
        sourcePortion: 100,
        alternativePortion: 0,
      },
    ];
    for (const probe of probes) {
      const marker = `rollback_${probe.constraint}_mutation`;
      try {
        await db.begin(async (tx) => {
          await tx.unsafe(
            `alter table public.food_default_alternatives drop constraint ${probe.constraint}`,
          );
          const source = await insertMutationFood(tx, po.userId);
          if (probe.constraint === 'food_alternatives_position_check') {
            for (const position of [1, 2, 3]) {
              const existingTarget = await insertMutationFood(tx, po.userId);
              await tx`insert into public.food_default_alternatives(
                food_id, food_version, position, source_basis, source_portion,
                alternative_food_id, alternative_version, alternative_basis, alternative_portion
              ) values (
                ${source}, 1, ${position}, 'g', 100,
                ${existingTarget}, 1, 'g', 100
              )`;
            }
          }
          const target = await insertMutationFood(tx, po.userId);
          await expectMutationToBreak(
            async () =>
              expect(
                tx`insert into public.food_default_alternatives(
                  food_id, food_version, position, source_basis, source_portion,
                  alternative_food_id, alternative_version, alternative_basis, alternative_portion
                ) values (
                  ${source}, 1, ${probe.position}, 'g', ${probe.sourcePortion},
                  ${target}, 1, 'g', ${probe.alternativePortion}
                )`,
              ).rejects.toMatchObject({ code: '23514' }),
            `dropping ${probe.constraint} must break its alternatives assertion`,
            true,
          );
          if (probe.constraint === 'food_alternatives_position_check') {
            const [count] = await tx`
              select count(*)::int as alternatives from public.food_default_alternatives where food_id = ${source}
            `;
            expect(count?.alternatives).toBe(4);
          }
          throw new Error(marker);
        });
      } catch (error) {
        if ((error as Error).message !== marker) throw error;
      }
    }
  });

  it('F16 follow-up: max-three, atomicity, and self-reference alternative guards fail when mutated', async () => {
    const request = (label: string) => ({
      name_en: label,
      basis: 'g',
      product_identity_norm: `mutation:${randomUUID()}`,
      preparation_identity_norm: 'plain',
      weighing_state: 'not_applicable',
      kcal: 100,
      protein_g: 10,
      carbohydrate_g: 10,
      fat_g: 2,
      fiber_g: null,
      servings: [{ unit_key: 'reference', label_en: '100 g', basis_qty: 100 }],
    });
    const alternative = (foodId: string) => ({
      alternative_food_id: foodId,
      alternative_version: 1,
      source_portion: 100,
      alternative_portion: 100,
    });

    const maxMarker = 'rollback_food_alternative_max_mutation';
    try {
      await db.begin(async (tx) => {
        const [definition] = await tx`
          select pg_catalog.pg_get_functiondef(
            'app_private.apply_food_default_alternatives(uuid,integer,jsonb)'::regprocedure
          ) as body`;
        const mutated = String(definition?.body).replace(
          /if\s+requested_count\s*>\s*3\s+then\s+raise exception 'catalog_food_alternatives_invalid' using errcode\s*=\s*'22023';\s+end if;/i,
          '',
        );
        expect(mutated).not.toBe(definition?.body);
        await tx.unsafe(mutated);
        await tx`alter table public.food_default_alternatives
          drop constraint food_alternatives_position_check`;
        const targets = await Promise.all(
          [0, 1, 2, 3].map(() => insertMutationFood(tx, po.userId)),
        );
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: po.userId, role: 'authenticated' })}, true)`;
        const created = await tx`select public.catalog_create_food(
          ${randomUUID()}, null, ${tx.json(request(`Max mutation ${randomUUID()}`))},
          ${tx.json(targets.map(alternative))}
        )`;
        const sourceId = (
          created[0]?.catalog_create_food as { food_id: string }
        ).food_id;
        await expectMutationToBreak(
          async () => expect(created[0]).toBeUndefined(),
          'dropping the max-three table check must break the RPC rejection assertion',
          true,
        );
        const rows =
          await tx`select count(*)::int as n from public.food_default_alternatives
          where food_id = ${sourceId}`;
        expect(rows[0]?.n).toBe(4);
        throw new Error(maxMarker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(maxMarker);
    }

    const atomicMarker = 'rollback_food_alternative_atomicity_mutation';
    try {
      await db.begin(async (tx) => {
        const source = await insertMutationFood(tx, po.userId);
        const target = await insertMutationFood(tx, po.userId);
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: po.userId, role: 'authenticated' })}, true)`;
        const versionRequest = request(`Non-atomic version ${randomUUID()}`);
        await tx`select public.catalog_version_food(
          ${source}, 1, ${randomUUID()}, ${tx.json(versionRequest)}
        )`;
        await tx`select set_config('role', 'postgres', true)`;
        await expect(
          tx.savepoint(
            async (sp) =>
              sp`select app_private.apply_food_default_alternatives(
              ${source}, 2, ${sp.json([alternative(target), { ...alternative(source), alternative_version: 2 }])}
            )`,
          ),
        ).rejects.toMatchObject({ code: '22023' });
        await expectMutationToBreak(
          async () =>
            expect(
              tx`select count(*)::int as n from public.food_versions where food_id = ${source} and version = 2`,
            ).resolves.toEqual([{ n: 0 }]),
          'writing alternatives after a committed version must break the all-or-nothing assertion',
          true,
        );
        await expect(
          tx`select count(*)::int as n from public.food_versions where food_id = ${source} and version = 2`,
        ).resolves.toEqual([{ n: 1 }]);
        throw new Error(atomicMarker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(atomicMarker);
    }

    const selfMarker = 'rollback_food_alternative_self_mutation';
    try {
      await db.begin(async (tx) => {
        const source = await insertMutationFood(tx, po.userId);
        const [definition] = await tx`
          select pg_catalog.pg_get_functiondef(
            'app_private.apply_food_default_alternatives(uuid,integer,jsonb)'::regprocedure
          ) as body`;
        const mutated = String(definition?.body).replace(
          /if\s+alternative_id\s*=\s*p_food_id\s+or\s+pair_key\s*=\s*any\s*\(\s*seen_pairs\s*\)\s*then/i,
          'if pair_key = any(seen_pairs) then',
        );
        expect(mutated).not.toBe(definition?.body);
        await tx.unsafe(mutated);
        const [constraint] = await tx`
          select conname from pg_catalog.pg_constraint
          where conrelid = 'public.food_default_alternatives'::regclass
            and contype = 'c'
            and conname = 'food_alternatives_check'`;
        expect(constraint?.conname).toBeTruthy();
        await tx.unsafe(
          `alter table public.food_default_alternatives drop constraint ${String(constraint?.conname)}`,
        );
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: po.userId, role: 'authenticated' })}, true)`;
        await expectMutationToBreak(
          async () =>
            expect(
              tx`select public.catalog_version_food(
                ${source}, 1, ${randomUUID()}, ${tx.json(request(`Self mutation ${randomUUID()}`))},
                ${tx.json([{ ...alternative(source), alternative_version: 2 }])}
              )`,
            ).rejects.toMatchObject({ code: '22023' }),
          'skipping the self-reference guard must break the RPC rejection assertion',
          true,
        );
        await expect(
          tx`select count(*)::int as n from public.food_default_alternatives
            where food_id = ${source} and food_version = 2 and alternative_food_id = ${source}`,
        ).resolves.toEqual([{ n: 1 }]);
        throw new Error(selfMarker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(selfMarker);
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
          definition.sql.replaceAll('and v.basis = p_basis', 'and true'),
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
        await tx.unsafe(
          definition.sql
            .replaceAll('>= 0.90', '>= 0.50')
            .replace(
              'SET "pg_trgm.similarity_threshold" TO \'0.90\'',
              'SET "pg_trgm.similarity_threshold" TO \'0.50\'',
            ),
        );
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
