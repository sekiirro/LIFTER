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
      values (${id}, 1, ${tx.json({ name_en: 'Exercise' })}, ${po.userId})`;
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

describe('T054 PR #43 variation compatibility over F16 overrides', () => {
  it('keeps workspace exercise and variation reads inside the trainer workspace under RLS', async () => {
    const exerciseId = await createExercise();
    const privateExerciseId = randomUUID();
    await db.begin(async (tx) => {
      await tx`insert into public.workspace_exercises(workspace_id, id, created_by, current_version)
        values (${wsB}, ${privateExerciseId}, ${po.userId}, 1)`;
      await tx`insert into public.workspace_exercise_versions(workspace_id, workspace_exercise_id, version, payload, created_by)
        values (${wsB}, ${privateExerciseId}, 1, ${tx.json({ name_en: 'Foreign workspace exercise' })}, ${po.userId})`;
    });
    await asActor(po.userId, (tx) => tx`select public.catalog_write_exercise_override(
      ${wsB}, ${exerciseId}, 0, ${randomUUID()}, ${tx.json({ notes: 'Foreign workspace variation' })}
    )`);

    await expect(asActor(trainerA.userId, (tx) => tx`
      select id from public.workspace_exercises where workspace_id = ${wsB}
    `)).resolves.toEqual([]);
    await expect(asActor(trainerA.userId, (tx) => tx`
      select exercise_id from public.exercise_overrides where workspace_id = ${wsB}
    `)).resolves.toEqual([]);
    await expect(asActor(trainerA.userId, (tx) => tx`
      select * from public.catalog_search('workspace_exercise', null, '{}'::jsonb, null, ${wsB})
    `)).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
    await expect(asActor(trainerA.userId, (tx) => tx`
      select * from public.catalog_search('variation', null, '{}'::jsonb, null, ${wsB})
    `)).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
  });

  it('pins the variation helper to the supplied workspace', async () => {
    const [helper] = await db`select pg_catalog.pg_get_functiondef(
      'app_private.catalog_search_variation(text,jsonb,text,uuid)'::regprocedure
    ) as definition`;
    expect(helper?.definition).toMatch(/override\.workspace_id\s*=\s*p_workspace_id/i);
  });

  it('retires legacy write RPCs and resolves the compatibility read from effective override values', async () => {
    const exerciseId = await createExercise();
    const request = { video_url: 'https://youtu.be/abcdefghijk', notes: 'workspace note' };
    await expect(
      asActor(trainerA.userId, (tx) => tx`select public.catalog_write_exercise_override(
        ${wsB}, ${exerciseId}, 0, ${randomUUID()}, ${tx.json(request)}
      )`),
    ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });

    const created = await asActor(trainerA.userId, (tx) => tx`select public.catalog_write_exercise_override(
      ${wsA}, ${exerciseId}, 0, ${randomUUID()}, ${tx.json(request)}
    ) as result`);
    expect((created[0]?.result as { version: number }).version).toBe(1);

    const variation = await asActor(trainerA.userId, (tx) => tx`select result_workspace_id, result_version,
      result_payload #>> '{effective_fields,video,value}' as video,
      result_payload #>> '{effective_fields,notes,value}' as notes
      from public.catalog_search('variation', '', '{}'::jsonb, null, ${wsA}) where result_id = ${exerciseId}`);
    expect(variation).toEqual([{
      result_workspace_id: wsA,
      result_version: 1,
      video: request.video_url,
      notes: request.notes,
    }]);

    const legacy = await db`select
      pg_catalog.to_regprocedure('public.catalog_write_variation(uuid,uuid,integer,uuid,jsonb)') as write,
      pg_catalog.to_regprocedure('public.catalog_transition_variation(uuid,uuid,integer,text,uuid)') as transition`;
    expect(legacy[0]).toEqual({ write: null, transition: null });
    await expect(db`select payload ->> 'video_url' as video from public.exercise_versions where exercise_id = ${exerciseId}`)
      .resolves.toEqual([{ video: null }]);
  });

  it('versions and resets Video/Notes through the F16 override RPC without changing canonical data', async () => {
    const exerciseId = await createExercise();
    const firstKey = randomUUID();
    const first = { video_url: 'https://www.youtube.com/watch?v=abcdefghijk', notes: 'Keep local' };
    const created = await Promise.all([0, 1].map(() => asActor(trainerA.userId, (tx) => tx`
      select public.catalog_write_exercise_override(${wsA}, ${exerciseId}, 0, ${firstKey}, ${tx.json(first)}) as result`)));
    expect(created[0]).toEqual(created[1]);

    const resetKey = randomUUID();
    const reset = await asActor(trainerA.userId, (tx) => tx`
      select public.catalog_write_exercise_override(${wsA}, ${exerciseId}, 1, ${resetKey}, ${tx.json({ video_url: null, notes: null })}) as result`);
    expect((reset[0]?.result as { version: number }).version).toBe(2);

    const effective = await asActor(trainerA.userId, (tx) => tx`select
      payload #>> '{effective_fields,video,value}' as video,
      payload #>> '{effective_fields,video,source}' as video_source,
      payload #>> '{effective_fields,notes,value}' as notes,
      payload #>> '{effective_fields,notes,source}' as notes_source
      from public.catalog_exercise_detail(${exerciseId}, ${wsA})`);
    expect(effective).toEqual([{
      video: null,
      video_source: 'none',
      notes: null,
      notes_source: 'none',
    }]);
    await expect(db`select payload ->> 'video_url' as video from public.exercise_versions where exercise_id = ${exerciseId}`)
      .resolves.toEqual([{ video: null }]);
    await expect(db`select count(*)::int as count from public.exercise_override_versions where workspace_id = ${wsA} and exercise_id = ${exerciseId}`)
      .resolves.toEqual([{ count: 2 }]);
  });
});
