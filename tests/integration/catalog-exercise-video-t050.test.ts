import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
let poId: string;
let trainerId: string;
let foreignTrainerId: string;
let workspaceId: string;

beforeAll(async () => {
  const f = await twoWorkspaceFixture();
  poId = f.po.userId;
  trainerId = f.trainerA.userId;
  foreignTrainerId = f.trainerB.userId;
  workspaceId = f.wsA.id;
});

afterAll(async () => db.end());

async function asActor<T>(actorId: string, body: (tx: Tx) => Promise<T>) {
  return db.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
    return body(tx);
  });
}

async function createGlobal(videoUrl: string | null) {
  return asActor(poId, async (tx) => {
    const request = {
      name_en: `T050 video ${randomUUID()}`,
      name_ar: 'تمرين فيديو',
      primary_muscle_code: 'chest',
      equipment_codes: ['barbell'],
      ...(videoUrl === null ? {} : { video_url: videoUrl }),
    };
    const [row] = await tx`select public.catalog_create_exercise(
      ${randomUUID()}, ${tx.json(request)}
    ) as result`;
    return (row!.result as { exercise_id: string }).exercise_id;
  });
}

async function writeVideoOverride(exerciseId: string, videoUrl: string | null, expectedVersion = 0) {
  return asActor(trainerId, (tx) => tx`select public.catalog_write_exercise_override(
    ${workspaceId}, ${exerciseId}, ${expectedVersion}, ${randomUUID()}, ${tx.json({ video_url: videoUrl })}
  )`);
}

describe('T050 current authorized exercise Video resolution', () => {
  it('uses a non-null workspace Video override ahead of conflicting legacy and canonical values', async () => {
    const canonical = 'https://youtu.be/canonical123';
    const override = 'https://youtu.be/override123';
    const legacy = 'https://youtu.be/legacy123';
    const exerciseId = await createGlobal(canonical);
    await writeVideoOverride(exerciseId, override);
    await db.begin(async (tx) => {
      await tx`insert into public.exercise_variations(workspace_id, exercise_id, created_by, current_version)
        values (${workspaceId}, ${exerciseId}, ${trainerId}, 1)`;
      await tx`insert into public.exercise_variation_versions(workspace_id, exercise_id, version, payload, created_by)
        values (${workspaceId}, ${exerciseId}, 1, ${tx.json({ video_url: legacy })}, ${trainerId})`;
    });

    const [detail] = await asActor(trainerId, (tx) => tx`select variation
      from public.catalog_exercise_detail(${exerciseId}, ${workspaceId})`);
    expect(detail?.variation).toEqual({ workspace_id: workspaceId, video_url: override, source: 'override' });
  });

  it('falls back to canonical Video after the workspace override is removed', async () => {
    const canonical = 'https://youtu.be/canonical456';
    const legacy = 'https://youtu.be/legacy456';
    const exerciseId = await createGlobal(canonical);
    await writeVideoOverride(exerciseId, 'https://youtu.be/removed456');
    await writeVideoOverride(exerciseId, null, 1);
    await db.begin(async (tx) => {
      await tx`insert into public.exercise_variations(workspace_id, exercise_id, created_by, current_version)
        values (${workspaceId}, ${exerciseId}, ${trainerId}, 1)`;
      await tx`insert into public.exercise_variation_versions(workspace_id, exercise_id, version, payload, created_by)
        values (${workspaceId}, ${exerciseId}, 1, ${tx.json({ video_url: legacy })}, ${trainerId})`;
    });

    const [detail] = await asActor(trainerId, (tx) => tx`select variation
      from public.catalog_exercise_detail(${exerciseId}, ${workspaceId})`);
    expect(detail?.variation).toEqual({ workspace_id: workspaceId, video_url: canonical, source: 'canonical' });
  });

  it('resolves a workspace-private exercise Video from its own current version', async () => {
    const videoUrl = 'https://youtu.be/private789';
    const exercise = await asActor(trainerId, (tx) => tx`select public.catalog_write_workspace_exercise(
      ${workspaceId}, null, null, ${randomUUID()}, ${tx.json({
        name_en: `T050 private ${randomUUID()}`,
        name_ar: 'تمرين خاص',
        primary_muscle_code: 'chest',
        equipment_codes: ['barbell'],
        video_url: videoUrl,
      })}
    ) as result`);
    const privateId = (exercise[0]!.result as { exercise_id: string }).exercise_id;
    const rows = await db`select * from app_private.catalog_resolve_workspace_exercise_video(
      ${workspaceId}, ${privateId}, true
    )`;
    expect(rows).toEqual([{
      workspace_exercise_id: privateId,
      workspace_id: workspaceId,
      video_url: videoUrl,
      source: 'workspace_private',
    }]);
  });

  it('denies a staff detail request for a foreign workspace without disclosing its Video', async () => {
    const exerciseId = await createGlobal('https://youtu.be/scope123');
    await expect(asActor(foreignTrainerId, (tx) => tx`select variation
      from public.catalog_exercise_detail(${exerciseId}, ${workspaceId})`))
      .rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
  });

  it('keeps the workspace resolver internal and non-callable by login roles', async () => {
    const rows = await db`
      select pg_catalog.to_regprocedure('app_private.catalog_resolve_exercise_video(uuid,uuid,boolean)')::oid as resolver,
        has_function_privilege('authenticated',
          'app_private.catalog_resolve_exercise_video(uuid,uuid,boolean)', 'execute') as authenticated_execute,
        has_function_privilege('anon',
          'app_private.catalog_resolve_exercise_video(uuid,uuid,boolean)', 'execute') as anon_execute,
        has_function_privilege('service_role',
          'app_private.catalog_resolve_exercise_video(uuid,uuid,boolean)', 'execute') as service_execute,
        pg_catalog.to_regprocedure('public.catalog_resolve_exercise_video(uuid,uuid)')::oid as public_resolver`;
    expect(rows[0]).toEqual({
      resolver: expect.any(Number),
      authenticated_execute: false,
      anon_execute: false,
      service_execute: false,
      public_resolver: null,
    });
  });
});
