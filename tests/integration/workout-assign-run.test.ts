import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;

beforeAll(async () => {
  f = await twoWorkspaceFixture();
});

afterAll(async () => {
  await db.end();
});

async function asPo<T>(tx: postgres.TransactionSql, body: () => Promise<T>) {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })}, true)`;
  return body();
}

async function seedGlobal(title: string) {
  const id = randomUUID();
  const document = {
    schema_version: 1,
    days: [{ id: randomUUID(), kind: 'session', items: [] }],
  };
  await db.begin(async (tx) => {
    await tx`insert into public.workout_global_templates (id, current_version, created_by) values (${id}, 1, ${f.po.userId})`;
    await tx`insert into public.workout_global_template_versions (template_id, version, title, schema_version, document, created_by)
      values (${id}, 1, ${title}, 1, ${tx.json(document)}, ${f.po.userId})`;
  });
  return id;
}

async function holdIdentity(workspaceId: string, globalId: string) {
  const id = randomUUID();
  const document = {
    schema_version: 1,
    days: [{ id: randomUUID(), kind: 'session', items: [] }],
  };
  await db.begin(async (tx) => {
    await tx`insert into public.workout_workspace_templates (
      workspace_id, id, current_version, origin_global_template_id, origin_global_template_version,
      origin_assignment_id, created_by
    ) values (${workspaceId}, ${id}, 1, ${globalId}, 1, ${randomUUID()}, ${f.po.userId})`;
    await tx`insert into public.workout_workspace_template_versions (
      workspace_id, template_id, version, title, schema_version, document, created_by
    ) values (${workspaceId}, ${id}, 1, 'Held copy', 1, ${tx.json(document)}, ${f.po.userId})`;
  });
  return id;
}

describe('F17 T025 assign run RPC', () => {
  it('T027 skips a held v1 copy when assigning the newer global v2', async () => {
    const globalId = await seedGlobal('Source v1');
    const heldId = await holdIdentity(f.wsA.id, globalId);
    const nextDocument = {
      schema_version: 1,
      days: [{ id: randomUUID(), kind: 'session', items: [] }],
    };
    await db.begin(async (tx) => {
      await tx`insert into public.workout_global_template_versions (
        template_id, version, title, schema_version, document, created_by
      ) values (${globalId}, 2, 'Source v2', 1, ${tx.json(nextDocument)}, ${f.po.userId})`;
      await tx`update public.workout_global_templates set current_version = 2 where id = ${globalId}`;
    });

    const result = await db.begin(async (tx) =>
      asPo(tx, async () => {
        const rows = await tx`select public.assign_workout_templates(
          'specific', ${[globalId]}::uuid[], null, 'specific_workspaces', ${[f.wsA.id, f.wsB.id]}::uuid[], ${randomUUID()}
        ) as result`;
        return rows[0]?.result as {
          items: Array<{
            workspace_id: string;
            outcome: string;
            created_copy_ids: string[];
            skipped_template_ids: string[];
          }>;
        };
      }),
    );

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspace_id: f.wsA.id,
          outcome: 'no_copies',
          created_copy_ids: [],
          skipped_template_ids: [globalId],
        }),
        expect.objectContaining({
          workspace_id: f.wsB.id,
          outcome: 'assigned',
        }),
      ]),
    );
    const retained = await db`
      select t.id, t.current_version, t.origin_global_template_version, v.version, v.title
      from public.workout_workspace_templates t
      join public.workout_workspace_template_versions v
        on v.workspace_id = t.workspace_id and v.template_id = t.id
      where t.workspace_id = ${f.wsA.id} and t.id = ${heldId}
    `;
    expect(retained).toMatchObject([
      {
        id: heldId,
        current_version: 1,
        origin_global_template_version: 1,
        version: 1,
        title: 'Held copy',
      },
    ]);
    const createdId = result.items.find(
      (item) => item.workspace_id === f.wsB.id,
    )?.created_copy_ids[0];
    if (!createdId) throw new Error('Version 2 assignment copy id is missing');
    const created = await db`
      select t.origin_global_template_version, v.version, v.title
      from public.workout_workspace_templates t
      join public.workout_workspace_template_versions v
        on v.workspace_id = t.workspace_id and v.template_id = t.id
      where t.workspace_id = ${f.wsB.id} and t.id = ${createdId}
    `;
    expect(created).toMatchObject([
      { origin_global_template_version: 2, version: 1, title: 'Source v2' },
    ]);
  });

  it('records mixed no_copies and assigned workspace receipts, and rejects a zero-total run before writes', async () => {
    const globalId = await seedGlobal('Mixed outcome template');
    const heldId = await holdIdentity(f.wsA.id, globalId);
    const key = randomUUID();
    const result = await db.begin(async (tx) =>
      asPo(tx, async () => {
        const rows = await tx`select public.assign_workout_templates(
          'specific', ${[globalId]}::uuid[], null, 'specific_workspaces', ${[f.wsA.id, f.wsB.id]}::uuid[], ${key}
        ) as result`;
        return rows[0]?.result as {
          assigned_workspace_count: number;
          no_copies_workspace_count: number;
          items: Array<{
            workspace_id: string;
            outcome: string;
            created_copy_ids: string[];
            skipped_template_ids: string[];
          }>;
        };
      }),
    );
    expect(result.assigned_workspace_count).toBe(1);
    expect(result.no_copies_workspace_count).toBe(1);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspace_id: f.wsA.id,
          outcome: 'no_copies',
          created_copy_ids: [],
          skipped_template_ids: [globalId],
        }),
        expect.objectContaining({
          workspace_id: f.wsB.id,
          outcome: 'assigned',
        }),
      ]),
    );
    const copyId = result.items.find((item) => item.workspace_id === f.wsB.id)
      ?.created_copy_ids[0];
    if (!copyId)
      throw new Error(
        'Assigned workspace receipt is missing its created copy id',
      );
    const copied = await db`
      select t.current_version, t.origin_global_template_id, v.version, v.title
      from public.workout_workspace_templates t
      join public.workout_workspace_template_versions v on v.workspace_id=t.workspace_id and v.template_id=t.id
      where t.workspace_id=${f.wsB.id} and t.id=${copyId}
    `;
    expect(copied).toMatchObject([
      {
        current_version: 1,
        origin_global_template_id: globalId,
        version: 1,
        title: 'Mixed outcome template',
      },
    ]);

    const before =
      await db`select count(*)::int as count from public.workout_template_assignment_runs`;
    await expect(
      db.begin(async (tx) =>
        asPo(
          tx,
          () => tx`select public.assign_workout_templates(
        'specific', ${[globalId]}::uuid[], null, 'specific_workspaces', ${[f.wsA.id, f.wsB.id]}::uuid[], ${randomUUID()}
      )`,
        ),
      ),
    ).rejects.toThrow(/zero_copies/);
    const after =
      await db`select count(*)::int as count from public.workout_template_assignment_runs`;
    expect(after[0]?.count).toBe(before[0]?.count);
    const held =
      await db`select id from public.workout_workspace_templates where workspace_id=${f.wsA.id} and origin_global_template_id=${globalId}`;
    expect(held).toEqual([{ id: heldId }]);
  });

  it('reports All Workspaces exclusions and handles all/all-except with both workspace modes', async () => {
    const included = await seedGlobal('Included by all-except');
    const excluded = await seedGlobal('Excluded by all-except');
    const result = await db.begin(async (tx) =>
      asPo(tx, async () => {
        const rows = await tx`select public.assign_workout_templates(
          'all_except', null, ${[excluded]}::uuid[], 'all_workspaces', null, ${randomUUID()}
        ) as result`;
        return rows[0]?.result as {
          run_id: string;
          items: Array<{
            workspace_id: string;
            outcome: string;
            skipped_template_ids: string[];
          }>;
        };
      }),
    );
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: 'assigned' }),
        expect.objectContaining({
          workspace_id: f.wsB.id,
          outcome: 'skipped_already_assigned',
        }),
      ]),
    );
    expect(
      result.items.find((item) => item.workspace_id === f.wsB.id)
        ?.skipped_template_ids.length,
    ).toBeGreaterThan(0);
    const workspaceA = result.items.find(
      (item) => item.workspace_id === f.wsA.id,
    );
    expect(workspaceA?.skipped_template_ids.length).toBeGreaterThan(0);
    expect(workspaceA?.skipped_template_ids).not.toContain(excluded);
    const assignedTemplates = await db`
      select global_template_id from public.workout_template_assignment_copies where run_id=${result.run_id}
    `;
    expect(assignedTemplates.map((row) => row.global_template_id)).toContain(
      included,
    );
    expect(
      assignedTemplates.map((row) => row.global_template_id),
    ).not.toContain(excluded);

    const allSpecific = await db.begin(async (tx) =>
      asPo(tx, async () => {
        const rows = await tx`select public.assign_workout_templates(
          'all', null, null, 'specific_workspaces', ${[f.wsA.id]}::uuid[], ${randomUUID()}
        ) as result`;
        return rows[0]?.result as {
          run_id: string;
          assigned_workspace_count: number;
        };
      }),
    );
    expect(allSpecific.assigned_workspace_count).toBe(1);
    const allSpecificCopies = await db`
      select global_template_id from public.workout_template_assignment_copies where run_id=${allSpecific.run_id}
    `;
    expect(allSpecificCopies.map((row) => row.global_template_id)).toContain(
      excluded,
    );

    const excludeSpecific = await db.begin(async (tx) =>
      asPo(tx, async () => {
        const rows = await tx`select public.assign_workout_templates(
          'all_except', null, ${[included]}::uuid[], 'specific_workspaces', ${[f.wsB.id]}::uuid[], ${randomUUID()}
        ) as result`;
        return rows[0]?.result as {
          run_id: string;
          assigned_workspace_count: number;
        };
      }),
    );
    expect(excludeSpecific.assigned_workspace_count).toBe(1);
    const excludeSpecificCopies = await db`
      select global_template_id from public.workout_template_assignment_copies where run_id=${excludeSpecific.run_id}
    `;
    expect(
      excludeSpecificCopies.map((row) => row.global_template_id),
    ).toContain(excluded);
    expect(
      excludeSpecificCopies.map((row) => row.global_template_id),
    ).not.toContain(included);
  });

  it('denies non-PO callers with a generic authorization error', async () => {
    await expect(
      db.begin(async (tx) => {
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })}, true)`;
        return tx`select public.assign_workout_templates('all', null, null, 'specific_workspaces', ${[f.wsA.id]}::uuid[], ${randomUUID()})`;
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('T026 replays a committed assignment after authorization and conflicts when arguments change', async () => {
    const globalId = await seedGlobal('Retry assignment template');
    const key = randomUUID();
    const invoke = (templateIds: string[]) =>
      db.begin(async (tx) =>
        asPo(tx, async () => {
          const rows = await tx`select public.assign_workout_templates(
          'specific', ${templateIds}::uuid[], null, 'specific_workspaces', ${[f.wsA.id]}::uuid[], ${key}
        ) as result`;
          return rows[0]?.result;
        }),
      );

    const committed = await invoke([globalId]); // Simulate losing the first response.
    await expect(
      db.begin(async (tx) => {
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })}, true)`;
        return tx`select public.assign_workout_templates(
          'specific', ${[globalId]}::uuid[], null, 'specific_workspaces', ${[f.wsA.id]}::uuid[], ${key}
        )`;
      }),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(invoke([globalId])).resolves.toEqual(committed);

    const otherGlobalId = await seedGlobal('Changed retry assignment template');
    await expect(invoke([otherGlobalId])).rejects.toThrow(
      /operation_key_conflict/,
    );
    const runs =
      await db`select count(*)::int as count from public.workout_template_assignment_runs where actor_id=${f.po.userId} and operation_key=${key}`;
    expect(runs[0]?.count).toBe(1);
  });

  it('T049 serializes concurrent assignment replays and 100 retries without duplicate copies', async () => {
    const globalId = await seedGlobal('Concurrent retry assignment template');
    const key = randomUUID();
    const invoke = () =>
      db.begin(async (tx) =>
        asPo(tx, async () => {
          const rows = await tx`select public.assign_workout_templates(
          'specific', ${[globalId]}::uuid[], null, 'specific_workspaces', ${[f.wsB.id]}::uuid[], ${key}
        ) as result`;
          return rows[0]?.result;
        }),
      );
    const results = await Promise.all(Array.from({ length: 100 }, invoke));
    expect(
      results.every(
        (result) => JSON.stringify(result) === JSON.stringify(results[0]),
      ),
    ).toBe(true);
    const runs =
      await db`select count(*)::int as count from public.workout_template_assignment_runs where actor_id=${f.po.userId} and operation_key=${key}`;
    const copies =
      await db`select count(*)::int as count from public.workout_template_assignment_copies where global_template_id=${globalId} and workspace_id=${f.wsB.id}`;
    expect(runs[0]?.count).toBe(1);
    expect(copies[0]?.count).toBe(1);
  }, 120_000);

  it('T049 serializes different concurrent assignment runs for one workspace/template identity', async () => {
    const globalId = await seedGlobal('Concurrent distinct assignment runs');
    const invoke = (key: string) =>
      db.begin(async (tx) =>
        asPo(tx, async () => {
          const rows = await tx`select public.assign_workout_templates(
          'specific', ${[globalId]}::uuid[], null, 'specific_workspaces', ${[f.wsA.id]}::uuid[], ${key}
        ) as result`;
          return rows[0]?.result;
        }),
      );
    const outcomes = await Promise.allSettled([
      invoke(randomUUID()),
      invoke(randomUUID()),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(1);
    const copies =
      await db`select count(*)::int as count from public.workout_template_assignment_copies where global_template_id=${globalId} and workspace_id=${f.wsA.id}`;
    expect(copies[0]?.count).toBe(1);
  });
});
