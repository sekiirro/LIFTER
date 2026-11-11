import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
let poId: string;
let trainerAId: string;
let trainerBId: string;
let workspaceAId: string;
let workspaceBId: string;

beforeAll(async () => {
  const f = await twoWorkspaceFixture();
  poId = f.po.userId;
  trainerAId = f.trainerA.userId;
  trainerBId = f.trainerB.userId;
  workspaceAId = f.wsA.id;
  workspaceBId = f.wsB.id;
});

afterAll(async () => db.end());

async function asActor<T>(actorId: string, body: (tx: Tx) => Promise<T>) {
  return db.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
    return body(tx);
  });
}

async function createGlobal(videoUrl: string) {
  return asActor(poId, async (tx) => {
    const [row] = await tx`select public.catalog_create_exercise(
      ${randomUUID()}, ${tx.json({ name_en: `T051 ${randomUUID()}`, name_ar: 'تمرين', primary_muscle_code: 'chest', equipment_codes: ['barbell'], video_url: videoUrl })}
    ) as result`;
    return (row!.result as { exercise_id: string }).exercise_id;
  });
}

async function writeOverride(exerciseId: string, videoUrl: string | null, expectedVersion: number) {
  return asActor(trainerAId, (tx) => tx`select public.catalog_write_exercise_override(
    ${workspaceAId}, ${exerciseId}, ${expectedVersion}, ${randomUUID()}, ${tx.json({ video_url: videoUrl })}
  )`);
}

async function createPrivate(actorId: string, workspaceId: string) {
  return asActor(actorId, async (tx) => {
    const [row] = await tx`select public.catalog_write_workspace_exercise(
      ${workspaceId}, null, null, ${randomUUID()},
      ${tx.json({ name_en: `T051 private ${randomUUID()}`, name_ar: 'تمرين خاص', primary_muscle_code: 'chest', equipment_codes: ['barbell'], video_url: 'https://youtu.be/abcdefghijk' })}
    ) as result`;
    return (row!.result as { exercise_id: string }).exercise_id;
  });
}

