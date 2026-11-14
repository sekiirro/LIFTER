import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, checked, sql } from './harness';

const db = sql();
const concurrentDb = postgres(process.env.DB_URL!, {
  max: 2,
  connect_timeout: 10,
});
let poId: string;
let trainerId: string;

async function createActor(role: 'platform_owner' | 'trainer') {
  const created = await admin().auth.admin.createUser({
    email: `catalog-exercise-${randomUUID()}@example.test`,
    password: `Exercise-${randomUUID()}-aA1!`,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error(created.error?.message ?? 'Catalog exercise actor missing');
  checked(
    await admin().from('staff_profiles').insert({
      user_id: created.data.user.id,
      role,
      display_name: 'Catalog Staff',
    }),
  );
  return created.data.user.id;
}

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
  poId = await createActor('platform_owner');
  trainerId = await createActor('trainer');
});

afterAll(async () => {
  await Promise.all([db.end(), concurrentDb.end()]);
});

const request = {
  name_ar: 'تمرين اختبار',
  name_en: 'Catalog test exercise',
  description: 'Canonical description',
  notes: 'Canonical coaching note',
  primary_muscle_code: 'chest',
  secondary_muscle_codes: ['triceps'],
  equipment_codes: ['barbell'],
  default_rest_time: 90,
  default_rir: 2,
  default_reps: { min: 8, max: 12 },
};

describe('global exercise create and version RPCs', () => {
  it('allows only PO and appends immutable versions with expected-version CAS', async () => {
    const key = randomUUID();
    await expect(
      asActor(
        trainerId,
        (tx) =>
          tx`select public.catalog_create_exercise(${key}, ${tx.json(request)})`,
      ),
    ).rejects.toMatchObject({ code: '42501' });

    const created = await asActor(
      poId,
      (tx) =>
        tx`select public.catalog_create_exercise(${key}, ${tx.json(request)})`,
    );
    const result = created[0]?.catalog_create_exercise as {
      exercise_id: string;
      version: number;
    };
    expect(result.version).toBe(1);

    const versionRequest = {
      ...request,
      name_en: 'Catalog test exercise revised',
    };
    const versioned = await asActor(
      poId,
      (tx) =>
        tx`select public.catalog_version_exercise(${result.exercise_id}, 1, ${randomUUID()}, ${tx.json(versionRequest)})`,
    );
    expect(versioned[0]?.catalog_version_exercise).toEqual({
      exercise_id: result.exercise_id,
      version: 2,
    });
    await expect(
      asActor(
        poId,
        (tx) =>
          tx`select public.catalog_version_exercise(${result.exercise_id}, 1, ${randomUUID()}, ${tx.json(versionRequest)})`,
      ),
    ).rejects.toMatchObject({ code: '40001' });
    const rows = await db`
      select e.current_version, v.version, v.payload ->> 'name_en' as name_en,
        v.payload ->> 'description' as description, v.notes,
        v.default_rest_time, v.default_rir, v.default_reps
      from public.exercises e join public.exercise_versions v on v.exercise_id = e.id
      where e.id = ${result.exercise_id} order by v.version
    `;
    expect(rows).toEqual([
      {
        current_version: 2,
        version: 1,
        name_en: request.name_en,
        description: request.description,
        notes: request.notes,
        default_rest_time: 90,
        default_rir: 2,
        default_reps: { min: 8, max: 12 },
      },
      {
        current_version: 2,
        version: 2,
        name_en: versionRequest.name_en,
        description: request.description,
        notes: request.notes,
        default_rest_time: 90,
        default_rir: 2,
        default_reps: { min: 8, max: 12 },
      },
    ]);
  });

  it('returns the identical response and commits one effect for concurrent identical creates', async () => {
    const key = randomUUID();
    const responses = await Promise.all(
      [0, 1].map(() =>
        asActor(
          poId,
          (tx) =>
            tx`select public.catalog_create_exercise(${key}, ${tx.json(request)})`,
        ),
      ),
    );
    expect(responses[0]).toEqual(responses[1]);
    const result = responses[0]![0]?.catalog_create_exercise as {
      exercise_id: string;
      version: number;
    };
    expect(result.version).toBe(1);
    await expect(
      db`select count(*)::int as versions from public.exercise_versions where exercise_id = ${result.exercise_id}`,
    ).resolves.toEqual([{ versions: 1 }]);
  });

  it('returns the identical response and appends one version for concurrent identical edits', async () => {
    const createKey = randomUUID();
    const created = await asActor(
      poId,
      (tx) =>
        tx`select public.catalog_create_exercise(${createKey}, ${tx.json(request)})`,
    );
    const result = created[0]?.catalog_create_exercise as {
      exercise_id: string;
      version: number;
    };
    const key = randomUUID();
    const update = { ...request, name_en: 'Concurrent exercise edit' };
    const responses = await Promise.all(
      [0, 1].map(() =>
        asActor(
          poId,
          (tx) =>
            tx`select public.catalog_version_exercise(${result.exercise_id}, 1, ${key}, ${tx.json(update)})`,
        ),
      ),
    );
    expect(responses[0]).toEqual(responses[1]);
    expect(responses[0]![0]?.catalog_version_exercise).toEqual({
      exercise_id: result.exercise_id,
      version: 2,
    });
    await expect(
      asActor(
        poId,
        (tx) =>
          tx`select public.catalog_version_exercise(${result.exercise_id}, null, ${randomUUID()}, ${tx.json(update)})`,
      ),
    ).rejects.toMatchObject({ code: '40001' });
    await expect(
      db`select count(*)::int as versions from public.exercise_versions where exercise_id = ${result.exercise_id}`,
    ).resolves.toEqual([{ versions: 2 }]);
  });
});
