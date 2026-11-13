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
let otherWorkspaceId: string;

beforeAll(async () => {
  const f = await twoWorkspaceFixture();
  poId = f.po.userId;
  trainerId = f.trainerA.userId;
  foreignTrainerId = f.trainerB.userId;
  workspaceId = f.wsA.id;
  otherWorkspaceId = f.wsB.id;
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

async function writeVideoOverride(
  exerciseId: string,
  videoUrl: string | null,
  expectedVersion = 0,
) {
  return asActor(
    trainerId,
    (tx) => tx`select public.catalog_write_exercise_override(
    ${workspaceId}, ${exerciseId}, ${expectedVersion}, ${randomUUID()}, ${tx.json({ video_url: videoUrl })}
  )`,
  );
}

describe('T050 current authorized exercise Video resolution', () => {
  it('T097 retains owner, empty search_path, and authenticated-only detail execution', async () => {
    const [fn] = await db`
      select p.prosecdef, p.proconfig,
        pg_catalog.pg_get_userbyid(p.proowner) as owner,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
      from pg_catalog.pg_proc p
      where p.oid = 'public.catalog_workspace_exercise_detail(uuid,uuid)'::regprocedure`;
    expect(fn).toMatchObject({
      prosecdef: true,
      owner: 'postgres',
      authenticated: true,
      anon: false,
      service_role: false,
    });
    expect(fn?.proconfig).toContain('search_path=""');
  });

  it('filters removed and merged Alternatives from private exercise detail without substituting a merged target', async () => {
    const removedTarget = await createGlobal(null);
    const mergedTarget = await createGlobal(null);
    const survivorTarget = await createGlobal(null);
    const [created] = await asActor(
      trainerId,
      (tx) =>
        tx`select public.catalog_write_workspace_exercise(
        ${workspaceId}, null, null, ${randomUUID()}, ${tx.json({
          name_en: `T050 alternatives ${randomUUID()}`,
          name_ar: '\u062A\u0645\u0631\u064A\u0646 \u062E\u0627\u0635',
          primary_muscle_code: 'chest',
          equipment_codes: ['barbell'],
          alternatives: [
            { global_exercise_id: removedTarget },
            { global_exercise_id: mergedTarget },
            { global_exercise_id: survivorTarget },
          ],
        })}
      ) as result`,
    );
    await asActor(
      poId,
      (tx) =>
        tx`select public.catalog_transition_exercise(
        ${removedTarget}, 0, 'remove', ${randomUUID()}
      )`,
    );
    await asActor(
      poId,
      (tx) =>
        tx`select public.catalog_merge_exercise(
        ${mergedTarget}, ${survivorTarget}, 0, ${randomUUID()}
      )`,
    );
    const privateExerciseId = (created!.result as { exercise_id: string })
      .exercise_id;
    const [detail] = await asActor(
      trainerId,
      (tx) =>
        tx`select payload
        from public.catalog_workspace_exercise_detail(
          ${workspaceId}, ${privateExerciseId}
        )`,
    );

    expect(detail?.payload.alternatives).toEqual([
      { global_exercise_id: survivorTarget },
    ]);

    const rollback = 'rollback_t097_active_alternative_mutation';
    try {
      await db.begin(async (tx) => {
        const [routine] = await tx`
          select pg_catalog.pg_get_functiondef(
            'public.catalog_workspace_exercise_detail(uuid,uuid)'::regprocedure
          ) as definition`;
        const definition = String(routine!.definition);
        const mutant = definition.replaceAll(
          "and target.lifecycle_state = 'active'",
          'and true',
        );
        expect(mutant).not.toBe(definition);
        await tx.unsafe(mutant);
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerId, role: 'authenticated' })}, true)`;
        const [mutatedDetail] = await tx`
          select payload from public.catalog_workspace_exercise_detail(
            ${workspaceId}, ${privateExerciseId}
          )`;
        expect(mutatedDetail?.payload.alternatives).toEqual([
          { global_exercise_id: removedTarget },
          { global_exercise_id: mergedTarget },
          { global_exercise_id: survivorTarget },
        ]);
        throw new Error(rollback);
      });
    } catch (error) {
      if ((error as Error).message !== rollback) throw error;
    }
  });

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

    const [detail] = await asActor(
      trainerId,
      (tx) => tx`select variation
      from public.catalog_exercise_detail(${exerciseId}, ${workspaceId})`,
    );
    expect(detail?.variation).toEqual({
      workspace_id: workspaceId,
      video_url: override,
      source: 'override',
    });
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

    const [detail] = await asActor(
      trainerId,
      (tx) => tx`select variation
      from public.catalog_exercise_detail(${exerciseId}, ${workspaceId})`,
    );
    expect(detail?.variation).toEqual({
      workspace_id: workspaceId,
      video_url: canonical,
      source: 'canonical',
    });
  });

  it('resolves a workspace-private exercise Video from its own current version', async () => {
    const videoUrl = 'https://youtu.be/private789';
    const exercise = await asActor(
      trainerId,
      (tx) => tx`select public.catalog_write_workspace_exercise(
      ${workspaceId}, null, null, ${randomUUID()}, ${tx.json({
        name_en: `T050 private ${randomUUID()}`,
        name_ar: 'تمرين خاص',
        primary_muscle_code: 'chest',
        equipment_codes: ['barbell'],
        video_url: videoUrl,
      })}
    ) as result`,
    );
    const privateId = (exercise[0]!.result as { exercise_id: string })
      .exercise_id;
    const rows =
      await db`select * from app_private.catalog_resolve_workspace_exercise_video(
      ${workspaceId}, ${privateId}, true
    )`;
    expect(rows).toEqual([
      {
        workspace_exercise_id: privateId,
        workspace_id: workspaceId,
        video_url: videoUrl,
        source: 'workspace_private',
      },
    ]);
  });

  it('denies a staff detail request for a foreign workspace without disclosing its Video', async () => {
    const exerciseId = await createGlobal('https://youtu.be/scope123');
    await expect(
      asActor(
        foreignTrainerId,
        (tx) => tx`select variation
      from public.catalog_exercise_detail(${exerciseId}, ${workspaceId})`,
      ),
    ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
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

  it('denies revoked workspace access before returning a global override Video', async () => {
    const exerciseId = await createGlobal('https://youtu.be/revokedglobal');
    await writeVideoOverride(exerciseId, 'https://youtu.be/revokedoverride');
    const rollback = 'rollback_t050_revoked_global';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.workspace_memberships(workspace_id, user_id, granted_by)
          values (${otherWorkspaceId}, ${trainerId}, ${poId})`;
        await tx`update public.workspace_memberships
          set revoked_at = statement_timestamp(), revoked_by = ${poId}
          where workspace_id = ${workspaceId} and user_id = ${trainerId} and revoked_at is null`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerId, role: 'authenticated' })}, true)`;
        await expect(
          tx`select variation from public.catalog_exercise_detail(${exerciseId}, ${workspaceId})`,
        ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
        throw new Error(rollback);
      });
    } catch (error) {
      expect((error as Error).message).toBe(rollback);
    }
  });

  it.each([
    ['https://evil.example/video', 'https://youtu.be/canonicalfallback'],
    ['https://docs.google.com/document/d/x', 'https://youtu.be/docsfallback'],
  ])(
    'filters a stored disallowed override host and falls back to canonical (%s)',
    async (badUrl, canonical) => {
      const exerciseId = await createGlobal(canonical);
      const rollback = 'rollback_t050_bad_override';
      try {
        await db.begin(async (tx) => {
          await tx`insert into public.exercise_overrides(workspace_id, exercise_id, current_version)
          values (${workspaceId}, ${exerciseId}, 1)`;
          await tx`insert into public.exercise_override_versions(workspace_id, exercise_id, version, payload, created_by)
          values (${workspaceId}, ${exerciseId}, 1, ${tx.json({ video_url: badUrl })}, ${trainerId})`;
          await tx`select set_config('role', 'authenticated', true)`;
          await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerId, role: 'authenticated' })}, true)`;
          const [detail] =
            await tx`select variation from public.catalog_exercise_detail(${exerciseId}, ${workspaceId})`;
          expect(detail?.variation).toEqual({
            workspace_id: workspaceId,
            video_url: canonical,
            source: 'canonical',
          });
          throw new Error(rollback);
        });
      } catch (error) {
        expect((error as Error).message).toBe(rollback);
      }
    },
  );

  it.each([
    'https://evil.example/video',
    'https://docs.google.com/document/d/x',
  ])(
    'filters a stored disallowed canonical host and returns none (%s)',
    async (badUrl) => {
      const exerciseId = await createGlobal(null);
      const rollback = 'rollback_t050_bad_canonical';
      try {
        await db.begin(async (tx) => {
          await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
            values (${exerciseId}, 2, ${tx.json({ name_en: 'T050 unsafe canonical', name_ar: 'تمرين غير آمن', primary_muscle_code: 'chest', equipment_codes: ['barbell'], video_url: badUrl })}, ${poId})`;
          await tx`update public.exercises set current_version = 2 where id = ${exerciseId}`;
          await tx`select set_config('role', 'authenticated', true)`;
          await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerId, role: 'authenticated' })}, true)`;
          const [detail] =
            await tx`select variation from public.catalog_exercise_detail(${exerciseId}, ${workspaceId})`;
          expect(detail?.variation).toEqual({
            workspace_id: workspaceId,
            video_url: null,
            source: 'none',
          });
          throw new Error(rollback);
        });
      } catch (error) {
        expect((error as Error).message).toBe(rollback);
      }
    },
  );

  it('denies revoked workspace access before returning a private exercise Video', async () => {
    const privateId = await createPrivate('https://youtu.be/revokedprivate');
    const rollback = 'rollback_t050_revoked_private';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.workspace_memberships(workspace_id, user_id, granted_by)
          values (${otherWorkspaceId}, ${trainerId}, ${poId})`;
        await tx`update public.workspace_memberships
          set revoked_at = statement_timestamp(), revoked_by = ${poId}
          where workspace_id = ${workspaceId} and user_id = ${trainerId} and revoked_at is null`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerId, role: 'authenticated' })}, true)`;
        await expect(
          tx`select payload from public.catalog_workspace_exercise_detail(${workspaceId}, ${privateId})`,
        ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
        throw new Error(rollback);
      });
    } catch (error) {
      expect((error as Error).message).toBe(rollback);
    }
  });

  it.each([
    'https://evil.example/video',
    'https://docs.google.com/document/d/x',
  ])(
    'filters a stored disallowed workspace-private Video and returns none (%s)',
    async (badUrl) => {
      const privateId = await createPrivate('https://youtu.be/initialprivate');
      const rollback = 'rollback_t050_bad_private';
      try {
        await db.begin(async (tx) => {
          await tx`insert into public.workspace_exercise_versions(workspace_id, workspace_exercise_id, version, payload, created_by)
            values (${workspaceId}, ${privateId}, 2, ${tx.json({ name_en: 'T050 unsafe private', name_ar: 'تمرين خاص', primary_muscle_code: 'chest', equipment_codes: ['barbell'], video_url: badUrl })}, ${trainerId})`;
          await tx`update public.workspace_exercises set current_version = 2
            where workspace_id = ${workspaceId} and id = ${privateId}`;
          await tx`select set_config('role', 'authenticated', true)`;
          await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerId, role: 'authenticated' })}, true)`;
          const [detail] =
            await tx`select payload from public.catalog_workspace_exercise_detail(${workspaceId}, ${privateId})`;
          expect(detail?.payload.video_url).toBeNull();
          throw new Error(rollback);
        });
      } catch (error) {
        expect((error as Error).message).toBe(rollback);
      }
    },
  );

  it('denies authenticated direct calls to both internal resolvers, including plan-authorized calls', async () => {
    const exerciseId = await createGlobal('https://youtu.be/directglobal');
    const privateId = await createPrivate('https://youtu.be/directprivate');
    await db.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerId, role: 'authenticated' })}, true)`;
      for (const planAuthorized of [false, true]) {
        await expect(
          tx.savepoint(
            (sp) => sp`select * from app_private.catalog_resolve_exercise_video(
          ${exerciseId}, ${workspaceId}, ${planAuthorized}
        )`,
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          tx.savepoint(
            (
              sp,
            ) => sp`select * from app_private.catalog_resolve_workspace_exercise_video(
          ${workspaceId}, ${privateId}, ${planAuthorized}
        )`,
          ),
        ).rejects.toMatchObject({ code: '42501' });
      }
    });
  });

  it('T050 mutation: removing the override read-time host filter makes caller coverage fail', async () => {
    const exerciseId = await createGlobal('https://youtu.be/mutantcanonical');
    const badUrl = 'https://evil.example/video';
    const marker = 'rollback_t050_override_filter_mutation';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.exercise_overrides(workspace_id, exercise_id, current_version)
          values (${workspaceId}, ${exerciseId}, 1)`;
        await tx`insert into public.exercise_override_versions(workspace_id, exercise_id, version, payload, created_by)
          values (${workspaceId}, ${exerciseId}, 1, ${tx.json({ video_url: badUrl })}, ${trainerId})`;
        const [row] = await tx`select pg_catalog.pg_get_functiondef(
          'app_private.catalog_resolve_exercise_video(uuid,uuid,boolean)'::regprocedure
        ) as definition`;
        const original = row!.definition as string;
        const mutant = original.replace(
          /if not app_private\.catalog_video_url_allowed\(override_video\) then\s+override_video := null;\s+end if;/,
          '',
        );
        expect(mutant).not.toBe(original);
        await tx.unsafe(mutant);
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerId, role: 'authenticated' })}, true)`;
        const [detail] =
          await tx`select variation from public.catalog_exercise_detail(${exerciseId}, ${workspaceId})`;
        await expectMutantToFail(async () => {
          expect(detail?.variation).toEqual({
            workspace_id: workspaceId,
            video_url: 'https://youtu.be/mutantcanonical',
            source: 'canonical',
          });
        }, 'override read-time host filter must reject stored evil.example URL');
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    }
  });

  it('T050 mutation: removing the canonical read-time host filter makes caller coverage fail', async () => {
    const exerciseId = await createGlobal(null);
    const badUrl = 'https://docs.google.com/document/d/x';
    const marker = 'rollback_t050_canonical_filter_mutation';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
          values (${exerciseId}, 2, ${tx.json({ name_en: 'T050 unsafe canonical', video_url: badUrl })}, ${poId})`;
        await tx`update public.exercises set current_version = 2 where id = ${exerciseId}`;
        const [row] = await tx`select pg_catalog.pg_get_functiondef(
          'app_private.catalog_resolve_exercise_video(uuid,uuid,boolean)'::regprocedure
        ) as definition`;
        const original = row!.definition as string;
        const mutant = original.replace(
          /if not app_private\.catalog_video_url_allowed\(canonical_video\) then\s+canonical_video := null;\s+end if;/,
          '',
        );
        expect(mutant).not.toBe(original);
        await tx.unsafe(mutant);
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerId, role: 'authenticated' })}, true)`;
        const [detail] =
          await tx`select variation from public.catalog_exercise_detail(${exerciseId}, ${workspaceId})`;
        await expectMutantToFail(async () => {
          expect(detail?.variation).toEqual({
            workspace_id: workspaceId,
            video_url: null,
            source: 'none',
          });
        }, 'canonical read-time host filter must reject stored docs.google.com URL');
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    }
  });

  it('T050 mutation: granting the authenticated resolver EXECUTE makes direct-call denial fail', async () => {
    const exerciseId = await createGlobal('https://youtu.be/grantmutant');
    const marker = 'rollback_t050_execute_grant_mutation';
    try {
      await db.begin(async (tx) => {
        await tx`grant execute on function app_private.catalog_resolve_exercise_video(uuid,uuid,boolean) to authenticated`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerId, role: 'authenticated' })}, true)`;
        await expectMutantToFail(async () => {
          await expect(
            tx`select * from app_private.catalog_resolve_exercise_video(${exerciseId}, ${workspaceId}, true)`,
          ).rejects.toMatchObject({ code: '42501' });
        }, 'direct-call denial must reject an authenticated EXECUTE grant even with p_plan_authorized=true');
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    }
  });

  it('T050 mutation: dropping has_workspace_access makes revoked caller denial fail', async () => {
    const privateId = await createPrivate(
      'https://youtu.be/privateaccessmutant',
    );
    const marker = 'rollback_t050_access_predicate_mutation';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.workspace_memberships(workspace_id, user_id, granted_by)
          values (${otherWorkspaceId}, ${trainerId}, ${poId})`;
        await tx`update public.workspace_memberships set revoked_at = statement_timestamp(), revoked_by = ${poId}
          where workspace_id = ${workspaceId} and user_id = ${trainerId} and revoked_at is null`;
        const membershipFunctions: Array<[string, string]> = [
          [
            'public.catalog_workspace_exercise_detail(uuid,uuid)',
            'private detail',
          ],
          [
            'app_private.catalog_resolve_workspace_exercise_video(uuid,uuid,boolean)',
            'private resolver',
          ],
        ];
        for (const [signature, label] of membershipFunctions) {
          const [definition] =
            await tx`select pg_catalog.pg_get_functiondef(${signature}::regprocedure) as sql`;
          if (!definition?.sql)
            throw new Error(`T050 ${label} definition missing`);
          const mutant = (definition.sql as string).replace(
            "and not app_private.has_workspace_access(p_workspace_id, 'coaching_work')",
            'and false',
          );
          if (mutant === definition.sql)
            throw new Error(
              `T050 ${label} membership predicate mutation target missing`,
            );
          await tx.unsafe(mutant);
        }
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerId, role: 'authenticated' })}, true)`;
        await expectMutantToFail(async () => {
          await expect(
            tx`select payload from public.catalog_workspace_exercise_detail(${workspaceId}, ${privateId})`,
          ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
        }, 'private revoked-membership caller assertion must fail if has_workspace_access is removed');
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    }
  });
});

async function expectMutantToFail(
  assertion: () => Promise<void>,
  label: string,
) {
  let failure: unknown;
  try {
    await assertion();
  } catch (error) {
    failure = error;
  }
  expect(failure, label).toBeDefined();
}

async function createPrivate(videoUrl: string) {
  const [row] = await asActor(
    trainerId,
    (tx) => tx`select public.catalog_write_workspace_exercise(
    ${workspaceId}, null, null, ${randomUUID()}, ${tx.json({
      name_en: `T050 private ${randomUUID()}`,
      name_ar: 'تمرين خاص',
      primary_muscle_code: 'chest',
      equipment_codes: ['barbell'],
      video_url: videoUrl,
    })}
  ) as result`,
  );
  return (row!.result as { exercise_id: string }).exercise_id;
}
