import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { createStaff, sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
let po: Awaited<ReturnType<typeof twoWorkspaceFixture>>['po'];
let wo: Awaited<ReturnType<typeof twoWorkspaceFixture>>['woA'];
let trainer: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerA'];
let foreignTrainer: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerB'];
let sales: Awaited<ReturnType<typeof twoWorkspaceFixture>>['salesA'];
let client: Awaited<ReturnType<typeof createStaff>>;
let wsA: string;
let wsB: string;

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  po = fixture.po;
  wo = fixture.woA;
  trainer = fixture.trainerA;
  foreignTrainer = fixture.trainerB;
  sales = fixture.salesA;
  wsA = fixture.wsA.id;
  wsB = fixture.wsB.id;
  client = await createStaff(null, 'catalog-exercise-detail-client');
});

afterAll(async () => db.end());

const payload = (name: string) => ({
  name_ar: 'تمرين اختبار التفاصيل',
  name_en: name,
  primary_muscle_code: 'chest',
  secondary_muscle_codes: ['triceps'],
  equipment_codes: ['barbell'],
  defaults: {
    warmup_sets: 1,
    working_sets: 3,
    reps: { min: 8, max: 12 },
    rest_seconds: 90,
    rir: 2,
  },
});

async function withExercise<T>(
  body: (tx: Tx, exerciseId: string) => Promise<T>,
) {
  const exerciseId = randomUUID();
  const marker = 'rollback_catalog_exercise_detail_fixture';
  let result: T | undefined;
  try {
    await db.begin(async (tx) => {
      await tx`insert into public.exercises(id, created_by, current_version)
        values (${exerciseId}, ${po.userId}, 1)`;
      await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
        values (${exerciseId}, 1, ${tx.json(payload('Current exercise payload'))}, ${po.userId})`;
      result = await body(tx, exerciseId);
      throw new Error(marker);
    });
  } catch (error) {
    if ((error as Error).message !== marker) throw error;
  }
  return result as T;
}

async function asActor<T>(tx: Tx, actorId: string, body: () => Promise<T>) {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
  return body();
}

describe('authorized exercise detail projection', () => {
  it('returns current version data and only an authorized workspace variation', async () => {
    await withExercise(async (tx, exerciseId) => {
      await tx`insert into public.exercise_variations(workspace_id, exercise_id, created_by, current_version)
        values (${wsA}, ${exerciseId}, ${trainer.userId}, 1)`;
      await tx`insert into public.exercise_variation_versions(workspace_id, exercise_id, version, payload, created_by)
        values (${wsA}, ${exerciseId}, 1, ${tx.json({ video_url: 'https://youtu.be/abcdefghijk', note: 'private note' })}, ${trainer.userId})`;
      const owner = await asActor(
        tx,
        po.userId,
        () =>
          tx`select * from public.catalog_exercise_detail(${exerciseId}, ${wsA})`,
      );
      expect(owner).toHaveLength(1);
      expect(owner[0]).toMatchObject({
        exercise_id: exerciseId,
        version: 1,
        requested_id: exerciseId,
        survivor_id: exerciseId,
        lifecycle_state: 'active',
        lifecycle_revision: 0,
        name_ar: 'تمرين اختبار التفاصيل',
        name_en: 'Current exercise payload',
        payload: payload('Current exercise payload'),
        variation: {
          workspace_id: wsA,
          video_url: 'https://youtu.be/abcdefghijk',
        },
      });
      const workspaceOwner = await asActor(
        tx,
        wo.userId,
        () =>
          tx`select exercise_id, lifecycle_state, lifecycle_revision from public.catalog_exercise_detail(${exerciseId}, ${wsA})`,
      );
      expect(workspaceOwner).toEqual([
        {
          exercise_id: exerciseId,
          lifecycle_state: 'active',
          lifecycle_revision: 0,
        },
      ]);
      const foreign = await asActor(
        tx,
        foreignTrainer.userId,
        () =>
          tx`select variation from public.catalog_exercise_detail(${exerciseId}, ${wsB})`,
      );
      expect(foreign).toEqual([{ variation: null }]);
      const workspaceStaff = await asActor(
        tx,
        trainer.userId,
        () =>
          tx`select variation from public.catalog_exercise_detail(${exerciseId}, ${wsA})`,
      );
      expect(workspaceStaff).toEqual([
        {
          variation: {
            workspace_id: wsA,
            video_url: 'https://youtu.be/abcdefghijk',
          },
        },
      ]);
    });
  });

  it('resolves merge aliases to the active terminal and exposes Removed as terminal', async () => {
    await withExercise(async (tx, aliasId) => {
      const terminalId = randomUUID();
      await tx`insert into public.exercises(id, created_by, current_version)
        values (${terminalId}, ${po.userId}, 1)`;
      await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
        values (${terminalId}, 1, ${tx.json(payload('Terminal survivor'))}, ${po.userId})`;
      await asActor(
        tx,
        po.userId,
        () =>
          tx`select public.catalog_merge_exercise(${aliasId}, ${terminalId}, 0, ${randomUUID()})`,
      );
      const merged = await asActor(
        tx,
        trainer.userId,
        () =>
          tx`select requested_id, survivor_id, exercise_id, name_en, lifecycle_state, lifecycle_revision from public.catalog_exercise_detail(${aliasId})`,
      );
      expect(merged).toEqual([
        {
          requested_id: aliasId,
          survivor_id: terminalId,
          exercise_id: terminalId,
          name_en: 'Terminal survivor',
          lifecycle_state: 'active',
          lifecycle_revision: 0,
        },
      ]);
      await asActor(
        tx,
        po.userId,
        () =>
          tx`select public.catalog_transition_exercise(${terminalId}, 0, 'remove', ${randomUUID()})`,
      );
      const removed = await asActor(
        tx,
        trainer.userId,
        () =>
          tx`select requested_id, survivor_id, exercise_id, name_en, lifecycle_state, lifecycle_revision from public.catalog_exercise_detail(${terminalId})`,
      );
      expect(removed).toEqual([
        {
          requested_id: terminalId,
          survivor_id: terminalId,
          exercise_id: terminalId,
          name_en: 'Terminal survivor',
          lifecycle_state: 'removed',
          lifecycle_revision: 1,
        },
      ]);
    });
  });

  it('uses the same non-disclosing denial for null, unknown, and unauthorized identities', async () => {
    await withExercise(async (tx, exerciseId) => {
      for (const actorId of [po.userId, wo.userId, trainer.userId]) {
        await asActor(tx, actorId, async () => {
          await expect(
            tx.savepoint(
              (sp) => sp`select * from public.catalog_exercise_detail(null)`,
            ),
          ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
          await expect(
            tx.savepoint(
              (sp) =>
                sp`select * from public.catalog_exercise_detail(${randomUUID()})`,
            ),
          ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
        });
      }
      for (const actorId of [sales.userId, client.userId]) {
        await asActor(tx, actorId, async () => {
          await expect(
            tx.savepoint(
              (sp) =>
                sp`select * from public.catalog_exercise_detail(${exerciseId})`,
            ),
          ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
        });
      }
      await tx`select set_config('role', 'anon', true)`;
      await tx`select set_config('request.jwt.claims', '{}', true)`;
      await expect(
        tx.savepoint(
          (sp) =>
            sp`select * from public.catalog_exercise_detail(${exerciseId})`,
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claims', '{}', true)`;
      await expect(
        tx.savepoint(
          (sp) =>
            sp`select * from public.catalog_exercise_detail(${exerciseId})`,
        ),
      ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
    });
  });

  it('keeps the explicit global catalog read gate on the detail RPC', async () => {
    const result = await db.unsafe(
      "select pg_catalog.pg_get_functiondef('public.catalog_exercise_detail(uuid,uuid)'::regprocedure) as definition",
    );
    expect(result[0]?.definition).toContain(
      'not app_private.catalog_can_read_global()',
    );
  });

  it('exposes only the privacy-safe view columns and authenticated grants', async () => {
    const result = await db`
      select c.relname as name, c.reloptions, pg_catalog.pg_get_userbyid(c.relowner) as owner,
        array_agg(a.attname order by a.attnum) filter (where a.attnum > 0 and not a.attisdropped) as columns,
        has_table_privilege('authenticated', c.oid, 'select') as authenticated_select,
        has_table_privilege('anon', c.oid, 'select') as anon_select,
        has_table_privilege('service_role', c.oid, 'select') as service_select
      from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid = c.oid
      where c.relnamespace = 'public'::regnamespace and c.relname in ('catalog_exercises_safe', 'catalog_exercise_versions_safe')
      group by c.oid, c.relname, c.reloptions order by c.relname`;
    expect(result).toEqual([
      {
        name: 'catalog_exercise_versions_safe',
        reloptions: ['security_barrier=true'],
        owner: 'postgres',
        columns: [
          'exercise_id',
          'version',
          'payload',
          'created_at',
          'created_by',
          'origin_workspace_id',
          'name_ar',
          'name_en',
          'primary_muscle_code',
          'secondary_muscle_codes',
          'equipment_codes',
          'defaults',
        ],
        authenticated_select: true,
        anon_select: false,
        service_select: false,
      },
      {
        name: 'catalog_exercises_safe',
        reloptions: ['security_barrier=true'],
        owner: 'postgres',
        columns: [
          'id',
          'current_version',
          'lifecycle_state',
          'created_at',
          'created_by',
          'origin_workspace_id',
          'lifecycle_revision',
        ],
        authenticated_select: true,
        anon_select: false,
        service_select: false,
      },
    ]);
    await withExercise(async (tx, exerciseId) => {
      const masked = await asActor(
        tx,
        trainer.userId,
        () =>
          tx`select f.created_by, f.origin_workspace_id, v.created_by as version_created_by, v.origin_workspace_id as version_origin from public.catalog_exercises_safe f join public.catalog_exercise_versions_safe v on v.exercise_id = f.id where f.id = ${exerciseId}`,
      );
      expect(masked).toEqual([
        {
          created_by: null,
          origin_workspace_id: null,
          version_created_by: null,
          version_origin: null,
        },
      ]);
    });
  });
});
