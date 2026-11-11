import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
let trainerId: string;
let poId: string;
let workspaceId: string;

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  trainerId = fixture.trainerA.userId;
  poId = fixture.po.userId;
  workspaceId = fixture.wsA.id;
});

afterAll(async () => db.end());

const core = {
  name_en: 'T075 private validator exercise',
  primary_muscle_code: 'chest',
  equipment_codes: ['barbell'],
};

async function asActor<T>(actorId: string, body: (tx: Tx) => Promise<T>) {
  return db.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
    return body(tx);
  });
}

async function writePrivate(
  payload: { [key: string]: Json },
  exerciseId: string | null = null,
  expectedVersion: number | null = null,
) {
  return asActor(
    trainerId,
    (tx) =>
      tx`select public.catalog_write_workspace_exercise(
      ${workspaceId}, ${exerciseId}, ${expectedVersion}, ${randomUUID()}, ${tx.json(payload)}
    )`,
  );
}

async function createGlobalTarget() {
  return asActor(poId, async (tx) => {
    const [row] =
      await tx`select public.catalog_create_exercise(${randomUUID()}, ${tx.json(
        {
          ...core,
          name_en: `T075 global target ${randomUUID()}`,
        },
      )})`;
    return (row?.catalog_create_exercise as { exercise_id: string })
      .exercise_id;
  });
}

