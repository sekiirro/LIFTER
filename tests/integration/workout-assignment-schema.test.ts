import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createStaff, sql, twoWorkspaceFixture } from './harness';

let db: ReturnType<typeof sql>;

beforeAll(() => {
  db = sql();
});

afterAll(async () => {
  await db?.end();
});

async function seedGlobalTemplate(
  poUserId: string,
  globalId: string,
  version: number,
  title: string,
) {
  const doc = {
    schema_version: 1,
    days: [{ id: randomUUID(), kind: 'session', items: [] }],
  };
  await db.begin(async (tx) => {
    if (version === 1) {
      await tx`
        insert into public.workout_global_templates (id, current_version, created_by)
        values (${globalId}, 1, ${poUserId})
      `;
    }
    await tx`
      insert into public.workout_global_template_versions (template_id, version, title, schema_version, document, created_by)
      values (${globalId}, ${version}, ${title}, 1, ${tx.json(doc)}, ${poUserId})
    `;
    if (version > 1) {
      await tx`
        update public.workout_global_templates
        set current_version = ${version}, updated_at = now()
        where id = ${globalId}
      `;
    }
  });
}

async function seedWorkspaceCopy(params: {
  workspaceId: string;
  wsTemplateId: string;
  globalId: string;
  globalVersion: number;
  runId: string;
  actorId: string;
}) {
  const doc = {
    schema_version: 1,
    days: [{ id: randomUUID(), kind: 'session', items: [] }],
  };
  await db.begin(async (tx) => {
    await tx`
      insert into public.workout_workspace_templates (
        workspace_id, id, current_version,
        origin_global_template_id, origin_global_template_version, origin_assignment_id,
        created_by
      )
      values (
        ${params.workspaceId}, ${params.wsTemplateId}, 1,
        ${params.globalId}, ${params.globalVersion}, ${params.runId},
        ${params.actorId}
      )
    `;
    await tx`
      insert into public.workout_workspace_template_versions (
        workspace_id, template_id, version, title, schema_version, document, created_by
      )
      values (
        ${params.workspaceId}, ${params.wsTemplateId}, 1, 'Assigned Copy', 1, ${tx.json(doc)}, ${params.actorId}
      )
    `;
  });
}

