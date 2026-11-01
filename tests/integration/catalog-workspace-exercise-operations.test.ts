import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, sql, twoWorkspaceFixture } from './harness';

const db = sql();
const concurrentDb = postgres(process.env.DB_URL!, {
  max: 2,
  connect_timeout: 10,
});
let po: Awaited<ReturnType<typeof twoWorkspaceFixture>>['po'];
let trainerA: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerA'];
let trainerB: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerB'];
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

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  po = fixture.po;
  trainerA = fixture.trainerA;
  trainerB = fixture.trainerB;
  wsA = fixture.wsA.id;
  wsB = fixture.wsB.id;
});

afterAll(async () => Promise.all([db.end(), concurrentDb.end()]));

const request = {
  name_ar: 'تمرين مساحة',
  name_en: 'Workspace exercise',
  primary_muscle_code: 'chest',
  secondary_muscle_codes: ['triceps'],
  equipment_codes: ['barbell'],
  defaults: { working_sets: 3 },
};

describe('workspace exercise create/version RPC', () => {
  it('binds work to one authorized workspace, permits PO scope, and checks live membership', async () => {
    await expect(
      asActor(
        trainerA.userId,
        (tx) =>
          tx`select public.catalog_write_workspace_exercise(${wsB}, null, null, ${randomUUID()}, ${tx.json(request)})`,
      ),
    ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });

    const created = await asActor(
      trainerA.userId,
      (tx) =>
        tx`select public.catalog_write_workspace_exercise(${wsA}, null, null, ${randomUUID()}, ${tx.json(request)})`,
    );
    const result = created[0]?.catalog_write_workspace_exercise as {
      workspace_id: string;
      exercise_id: string;
      version: number;
    };
    expect(result).toMatchObject({ workspace_id: wsA, version: 1 });
    const poCreated = await asActor(
      po.userId,
      (tx) =>
        tx`select public.catalog_write_workspace_exercise(${wsB}, null, null, ${randomUUID()}, ${tx.json(request)})`,
    );
    expect(
      (
        poCreated[0]?.catalog_write_workspace_exercise as {
          workspace_id: string;
        }
      ).workspace_id,
    ).toBe(wsB);

    await db`update public.workspace_memberships set revoked_at = now(), revoked_by = ${po.userId}
      where workspace_id = ${wsA} and user_id = ${trainerA.userId} and revoked_at is null`;
    await expect(
      asActor(
        trainerA.userId,
        (tx) =>
          tx`select public.catalog_write_workspace_exercise(${wsA}, null, null, ${randomUUID()}, ${tx.json(request)})`,
      ),
    ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
  });

  it('serializes concurrent identical workspace creates into one identity and replay response', async () => {
    const key = randomUUID();
    const responses = await Promise.all(
      [0, 1].map(() =>
        asActor(
          trainerB.userId,
          (tx) =>
            tx`select public.catalog_write_workspace_exercise(${wsB}, null, null, ${key}, ${tx.json(request)})`,
        ),
      ),
    );
    expect(responses[0]).toEqual(responses[1]);
    const result = responses[0][0]?.catalog_write_workspace_exercise as {
      exercise_id: string;
    };
    await expect(
      db`select count(*)::int as identities from public.workspace_exercises where workspace_id = ${wsB} and id = ${result.exercise_id}`,
    ).resolves.toEqual([{ identities: 1 }]);
    await expect(
      db`select count(*)::int as versions from public.workspace_exercise_versions where workspace_id = ${wsB} and workspace_exercise_id = ${result.exercise_id}`,
    ).resolves.toEqual([{ versions: 1 }]);
  });

  it('serializes concurrent identical edits into one immutable version', async () => {
    const created = await asActor(
      trainerB.userId,
      (tx) =>
        tx`select public.catalog_write_workspace_exercise(${wsB}, null, null, ${randomUUID()}, ${tx.json(request)})`,
    );
    const result = created[0]?.catalog_write_workspace_exercise as {
      exercise_id: string;
    };
    const key = randomUUID();
    const update = { ...request, name_en: 'Workspace exercise updated' };
    const responses = await Promise.all(
      [0, 1].map(() =>
        asActor(
          trainerB.userId,
          (tx) =>
            tx`select public.catalog_write_workspace_exercise(${wsB}, ${result.exercise_id}, 1, ${key}, ${tx.json(update)})`,
        ),
      ),
    );
    expect(responses[0]).toEqual(responses[1]);
    expect(
      (responses[0][0]?.catalog_write_workspace_exercise as { version: number })
        .version,
    ).toBe(2);
    await expect(
      db`select count(*)::int as versions from public.workspace_exercise_versions where workspace_id = ${wsB} and workspace_exercise_id = ${result.exercise_id}`,
    ).resolves.toEqual([{ versions: 2 }]);
    await expect(
      db`select version, payload ->> 'name_en' as name_en from public.workspace_exercise_versions
        where workspace_id = ${wsB} and workspace_exercise_id = ${result.exercise_id} order by version`,
    ).resolves.toEqual([
      { version: 1, name_en: request.name_en },
      { version: 2, name_en: update.name_en },
    ]);
  });
});
