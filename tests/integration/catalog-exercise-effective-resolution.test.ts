import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
let poId: string;
let trainerId: string;
let workspaceId: string;
let foreignWorkspaceId: string;

beforeAll(async () => {
  const f = await twoWorkspaceFixture();
  poId = f.po.userId;
  trainerId = f.trainerA.userId;
  workspaceId = f.wsA.id;
  foreignWorkspaceId = f.wsB.id;
});
afterAll(async () => db.end());

async function asActor<T>(actorId: string, body: (tx: Tx) => Promise<T>) {
  return db.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
    return body(tx);
  });
}

async function createGlobal(name: string) {
  return asActor(poId, async (tx) => {
    const [r] =
      await tx`select public.catalog_create_exercise(${randomUUID()}, ${tx.json({ name_en: name, name_ar: 'ØªÙ…Ø±ÙŠÙ†', primary_muscle_code: 'chest', equipment_codes: ['barbell'] })}) as result`;
    return r!.result.exercise_id as string;
  });
}

async function writeOverride(exerciseId: string, values: Record<string, Json>) {
  return asActor(
    trainerId,
    (tx) => tx`select public.catalog_write_exercise_override(
    ${workspaceId}, ${exerciseId}, 0, ${randomUUID()}, ${tx.json(values)}
  )`,
  );
}

async function search(
  actorId: string,
  scope: string | null,
  exerciseId: string,
  query = '',
) {
  return asActor(
    actorId,
    (tx) => tx`select result_payload from public.catalog_search(
    'exercise', ${query}, '{}'::jsonb, null, ${scope}
  ) where result_id = ${exerciseId}`,
  );
}

