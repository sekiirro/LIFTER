import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { sql, twoWorkspaceFixture } from './harness';
import { toExerciseSnapshotV2 } from '../../lib/catalog/snapshot';

const db = sql();
type Tx = postgres.TransactionSql;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
let poId: string;
let workspaceOwnerId: string;
let trainerId: string;
let workspaceId: string;
let foreignWorkspaceId: string;

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  poId = fixture.po.userId;
  workspaceOwnerId = fixture.woA.userId;
  trainerId = fixture.trainerA.userId;
  workspaceId = fixture.wsA.id;
  foreignWorkspaceId = fixture.wsB.id;
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
  it('accepts an English-only Global exercise with required taxonomy (T074)', async () => {
    const result = await createGlobal(core);
    expect(result[0]?.catalog_create_exercise).toMatchObject({ version: 1 });
  });

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

  it('accepts an English-only workspace-private exercise with required taxonomy (T075)', async () => {
    const result = await createPrivate(core);
    expect(result[0]?.catalog_write_workspace_exercise).toMatchObject({
      version: 1,
      workspace_id: workspaceId,
    });
  });

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

  it('T045 stores private exercise video only in the owning workspace version', async () => {
    const videoUrl = 'https://youtu.be/abcdefghijk';
    const result = await createPrivate({
      ...core,
      name_ar: 'ØªÙ…Ø±ÙŠÙ† Ø®Ø§Øµ',
      video_url: videoUrl,
    });
    const exerciseId = (
      result[0]?.catalog_write_workspace_exercise as { exercise_id: string }
    ).exercise_id;
    const [version] = await db`
      select workspace_id, payload ->> 'video_url' as video_url
      from public.workspace_exercise_versions
      where workspace_exercise_id = ${exerciseId} and version = 1
    `;
    expect(version).toEqual({ workspace_id: workspaceId, video_url: videoUrl });
    await expect(
      db`select exercise_id from public.exercise_versions where exercise_id = ${exerciseId}`,
    ).resolves.toHaveLength(0);
  });

  it('T045 rejects a private video write for a foreign workspace', async () => {
    await expect(
      asActor(
        trainerId,
        (tx) =>
          tx`select public.catalog_write_workspace_exercise(${foreignWorkspaceId}, null, null, ${randomUUID()}, ${tx.json(
            {
              ...core,
              name_ar: 'ØªÙ…Ø±ÙŠÙ† Ø®Ø§Øµ',
              video_url: 'https://youtu.be/abcdefghijk',
            },
          )})`,
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('T045 applies the canonical video validator to private exercise writes', async () => {
    await expect(
      createPrivate({
        ...core,
        name_ar: 'ØªÙ…Ø±ÙŠÙ† Ø®Ø§Øµ',
        video_url: 'https://vimeo.com/123456789',
      }),
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
  const contractIt =
    field === 'Name' ||
    field === 'Description' ||
    task === 'T043' ||
    task === 'T074'
      ? it
      : it.fails;
  const privateContractIt =
    field === 'Name' ||
    field === 'Description' ||
    task === 'T043' ||
    task === 'T074'
      ? it
      : it.fails;
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

  it(`rejects a malformed or disallowed ${field} value on the Global write path (${field === 'Video' ? 'T061' : task})`, async () => {
    await expect(
      createGlobal({ ...core, name_ar: 'تمرين', [key]: invalid }),
    ).rejects.toBeDefined();
  });

  if (field === 'Video') {
    it('T043 rejects a disallowed Vimeo video URL', async () => {
      await expect(
        createGlobal({
          ...core,
          name_ar: 'تمرين',
          video_url: 'https://vimeo.com/123456789',
        }),
      ).rejects.toBeDefined();
    });
  }

  it('T043 appends canonical video changes as immutable versions and audits video', async () => {
    const firstUrl = 'https://youtu.be/abcdefghijk';
    const secondUrl = 'https://www.youtube.com/watch?v=abcdefghijk';
    const created = await createGlobal({
      ...core,
      name_ar: 'تمرين',
      video_url: firstUrl,
    });
    const exerciseId = (
      created[0]?.catalog_create_exercise as { exercise_id: string }
    ).exercise_id;
    const versioned = await asActor(
      poId,
      (tx) => tx`
      select public.catalog_version_exercise(${exerciseId}, 1, ${randomUUID()},
        ${tx.json({ ...core, name_ar: 'تمرين', video_url: secondUrl })})
    `,
    );
    expect(versioned[0]?.catalog_version_exercise).toEqual({
      exercise_id: exerciseId,
      version: 2,
    });
    const rows = await db`
      select version, payload ->> 'video_url' as video_url from public.exercise_versions
      where exercise_id = ${exerciseId} order by version
    `;
    expect(rows).toEqual([
      { version: 1, video_url: firstUrl },
      { version: 2, video_url: secondUrl },
    ]);
    const detail = await asActor(
      poId,
      (tx) => tx`
      select * from public.catalog_exercise_detail(${exerciseId})
    `,
    );
    expect(detail).toHaveLength(1);
    expect(detail[0]?.version).toBe(2);
    expect(detail[0]?.payload).toMatchObject({ video_url: secondUrl });
    const audit = await db`
      select details -> 'changed_fields' as changed_fields from public.audit_events
      where action = 'catalog.exercise_versioned' and target_id = ${exerciseId}
      order by id desc limit 1
    `;
    expect(audit[0]?.changed_fields).toContain('video');
  });

  privateContractIt(
    `${field}: stores an allowed private value (T075)`,
    async () => {
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
    },
  );

  it(`rejects a malformed or disallowed ${field} value on the private write path (${field === 'Video' ? 'T061' : 'T075'})`, async () => {
    await expect(
      createPrivate({ ...core, name_ar: 'تمرين', [key]: invalid }),
    ).rejects.toBeDefined();
  });
});

describe('T044 canonical Description storage and freeze', () => {
  it('stores one optional-language Description in each immutable canonical version (T044)', async () => {
    const first = 'شرح باللغة العربية فقط';
    const second = 'Updated English description';
    const created = await createGlobal({
      ...core,
      name_ar: 'تمرين',
      description: first,
    });
    const exerciseId = (
      created[0]?.catalog_create_exercise as { exercise_id: string }
    ).exercise_id;

    await asActor(
      poId,
      (tx) =>
        tx`select public.catalog_version_exercise(${exerciseId}, 1, ${randomUUID()}, ${tx.json({ ...core, name_ar: 'تمرين', description: second })})`,
    );

    const versions = await db`
      select version, payload ->> 'description' as description
      from public.exercise_versions where exercise_id = ${exerciseId}
      order by version
    `;
    expect(versions).toEqual([
      { version: 1, description: first },
      { version: 2, description: second },
    ]);
    const detail = await asActor(
      poId,
      (tx) => tx`select * from public.catalog_exercise_detail(${exerciseId})`,
    );
    expect(detail[0]?.payload).toMatchObject({ description: second });
  });

  it('rejects a second localized Description field (T044)', async () => {
    await expect(
      createGlobal({
        ...core,
        name_ar: 'تمرين',
        description: 'One value',
        description_en: 'Second value',
      }),
    ).rejects.toBeDefined();
    await expect(
      createGlobal({
        ...core,
        name_ar: 'تمرين',
        description: 'One value',
        description_ar: 'قيمة ثانية',
      }),
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

  it('accepts a Global Description at the 2000-character cap (T074)', async () => {
    const result = await createGlobal({
      ...core,
      name_ar: 'تمرين',
      description: 'x'.repeat(2000),
    });
    expect(result[0]?.catalog_create_exercise).toBeDefined();
  });

  it('rejects a Global Description above 2000 characters (T074)', async () => {
    await expect(
      createGlobal({
        ...core,
        name_ar: 'تمرين',
        description: 'x'.repeat(2001),
      }),
    ).rejects.toMatchObject({
      code: '22023',
      message: 'catalog_exercise_invalid',
    });
  });

  it('rejects a Global exercise as its own Alternative (T074)', async () => {
    const created = await createGlobal({ ...core, name_ar: 'تمرين' });
    const exerciseId = (
      created[0]?.catalog_create_exercise as { exercise_id: string }
    ).exercise_id;
    await expect(
      asActor(
        poId,
        (tx) =>
          tx`select public.catalog_version_exercise(${exerciseId}, 1, ${randomUUID()}, ${tx.json(
            {
              ...core,
              name_ar: 'تمرين',
              alternatives: [exerciseId],
            },
          )})`,
      ),
    ).rejects.toMatchObject({
      code: '22023',
      message: 'catalog_exercise_alternatives_invalid',
    });
  });

  it('rejects a workspace-private target in Global Alternatives (T074)', async () => {
    const privateResult = await createPrivate({
      ...core,
      name_ar: 'تمرين خاص',
    });
    const privateId = (
      privateResult[0]?.catalog_write_workspace_exercise as {
        exercise_id: string;
      }
    ).exercise_id;
    await expect(
      createGlobal({ ...core, name_ar: 'تمرين', alternatives: [privateId] }),
    ).rejects.toMatchObject({
      code: '22023',
      message: 'catalog_exercise_alternatives_invalid',
    });
  });

  it('stores canonical Notes and Defaults and audits the eight-field contract (T074)', async () => {
    const result = await createGlobal({
      ...core,
      name_ar: 'تمرين',
      notes: 'Canonical coaching note',
      default_rest_time: 90,
      default_rir: 2,
      default_reps: { min: 8, max: 12 },
    });
    const exerciseId = (
      result[0]?.catalog_create_exercise as { exercise_id: string }
    ).exercise_id;
    const [version] = await db`
      select notes, default_rest_time, default_rir, default_reps
      from public.exercise_versions where exercise_id = ${exerciseId} and version = 1
    `;
    expect(version).toEqual({
      notes: 'Canonical coaching note',
      default_rest_time: 90,
      default_rir: 2,
      default_reps: { min: 8, max: 12 },
    });
    const [audit] = await db`
      select details -> 'changed_fields' as changed_fields
      from public.audit_events
      where target_table = 'exercises' and target_id = ${exerciseId}
        and action = 'catalog.exercise_created'
    `;
    expect(audit?.changed_fields).toEqual([
      'name',
      'description',
      'notes',
      'video',
      'alternatives',
      'default_rest_time',
      'default_rir',
      'default_reps',
    ]);
  });

  it('stores valid Global Alternatives as normalized child rows (T074)', async () => {
    const targets = await Promise.all(
      [1, 2, 3].map(async (n) => {
        const result = await createGlobal({
          ...core,
          name_ar: 'تمرين',
          name_en: `T074 canonical Alternative ${n}`,
        });
        return (result[0]?.catalog_create_exercise as { exercise_id: string })
          .exercise_id;
      }),
    );
    const result = await createGlobal({
      ...core,
      name_ar: 'تمرين',
      alternatives: targets,
    });
    const exerciseId = (
      result[0]?.catalog_create_exercise as { exercise_id: string }
    ).exercise_id;
    const alternatives = await db`
      select position, global_exercise_id from public.exercise_version_alternatives
      where exercise_id = ${exerciseId} and version = 1 order by position
    `;
    expect(alternatives).toEqual(
      targets.map((global_exercise_id, index) => ({
        position: index + 1,
        global_exercise_id,
      })),
    );
  });

  it('T074 validator and self-target mutants break their contract assertions', async () => {
    const globalTargets = await Promise.all(
      [1, 2, 3, 4].map(async (n) => {
        const result = await createGlobal({
          ...core,
          name_ar: 'تمرين',
          name_en: `T074 mutation target ${n}`,
        });
        return (result[0]?.catalog_create_exercise as { exercise_id: string })
          .exercise_id;
      }),
    );
    const privateResult = await createPrivate({
      ...core,
      name_ar: 'تمرين خاص',
      name_en: 'T074 mutation private target',
    });
    const privateId = (
      privateResult[0]?.catalog_write_workspace_exercise as {
        exercise_id: string;
      }
    ).exercise_id;
    const parentResult = await createGlobal({ ...core, name_ar: 'تمرين' });
    const parentId = (
      parentResult[0]?.catalog_create_exercise as { exercise_id: string }
    ).exercise_id;
    const validatorSignature = 'app_private.validate_exercise_payload(jsonb)';
    const cases = [
      {
        label: 'Description maximum',
        needle: "char_length(p_request ->> 'description') > 2000",
        replacement: 'false',
        payload: { ...core, name_ar: 'تمرين', description: 'x'.repeat(2001) },
        message: 'catalog_exercise_invalid',
      },
      {
        label: 'Alternatives maximum',
        needle: "jsonb_array_length(p_request -> 'alternatives') > 3",
        replacement: 'false',
        payload: { ...core, name_ar: 'تمرين', alternatives: globalTargets },
        message: 'catalog_exercise_alternatives_invalid',
      },
      {
        label: 'Alternatives uniqueness',
        needle: "count(*) <> count(distinct value #>> '{}')",
        replacement: 'false',
        payload: {
          ...core,
          name_ar: 'تمرين',
          alternatives: [globalTargets[0]!, globalTargets[0]!],
        },
        message: 'catalog_exercise_alternatives_invalid',
      },
      {
        label: 'Global target scope',
        needle: "where e.id is null or e.lifecycle_state <> 'active'",
        replacement: "where e.lifecycle_state <> 'active'",
        payload: { ...core, name_ar: 'تمرين', alternatives: [privateId] },
        message: 'catalog_exercise_alternatives_invalid',
      },
      {
        label: 'Rest Time step',
        needle: "(p_request ->> 'default_rest_time')::integer % 15 <> 0",
        replacement: 'false',
        payload: { ...core, name_ar: 'تمرين', default_rest_time: 7 },
        message: 'catalog_exercise_invalid',
      },
      {
        label: 'RIR range',
        needle: "(p_request ->> 'default_rir') !~ '^(0|[1-5])$'",
        replacement: 'false',
        payload: { ...core, name_ar: 'تمرين', default_rir: 6 },
        message: 'catalog_exercise_invalid',
      },
      {
        label: 'Reps range',
        needle:
          "or (p_request -> 'default_reps' ->> 'max') !~ '^([1-9]|[1-9][0-9]|100)$'",
        replacement: 'or false',
        payload: {
          ...core,
          name_ar: 'تمرين',
          default_reps: { min: 8, max: 101 },
        },
        message: 'catalog_exercise_invalid',
      },
    ];

    for (const testCase of cases) {
      const marker = `rollback_t074_${testCase.label.replaceAll(' ', '_')}`;
      try {
        await db.begin(async (tx) => {
          const [current] = await tx`
            select pg_get_functiondef(${validatorSignature}::regprocedure) as definition
          `;
          const definition = current?.definition as string;
          if (!definition.includes(testCase.needle))
            throw new Error(`T074 mutation target missing: ${testCase.label}`);
          await tx.unsafe(
            definition.replace(testCase.needle, testCase.replacement),
          );
          let assertionFailure: unknown;
          try {
            await expect(
              tx`select app_private.validate_exercise_payload(${tx.json(testCase.payload)})`,
            ).rejects.toMatchObject({
              code: '22023',
              message: testCase.message,
            });
          } catch (error) {
            assertionFailure = error;
          }
          expect(
            assertionFailure,
            `${testCase.label} mutation must break rejection`,
          ).toBeDefined();
          throw new Error(marker);
        });
      } catch (error) {
        expect((error as Error).message).toBe(marker);
      }
    }

    const selfMarker = 'rollback_t074_self_alternative';
    try {
      await db.begin(async (tx) => {
        const [current] = await tx`
          select pg_get_functiondef('public.catalog_version_exercise(uuid,integer,uuid,jsonb)'::regprocedure) as definition
        `;
        const definition = current?.definition as string;
        const needle = 'where a.target_id = p_exercise_id::text';
        if (!definition.includes(needle))
          throw new Error('T074 self-target mutation target missing');
        await tx.unsafe(definition.replace(needle, 'where false'));
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: poId, role: 'authenticated' })}, true)`;
        let assertionFailure: unknown;
        try {
          await expect(
            tx`select public.catalog_version_exercise(${parentId}, 1, ${randomUUID()}, ${tx.json(
              {
                ...core,
                name_ar: 'تمرين',
                alternatives: [parentId],
              },
            )})`,
          ).rejects.toMatchObject({
            code: '22023',
            message: 'catalog_exercise_alternatives_invalid',
          });
        } catch (error) {
          assertionFailure = error;
        }
        expect(
          assertionFailure,
          'self-Alternative mutation must break rejection',
        ).toBeDefined();
        throw new Error(selfMarker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(selfMarker);
    }
  });

  it('keeps an empty Alternatives list distinct from null/inherit (T047/T048)', async () => {
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

  it.each([
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

  it.each([
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
    ).rejects.toMatchObject({
      code: '22023',
      message: 'catalog_exercise_alternatives_invalid',
    });
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
    ).rejects.toMatchObject({
      code: '22023',
      message: 'catalog_exercise_alternatives_invalid',
    });
    await expect(
      createPrivate({
        ...core,
        name_ar: 'Test',
        alternatives: [privateId, privateId],
      }),
    ).rejects.toBeDefined();
  });

  it('allows exactly three unique Global alternatives (T074)', async () => {
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
  });

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

  it('makes a new Global exercise visible without replacing a workspace edit (T049)', async () => {
    const global = await createGlobal({
      ...core,
      name_ar: 'Test',
      name_en: 'New shared default',
    });
    const globalId = (
      global[0]?.catalog_create_exercise as { exercise_id: string }
    ).exercise_id;
    await asActor(
      trainerId,
      (tx) =>
        tx`select public.catalog_write_exercise_override(${workspaceId}, ${globalId}, 0, ${randomUUID()}, ${tx.json({ name_en: 'Workspace name' })})`,
    );
    const [workspace] = await asActor(
      trainerId,
      (tx) => tx`select result_id, result_payload
        from public.catalog_search('exercise', 'New shared default', '{}'::jsonb, null, ${workspaceId})
        where result_id = ${globalId}`,
    );
    expect(workspace?.result_id).toBe(globalId);
    expect(workspace?.result_payload.effective_fields.name).toEqual({
      value: { name_en: 'Workspace name', name_ar: null },
      source: 'override',
    });
    const [canonical] = await asActor(
      poId,
      (tx) => tx`select result_payload
        from public.catalog_search('exercise', 'New shared default', '{}'::jsonb, null, null)
        where result_id = ${globalId}`,
    );
    expect(canonical?.result_payload.name_en).toBe('New shared default');
  });

  it('captures copied Global defaults and trainer edits in planner entries (T056)', async () => {
    const globalDefaults = {
      restSeconds: 90,
      rir: 2,
      reps: { kind: 'range' as const, min: 8, max: 12 },
    };
    const editableDefaults = structuredClone(globalDefaults);
    editableDefaults.restSeconds = 75;
    const published = toExerciseSnapshotV2({
      source: 'global',
      exerciseId: 'ex-global-defaults',
      canonicalVersion: 1,
      overrideVersion: null,
      plannerEntry: {
        name: { en: 'Planner entry', ar: 'مدخل الخطة' },
        alternatives: [],
        defaults: editableDefaults,
      },
      currentLibrary: { defaults: { restSeconds: 120, rir: 4 } },
    });
    expect(published.defaults).toEqual({
      restSeconds: 75,
      rir: 2,
      reps: { kind: 'range', min: 8, max: 12 },
    });
  });

  it('keeps published exercise alternatives frozen in V2 after later library changes (T050/T056)', async () => {
    const plannerAlternatives = [{ globalExerciseId: 'ex-removed' }];
    const published = toExerciseSnapshotV2({
      source: 'global',
      exerciseId: 'ex-1',
      canonicalVersion: 3,
      overrideVersion: null,
      plannerEntry: {
        name: { en: 'Planner entry' },
        alternatives: plannerAlternatives,
      },
    });
    plannerAlternatives.splice(0, 1, { globalExerciseId: 'ex-survivor' });
    expect(published.alternatives).toEqual([
      { globalExerciseId: 'ex-removed' },
    ]);
  });

  it('T054/T062 cutover deletes legacy and pre-F16 records, preserving audit events', async () => {
    const files = await readdir(join(process.cwd(), 'supabase/migrations'));
    const candidates = files.filter((name) =>
      /^\d+_catalog_exercise_cutover\.sql$/i.test(name),
    );
    expect(candidates).toHaveLength(1);
    const source = await readFile(
      join(process.cwd(), 'supabase/migrations', candidates[0]!),
      'utf8',
    );
    for (const table of [
      'exercise_variations',
      'exercise_variation_versions',
      'exercise_lifecycle_events',
      'workspace_exercise_lifecycle_events',
      'exercise_versions',
      'workspace_exercise_versions',
      'exercise_overrides',
      'exercise_override_versions',
      'exercise_version_alternatives',
      'workspace_exercise_version_alternatives',
      'exercise_override_alternatives',
      'workspace_exercises',
      'exercises',
    ]) {
      expect(source).toMatch(
        new RegExp(`delete\\s+from\\s+(?:public\\.)?${table}\\b`, 'i'),
      );
    }
    expect(source).toMatch(
      /delete\s+from\s+(?:public\.)?exercise_lifecycle_events[\s\S]*?delete\s+from\s+(?:public\.)?exercises/i,
    );
    expect(source).toMatch(
      /delete\s+from\s+(?:public\.)?workspace_exercise_lifecycle_events[\s\S]*?delete\s+from\s+(?:public\.)?workspace_exercises/i,
    );
    expect(source).not.toMatch(/delete\s+from\s+(?:public\.)?audit_events/i);
    expect(source).not.toMatch(
      /instructions_(?:ar|en)[\s\S]{0,200}notes|notes[\s\S]{0,200}instructions_(?:ar|en)/i,
    );
  });

  it('T054 leaves the lifecycle append-only guard armed after its scoped cutover bypass', async () => {
    const files = await readdir(join(process.cwd(), 'supabase/migrations'));
    const migration = files.find((name) =>
      /^\d+_catalog_exercise_cutover\.sql$/i.test(name),
    );
    expect(migration).toBeDefined();
    const source = await readFile(
      join(process.cwd(), 'supabase/migrations', migration!),
      'utf8',
    );
    expect(source).toMatch(
      /disable\s+trigger\s+exercise_lifecycle_events_append_only[\s\S]*?enable\s+trigger\s+exercise_lifecycle_events_append_only/i,
    );
    expect(source).toMatch(
      /disable\s+trigger\s+workspace_exercise_lifecycle_events_append_only[\s\S]*?enable\s+trigger\s+workspace_exercise_lifecycle_events_append_only/i,
    );
  });

  it('T054 deletes legacy rows whether or not Instructions fields exist', async () => {
    const files = await readdir(join(process.cwd(), 'supabase/migrations'));
    const migration = files.find((name) =>
      /^\d+_catalog_exercise_cutover\.sql$/i.test(name),
    );
    expect(migration).toBeDefined();
    const source = await readFile(
      join(process.cwd(), 'supabase/migrations', migration!),
      'utf8',
    );
    const legacyDelete =
      source.match(
        /delete\s+from\s+(?:public\.)?exercise_variations[\s\S]*?;/i,
      )?.[0] ?? '';
    expect(legacyDelete).not.toMatch(/instructions_(?:ar|en)/i);
    expect(source).toMatch(
      /delete\s+from\s+(?:public\.)?exercise_variation_versions/i,
    );
  });

  it('T054 removes pre-F16 global and workspace-private video and snapshot references', async () => {
    const files = await readdir(join(process.cwd(), 'supabase/migrations'));
    const migration = files.find((name) =>
      /^\d+_catalog_exercise_cutover\.sql$/i.test(name),
    );
    expect(migration).toBeDefined();
    const source = await readFile(
      join(process.cwd(), 'supabase/migrations', migration!),
      'utf8',
    );
    expect(source).toMatch(/delete\s+from\s+(?:public\.)?exercise_versions/i);
    expect(source).toMatch(
      /delete\s+from\s+(?:public\.)?workspace_exercise_versions/i,
    );
    expect(source).toMatch(/snapshot/i);
    expect(source).toMatch(/docs\.google\.com/i);
  });

  it('T054 retires legacy variation writes and resolves variation consumers through F16 overrides', async () => {
    const files = await readdir(join(process.cwd(), 'supabase/migrations'));
    const migration = files.find((name) =>
      /^\d+_catalog_exercise_cutover\.sql$/i.test(name),
    );
    expect(migration).toBeDefined();
    const source = await readFile(
      join(process.cwd(), 'supabase/migrations', migration!),
      'utf8',
    );
    expect(source).toMatch(
      /catalog_write_variation[\s\S]*?(?:not_permitted|retired)/i,
    );
    expect(source).not.toMatch(
      /from\s+public\.exercise_variations\s+e\s+join\s+public\.exercise_variation_versions/i,
    );
    const server = await readFile(
      join(process.cwd(), 'lib/catalog/server.ts'),
      'utf8',
    );
    expect(server).not.toMatch(/writeVariation:\s*'catalog_write_variation'/);
    expect(server).not.toMatch(
      /transitionVariation:\s*'catalog_transition_variation'/,
    );
    expect(server).toMatch(/catalog_write_exercise_override/);
    expect(server).toMatch(/catalog_remove_workspace_exercise/);
  });

  it('T054 removes legacy and pre-F16 records, lifecycle chains, and videos while preserving audit events', async () => {
    const legacyExercise = randomUUID();
    const mergeSource = randomUUID();
    const mergeMiddle = randomUUID();
    const mergeTarget = randomUUID();
    const privateExercise = randomUUID();
    const auditBefore =
      await db`select count(*)::integer as count from public.audit_events`;
    await db.begin(async (tx) => {
      await tx`set constraints all deferred`;
      await tx`insert into public.exercises (id, created_by, lifecycle_state, current_version, lifecycle_revision, superseded_by)
        values
          (${legacyExercise}, ${poId}, 'active', 1, 0, null),
          (${mergeSource}, ${poId}, 'merged', 1, 3, ${mergeMiddle}),
          (${mergeMiddle}, ${poId}, 'merged', 1, 1, ${mergeTarget}),
          (${mergeTarget}, ${poId}, 'active', 1, 0, null)`;
      for (const exerciseId of [
        legacyExercise,
        mergeSource,
        mergeMiddle,
        mergeTarget,
      ]) {
        await tx`insert into public.exercise_versions (exercise_id, version, payload, created_by)
          values (${exerciseId}, 1, ${tx.json({ name_en: 'cutover fixture', video_url: 'https://docs.google.com/d/fixture', instructions_en: 'legacy instruction' })}, ${poId})`;
      }
      await tx`insert into public.exercise_lifecycle_events (exercise_id, revision, lifecycle_state, actor_user_id)
        values
          (${mergeSource}, 1, 'removed', ${poId}),
          (${mergeSource}, 2, 'active', ${poId}),
          (${mergeSource}, 3, 'merged', ${poId}),
          (${mergeMiddle}, 1, 'merged', ${poId})`;
      await tx`insert into public.workspace_exercises (workspace_id, id, created_by, lifecycle_state, current_version, lifecycle_revision)
        values (${workspaceId}, ${privateExercise}, ${trainerId}, 'removed', 1, 1)`;
      await tx`insert into public.workspace_exercise_versions (workspace_id, workspace_exercise_id, version, payload, created_by)
        values (${workspaceId}, ${privateExercise}, 1, ${tx.json({ name_en: 'private cutover fixture', video_url: 'https://docs.google.com/d/private', instructions_en: 'private instruction' })}, ${trainerId})`;
      await tx`insert into public.workspace_exercise_lifecycle_events (workspace_id, workspace_exercise_id, revision, lifecycle_state, actor_user_id)
        values (${workspaceId}, ${privateExercise}, 1, 'removed', ${trainerId})`;
      await tx`insert into public.exercise_variations (workspace_id, exercise_id, created_by, lifecycle_state, current_version)
        values (${workspaceId}, ${legacyExercise}, ${trainerId}, 'removed', 1),
          (${workspaceId}, ${mergeTarget}, ${trainerId}, 'active', 1)`;
      await tx`insert into public.exercise_variation_versions (workspace_id, exercise_id, version, payload, created_by)
        values
          (${workspaceId}, ${legacyExercise}, 1, ${tx.json({ video_url: 'https://docs.google.com/d/legacy', instructions_en: 'present' })}, ${trainerId}),
          (${workspaceId}, ${mergeTarget}, 1, ${tx.json({ video_url: 'https://youtu.be/legacy-without-instructions' })}, ${trainerId})`;
      await tx`insert into public.exercise_overrides (workspace_id, exercise_id, current_version)
        values (${workspaceId}, ${legacyExercise}, 1)`;
      await tx`insert into public.exercise_override_versions (workspace_id, exercise_id, version, payload, alternatives_present, created_by)
        values (${workspaceId}, ${legacyExercise}, 1, ${tx.json({ video_url: 'https://youtu.be/override' })}, false, ${trainerId})`;
    });

    const migration = await readFile(
      join(
        process.cwd(),
        'supabase/migrations/20261111012000_catalog_exercise_cutover.sql',
      ),
      'utf8',
    );
    const [globalIdentities] = await db`
      select coalesce(jsonb_agg(id order by id), '[]'::jsonb) as value
      from public.exercises`;
    const [workspaceIdentities] = await db`
      select coalesce(
        jsonb_agg(jsonb_build_array(workspace_id, id) order by workspace_id, id),
        '[]'::jsonb
      ) as value
      from public.workspace_exercises`;
    const verifiedIdentities = JSON.stringify({
      exercises: globalIdentities!.value,
      workspace_exercises: workspaceIdentities!.value,
    });
    const gatedMigration = migration
      .replace(
        '\nbegin;\n',
        `\nset app.cutover_verified_identities = '${verifiedIdentities}';\nbegin;\n`,
      )
      .replace(
        /\ncommit;\s*$/,
        '\ncommit;\nreset app.cutover_verified_identities;\n',
      );
    expect(gatedMigration).not.toBe(migration);
    expect(gatedMigration).toContain('reset app.cutover_verified_identities;');
    await db.unsafe(gatedMigration);
    const counts = await db`
      select
        (select count(*) from public.exercise_variations)::integer as legacy_rows,
        (select count(*) from public.exercise_variation_versions)::integer as legacy_versions,
        (select count(*) from public.exercise_lifecycle_events)::integer as global_events,
        (select count(*) from public.workspace_exercise_lifecycle_events)::integer as private_events,
        (select count(*) from public.exercises)::integer as global_identities,
        (select count(*) from public.exercise_versions)::integer as global_versions,
        (select count(*) from public.workspace_exercises)::integer as private_identities,
        (select count(*) from public.workspace_exercise_versions)::integer as private_versions,
        (select count(*) from public.exercise_overrides)::integer as overrides,
        (select count(*) from public.exercise_override_versions)::integer as override_versions,
        (select count(*) from public.audit_events)::integer as audit_events,
        (select count(*) from pg_catalog.pg_trigger where tgname in
          ('exercise_lifecycle_events_append_only','workspace_exercise_lifecycle_events_append_only') and tgenabled = 'O')::integer as active_event_guards`;
    expect(counts[0]).toEqual({
      legacy_rows: 0,
      legacy_versions: 0,
      global_events: 0,
      private_events: 0,
      global_identities: 0,
      global_versions: 0,
      private_identities: 0,
      private_versions: 0,
      overrides: 0,
      override_versions: 0,
      audit_events: auditBefore[0]!.count,
      active_event_guards: 2,
    });
    const legacyWriters = await db`
      select pg_catalog.to_regprocedure('public.catalog_write_variation(uuid,uuid,integer,uuid,jsonb)') as write,
        pg_catalog.to_regprocedure('public.catalog_transition_variation(uuid,uuid,integer,text,uuid)') as transition`;
    expect(legacyWriters[0]).toEqual({ write: null, transition: null });

    // This test applies the pushed cutover migration directly; replay the
    // later forward fixes so subsequent tests see the current RPC behavior.
    const securityFix = await readFile(
      join(
        process.cwd(),
        'supabase/migrations/20261111015400_catalog_search_invoker_security.sql',
      ),
      'utf8',
    );
    await db.unsafe(securityFix);
    const searchBehaviorFix = await readFile(
      join(
        process.cwd(),
        'supabase/migrations/20261111205300_catalog_search_effective_names_and_variation_pagination.sql',
      ),
      'utf8',
    );
    await db.unsafe(searchBehaviorFix);
    const [searchSecurity] = await db`
      select prosecdef from pg_catalog.pg_proc
      where oid = 'public.catalog_search(text,text,jsonb,text,uuid)'::regprocedure
    `;
    expect(searchSecurity?.prosecdef).toBe(false);
  });
});