describe('T075 workspace-private validation and version storage', () => {
  it('stores private Name, Description, Notes, Defaults, and normalized Alternatives', async () => {
    const globalTarget = await createGlobalTarget();
    const privateTargetResult = await writePrivate({
      ...core,
      name_en: 'T075 private alternative target',
    });
    const privateTarget = (
      privateTargetResult[0]?.catalog_write_workspace_exercise as {
        exercise_id: string;
      }
    ).exercise_id;
    const payload = {
      ...core,
      name_ar: 'ØªÙ…Ø±ÙŠÙ†',
      description: 'x'.repeat(2000),
      notes: 'Private coaching note',
      default_rest_time: 90,
      default_rir: 2,
      default_reps: { min: 8, max: 12 },
      alternatives: [
        { global_exercise_id: globalTarget } as Json,
        { workspace_exercise_id: privateTarget } as Json,
      ],
    };
    const created = await writePrivate(payload);
    const exerciseId = (
      created[0]?.catalog_write_workspace_exercise as { exercise_id: string }
    ).exercise_id;
    const [version] = await db`
      select payload, notes, default_rest_time, default_rir, default_reps
      from public.workspace_exercise_versions
      where workspace_id = ${workspaceId} and workspace_exercise_id = ${exerciseId} and version = 1
    `;
    expect(version).toMatchObject({
      payload: expect.objectContaining({
        name_en: core.name_en,
        description: 'x'.repeat(2000),
      }),
      notes: 'Private coaching note',
      default_rest_time: 90,
      default_rir: 2,
      default_reps: { min: 8, max: 12 },
    });
    const alternatives = await db`
      select position, global_exercise_id, alternative_workspace_exercise_id
      from public.workspace_exercise_version_alternatives
      where workspace_id = ${workspaceId} and workspace_exercise_id = ${exerciseId} and version = 1
      order by position
    `;
    expect(alternatives).toEqual([
      {
        position: 1,
        global_exercise_id: globalTarget,
        alternative_workspace_exercise_id: null,
      },
      {
        position: 2,
        global_exercise_id: null,
        alternative_workspace_exercise_id: privateTarget,
      },
    ]);
  });

  it('accepts Description at 2000 characters and rejects 2001 with the existing validation error', async () => {
    await writePrivate({ ...core, description: 'x'.repeat(2000) });
    await expect(
      writePrivate({ ...core, description: 'x'.repeat(2001) }),
    ).rejects.toMatchObject({
      code: '22023',
      message: 'catalog_exercise_invalid',
    });
  });

  it('rejects malformed, duplicate, inactive, self, and over-limit private Alternatives', async () => {
    const globalTarget = await createGlobalTarget();
    const inactiveTarget = await createGlobalTarget();
    await db`update public.exercises set lifecycle_state = 'removed' where id = ${inactiveTarget}`;
    const valid = { global_exercise_id: globalTarget };
    for (const alternatives of [
      [
        {
          global_exercise_id: globalTarget,
          workspace_exercise_id: randomUUID(),
        },
      ],
      [{}],
      [valid, valid],
      [
        valid,
        { global_exercise_id: await createGlobalTarget() },
        { global_exercise_id: await createGlobalTarget() },
        { global_exercise_id: await createGlobalTarget() },
      ],
      [{ global_exercise_id: inactiveTarget }],
    ]) {
      await expect(
        writePrivate({ ...core, alternatives }),
      ).rejects.toMatchObject({
        code: '22023',
        message: 'catalog_exercise_alternatives_invalid',
      });
    }

    const source = await writePrivate(core);
    const sourceId = (
      source[0]?.catalog_write_workspace_exercise as { exercise_id: string }
    ).exercise_id;
    await expect(
      writePrivate(
        { ...core, alternatives: [{ workspace_exercise_id: sourceId }] },
        sourceId,
        1,
      ),
    ).rejects.toMatchObject({
      code: '22023',
      message: 'catalog_exercise_alternatives_invalid',
    });
  });

  it('preserves the private target composite key, one-target rule, uniqueness, active-at-write, and max-three bound', async () => {
    const [row] = await db`
      select
        exists (select 1 from pg_catalog.pg_constraint c
          where c.conrelid='public.workspace_exercise_version_alternatives'::regclass
            and c.contype='f' and c.confrelid='public.workspace_exercises'::regclass
            and (select array_agg(a.attname order by k.ordinality)
              from unnest(c.conkey) with ordinality k(attnum, ordinality)
              join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)
              = array['workspace_id','alternative_workspace_exercise_id']::name[]
            and (select array_agg(a.attname order by k.ordinality)
              from unnest(c.confkey) with ordinality k(attnum, ordinality)
              join pg_catalog.pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum)
              = array['workspace_id','id']::name[]) as private_composite_fk,
        exists (select 1 from pg_catalog.pg_constraint c
          where c.conrelid='public.workspace_exercise_version_alternatives'::regclass
            and c.contype='c' and pg_catalog.pg_get_constraintdef(c.oid) ilike '%num_nonnulls(global_exercise_id, alternative_workspace_exercise_id) = 1%') as one_target,
        exists (select 1 from pg_catalog.pg_constraint c
          where c.conrelid='public.workspace_exercise_version_alternatives'::regclass
            and c.contype='u' and c.conkey = array[
              (select attnum from pg_catalog.pg_attribute where attrelid=c.conrelid and attname='workspace_id'),
              (select attnum from pg_catalog.pg_attribute where attrelid=c.conrelid and attname='workspace_exercise_id'),
              (select attnum from pg_catalog.pg_attribute where attrelid=c.conrelid and attname='version'),
              (select attnum from pg_catalog.pg_attribute where attrelid=c.conrelid and attname='alternative_workspace_exercise_id')
            ]::smallint[]) as unique_private_target,
        exists (select 1 from pg_catalog.pg_constraint c
          where c.conrelid='public.workspace_exercise_version_alternatives'::regclass
            and c.contype='c' and pg_catalog.pg_get_constraintdef(c.oid) ilike '%position%1%3%') as max_three
    `;
    expect(row?.private_composite_fk).toBe(true);
    expect(row?.one_target).toBe(true);
    expect(row?.unique_private_target).toBe(true);
    expect(row?.max_three).toBe(true);
  });

  it('keeps the workspace validator private and the write RPC authenticated-only', async () => {
    const [row] = await db`
      select p.prosecdef, p.proconfig,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
      from pg_catalog.pg_proc p
      where p.oid = 'app_private.validate_workspace_exercise_payload(uuid,uuid,jsonb)'::regprocedure
    `;
    expect(row?.prosecdef).toBe(true);
    expect(row?.proconfig).toContain('search_path=""');
    expect(row?.authenticated_execute).toBe(false);
    expect(row?.anon_execute).toBe(false);
    expect(row?.service_execute).toBe(false);

    const [writer] = await db`
      select p.prosecdef, p.proconfig,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
      from pg_catalog.pg_proc p
      where p.oid = 'public.catalog_write_workspace_exercise(uuid,uuid,integer,uuid,jsonb)'::regprocedure
    `;
    expect(writer?.prosecdef).toBe(true);
    expect(writer?.proconfig).toContain('search_path=""');
    expect(writer?.authenticated_execute).toBe(true);
    expect(writer?.anon_execute).toBe(false);
    expect(writer?.service_execute).toBe(false);
  });

  it('kills the Notes allowlist, Description, Alternatives limit, self-target, and private composite-key mutants', async () => {
    const globalTargets = await Promise.all(
      [1, 2, 3, 4].map(() => createGlobalTarget()),
    );
    const source = await writePrivate(core);
    const sourceId = (
      source[0]?.catalog_write_workspace_exercise as { exercise_id: string }
    ).exercise_id;
    const probes = [
      {
        label: 'Notes allowlist',
        signature: 'app_private.validate_exercise_payload(jsonb)',
        needle: "'notes','video_url'",
        replacement: "'dropped_notes','video_url'",
        request: { ...core, notes: 'T075 mutation probe' },
        workspaceAware: false,
        shouldRejectUnderMutation: true,
      },
      {
        label: 'Description maximum',
        signature: 'app_private.validate_exercise_payload(jsonb)',
        needle: "char_length(p_request ->> 'description') > 2000",
        replacement: 'false',
        request: { ...core, description: 'x'.repeat(2001) },
        workspaceAware: false,
        shouldRejectUnderMutation: false,
      },
      {
        label: 'Alternatives maximum',
        signature:
          'app_private.validate_workspace_exercise_payload(uuid,uuid,jsonb)',
        needle: "if jsonb_array_length(p_request -> 'alternatives') > 3 then",
        replacement: 'if false then',
        request: {
          ...core,
          alternatives: globalTargets.map((global_exercise_id) => ({
            global_exercise_id,
          })),
        },
        workspaceAware: true,
        shouldRejectUnderMutation: false,
      },
      {
        label: 'Self Alternative',
        signature:
          'app_private.validate_workspace_exercise_payload(uuid,uuid,jsonb)',
        needle:
          "where (a.value ->> 'workspace_exercise_id')::uuid = p_exercise_id",
        replacement: 'where false',
        request: {
          ...core,
          alternatives: [{ workspace_exercise_id: sourceId }],
        },
        workspaceAware: true,
        shouldRejectUnderMutation: false,
      },
    ];

    for (const probe of probes) {
      const marker = `rollback_t075_${probe.label.replaceAll(' ', '_')}`;
      try {
        await db.begin(async (tx) => {
          const [current] = await tx`
            select pg_catalog.pg_get_functiondef(${probe.signature}::regprocedure) as definition
          `;
          const definition = current?.definition as string;
          if (!definition.includes(probe.needle))
            throw new Error(`T075 mutation target missing: ${probe.label}`);
          await tx.unsafe(definition.replace(probe.needle, probe.replacement));
          let assertionFailure: unknown;
          try {
            if (probe.workspaceAware) {
              await tx`select app_private.validate_workspace_exercise_payload(${workspaceId}, ${sourceId}, ${tx.json(probe.request)})`;
            } else {
              await tx`select app_private.validate_exercise_payload(${tx.json(probe.request)})`;
            }
          } catch (error) {
            assertionFailure = error;
          }
          expect(
            Boolean(assertionFailure),
            `${probe.label} mutation must break its assertion`,
          ).toBe(probe.shouldRejectUnderMutation);
          throw new Error(marker);
        });
      } catch (error) {
        expect((error as Error).message).toBe(marker);
      }
    }

    const compositeMarker = 'rollback_t075_private_composite_key';
    try {
      await db.begin(async (tx) => {
        await tx`alter table public.workspace_exercise_version_alternatives
          drop constraint workspace_exercise_version_alternatives_private_target_fk`;
        const [row] = await tx`
          select exists (select 1 from pg_catalog.pg_constraint c
            where c.conrelid='public.workspace_exercise_version_alternatives'::regclass
              and c.conname='workspace_exercise_version_alternatives_private_target_fk'
              and c.contype='f') as private_composite_fk
        `;
        expect(
          row?.private_composite_fk,
          'dropping the private composite key must break its assertion',
        ).toBe(false);
        throw new Error(compositeMarker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(compositeMarker);
    }
  });
});
