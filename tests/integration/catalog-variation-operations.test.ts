import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
const concurrentDb = postgres(process.env.DB_URL!, {
  max: 2,
  connect_timeout: 10,
});
let po: Awaited<ReturnType<typeof twoWorkspaceFixture>>['po'];
let trainerA: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerA'];
let wsA: string;
let wsB: string;

async function asActor<T>(
  actorId: string,
  body: (tx: postgres.TransactionSql) => Promise<T>,
) {
  return concurrentDb.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
    return body(tx);
  });
}

async function createExercise() {
  const id = randomUUID();
  await db.begin(async (tx) => {
    await tx`insert into public.exercises(id, created_by, current_version) values (${id}, ${po.userId}, 1)`;
    await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
      values (${id}, 1, ${tx.json({ name_ar: 'تمرين', name_en: 'Exercise' })}, ${po.userId})`;
  });
  return id;
}

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  po = fixture.po;
  trainerA = fixture.trainerA;
  wsA = fixture.wsA.id;
  wsB = fixture.wsB.id;
});

afterAll(async () => Promise.all([db.end(), concurrentDb.end()]));

describe('workspace exercise variation RPC', () => {
  it('binds mappings to the selected workspace and validates only HTTPS YouTube/Drive URLs', async () => {
    const exerciseId = await createExercise();
    const request = {
      video_url: 'https://youtu.be/abcdefghijk',
      note: 'workspace note',
    };
    await expect(
      asActor(
        trainerA.userId,
        (tx) =>
          tx`select public.catalog_write_variation(${wsB}, ${exerciseId}, null, ${randomUUID()}, ${tx.json(request)})`,
      ),
    ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
    const created = await asActor(
      trainerA.userId,
      (tx) =>
        tx`select public.catalog_write_variation(${wsA}, ${exerciseId}, null, ${randomUUID()}, ${tx.json(request)})`,
    );
    expect(
      (created[0]?.catalog_write_variation as { workspace_id: string })
        .workspace_id,
    ).toBe(wsA);
    await expect(
      db`select payload ->> 'video_url' as video from public.exercise_versions where exercise_id = ${exerciseId}`,
    ).resolves.toEqual([{ video: null }]);
    await expect(
      asActor(
        trainerA.userId,
        (tx) =>
          tx`select public.catalog_write_variation(${wsA}, ${exerciseId}, 1, ${randomUUID()}, ${tx.json({ video_url: 'https://youtube.com.evil.example/video' })})`,
      ),
    ).rejects.toMatchObject({
      code: '22023',
      message: 'catalog_variation_invalid',
    });
    await expect(
      asActor(
        po.userId,
        (tx) =>
          tx`select public.catalog_write_variation(${wsB}, ${exerciseId}, null, ${randomUUID()}, ${tx.json({ video_url: 'https://drive.google.com/file/d/abc' })})`,
      ),
    ).resolves.toHaveLength(1);
  });

  it('returns one identical response for concurrent variation creates and versions', async () => {
    const exerciseId = await createExercise();
    const key = randomUUID();
    const request = {
      video_url: 'https://www.youtube.com/watch?v=abcdefghijk',
    };
    const created = await Promise.all(
      [0, 1].map(() =>
        asActor(
          trainerA.userId,
          (tx) =>
            tx`select public.catalog_write_variation(${wsA}, ${exerciseId}, null, ${key}, ${tx.json(request)})`,
        ),
      ),
    );
    expect(created[0]).toEqual(created[1]);
    const versionKey = randomUUID();
    const update = { video_url: 'https://drive.google.com/file/d/updated' };
    const versioned = await Promise.all(
      [0, 1].map(() =>
        asActor(
          trainerA.userId,
          (tx) =>
            tx`select public.catalog_write_variation(${wsA}, ${exerciseId}, 1, ${versionKey}, ${tx.json(update)})`,
        ),
      ),
    );
    expect(versioned[0]).toEqual(versioned[1]);
    expect(
      (versioned[0]![0]?.catalog_write_variation as { version: number })
        .version,
    ).toBe(2);
    await expect(
      db`select count(*)::int as versions from public.exercise_variation_versions where workspace_id = ${wsA} and exercise_id = ${exerciseId}`,
    ).resolves.toEqual([{ versions: 2 }]);
    await expect(
      db`select payload ->> 'video_url' as video from public.exercise_variation_versions
        where workspace_id = ${wsA} and exercise_id = ${exerciseId} order by version`,
    ).resolves.toEqual([
      { video: request.video_url },
      { video: update.video_url },
    ]);
    const removeKey = randomUUID();
    const removed = await Promise.all(
      [0, 1].map(() =>
        asActor(
          trainerA.userId,
          (tx) =>
            tx`select public.catalog_transition_variation(${wsA}, ${exerciseId}, 2, 'remove', ${removeKey})`,
        ),
      ),
    );
    expect(removed[0]).toEqual(removed[1]);
    expect(
      await asActor(
        trainerA.userId,
        (tx) =>
          tx`select variation from public.catalog_exercise_detail(${exerciseId}, ${wsA})`,
      ),
    ).toEqual([{ variation: { workspace_id: wsA, video_url: null, source: 'none' } }]);
    const restored = await asActor(
      trainerA.userId,
      (tx) =>
        tx`select public.catalog_transition_variation(${wsA}, ${exerciseId}, 3, 'restore', ${randomUUID()})`,
    );
    expect(
      (restored[0]?.catalog_transition_variation as { lifecycle_state: string })
        .lifecycle_state,
    ).toBe('active');
    expect(
      await asActor(
        trainerA.userId,
        (tx) =>
          tx`select variation from public.catalog_exercise_detail(${exerciseId}, ${wsA})`,
      ),
    ).toEqual([
      {
        variation: { workspace_id: wsA, video_url: null, source: 'none' },
      },
    ]);
  });
});