describe('F17 T014 assignment runs, items, copies, and distribution state', () => {
  it('enforces run/item/copy ledgers, copy uniqueness across versions/retries, and immutability', async () => {
    const { po, wsA, wsB } = await twoWorkspaceFixture();
    const globalId = randomUUID();
    await seedGlobalTemplate(po.userId, globalId, 1, 'Global Strength v1');
    await seedGlobalTemplate(po.userId, globalId, 2, 'Global Strength v2');

    const run1Id = randomUUID();
    const opKey1 = randomUUID();
    const copyWsAId = randomUUID();

    // Zero-copy run rejected
    await expect(
      db`
        insert into public.workout_template_assignment_runs (
          id, actor_id, operation_key, request_hash,
          template_selection_mode, target_mode,
          assigned_workspace_count, created_copies_count
        )
        values (
          ${randomUUID()}, ${po.userId}, ${randomUUID()}, 'sha256:zero',
          'all', 'all_workspaces', 0, 0
        )
      `,
    ).rejects.toThrow(/violates check constraint/);

    // Invalid selection mode / array combinations rejected
    await expect(
      db`
        insert into public.workout_template_assignment_runs (
          id, actor_id, operation_key, request_hash,
          template_selection_mode, selected_template_ids, target_mode,
          assigned_workspace_count, created_copies_count
        )
        values (
          ${randomUUID()}, ${po.userId}, ${randomUUID()}, 'sha256:bad-spec',
          'specific', null, 'all_workspaces', 1, 1
        )
      `,
    ).rejects.toThrow(/violates check constraint/);

    await seedWorkspaceCopy({
      workspaceId: wsA.id,
      wsTemplateId: copyWsAId,
      globalId,
      globalVersion: 1,
      runId: run1Id,
      actorId: po.userId,
    });

    await db.begin(async (tx) => {
      await tx`
        insert into public.workout_template_assignment_runs (
          id, actor_id, operation_key, request_hash,
          template_selection_mode, selected_template_ids,
          target_mode, selected_workspace_ids,
          assigned_workspace_count, skipped_already_assigned_count,
          no_copies_workspace_count, denied_workspace_count, created_copies_count
        )
        values (
          ${run1Id}, ${po.userId}, ${opKey1}, 'sha256:run1',
          'specific', ${[globalId]}::uuid[],
          'specific_workspaces', ${[wsA.id, wsB.id]}::uuid[],
          1, 0, 1, 0, 1
        )
      `;
      await tx`
        insert into public.workout_template_assignment_items (
          run_id, workspace_id, outcome, created_copy_ids
        )
        values
          (${run1Id}, ${wsA.id}, 'assigned', ${[copyWsAId]}::uuid[]),
          (${run1Id}, ${wsB.id}, 'no_copies', ${[]}::uuid[])
      `;
      await tx`
        insert into public.workout_template_assignment_copies (
          run_id, workspace_id, global_template_id, global_template_version,
          workspace_template_id, workspace_template_version
        )
        values (
          ${run1Id}, ${wsA.id}, ${globalId}, 1,
          ${copyWsAId}, 1
        )
      `;
    });

    // Duplicate (actor_id, operation_key) rejected
    await expect(
      db`
        insert into public.workout_template_assignment_runs (
          id, actor_id, operation_key, request_hash,
          template_selection_mode, target_mode,
          assigned_workspace_count, created_copies_count
        )
        values (
          ${randomUUID()}, ${po.userId}, ${opKey1}, 'sha256:dup-op',
          'all', 'all_workspaces', 1, 1
        )
      `,
    ).rejects.toThrow(/duplicate key value violates unique constraint/);

    // Duplicate (run_id, workspace_id) item rejected
    await expect(
      db`
        insert into public.workout_template_assignment_items (
          run_id, workspace_id, outcome, created_copy_ids
        )
        values (${run1Id}, ${wsA.id}, 'no_copies', ${[]}::uuid[])
      `,
    ).rejects.toThrow(/duplicate key value violates unique constraint/);

    // Outcome/copy_ids invariant: 'assigned' requires non-empty created_copy_ids; 'no_copies' requires empty
    await expect(
      db`
        insert into public.workout_template_assignment_items (
          run_id, workspace_id, outcome, created_copy_ids
        )
        values (${run1Id}, ${randomUUID()}, 'assigned', ${[]}::uuid[])
      `,
    ).rejects.toThrow(/violates check constraint/);

    // Copy uniqueness: second copy for same (workspace_id, global_template_id) even in a NEW run and NEW global_template_version MUST fail
    const run2Id = randomUUID();
    const copyWsADupId = randomUUID();
    await expect(
      db.begin(async (tx) => {
        await tx`
          insert into public.workout_template_assignment_runs (
            id, actor_id, operation_key, request_hash,
            template_selection_mode, target_mode,
            assigned_workspace_count, created_copies_count
          )
          values (
            ${run2Id}, ${po.userId}, ${randomUUID()}, 'sha256:run2',
            'all', 'all_workspaces', 1, 1
          )
        `;
        await tx`
          insert into public.workout_template_assignment_items (
            run_id, workspace_id, outcome, created_copy_ids
          )
          values (${run2Id}, ${wsA.id}, 'assigned', ${[copyWsADupId]}::uuid[])
        `;
        await tx`
          insert into public.workout_template_assignment_copies (
            run_id, workspace_id, global_template_id, global_template_version,
            workspace_template_id, workspace_template_version
          )
          values (
            ${run2Id}, ${wsA.id}, ${globalId}, 2,
            ${copyWsAId}, 1
          )
        `;
      }),
    ).rejects.toThrow(/duplicate key value violates unique constraint/);

    // Ledger immutability: UPDATE and DELETE rejected on runs, items, copies
    await expect(
      db`update public.workout_template_assignment_runs set assigned_workspace_count = 2 where id = ${run1Id}`,
    ).rejects.toThrow(/assignment_ledger_immutable/);
    await expect(
      db`delete from public.workout_template_assignment_runs where id = ${run1Id}`,
    ).rejects.toThrow(/assignment_ledger_immutable/);

    await expect(
      db`update public.workout_template_assignment_items set outcome = 'denied', created_copy_ids = '{}' where run_id = ${run1Id} and workspace_id = ${wsA.id}`,
    ).rejects.toThrow(/assignment_ledger_immutable/);
    await expect(
      db`delete from public.workout_template_assignment_items where run_id = ${run1Id} and workspace_id = ${wsA.id}`,
    ).rejects.toThrow(/assignment_ledger_immutable/);

    await expect(
      db`update public.workout_template_assignment_copies set global_template_version = 2 where run_id = ${run1Id} and workspace_id = ${wsA.id}`,
    ).rejects.toThrow(/assignment_ledger_immutable/);
    await expect(
      db`delete from public.workout_template_assignment_copies where run_id = ${run1Id} and workspace_id = ${wsA.id}`,
    ).rejects.toThrow(/assignment_ledger_immutable/);
  });

  it('enforces per-workspace distribution state monotonicity, first_assignment immutability, and no-delete', async () => {
    const { po, wsA } = await twoWorkspaceFixture();
    const run1Id = randomUUID();
    const run2Id = randomUUID();

    await db.begin(async (tx) => {
      await tx`
        insert into public.workout_template_assignment_runs (
          id, actor_id, operation_key, request_hash,
          template_selection_mode, target_mode, selected_workspace_ids,
          assigned_workspace_count, created_copies_count
        )
        values
          (${run1Id}, ${po.userId}, ${randomUUID()}, 'sha256:d1', 'all', 'all_workspaces', null, 1, 1),
          (${run2Id}, ${po.userId}, ${randomUUID()}, 'sha256:d2', 'all', 'specific_workspaces', ${[wsA.id]}::uuid[], 1, 1)
      `;
    });

    // Invalid state: flag=true with null first_assigned_at rejected
    await expect(
      db`
        insert into public.workout_template_distribution_state (
          workspace_id, ever_received_global_assignment
        )
        values (${wsA.id}, true)
      `,
    ).rejects.toThrow(/violates check constraint/);

    // Valid initial false row, then transition false -> true
    await db`
      insert into public.workout_template_distribution_state (
        workspace_id, ever_received_global_assignment
      )
      values (${wsA.id}, false)
    `;

    const firstAt = new Date().toISOString();
    await db`
      update public.workout_template_distribution_state
      set
        ever_received_global_assignment = true,
        first_assigned_at = ${firstAt},
        first_assignment_id = ${run1Id},
        last_assignment_id = ${run1Id},
        updated_at = now()
      where workspace_id = ${wsA.id}
    `;

    // Updating last_assignment_id on subsequent specific assignment is allowed
    await db`
      update public.workout_template_distribution_state
      set last_assignment_id = ${run2Id}, updated_at = now()
      where workspace_id = ${wsA.id}
    `;

    // Clearing ever_received_global_assignment rejected
    await expect(
      db`
        update public.workout_template_distribution_state
        set
          ever_received_global_assignment = false,
          first_assigned_at = null,
          first_assignment_id = null,
          last_assignment_id = null
        where workspace_id = ${wsA.id}
      `,
    ).rejects.toThrow(/distribution_state_immutable/);

    // Mutating first_assignment_id once set rejected
    await expect(
      db`
        update public.workout_template_distribution_state
        set first_assignment_id = ${run2Id}
        where workspace_id = ${wsA.id}
      `,
    ).rejects.toThrow(/distribution_state_immutable/);

    // Delete rejected
    await expect(
      db`delete from public.workout_template_distribution_state where workspace_id = ${wsA.id}`,
    ).rejects.toThrow(/distribution_state_immutable/);
  });

  it('enforces PO-only SELECT and denies workspace staff, sales, foreign users, and anon', async () => {
    const { po, woA, wsA } = await twoWorkspaceFixture();
    const trainerA = await createStaff('trainer', 't014-trainer');
    const salesA = await createStaff('sales', 't014-sales');
    const foreignWo = await createStaff('workspace_owner', 't014-foreign');
    const globalId = randomUUID();
    await seedGlobalTemplate(po.userId, globalId, 1, 'Global PO');

    const runId = randomUUID();
    const copyId = randomUUID();
    await seedWorkspaceCopy({
      workspaceId: wsA.id,
      wsTemplateId: copyId,
      globalId,
      globalVersion: 1,
      runId,
      actorId: po.userId,
    });

    await db.begin(async (tx) => {
      await tx`
        insert into public.workout_template_assignment_runs (
          id, actor_id, operation_key, request_hash,
          template_selection_mode, target_mode,
          assigned_workspace_count, created_copies_count
        )
        values (${runId}, ${po.userId}, ${randomUUID()}, 'sha256:rls', 'all', 'all_workspaces', 1, 1)
      `;
      await tx`
        insert into public.workout_template_assignment_items (
          run_id, workspace_id, outcome, created_copy_ids
        )
        values (${runId}, ${wsA.id}, 'assigned', ${[copyId]}::uuid[])
      `;
      await tx`
        insert into public.workout_template_assignment_copies (
          run_id, workspace_id, global_template_id, global_template_version,
          workspace_template_id, workspace_template_version
        )
        values (${runId}, ${wsA.id}, ${globalId}, 1, ${copyId}, 1)
      `;
      await tx`
        insert into public.workout_template_distribution_state (
          workspace_id, ever_received_global_assignment,
          first_assigned_at, first_assignment_id, last_assignment_id
        )
        values (${wsA.id}, true, now(), ${runId}, ${runId})
      `;
    });

    // PO can read all 4 tables
    for (const table of [
      'workout_template_assignment_runs',
      'workout_template_assignment_items',
      'workout_template_assignment_copies',
      'workout_template_distribution_state',
    ] as const) {
      const { data, error } = await po.client.from(table).select('*');
      expect(error, table).toBeNull();
      expect(data?.length, table).toBeGreaterThan(0);

      // Non-PO authenticated roles see 0 rows via RLS
      for (const actor of [woA, foreignWo, trainerA, salesA]) {
        const res = await actor.client.from(table).select('*');
        expect(res.error, `${table} for ${actor.userId}`).toBeNull();
        expect(res.data, `${table} for ${actor.userId}`).toEqual([]);
      }

      // Anon denied
      const anonRes = await anonClient().from(table).select('*');
      expect(anonRes.error, `anon ${table}`).not.toBeNull();
    }

    // Direct DML denied for PO and staff via PostgREST
    const insRun = await po.client
      .from('workout_template_assignment_runs')
      .insert({
        actor_id: po.userId,
        operation_key: randomUUID(),
        request_hash: 'sha256:direct',
        template_selection_mode: 'all',
        target_mode: 'all_workspaces',
        assigned_workspace_count: 1,
        created_copies_count: 1,
      });
    expect(insRun.error).not.toBeNull();
  });
});
