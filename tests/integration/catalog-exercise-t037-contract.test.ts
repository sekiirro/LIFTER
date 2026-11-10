import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
let poId: string;
let workspaceOwnerId: string;
let trainerId: string;
let workspaceId: string;

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  poId = fixture.po.userId;
  workspaceOwnerId = fixture.woA.userId;
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
  return asActor(
    actor,
    (tx) =>
      tx`select public.catalog_create_exercise(${randomUUID()}, ${tx.json(payload)})`,
  );
}

async function createPrivate(payload: { [key: string]: Json }) {
  return asActor(
    trainerId,
    (tx) =>
      tx`select public.catalog_write_workspace_exercise(${workspaceId}, null, null, ${randomUUID()}, ${tx.json(payload)})`,
  );
}

describe('T037 Global and workspace-private write contracts', () => {
  it.fails(
    'accepts an English-only Global exercise with required taxonomy (T074)',
    async () => {
      const result = await createGlobal(core);
      expect(result[0]?.catalog_create_exercise).toMatchObject({ version: 1 });
    },
  );

  it('rejects a Global create without primary muscle (T074)', async () => {
    await expect(
      createGlobal({
        name_en: core.name_en,
        equipment_codes: core.equipment_codes,
      }),
    ).rejects.toBeDefined();
  });

  it('rejects a Global create without equipment (T074)', async () => {
    await expect(
      createGlobal({ name_en: core.name_en, primary_muscle_code: 'chest' }),
    ).rejects.toBeDefined();
  });

  it.fails(
    'accepts an English-only workspace-private exercise with required taxonomy (T075)',
    async () => {
      const result = await createPrivate(core);
      expect(result[0]?.catalog_write_workspace_exercise).toMatchObject({
        version: 1,
        workspace_id: workspaceId,
      });
    },
  );

  it('rejects a workspace-private create without primary muscle (T075)', async () => {
    await expect(
      createPrivate({
        name_en: core.name_en,
        equipment_codes: core.equipment_codes,
      }),
    ).rejects.toBeDefined();
  });

  it('rejects a workspace-private create without equipment (T075)', async () => {
    await expect(
      createPrivate({ name_en: core.name_en, primary_muscle_code: 'chest' }),
    ).rejects.toBeDefined();
  });

  it('rejects non-PO Global writes (T037)', async () => {
    await expect(
      createGlobal({ ...core, name_ar: 'تمرين اختبار' }, trainerId),
    ).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('rejects workspace-owner Global writes (T037)', async () => {
    await expect(
      createGlobal({ ...core, name_ar: 'Test' }, workspaceOwnerId),
    ).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('rejects fields outside the workspace exercise allowlist (T037/T075)', async () => {
    await expect(
      createPrivate({ ...core, unapproved_field: 'must not persist' }),
    ).rejects.toBeDefined();
  });
});

describe.each([
  ['Name', 'name_en', 'Valid English name', '', 'T074'],
  [
    'Description',
    'description',
    'One description in Arabic فقط',
    { name_ar: 'pair key' },
    'T074',
  ],
  [
    'Notes',
    'notes',
    'Coaching note',
    { instructions_en: 'legacy key' },
    'T074',
  ],
  [
    'Video',
    'video_url',
    'https://youtu.be/abcdefghijk',
    'https://docs.google.com/document/d/id',
    'T043',
  ],
  ['Alternatives', 'alternatives', [], ['a', 'b', 'c', 'd'], 'T074'],
  ['Default Rest Time', 'default_rest_time', 90, 7, 'T074'],
  ['Default RIR', 'default_rir', 2, 2.5, 'T074'],
  [
    'Default Reps',
    'default_reps',
    { min: 8, max: 12 },
    { min: 12, max: 5 },
    'T074',
  ],
] as const)('%s field contract', (field, key, valid, invalid, task) => {
  const contractIt = field === 'Name' ? it : it.fails;
  contractIt(`${field}: stores an allowed Global value (${task})`, async () => {
    const result = await createGlobal({
      ...core,
      name_ar: 'تمرين',
      [key]: valid,
    });
    const exerciseId = (
      result[0]?.catalog_create_exercise as { exercise_id: string }
    ).exercise_id;
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
    const result = await createPrivate({
      ...core,
      name_ar: 'تمرين',
      [key]: valid,
    });
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

  it.fails(
    'keeps an empty Alternatives list distinct from null/inherit (T047/T048)',
    async () => {
      const empty = await createPrivate({
        ...core,
        name_ar: 'تمرين',
        alternatives: [],
      });
      const exerciseId = (
        empty[0]?.catalog_write_workspace_exercise as { exercise_id: string }
      ).exercise_id;
      const version = await db`
      select payload -> 'alternatives' as alternatives
      from public.workspace_exercise_versions
      where workspace_id = ${workspaceId} and workspace_exercise_id = ${exerciseId} and version = 1
    `;
      expect(version[0]?.alternatives).toEqual([]);
    },
  );

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
    [
      'Default Rest Time accepts 0, 90, and 600 seconds',
      'default_rest_time',
      [0, 90, 600],
    ],
    ['Default RIR accepts 0 and 5', 'default_rir', [0, 5]],
    [
      'Default Reps accepts 1, 100, and the inclusive 1-100 range',
      'default_reps',
      [1, 100, { min: 1, max: 100 }],
    ],
  ])('%s on Global create (T074)', async (_label, key, values) => {
    for (const value of values) {
      await createGlobal({ ...core, name_ar: 'تمرين', [key]: value });
    }
  });

  it.each([
    [
      'Default Rest Time rejects 7 and 601 seconds',
      'default_rest_time',
      [7, 601],
    ],
    ['Default RIR rejects 6 and 2.5', 'default_rir', [6, 2.5]],
    [
      'Default Reps rejects 0, 101, and reversed ranges',
      'default_reps',
      [0, 101, { min: 12, max: 5 }],
    ],
  ])('%s on Global create (T074)', async (_label, key, values) => {
    for (const value of values) {
      await expect(
        createGlobal({ ...core, name_ar: 'تمرين', [key]: value }),
      ).rejects.toBeDefined();
    }
  });

  it.fails.each([
    [
      'Default Rest Time accepts 0, 90, and 600 seconds',
      'default_rest_time',
      [0, 90, 600],
    ],
    ['Default RIR accepts 0 and 5', 'default_rir', [0, 5]],
    [
      'Default Reps accepts 1, 100, and the inclusive 1-100 range',
      'default_reps',
      [1, 100, { min: 1, max: 100 }],
    ],
  ])('%s on workspace-private create (T075)', async (_label, key, values) => {
    for (const value of values) {
      await createPrivate({ ...core, name_ar: 'تمرين', [key]: value });
    }
  });

  it.each([
    [
      'Default Rest Time rejects 7 and 601 seconds',
      'default_rest_time',
      [7, 601],
    ],
    ['Default RIR rejects 6 and 2.5', 'default_rir', [6, 2.5]],
    [
      'Default Reps rejects 0, 101, and reversed ranges',
      'default_reps',
      [0, 101, { min: 12, max: 5 }],
    ],
  ])('%s on workspace-private create (T075)', async (_label, key, values) => {
    for (const value of values) {
      await expect(
        createPrivate({ ...core, name_ar: 'تمرين', [key]: value }),
      ).rejects.toBeDefined();
    }
  });
});

describe('T037 remaining workspace and identity contracts', () => {
  it.fails(
    'inherits null for all seven optional fields on workspace edit (T047)',
    async () => {
      const initial = {
        ...core,
        name_ar: 'Test',
        name_en: 'Initial local name',
        description: 'Local description',
        notes: 'Local notes',
        video_url: 'https://youtu.be/abcdefghijk',
        default_rest_time: 90,
        default_rir: 2,
        default_reps: { min: 8, max: 12 },
      };
      const created = await createPrivate(initial);
      const id = (
        created[0]?.catalog_write_workspace_exercise as { exercise_id: string }
      ).exercise_id;
      const update = {
        ...initial,
        name_en: null,
        description: null,
        notes: null,
        video_url: null,
        default_rest_time: null,
        default_rir: null,
        default_reps: null,
      };
      await asActor(
        trainerId,
        (tx) =>
          tx`select public.catalog_write_workspace_exercise(${workspaceId}, ${id}, 1, ${randomUUID()}, ${tx.json(update)})`,
      );
      const [row] = await db`
      select payload from public.workspace_exercise_versions
      where workspace_id = ${workspaceId} and workspace_exercise_id = ${id} and version = 2
    `;
      expect(row?.payload).toMatchObject({
        name_en: 'Initial local name',
        description: 'Local description',
        notes: 'Local notes',
        video_url: 'https://youtu.be/abcdefghijk',
        default_rest_time: 90,
        default_rir: 2,
        default_reps: { min: 8, max: 12 },
      });
    },
  );

  it('rejects four and duplicate Alternatives on both write paths (T048)', async () => {
    const globalTargets = await Promise.all(
      [1, 2, 3, 4].map(async (n) => {
        const result = await createGlobal({
          ...core,
          name_ar: 'Test',
          name_en: `Alternative target ${n}`,
        });
        return (result[0]?.catalog_create_exercise as { exercise_id: string })
          .exercise_id;
      }),
    );
    const privateTarget = await createPrivate({
      ...core,
      name_ar: 'Test',
      name_en: 'Private alternative target',
    });
    const privateId = (
      privateTarget[0]?.catalog_write_workspace_exercise as {
        exercise_id: string;
      }
    ).exercise_id;
    await expect(
      createGlobal({ ...core, name_ar: 'Test', alternatives: globalTargets }),
    ).rejects.toBeDefined();
    await expect(
      createPrivate({
        ...core,
        name_ar: 'Test',
        alternatives: [...globalTargets.slice(0, 3), privateId],
      }),
    ).rejects.toBeDefined();
    await expect(
      createGlobal({
        ...core,
        name_ar: 'Test',
        alternatives: [globalTargets[0]!, globalTargets[0]!],
      }),
    ).rejects.toBeDefined();
    await expect(
      createPrivate({
        ...core,
        name_ar: 'Test',
        alternatives: [privateId, privateId],
      }),
    ).rejects.toBeDefined();
  });

  it.fails(
    'allows exactly three unique Global alternatives on each write path (T048)',
    async () => {
      const targets = await Promise.all(
        [1, 2, 3].map(async (n) => {
          const result = await createGlobal({
            ...core,
            name_ar: 'Test',
            name_en: `Alternative target ${n}`,
          });
          return (result[0]?.catalog_create_exercise as { exercise_id: string })
            .exercise_id;
        }),
      );
      const global = await createGlobal({
        ...core,
        name_ar: 'Test',
        alternatives: targets,
      });
      expect(global[0]?.catalog_create_exercise).toBeDefined();
      const local = await createPrivate({
        ...core,
        name_ar: 'Test',
        alternatives: targets,
      });
      expect(local[0]?.catalog_write_workspace_exercise).toBeDefined();
    },
  );

  it('denies non-PO Global edits to both WO and Trainer (T037)', async () => {
    const created = await createGlobal({
      ...core,
      name_ar: 'Test',
      name_en: 'PO owned edit target',
    });
    const id = (created[0]?.catalog_create_exercise as { exercise_id: string })
      .exercise_id;
    const version = { ...core, name_en: 'Unauthorized edit' };
    for (const roleId of [trainerId]) {
      await expect(
        asActor(
          roleId,
          (tx) =>
            tx`select public.catalog_version_exercise(${id}, 1, ${randomUUID()}, ${tx.json(version)})`,
        ),
      ).rejects.toMatchObject({ code: '42501' });
    }
    const workspaceOwner = (await twoWorkspaceFixture()).woA.userId;
    await expect(
      asActor(
        workspaceOwner,
        (tx) =>
          tx`select public.catalog_version_exercise(${id}, 1, ${randomUUID()}, ${tx.json(version)})`,
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('denies foreign workspace reads and writes (T037)', async () => {
    const fixture = await twoWorkspaceFixture();
    const foreign = await asActor(
      fixture.trainerB.userId,
      (tx) =>
        tx`select public.catalog_write_workspace_exercise(${fixture.wsB.id}, null, null, ${randomUUID()}, ${tx.json({ ...core, name_ar: 'Foreign exercise' })})`,
    );
    const foreignId = (
      foreign[0]?.catalog_write_workspace_exercise as { exercise_id: string }
    ).exercise_id;
    await expect(
      asActor(
        trainerId,
        (tx) => tx`
      select * from public.workspace_exercises where workspace_id = ${fixture.wsB.id} and id = ${foreignId}
    `,
      ),
    ).resolves.toHaveLength(0);
    await expect(
      asActor(
        trainerId,
        (tx) =>
          tx`select public.catalog_write_workspace_exercise(${fixture.wsB.id}, ${foreignId}, 1, ${randomUUID()}, ${tx.json(core)})`,
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it.fails(
    'makes a new Global exercise visible without replacing a workspace edit (T049)',
    async () => {
      const global = await createGlobal({
        ...core,
        name_ar: 'Test',
        name_en: 'New shared default',
        default_rest_time: 90,
      });
      const globalId = (
        global[0]?.catalog_create_exercise as { exercise_id: string }
      ).exercise_id;
      const local = await asActor(
        trainerId,
        (tx) =>
          tx`select public.catalog_write_workspace_exercise(${workspaceId}, ${globalId}, null, ${randomUUID()}, ${tx.json({ name_en: 'Workspace name' })})`,
      );
      const localResult = local[0]?.catalog_write_workspace_exercise as {
        exercise_id: string;
      };
      const resolved = await db`
      select e.id, e.current_version, wv.payload ->> 'name_en' as local_name
      from public.exercises e
      left join public.workspace_exercise_versions wv
        on wv.workspace_id = ${workspaceId} and wv.workspace_exercise_id = ${localResult.exercise_id}
      where e.id = ${globalId}
    `;
      expect(resolved).toHaveLength(1);
      expect(resolved[0]?.local_name).toBe('Workspace name');
    },
  );

  it.fails(
    'copies Global defaults into editable planner entries (T056; planner surface absent)',
    async () => {
      throw new Error(
        'No planner entry implementation exists in this repository; tracked by tasks.md T056.',
      );
    },
  );

  it.fails(
    'T054/T062 cutover deletes legacy rows and never merges Instructions into Notes',
    async () => {
      const files = await readdir(join(process.cwd(), 'supabase/migrations'));
      const candidates = files.filter((name) =>
        /exercise.*cutover|catalog.*cutover/i.test(name),
      );
      expect(candidates.length).toBeGreaterThan(0);
      const sources = await Promise.all(
        candidates.map((name) =>
          readFile(join(process.cwd(), 'supabase/migrations', name), 'utf8'),
        ),
      );
      const source = sources.join('\n');
      expect(source).toMatch(
        /delete\s+from\s+(?:public\.)?exercise_variations/i,
      );
      expect(source).toMatch(
        /delete\s+from\s+(?:public\.)?exercise_variation_versions/i,
      );
      expect(source).not.toMatch(
        /instructions_(?:ar|en)[\s\S]{0,200}notes|notes[\s\S]{0,200}instructions_(?:ar|en)/i,
      );
    },
  );
});
