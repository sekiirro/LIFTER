import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
let poId: string;
let trainerId: string;
let salesId: string;
let workspaceId: string;
let foreignWorkspaceId: string;

beforeAll(async () => {
  const f = await twoWorkspaceFixture();
  poId = f.po.userId;
  trainerId = f.trainerA.userId;
  salesId = f.salesA.userId;
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
      await tx`select public.catalog_create_exercise(${randomUUID()}, ${tx.json({ name_en: name, name_ar: 'تمرين', primary_muscle_code: 'chest', equipment_codes: ['barbell'] })}) as result`;
    return r!.result.exercise_id as string;
  });
}

async function write(
  actorId: string,
  workspace: string,
  exercise: string,
  expected: number | null,
  key: string,
  request: object,
) {
  return asActor(
    actorId,
    (tx) =>
      tx`select public.catalog_write_exercise_override(${workspace}, ${exercise}, ${expected}, ${key}, ${tx.json(request as Json)}) as result`,
  );
}

describe('T047 workspace exercise override writes', () => {
  it('accepts Notes and Video references at 2,000 characters and rejects 2,001', async () => {
    const acceptedExercise = await createGlobal(
      `T047 cap accepted ${randomUUID()}`,
    );
    const baseVideo = 'https://youtu.be/abcdefghijk?x=';
    const acceptedVideo = baseVideo.padEnd(2000, 'a');
    expect(acceptedVideo).toHaveLength(2000);
    const accepted = await write(
      trainerId,
      workspaceId,
      acceptedExercise,
      0,
      randomUUID(),
      {
        notes: 'n'.repeat(2000),
        video_url: acceptedVideo,
      },
    );
    expect(accepted[0]?.result).toMatchObject({ version: 1 });

    const rejectedExercise = await createGlobal(
      `T047 cap rejected ${randomUUID()}`,
    );
    await expect(
      write(trainerId, workspaceId, rejectedExercise, 0, randomUUID(), {
        notes: 'n'.repeat(2001),
      }),
    ).rejects.toThrow(
      /catalog_exercise_override_invalid|catalog_exercise_payload_invalid|catalog_exercise_notes_too_long/,
    );
    await expect(
      write(trainerId, workspaceId, rejectedExercise, 0, randomUUID(), {
        video_url: `${acceptedVideo}a`,
      }),
    ).rejects.toThrow(
      /exercise_override_versions_notes_video_text_limit|catalog_exercise_override_invalid|catalog_exercise_payload_invalid|catalog_exercise_video_too_long/,
    );
  });

  it('fails the data audit with a count before writing and never truncates', async () => {
    const exercise = await createGlobal(`T047 audit guard ${randomUUID()}`);
    await expect(
      db.begin(async (tx) => {
        await tx`alter table public.exercise_versions
        drop constraint exercise_versions_notes_video_text_limit`;
        const [base] =
          await tx`select payload, created_by from public.exercise_versions
        where exercise_id=${exercise} and version=1`;
        await tx`insert into public.exercise_versions
        (exercise_id, version, payload, notes, created_by)
        values (${exercise}, 2, ${tx.json(base!.payload)}, ${'x'.repeat(2001)}, ${base!.created_by})`;
        await tx`select app_private.catalog_assert_exercise_text_limits()`;
      }),
    ).rejects.toThrow(/catalog_exercise_text_limit_existing_data:1/);
    const rows = await db`select version from public.exercise_versions
      where exercise_id=${exercise} order by version`;
    expect(rows.map((row) => row.version)).toEqual([1]);
  });

  it('creates, versions, resets, and records exactly one audit per write', async () => {
    const exercise = await createGlobal(`T047 ${randomUUID()}`);
    const key1 = randomUUID();
    const created = await write(trainerId, workspaceId, exercise, 0, key1, {
      name_en: 'Local name',
      name_ar: 'اسم محلي',
      description: 'short note',
      notes: 'coach note',
      video_url: 'https://youtu.be/abcdefghijk',
      default_rest_time: 90,
      default_rir: 2,
      default_reps: { min: 8, max: 12 },
      alternatives: [],
    });
    expect(created[0]?.result).toMatchObject({
      version: 1,
      workspace_id: workspaceId,
      exercise_id: exercise,
    });
    const key2 = randomUUID();
    const updated = await write(trainerId, workspaceId, exercise, 1, key2, {
      name_en: null,
      description: null,
      notes: null,
      video_url: null,
      default_rest_time: null,
      default_rir: null,
      default_reps: null,
      alternatives: null,
    });
    expect(updated[0]?.result).toMatchObject({ version: 2 });
    const rows =
      await db`select version, payload, alternatives_present from public.exercise_override_versions where workspace_id=${workspaceId} and exercise_id=${exercise} order by version`;
    expect(rows).toHaveLength(2);
    expect(rows[0]?.payload).toMatchObject({
      name_en: 'Local name',
      default_reps: { min: 8, max: 12 },
    });
    expect(rows[0]?.alternatives_present).toBe(true);
    expect(rows[1]?.payload).toMatchObject({
      name_en: null,
      name_ar: null,
      description: null,
      notes: null,
      video_url: null,
      default_rest_time: null,
      default_rir: null,
      default_reps: null,
    });
    expect(rows[1]?.alternatives_present).toBe(false);
    const audits =
      await db`select count(*)::int as n from public.audit_events where workspace_id=${workspaceId} and target_table='exercise_overrides' and target_id=${exercise}`;
    expect(audits[0]?.n).toBe(2);
  });

  it('replays the same action and payload, rejects key reuse with a different payload, stale CAS, and invalid fields', async () => {
    const exercise = await createGlobal(`T047 idem ${randomUUID()}`);
    const key = randomUUID();
    const payload = { name_en: 'One' };
    const first = await write(
      trainerId,
      workspaceId,
      exercise,
      0,
      key,
      payload,
    );
    const replay = await write(
      trainerId,
      workspaceId,
      exercise,
      0,
      key,
      payload,
    );
    expect(replay[0]?.result).toEqual(first[0]?.result);
    await expect(
      write(trainerId, workspaceId, exercise, 0, key, { name_en: 'Two' }),
    ).rejects.toThrow(/operation_key_request_conflict/);
    await expect(
      write(trainerId, workspaceId, exercise, 0, randomUUID(), {
        name_en: 'Stale',
      }),
    ).rejects.toThrow(/catalog_exercise_override_version_conflict/);
    for (const [field, value] of [
      ['default_rest_time', 31],
      ['default_rir', 6],
      ['default_reps', 101],
      ['unapproved_field', 'x'],
    ] as const) {
      await expect(
        write(trainerId, workspaceId, exercise, 1, randomUUID(), {
          [field]: value,
        }),
      ).rejects.toBeDefined();
    }
    for (const request of [
      { default_rest_time: 615 },
      { default_rir: -1 },
      { default_reps: { min: 12, max: 8 } },
      { default_reps: { min: 8 } },
      { name_ar: 'Arabic without English' },
      { video_url: 'https://docs.google.com/document/d/example' },
      {
        alternatives: [
          { global_exercise_id: exercise },
          { global_exercise_id: exercise },
        ],
      },
      {
        alternatives: [1, 2, 3, 4].map(() => ({
          global_exercise_id: randomUUID(),
        })),
      },
    ]) {
      await expect(
        write(trainerId, workspaceId, exercise, 1, randomUUID(), request),
      ).rejects.toBeDefined();
    }
    const boundary = await write(
      trainerId,
      workspaceId,
      exercise,
      1,
      randomUUID(),
      {
        default_rest_time: 600,
        default_rir: 0,
        default_reps: 100,
        video_url: 'https://drive.google.com/file/d/123',
      },
    );
    expect(boundary[0]?.result).toMatchObject({ version: 2 });
  });

  it('preserves removed targets in override history on a Notes write but rejects re-selection', async () => {
    const source = await createGlobal(`T047 source ${randomUUID()}`);
    const target = await createGlobal(`T047 target ${randomUUID()}`);
    await write(trainerId, workspaceId, source, 0, randomUUID(), {
      alternatives: [{ global_exercise_id: target }],
    });
    await asActor(
      poId,
      (tx) => tx`select public.catalog_transition_exercise(
      ${target}, 0, 'remove', ${randomUUID()}
    )`,
    );
    await write(trainerId, workspaceId, source, 1, randomUUID(), {
      notes: 'Keep the recorded target reference',
    });
    const preserved =
      await db`select global_exercise_id from public.exercise_override_alternatives
      where workspace_id=${workspaceId} and exercise_id=${source} and override_version=2`;
    expect(preserved).toEqual([{ global_exercise_id: target }]);
    await expect(
      write(trainerId, workspaceId, source, 2, randomUUID(), {
        alternatives: [{ global_exercise_id: target }],
      }),
    ).rejects.toThrow(/catalog_exercise_alternatives_invalid/);
  });

  it('enforces workspace authorization and permits the PO workspace override reach', async () => {
    const exercise = await createGlobal(`T047 auth ${randomUUID()}`);
    await expect(
      write(trainerId, foreignWorkspaceId, exercise, 0, randomUUID(), {
        name_en: 'Foreign',
      }),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      write(salesId, workspaceId, exercise, 0, randomUUID(), {
        name_en: 'Sales',
      }),
    ).rejects.toMatchObject({ code: '42501' });
    const poWrite = await write(
      poId,
      foreignWorkspaceId,
      exercise,
      0,
      randomUUID(),
      { name_en: 'PO scoped' },
    );
    expect(poWrite[0]?.result).toMatchObject({
      version: 1,
      workspace_id: foreignWorkspaceId,
    });
  });

  it('places the authorization recheck after the locked revision read', async () => {
    const [row] =
      await db`select pg_catalog.pg_get_functiondef('public.catalog_write_exercise_override(uuid,uuid,integer,uuid,jsonb)'::regprocedure) as body`;
    const lockRead = row!.body.indexOf('for update');
    const postLockCheck = row!.body.indexOf(
      "if not app_private.has_workspace_access(p_workspace_id, 'coaching_work')",
      lockRead + 1,
    );
    expect(lockRead).toBeGreaterThan(-1);
    expect(postLockCheck).toBeGreaterThan(lockRead);
  });
});
