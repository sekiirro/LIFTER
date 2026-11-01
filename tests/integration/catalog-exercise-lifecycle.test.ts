import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
const concurrentDb = postgres(process.env.DB_URL!, {
  max: 2,
  connect_timeout: 10,
});
let poId: string;
let trainerId: string;

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

async function createExercise(name = 'Lifecycle exercise') {
  const id = randomUUID();
  await db.begin(async (tx) => {
    await tx`insert into public.exercises(id, created_by, current_version) values (${id}, ${poId}, 1)`;
    await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
      values (${id}, 1, ${tx.json({ name_en: name, name_ar: 'تمرين' })}, ${poId})`;
  });
  return id;
}

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  poId = fixture.po.userId;
  trainerId = fixture.trainerA.userId;
});

afterAll(async () => Promise.all([db.end(), concurrentDb.end()]));

describe('global exercise lifecycle and merge RPCs', () => {
  it('appends Remove/Restore markers without changing content versions and rejects stale transitions', async () => {
    const exerciseId = await createExercise();
    const removeKey = randomUUID();
    const removed = await Promise.all(
      [0, 1].map(() =>
        asActor(
          poId,
          (tx) =>
            tx`select public.catalog_transition_exercise(${exerciseId}, 0, 'remove', ${removeKey})`,
        ),
      ),
    );
    expect(removed[0]).toEqual(removed[1]);
    expect(
      (
        removed[0]![0]?.catalog_transition_exercise as {
          lifecycle_state: string;
        }
      ).lifecycle_state,
    ).toBe('removed');
    await expect(
      db`select count(*)::int as versions from public.exercise_versions where exercise_id = ${exerciseId}`,
    ).resolves.toEqual([{ versions: 1 }]);
    await expect(
      db`select count(*)::int as events from public.exercise_lifecycle_events where exercise_id = ${exerciseId}`,
    ).resolves.toEqual([{ events: 1 }]);
    await expect(
      asActor(
        poId,
        (tx) =>
          tx`select public.catalog_transition_exercise(${exerciseId}, 0, 'remove', ${randomUUID()})`,
      ),
    ).rejects.toMatchObject({ code: '40001' });
    const restored = await asActor(
      poId,
      (tx) =>
        tx`select public.catalog_transition_exercise(${exerciseId}, 1, 'restore', ${randomUUID()})`,
    );
    expect(
      (restored[0]?.catalog_transition_exercise as { lifecycle_state: string })
        .lifecycle_state,
    ).toBe('active');
    await expect(
      db`select count(*)::int as versions from public.exercise_versions where exercise_id = ${exerciseId}`,
    ).resolves.toEqual([{ versions: 1 }]);
    await expect(
      db`select count(*)::int as events from public.exercise_lifecycle_events where exercise_id = ${exerciseId}`,
    ).resolves.toEqual([{ events: 2 }]);
    await expect(
      asActor(
        trainerId,
        (tx) =>
          tx`select public.catalog_transition_exercise(${exerciseId}, 2, 'remove', ${randomUUID()})`,
      ),
    ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
  });

  it('locks and flattens merge aliases to the active terminal without rewriting content', async () => {
    const alias = await createExercise('Alias');
    const source = await createExercise('Source');
    const intermediate = await createExercise('Intermediate');
    const terminal = await createExercise('Terminal');
    await asActor(
      poId,
      (tx) =>
        tx`select public.catalog_merge_exercise(${intermediate}, ${terminal}, 0, ${randomUUID()})`,
    );
    await asActor(
      poId,
      (tx) =>
        tx`select public.catalog_merge_exercise(${alias}, ${source}, 0, ${randomUUID()})`,
    );
    const key = randomUUID();
    const responses = await Promise.all(
      [0, 1].map(() =>
        asActor(
          poId,
          (tx) =>
            tx`select public.catalog_merge_exercise(${source}, ${intermediate}, 0, ${key})`,
        ),
      ),
    );
    expect(responses[0]).toEqual(responses[1]);
    await expect(
      db`select count(*)::int as audit_events from public.audit_events
        where action = 'catalog.exercise_merged' and target_id = ${source}`,
    ).resolves.toEqual([{ audit_events: 1 }]);
    await expect(
      db`select lifecycle_state from public.exercise_lifecycle_events where exercise_id = ${source}`,
    ).resolves.toEqual([{ lifecycle_state: 'merged' }]);
    await expect(
      db`select id, lifecycle_state, superseded_by from public.exercises where id in (${alias}, ${source}, ${intermediate}, ${terminal}) order by id`,
    ).resolves.toEqual(
      expect.arrayContaining([
        { id: alias, lifecycle_state: 'merged', superseded_by: terminal },
        { id: source, lifecycle_state: 'merged', superseded_by: terminal },
        {
          id: intermediate,
          lifecycle_state: 'merged',
          superseded_by: terminal,
        },
        { id: terminal, lifecycle_state: 'active', superseded_by: null },
      ]),
    );
    for (const aliasId of [alias, source, intermediate]) {
      await expect(
        asActor(
          poId,
          (tx) =>
            tx`select public.catalog_resolve_exercise_selection(${aliasId})`,
        ),
      ).resolves.toEqual([{ catalog_resolve_exercise_selection: terminal }]);
      await expect(
        db`select count(*)::int as versions from public.exercise_versions where exercise_id = ${aliasId}`,
      ).resolves.toEqual([{ versions: 1 }]);
    }
  });

  it('rechecks both roots under concurrent opposite merges and never creates a cycle', async () => {
    const left = await createExercise('Left');
    const right = await createExercise('Right');
    const outcomes = await Promise.allSettled([
      asActor(
        poId,
        (tx) =>
          tx`select public.catalog_merge_exercise(${left}, ${right}, 0, ${randomUUID()})`,
      ),
      asActor(
        poId,
        (tx) =>
          tx`select public.catalog_merge_exercise(${right}, ${left}, 0, ${randomUUID()})`,
      ),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(1);
    const rows =
      await db`select id, lifecycle_state, superseded_by from public.exercises where id in (${left}, ${right})`;
    expect(rows.filter((row) => row.lifecycle_state === 'active')).toHaveLength(
      1,
    );
    expect(rows.filter((row) => row.lifecycle_state === 'merged')).toHaveLength(
      1,
    );
    const cycle = await db`
      with recursive chain(start_id, id, superseded_by, path, cycle) as (
        select e.id, e.id, e.superseded_by, array[e.id], false from public.exercises e where e.id in (${left}, ${right})
        union all
        select c.start_id, e.id, e.superseded_by, c.path || e.id, e.id = any(c.path)
        from chain c join public.exercises e on e.id = c.superseded_by where c.superseded_by is not null and not c.cycle
      ) select exists(select 1 from chain where cycle) as has_cycle`;
    expect(cycle[0]?.has_cycle).toBe(false);
  });
});