describe('T051 internal resolver boundary and current Video reads', () => {
  it('denies missing and foreign workspace-private references with the same generic error', async () => {
    const foreignId = await createPrivate(trainerBId, workspaceBId);
    const missingId = randomUUID();
    const failures: Array<{ code: string; message: string }> = [];
    for (const exerciseId of [missingId, foreignId]) {
      try {
        await db`select * from app_private.catalog_resolve_workspace_exercise_video(${workspaceAId}, ${exerciseId}, true)`;
        throw new Error('resolver unexpectedly returned a row');
      } catch (error) {
        failures.push({ code: (error as { code: string }).code, message: (error as Error).message });
      }
    }
    expect(failures).toEqual([
      { code: '42501', message: 'not_permitted' },
      { code: '42501', message: 'not_permitted' },
    ]);
  });

  it('T051 mutation: dropping the composite workspace predicate exposes the foreign reference test', async () => {
    const foreignId = await createPrivate(trainerBId, workspaceBId);
    const marker = 'rollback_t051_composite_mutation';
    try {
      await db.begin(async (tx) => {
        const [row] = await tx`select pg_catalog.pg_get_functiondef(
          'app_private.catalog_resolve_workspace_exercise_video(uuid,uuid,boolean)'::regprocedure
        ) as definition`;
        const original = row!.definition as string;
        const mutant = original.replace('where e.workspace_id = p_workspace_id\n      and e.id = p_workspace_exercise_id;', 'where e.id = p_workspace_exercise_id;');
        expect(mutant).not.toBe(original);
        await tx.unsafe(mutant);
        const [result] = await tx`select * from app_private.catalog_resolve_workspace_exercise_video(${workspaceAId}, ${foreignId}, true)`;
        await expectMutantToFail(async () => {
          expect(result).toBeUndefined();
        }, 'foreign private exercise must be denied when workspace equality is removed');
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    }
  });

  it('T051 mutation: distinguishing an existing foreign reference from a missing reference breaks generic denial', async () => {
    const foreignId = await createPrivate(trainerBId, workspaceBId);
    const missingId = randomUUID();
    const marker = 'rollback_t051_disclosure_mutation';
    try {
      await db.begin(async (tx) => {
        const [row] = await tx`select pg_catalog.pg_get_functiondef(
          'app_private.catalog_resolve_workspace_exercise_video(uuid,uuid,boolean)'::regprocedure
        ) as definition`;
        const original = row!.definition as string;
        const mutant = original.replace(
          '  if not found then\n    raise exception using errcode = \'42501\', message = \'not_permitted\';\n  end if;',
          `  if not found and exists (select 1 from public.workspace_exercises e where e.id = p_workspace_exercise_id) then
    raise exception using errcode = '42501', message = 'foreign_reference';
  end if;
  if not found then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;`,
        );
        expect(mutant).not.toBe(original);
        await tx.unsafe(mutant);
        const errors: string[] = [];
        for (const exerciseId of [missingId, foreignId]) {
          try {
            await tx.savepoint((sp) => sp`select * from app_private.catalog_resolve_workspace_exercise_video(${workspaceAId}, ${exerciseId}, true)`);
          } catch (error) {
            errors.push((error as Error).message);
          }
        }
        await expectMutantToFail(async () => {
          expect(errors[0]).toBe(errors[1]);
        }, 'missing and foreign references must not produce different messages');
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    }
  });

  it('returns the current Video on every staff view, including override removal and changed Global fallback', async () => {
    const firstGlobal = 'https://youtu.be/AAAAAAAAAAA';
    const changedGlobal = 'https://youtu.be/BBBBBBBBBBB';
    const firstOverride = 'https://youtu.be/CCCCCCCCCCC';
    const changedOverride = 'https://youtu.be/DDDDDDDDDDD';
    const exerciseId = await createGlobal(firstGlobal);
    await writeOverride(exerciseId, firstOverride, 0);

    const readVideo = async () => asActor(trainerAId, async (tx) => {
      const [row] = await tx`select result_payload
        from public.catalog_search('exercise', null, '{}'::jsonb, null, ${workspaceAId})
        where result_id = ${exerciseId}`;
      return row?.result_payload.effective_fields.video;
    });

    expect(await readVideo()).toEqual({ value: firstOverride, source: 'override' });
    await writeOverride(exerciseId, changedOverride, 1);
    expect(await readVideo()).toEqual({ value: changedOverride, source: 'override' });
    await writeOverride(exerciseId, null, 2);
    expect(await readVideo()).toEqual({ value: firstGlobal, source: 'canonical' });

    await asActor(poId, (tx) => tx`select public.catalog_version_exercise(
      ${exerciseId}, 1, ${randomUUID()}, ${tx.json({ name_en: 'T051 versioned', name_ar: 'تمرين', primary_muscle_code: 'chest', equipment_codes: ['barbell'], video_url: changedGlobal })}
    )`);
    expect(await readVideo()).toEqual({ value: changedGlobal, source: 'canonical' });
  });

  it('denies the next staff view after workspace membership is revoked', async () => {
    const exerciseId = await createGlobal('https://youtu.be/FFFFFFFFFFF');
    const [warm] = await asActor(trainerAId, (tx) => tx`select result_payload
      from public.catalog_search('exercise', null, '{}'::jsonb, null, ${workspaceAId})
      where result_id = ${exerciseId}`);
    expect(warm).toBeDefined();

    const marker = 'rollback_t051_revoke_membership';
    try {
      await db.begin(async (tx) => {
        await tx`update public.workspace_memberships set revoked_at = statement_timestamp(), revoked_by = ${poId}
          where workspace_id = ${workspaceAId} and user_id = ${trainerAId} and revoked_at is null`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerAId, role: 'authenticated' })}, true)`;
        await expect(tx.savepoint((sp) => sp`select result_payload
          from public.catalog_search('exercise', null, '{}'::jsonb, null, ${workspaceAId})
          where result_id = ${exerciseId}`)).rejects.toMatchObject({ code: '42501' });
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    }
  });

  it('denies direct resolver calls from anon, authenticated and service_role', async () => {
    const exerciseId = await createGlobal('https://youtu.be/EEEEEEEEEEE');
    const marker = 'rollback_t051_role_grants';
    try {
      await db.begin(async (tx) => {
        await tx`grant usage on schema app_private to anon, authenticated, service_role`;
        for (const role of ['anon', 'authenticated', 'service_role'] as const) {
        await tx`select set_config('role', ${role}, true)`;
        if (role === 'authenticated') {
          await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainerAId, role })}, true)`;
        }
        await expect(tx.savepoint((sp) => sp`select * from app_private.catalog_resolve_exercise_video(${exerciseId}, ${workspaceAId}, true)`))
          .rejects.toMatchObject({ code: '42501' });
        await tx`reset role`;
        }
        throw new Error(marker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(marker);
    }
  });
});

async function expectMutantToFail(assertion: () => Promise<void>, label: string) {
  let failure: unknown;
  try {
    await assertion();
  } catch (error) {
    failure = error;
  }
  expect(failure, label).toBeDefined();
}
