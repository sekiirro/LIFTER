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

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  poId = fixture.po.userId;
  trainerId = fixture.trainerA.userId;
  workspaceId = fixture.wsA.id;
});

afterAll(async () => db.end());

const core = {
  name_en: 'T037 contract exercise',
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

async function createGlobal(payload: { [key: string]: Json }, actor = poId) {
  return asActor(actor, (tx) =>
    tx`select public.catalog_create_exercise(${randomUUID()}, ${tx.json(payload)})`,
  );
}

async function createPrivate(payload: { [key: string]: Json }) {
  return asActor(trainerId, (tx) =>
    tx`select public.catalog_write_workspace_exercise(${workspaceId}, null, null, ${randomUUID()}, ${tx.json(payload)})`,
  );
}

describe('T037 Global and workspace-private write contracts', () => {
  it.fails('accepts an English-only Global exercise with required taxonomy (T074)', async () => {
    const result = await createGlobal(core);
    expect(result[0]?.catalog_create_exercise).toMatchObject({ version: 1 });
  });

  it('rejects a Global create without primary muscle (T074)', async () => {
    await expect(
      createGlobal({ name_en: core.name_en, equipment_codes: core.equipment_codes }),
    ).rejects.toBeDefined();
  });

  it('rejects a Global create without equipment (T074)', async () => {
    await expect(
      createGlobal({ name_en: core.name_en, primary_muscle_code: 'chest' }),
    ).rejects.toBeDefined();
  });

  it.fails('accepts an English-only workspace-private exercise with required taxonomy (T075)', async () => {
    const result = await createPrivate(core);
    expect(result[0]?.catalog_write_workspace_exercise).toMatchObject({
      version: 1,
      workspace_id: workspaceId,
    });
  });

  it('rejects a workspace-private create without primary muscle (T075)', async () => {
    await expect(
      createPrivate({ name_en: core.name_en, equipment_codes: core.equipment_codes }),
    ).rejects.toBeDefined();
  });

  it('rejects a workspace-private create without equipment (T075)', async () => {
    await expect(
      createPrivate({ name_en: core.name_en, primary_muscle_code: 'chest' }),
    ).rejects.toBeDefined();
  });

  it('rejects non-PO Global writes (T037)', async () => {
    await expect(createGlobal({ ...core, name_ar: 'تمرين اختبار' }, trainerId)).rejects.toMatchObject({
      code: '42501',
    });
  });
});

describe.each([
  ['Name', 'name_en', 'Valid English name', '', 'T074'],
  ['Description', 'description', 'One description in Arabic فقط', { name_ar: 'pair key' }, 'T074'],
  ['Notes', 'notes', 'Coaching note', { instructions_en: 'legacy key' }, 'T074'],
  ['Video', 'video_url', 'https://youtu.be/abcdefghijk', 'https://docs.google.com/document/d/id', 'T043'],
  ['Alternatives', 'alternatives', [], ['a', 'b', 'c', 'd'], 'T074'],
  ['Default Rest Time', 'default_rest_time', 90, 7, 'T074'],
  ['Default RIR', 'default_rir', 2, 2.5, 'T074'],
  ['Default Reps', 'default_reps', { min: 8, max: 12 }, { min: 12, max: 5 }, 'T074'],
] as const)('%s field contract', (field, key, valid, invalid, task) => {
  const contractIt = field === 'Name' ? it : it.fails;
  contractIt(`${field}: stores an allowed Global value (${task})`, async () => {
    const result = await createGlobal({ ...core, name_ar: 'تمرين', [key]: valid });
    const exerciseId = (result[0]?.catalog_create_exercise as { exercise_id: string })
      .exercise_id;
    const [version] = await db`
      select payload from public.exercise_versions
      where exercise_id = ${exerciseId} and version = 1
    `;
    expect(version?.payload).toMatchObject({ [key]: valid });
  });

  it(`rejects a malformed or disallowed ${field} value on the Global write path (${task})`, async () => {
    await expect(
      createGlobal({ ...core, name_ar: 'تمرين', [key]: invalid }),
    ).rejects.toBeDefined();
  });

  contractIt(`${field}: stores an allowed private value (T075)`, async () => {
    const result = await createPrivate({ ...core, name_ar: 'تمرين', [key]: valid });
    const exerciseId = (
      result[0]?.catalog_write_workspace_exercise as { exercise_id: string }
    ).exercise_id;
    const [version] = await db`
      select payload from public.workspace_exercise_versions
      where workspace_id = ${workspaceId} and workspace_exercise_id = ${exerciseId} and version = 1
    `;
    expect(version?.payload).toMatchObject({ [key]: valid });
  });

  it(`rejects a malformed or disallowed ${field} value on the private write path (T075)`, async () => {
    await expect(
      createPrivate({ ...core, name_ar: 'تمرين', [key]: invalid }),
    ).rejects.toBeDefined();
  });
});

describe('T037 contract distinctions', () => {
  it('rejects Arabic-only names on both write paths (T074/T075)', async () => {
    const arabicOnly = { name_ar: 'تمرين بلا اسم إنجليزي', ...core };
    delete (arabicOnly as Partial<typeof core>).name_en;
    await expect(createGlobal(arabicOnly)).rejects.toBeDefined();
    await expect(createPrivate(arabicOnly)).rejects.toBeDefined();
  });

  it.fails('keeps an empty Alternatives list distinct from null/inherit (T047/T048)', async () => {
    const empty = await createPrivate({ ...core, name_ar: 'تمرين', alternatives: [] });
    const exerciseId = (
      empty[0]?.catalog_write_workspace_exercise as { exercise_id: string }
    ).exercise_id;
    const version = await db`
      select payload -> 'alternatives' as alternatives
      from public.workspace_exercise_versions
      where workspace_id = ${workspaceId} and workspace_exercise_id = ${exerciseId} and version = 1
    `;
    expect(version[0]?.alternatives).toEqual([]);
  });

  it('keeps workspace-private creation isolated from canonical Global identities (T037)', async () => {
    const result = await createPrivate({ ...core, name_ar: 'تمرين خاص' });
    const exerciseId = (
      result[0]?.catalog_write_workspace_exercise as { exercise_id: string }
    ).exercise_id;
    await expect(
      db`select id from public.exercises where id = ${exerciseId}`,
    ).resolves.toHaveLength(0);
    await expect(
      db`select id from public.workspace_exercises where workspace_id = ${workspaceId} and id = ${exerciseId}`,
    ).resolves.toHaveLength(1);
  });

  it.fails.each([
    ['Default Rest Time accepts 0, 90, and 600 seconds', 'default_rest_time', [0, 90, 600]],
    ['Default RIR accepts 0 and 5', 'default_rir', [0, 5]],
    ['Default Reps accepts a single count and inclusive range', 'default_reps', [8, { min: 8, max: 12 }]],
  ])('%s on Global create (T074)', async (_label, key, values) => {
    for (const value of values) {
      await createGlobal({ ...core, name_ar: 'تمرين', [key]: value });
    }
  });

  it.each([
    ['Default Rest Time rejects 7 and 601 seconds', 'default_rest_time', [7, 601]],
    ['Default RIR rejects 6 and 2.5', 'default_rir', [6, 2.5]],
    ['Default Reps rejects 0, 101, and reversed ranges', 'default_reps', [0, 101, { min: 12, max: 5 }]],
  ])('%s on Global create (T074)', async (_label, key, values) => {
    for (const value of values) {
      await expect(
        createGlobal({ ...core, name_ar: 'تمرين', [key]: value }),
      ).rejects.toBeDefined();
    }
  });

  it.fails.each([
    ['Default Rest Time accepts 0, 90, and 600 seconds', 'default_rest_time', [0, 90, 600]],
    ['Default RIR accepts 0 and 5', 'default_rir', [0, 5]],
    ['Default Reps accepts a single count and inclusive range', 'default_reps', [8, { min: 8, max: 12 }]],
  ])('%s on workspace-private create (T075)', async (_label, key, values) => {
    for (const value of values) {
      await createPrivate({ ...core, name_ar: 'تمرين', [key]: value });
    }
  });

  it.each([
    ['Default Rest Time rejects 7 and 601 seconds', 'default_rest_time', [7, 601]],
    ['Default RIR rejects 6 and 2.5', 'default_rir', [6, 2.5]],
    ['Default Reps rejects 0, 101, and reversed ranges', 'default_reps', [0, 101, { min: 12, max: 5 }]],
  ])('%s on workspace-private create (T075)', async (_label, key, values) => {
    for (const value of values) {
      await expect(
        createPrivate({ ...core, name_ar: 'تمرين', [key]: value }),
      ).rejects.toBeDefined();
    }
  });
});
