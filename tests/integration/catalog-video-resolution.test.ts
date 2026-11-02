import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, checked, sql } from './harness';

const db = sql();
let poId: string;
let trainerId: string;
let workspaceId: string;

beforeAll(async () => {
  const makeActor = async (role: 'platform_owner' | 'trainer') => {
    const created = await admin().auth.admin.createUser({
      email: `catalog-video-${randomUUID()}@example.test`,
      password: `Video-${randomUUID()}-aA1!`,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      throw new Error(created.error?.message ?? 'Catalog video actor missing');
    checked(
      await admin()
        .from('staff_profiles')
        .insert({ user_id: created.data.user.id, role }),
    );
    return created.data.user.id;
  };
  poId = await makeActor('platform_owner');
  trainerId = await makeActor('trainer');
  const workspace = checked(
    await admin()
      .from('workspaces')
      .insert({
        name: 'Video scope',
        slug: `video-${randomUUID().slice(0, 8)}`,
        created_by: poId,
      })
      .select('id')
      .single(),
  );
  if (!workspace) throw new Error('Catalog video workspace missing');
  workspaceId = workspace.id as string;
  checked(
    await admin().from('workspace_memberships').insert({
      workspace_id: workspaceId,
      user_id: trainerId,
      granted_by: poId,
    }),
  );
});

afterAll(async () => db.end());

describe('dynamic workspace video resolution', () => {
  it('returns only an authorized selected workspace video and denies foreign or revoked access', async () => {
    const exerciseId = randomUUID();
    const unsafeExerciseId = randomUUID();
    const rollback = 'rollback_catalog_video_fixture';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.exercises (id, created_by, current_version)
          values (${exerciseId}, ${poId}, 1), (${unsafeExerciseId}, ${poId}, 1)`;
        await tx`insert into public.exercise_versions (exercise_id, version, payload, created_by)
          values (${exerciseId}, 1, '{}'::jsonb, ${poId}), (${unsafeExerciseId}, 1, '{}'::jsonb, ${poId})`;
        await tx`insert into public.exercise_variations (workspace_id, exercise_id, created_by, current_version)
          values (${workspaceId}, ${exerciseId}, ${trainerId}, 1), (${workspaceId}, ${unsafeExerciseId}, ${trainerId}, 1)`;
        await tx`insert into public.exercise_variation_versions (workspace_id, exercise_id, version, payload, created_by)
          values (${workspaceId}, ${exerciseId}, 1,
            ${tx.json({ video_url: 'https://youtu.be/abcdefghijk', note: 'private note' })}, ${trainerId}),
            (${workspaceId}, ${unsafeExerciseId}, 1, ${tx.json({ video_url: 'https://evil.example/video' })}, ${trainerId})`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerId, role: 'authenticated' })}, true)`;
        const result =
          await tx`select * from public.catalog_resolve_exercise_video(${exerciseId}, ${workspaceId})`;
        expect(result).toEqual([
          {
            exercise_id: exerciseId,
            workspace_id: workspaceId,
            video_url: 'https://youtu.be/abcdefghijk',
          },
        ]);
        await tx`select set_config('role', 'postgres', true)`;
        await tx`update public.exercises set lifecycle_state = 'removed' where id = ${exerciseId}`;
        await tx`select set_config('role', 'authenticated', true)`;
        expect(
          await tx`select * from public.catalog_resolve_exercise_video(${exerciseId}, ${workspaceId})`,
        ).toEqual([
          {
            exercise_id: exerciseId,
            workspace_id: workspaceId,
            video_url: 'https://youtu.be/abcdefghijk',
          },
        ]);
        expect(
          await tx`select * from public.catalog_resolve_exercise_video(${unsafeExerciseId}, ${workspaceId})`,
        ).toEqual([]);
        await expect(
          tx.savepoint(
            (sp) =>
              sp`select * from public.catalog_resolve_exercise_video(${exerciseId}, ${randomUUID()})`,
          ),
        ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
        await tx`select set_config('role', 'postgres', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: poId, role: 'authenticated' })}, true)`;
        await tx`update public.workspace_memberships set revoked_at = statement_timestamp(), revoked_by = ${poId}
          where workspace_id = ${workspaceId} and user_id = ${trainerId}`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerId, role: 'authenticated' })}, true)`;
        await expect(
          tx.savepoint(
            (sp) =>
              sp`select * from public.catalog_resolve_exercise_video(${exerciseId}, ${workspaceId})`,
          ),
        ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
        throw new Error(rollback);
      });
    } catch (error) {
      expect((error as Error).message).toBe(rollback);
    }
  });

  it.each([
    'http://youtube.com/watch?v=abcdefghijk',
    'https://youtube.com.evil.example/watch?v=abcdefghijk',
    'https://user:password@youtube.com/watch?v=abcdefghijk',
    'https://vimeo.com/123456789',
  ])('rejects disallowed video URL %s', async (videoUrl) => {
    await expect(
      db`select app_private.catalog_video_url_allowed(${videoUrl}) as allowed`,
    ).resolves.toEqual([{ allowed: false }]);
  });
});