describe('T049 staff effective exercise resolution', () => {
  it('resolves each of the eight fields per workspace with a source and keeps canonical-only search', async () => {
    const searchName = `T049 fields ${randomUUID()}`;
    const exerciseId = await createGlobal(searchName);
    const local = {
      name_en: 'Workspace name',
      description: 'Workspace description',
      notes: 'Workspace coaching notes',
      video_url: 'https://youtu.be/abcdefghijk',
      alternatives: [],
      default_rest_time: 90,
      default_rir: 2,
      default_reps: { min: 8, max: 12 },
    };
    await writeOverride(exerciseId, local);

    const [workspace] = await search(
      trainerId,
      workspaceId,
      exerciseId,
      searchName,
    );
    expect(workspace?.result_payload).toMatchObject({
      effective_fields: {
        name: {
          value: { name_en: 'Workspace name', name_ar: null },
          source: 'override',
        },
        description: { value: 'Workspace description', source: 'override' },
        notes: { value: 'Workspace coaching notes', source: 'override' },
        video: { value: 'https://youtu.be/abcdefghijk', source: 'override' },
        alternatives: { value: [], source: 'override' },
        default_rest_time: { value: 90, source: 'override' },
        default_rir: { value: 2, source: 'override' },
        default_reps: { value: { min: 8, max: 12 }, source: 'override' },
      },
    });
    expect(
      Object.keys(workspace!.result_payload.effective_fields).sort(),
    ).toEqual([
      'alternatives',
      'default_reps',
      'default_rest_time',
      'default_rir',
      'description',
      'name',
      'notes',
      'video',
    ]);
    const detail = await asActor(
      trainerId,
      (tx) => tx`select payload, override_version
      from public.catalog_exercise_detail(${exerciseId}, ${workspaceId})`,
    );
    expect(detail[0]?.override_version).toBe(1);
    expect(detail[0]?.payload.effective_fields).toEqual(
      workspace?.result_payload.effective_fields,
    );

    const canonical = await asActor(
      poId,
      (tx) => tx`select payload, override_version
      from public.catalog_exercise_detail(${exerciseId}, null)`,
    );
    expect(canonical[0]?.override_version).toBeNull();
    expect(canonical[0]?.payload.effective_fields).toMatchObject({
      name: {
        value: { name_en: expect.any(String), name_ar: 'ØªÙ…Ø±ÙŠÙ†' },
        source: 'canonical',
      },
      description: { value: null, source: 'none' },
      notes: { value: null, source: 'none' },
      video: { value: null, source: 'none' },
      alternatives: { value: [], source: 'none' },
      default_rest_time: { value: null, source: 'none' },
      default_rir: { value: null, source: 'none' },
      default_reps: { value: null, source: 'none' },
    });
  });

  it('treats null as inherit and an explicit-empty Alternatives override as empty', async () => {
    const exerciseName = `T049 inherit ${randomUUID()}`;
    const exerciseId = await createGlobal(exerciseName);
    const targetId = await createGlobal(`T049 alternative ${randomUUID()}`);
    await db`insert into public.exercise_version_alternatives(exercise_id, version, position, global_exercise_id)
      values (${exerciseId}, 1, 1, ${targetId})`;
    await writeOverride(exerciseId, { name_en: null, alternatives: [] });

    const [workspace] = await search(
      trainerId,
      workspaceId,
      exerciseId,
      exerciseName,
    );
    expect(workspace?.result_payload.effective_fields.name).toMatchObject({
      value: { name_en: expect.stringMatching(/^T049 inherit /) },
      source: 'canonical',
    });
    expect(workspace?.result_payload.effective_fields.alternatives).toEqual({
      value: [],
      source: 'override',
    });
  });

  it('rejects a canonical self Alternative even when UUID text uses uppercase', async () => {
    let exerciseId = await createGlobal(`T049 self ${randomUUID()}`);
    while (!/[a-f]/i.test(exerciseId))
      exerciseId = await createGlobal(`T049 self ${randomUUID()}`);
    const [version] = await db`select payload from public.exercise_versions
      where exercise_id=${exerciseId} and version=1`;
    const uppercaseSelf = exerciseId.toUpperCase();
    expect(uppercaseSelf).not.toBe(exerciseId);
    await expect(
      asActor(
        poId,
        (tx) => tx`select public.catalog_version_exercise(
      ${exerciseId}, 1, ${randomUUID()}, ${tx.json({
        ...version!.payload,
        alternatives: [uppercaseSelf],
      })}
    )`,
      ),
    ).rejects.toThrow(/catalog_exercise_alternatives_invalid/);
  });

  it('requires current coaching_work for the explicitly selected workspace', async () => {
    const exerciseName = `T049 scope ${randomUUID()}`;
    const exerciseId = await createGlobal(exerciseName);
    await expect(
      search(trainerId, foreignWorkspaceId, exerciseId),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      search(trainerId, workspaceId, exerciseId, exerciseName),
    ).resolves.toHaveLength(1);
  });

  it('resolves workspace-private values only from that identity version', async () => {
    const name = `T049 private ${randomUUID()}`;
    const created = await asActor(
      trainerId,
      (tx) => tx`select public.catalog_write_workspace_exercise(
      ${workspaceId}, null, null, ${randomUUID()}, ${tx.json({
        name_en: name,
        name_ar: 'ØªÙ…Ø±ÙŠÙ† Ø®Ø§Øµ',
        primary_muscle_code: 'chest',
        equipment_codes: ['barbell'],
        video_url: 'https://youtu.be/abcdefghijk',
      })}
    ) as result`,
    );
    const exerciseId = created[0]!.result.exercise_id as string;
    const [row] = await asActor(
      trainerId,
      (tx) => tx`select result_payload
      from public.catalog_search('workspace_exercise', null, '{}'::jsonb, null, ${workspaceId})
      where result_id = ${exerciseId}`,
    );
    expect(row?.result_payload.effective_fields).toMatchObject({
      name: {
        value: { name_en: name, name_ar: 'ØªÙ…Ø±ÙŠÙ† Ø®Ø§Øµ' },
        source: 'workspace_private',
      },
      video: {
        value: 'https://youtu.be/abcdefghijk',
        source: 'workspace_private',
      },
      description: { value: null, source: 'none' },
      notes: { value: null, source: 'none' },
      alternatives: { value: [], source: 'none' },
      default_rest_time: { value: null, source: 'none' },
      default_rir: { value: null, source: 'none' },
      default_reps: { value: null, source: 'none' },
    });
  });
});
