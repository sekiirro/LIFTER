import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import {
  admin,
  checked,
  sql,
  twoWorkspaceFixture,
  type Workspace,
} from './harness';

// F17 T046: Assignment state visibility tests (FR-011, SC-004).
// Proves that never-assigned, intentionally partial, and own-templates-only
// are distinguishable in run receipts (the #176 RPC) and in durable state.

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

async function makeTestWorkspace(label: string): Promise<Workspace> {
  const cleanLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  return checked(
    await admin()
      .from('workspaces')
      .insert({
        name: `Visibility ${label} ${suffix.slice(0, 6)}`,
        slug: `vis-${cleanLabel}-${suffix}`,
        created_by: f.po.userId,
      })
      .select()
      .single(),
  ) as Workspace;
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

async function seedOwnTemplate(workspaceId: string, title: string) {
  const id = randomUUID();
  const document = {
    schema_version: 1,
    days: [{ id: randomUUID(), kind: 'session', items: [] }],
  };
  await db.begin(async (tx) => {
    await tx`insert into public.workout_workspace_templates (
      workspace_id, id, current_version, origin_global_template_id, origin_global_template_version,
      origin_assignment_id, created_by
    ) values (${workspaceId}, ${id}, 1, null, null, null, ${f.po.userId})`;
    await tx`insert into public.workout_workspace_template_versions (
      workspace_id, template_id, version, title, schema_version, document, created_by
    ) values (${workspaceId}, ${id}, 1, ${title}, 1, ${tx.json(document)}, ${f.po.userId})`;
  });
  return id;
}

async function seedInitialAssignment(workspaceId: string, globalId: string) {
  const key = randomUUID();
  await db.begin(async (tx) =>
    asPo(tx, async () => {
      await tx`select public.assign_workout_templates(
        'specific', ${[globalId]}::uuid[], null,
        'specific_workspaces', ${[workspaceId]}::uuid[],
        ${key}
      )`;
    }),
  );
}

type AssignRpcResult = {
  run_id: string;
  assigned_workspace_count: number;
  skipped_already_assigned_count: number;
  no_copies_workspace_count: number;
  created_copies_count: number;
  items: Array<{
    workspace_id: string;
    outcome: 'assigned' | 'skipped_already_assigned' | 'no_copies' | 'denied';
    created_copy_ids: string[];
    skipped_template_ids: string[];
  }>;
};

describe('F17 T046: Assignment state visibility tests (FR-011, SC-004)', () => {
  it('All Workspaces run receipts distinguish intentionally partial from never-assigned and own-templates-only', async () => {
    const gt1 = await seedGlobal('All Workspaces Test Global 1');
    const wsNever = await makeTestWorkspace('never-assigned-1');
    const wsPartial = await makeTestWorkspace('partial-assigned-1');
    const wsOwnOnly = await makeTestWorkspace('own-only-1');

    // Setup initial states
    await seedInitialAssignment(wsPartial.id, gt1);
    const ownTemplateId = await seedOwnTemplate(
      wsOwnOnly.id,
      'Self-Created Plan',
    );

    // Run All Workspaces assignment
    const key = randomUUID();
    const result = await db.begin(async (tx) =>
      asPo(tx, async () => {
        const rows = await tx`select public.assign_workout_templates(
          'all', null, null, 'all_workspaces', null, ${key}
        ) as result`;
        return rows[0]?.result as AssignRpcResult;
      }),
    );

    expect(result.run_id).toBeDefined();

    // 1. Receipt distinguishes intentionally partial:
    // wsPartial is skipped with outcome 'skipped_already_assigned'
    const partialItem = result.items.find(
      (item) => item.workspace_id === wsPartial.id,
    );
    expect(partialItem).toBeDefined();
    expect(partialItem?.outcome).toBe('skipped_already_assigned');
    expect(partialItem?.created_copy_ids).toEqual([]);
    expect(partialItem?.skipped_template_ids).toContain(gt1);

    // 2. Receipt distinguishes never-assigned:
    // wsNever is eligible and receives copies with outcome 'assigned'
    const neverItem = result.items.find(
      (item) => item.workspace_id === wsNever.id,
    );
    expect(neverItem).toBeDefined();
    expect(neverItem?.outcome).toBe('assigned');
    expect(neverItem?.created_copy_ids.length).toBeGreaterThan(0);
    expect(neverItem?.skipped_template_ids).toEqual([]);

    // 3. Receipt distinguishes own-templates-only:
    // wsOwnOnly is eligible under literal PO A2 and receives copies with outcome 'assigned'
    const ownItem = result.items.find(
      (item) => item.workspace_id === wsOwnOnly.id,
    );
    expect(ownItem).toBeDefined();
    expect(ownItem?.outcome).toBe('assigned');
    expect(ownItem?.created_copy_ids.length).toBeGreaterThan(0);
    expect(ownItem?.skipped_template_ids).toEqual([]);

    // Invariant: wsPartial outcome differs from wsNever and wsOwnOnly
    expect(partialItem?.outcome).not.toBe(neverItem?.outcome);
    expect(partialItem?.outcome).not.toBe(ownItem?.outcome);

    // 4. Persistence verification: own template is preserved on wsOwnOnly
    const ownRetained = await db`
      select id, origin_global_template_id from public.workout_workspace_templates
      where workspace_id = ${wsOwnOnly.id} and id = ${ownTemplateId}
    `;
    expect(ownRetained).toHaveLength(1);
    expect(ownRetained[0]?.origin_global_template_id).toBeNull();

    // wsOwnOnly now has its own template PLUS the new global copies
    const ownAllTemplates = await db`
      select id, origin_global_template_id from public.workout_workspace_templates
      where workspace_id = ${wsOwnOnly.id}
    `;
    const ownTemplatesCount = ownAllTemplates.filter(
      (t) => t.origin_global_template_id === null,
    ).length;
    const globalCopiesCount = ownAllTemplates.filter(
      (t) => t.origin_global_template_id !== null,
    ).length;
    expect(ownTemplatesCount).toBe(1);
    expect(globalCopiesCount).toBe(ownItem?.created_copy_ids.length);

    // wsNever holds only global copies (0 own templates)
    const neverAllTemplates = await db`
      select id, origin_global_template_id from public.workout_workspace_templates
      where workspace_id = ${wsNever.id}
    `;
    expect(
      neverAllTemplates.every((t) => t.origin_global_template_id !== null),
    ).toBe(true);

    // 5. Ledger items table verification: durable receipts match returned JSON
    const ledgerRows = await db`
      select workspace_id, outcome, created_copy_ids
      from public.workout_template_assignment_items
      where run_id = ${result.run_id} and workspace_id in (${wsNever.id}, ${wsPartial.id}, ${wsOwnOnly.id})
    `;
    const ledgerMap = new Map(ledgerRows.map((r) => [r.workspace_id, r]));
    expect(ledgerMap.get(wsPartial.id)?.outcome).toBe(
      'skipped_already_assigned',
    );
    expect(ledgerMap.get(wsNever.id)?.outcome).toBe('assigned');
    expect(ledgerMap.get(wsOwnOnly.id)?.outcome).toBe('assigned');
  });

  it('Specific Workspaces run receipts distinguish held templates (no_copies vs assigned)', async () => {
    const gtTarget = await seedGlobal('Specific Target Global');
    const wsNever2 = await makeTestWorkspace('never-specific-2');
    const wsPartial2 = await makeTestWorkspace('partial-specific-2');
    const wsOwnOnly2 = await makeTestWorkspace('own-specific-2');

    // wsPartial2 already holds gtTarget
    await seedInitialAssignment(wsPartial2.id, gtTarget);
    // wsOwnOnly2 has a self-created template
    await seedOwnTemplate(wsOwnOnly2.id, 'Own Self Plan 2');

    // Run Specific Workspaces targeting gtTarget across all 3 workspaces
    const key = randomUUID();
    const result = await db.begin(async (tx) =>
      asPo(tx, async () => {
        const rows = await tx`select public.assign_workout_templates(
          'specific', ${[gtTarget]}::uuid[], null,
          'specific_workspaces', ${[wsNever2.id, wsPartial2.id, wsOwnOnly2.id]}::uuid[],
          ${key}
        ) as result`;
        return rows[0]?.result as AssignRpcResult;
      }),
    );

    // 1. wsPartial2 receipt shows outcome 'no_copies' with skipped identity
    const partialItem = result.items.find(
      (item) => item.workspace_id === wsPartial2.id,
    );
    expect(partialItem).toBeDefined();
    expect(partialItem?.outcome).toBe('no_copies');
    expect(partialItem?.created_copy_ids).toEqual([]);
    expect(partialItem?.skipped_template_ids).toEqual([gtTarget]);

    // 2. wsNever2 receipt shows outcome 'assigned' with 1 copy created
    const neverItem = result.items.find(
      (item) => item.workspace_id === wsNever2.id,
    );
    expect(neverItem).toBeDefined();
    expect(neverItem?.outcome).toBe('assigned');
    expect(neverItem?.created_copy_ids).toHaveLength(1);
    expect(neverItem?.skipped_template_ids).toEqual([]);

    // 3. wsOwnOnly2 receipt shows outcome 'assigned' with 1 copy created
    const ownItem = result.items.find(
      (item) => item.workspace_id === wsOwnOnly2.id,
    );
    expect(ownItem).toBeDefined();
    expect(ownItem?.outcome).toBe('assigned');
    expect(ownItem?.created_copy_ids).toHaveLength(1);
    expect(ownItem?.skipped_template_ids).toEqual([]);

    // Distinctness: no_copies vs assigned
    expect(partialItem?.outcome).not.toBe(neverItem?.outcome);
    expect(partialItem?.outcome).not.toBe(ownItem?.outcome);
  });

  it('Specific Workspaces receipt distinguishes intentional partial addition with skipped identities', async () => {
    const gtHeld = await seedGlobal('Already Held Global');
    const gtNew = await seedGlobal('New Missing Global');
    const wsPartial3 = await makeTestWorkspace('partial-addition-3');

    // wsPartial3 holds gtHeld
    await seedInitialAssignment(wsPartial3.id, gtHeld);

    // Target both gtHeld and gtNew for wsPartial3
    const key = randomUUID();
    const result = await db.begin(async (tx) =>
      asPo(tx, async () => {
        const rows = await tx`select public.assign_workout_templates(
          'specific', ${[gtHeld, gtNew]}::uuid[], null,
          'specific_workspaces', ${[wsPartial3.id]}::uuid[],
          ${key}
        ) as result`;
        return rows[0]?.result as AssignRpcResult;
      }),
    );

    expect(result.assigned_workspace_count).toBe(1);
    expect(result.created_copies_count).toBe(1);

    const item = result.items[0];
    expect(item?.workspace_id).toBe(wsPartial3.id);
    expect(item?.outcome).toBe('assigned');
    // Only the missing template is created (0 duplicate of gtHeld)
    expect(item?.created_copy_ids).toHaveLength(1);
    // Already-held template identity is reported as skipped
    expect(item?.skipped_template_ids).toEqual([gtHeld]);
  });

  it('durable database state distinguishes never-assigned, intentionally partial, and own-templates-only', async () => {
    const gtSample = await seedGlobal('Durable Query Sample');
    const wsDurableNever = await makeTestWorkspace('durable-never');
    const wsDurablePartial = await makeTestWorkspace('durable-partial');
    const wsDurableOwn = await makeTestWorkspace('durable-own');

    await seedInitialAssignment(wsDurablePartial.id, gtSample);
    await seedOwnTemplate(wsDurableOwn.id, 'Durable Own Plan');

    // Query distribution state table for each workspace
    const distributionStates = await db`
      select workspace_id, ever_received_global_assignment
      from public.workout_template_distribution_state
      where workspace_id in (${wsDurableNever.id}, ${wsDurablePartial.id}, ${wsDurableOwn.id})
    `;
    const distMap = new Map(
      distributionStates.map((r) => [
        r.workspace_id,
        r.ever_received_global_assignment,
      ]),
    );

    // Query template counts partitioned by provenance
    const templateRows = await db`
      select workspace_id,
        count(*) filter (where origin_global_template_id is not null)::int as global_copies,
        count(*) filter (where origin_global_template_id is null)::int as own_templates
      from public.workout_workspace_templates
      where workspace_id in (${wsDurableNever.id}, ${wsDurablePartial.id}, ${wsDurableOwn.id})
      group by workspace_id
    `;
    const tMap = new Map(templateRows.map((r) => [r.workspace_id, r]));

    // (a) Never-assigned: distribution-state false/absent, 0 global copies, 0 own templates
    expect(distMap.get(wsDurableNever.id) ?? false).toBe(false);
    expect(tMap.get(wsDurableNever.id)?.global_copies ?? 0).toBe(0);
    expect(tMap.get(wsDurableNever.id)?.own_templates ?? 0).toBe(0);

    // (b) Intentionally partial: distribution-state true, >=1 global copies
    expect(distMap.get(wsDurablePartial.id)).toBe(true);
    expect(tMap.get(wsDurablePartial.id)?.global_copies).toBeGreaterThan(0);
    expect(tMap.get(wsDurablePartial.id)?.own_templates ?? 0).toBe(0);

    // (c) Own-templates-only: distribution-state false/absent, 0 global copies, >=1 own templates
    expect(distMap.get(wsDurableOwn.id) ?? false).toBe(false);
    expect(tMap.get(wsDurableOwn.id)?.global_copies ?? 0).toBe(0);
    expect(tMap.get(wsDurableOwn.id)?.own_templates).toBe(1);

    // Classification function over durable rows confirms three distinct states
    const classify = (wsId: string) => {
      const ever = distMap.get(wsId) ?? false;
      const copies = tMap.get(wsId)?.global_copies ?? 0;
      const own = tMap.get(wsId)?.own_templates ?? 0;
      if (ever || copies > 0) return 'intentionally_partial';
      if (own > 0) return 'own_templates_only';
      return 'never_assigned';
    };

    expect(classify(wsDurableNever.id)).toBe('never_assigned');
    expect(classify(wsDurablePartial.id)).toBe('intentionally_partial');
    expect(classify(wsDurableOwn.id)).toBe('own_templates_only');
  });

  it('PO cross-workspace read visibility differentiates own templates from assigned copies', async () => {
    const gtGov = await seedGlobal('Governance Global Plan');
    const wsGov = await makeTestWorkspace('governance-ws');

    const ownId = await seedOwnTemplate(wsGov.id, 'Self Plan Gov');
    await seedInitialAssignment(wsGov.id, gtGov);

    // 1. As PO, query the assignment copies ledger: assigned copies carry origin provenance,
    // while self-created templates have no assignment copy ledger rows.
    const poCopies = await db.begin(async (tx) =>
      asPo(tx, async () => {
        return tx`
          select workspace_id, global_template_id, global_template_version, workspace_template_id
          from public.workout_template_assignment_copies
          where workspace_id = ${wsGov.id}
        `;
      }),
    );

    expect(poCopies).toHaveLength(1);
    expect(poCopies[0]?.global_template_id).toBe(gtGov);
    expect(poCopies[0]?.global_template_version).toBe(1);
    const assignedCopyWorkspaceId = poCopies[0]?.workspace_template_id;
    expect(assignedCopyWorkspaceId).toBeDefined();
    expect(assignedCopyWorkspaceId).not.toBe(ownId);

    // 2. Non-PO roles are filtered out by RLS (0 rows visible)
    const staffCopies = await db.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })}, true)`;
      return tx`select * from public.workout_template_assignment_copies where workspace_id = ${wsGov.id}`;
    });
    expect(staffCopies).toEqual([]);

    // 3. Durable template table verification: self-created template has NULL origin provenance,
    // whereas assigned copy has origin_global_template_id pointing to gtGov.
    const rows = await db`
      select t.id, t.origin_global_template_id, t.origin_global_template_version,
        t.origin_assignment_id, v.title
      from public.workout_workspace_templates t
      join public.workout_workspace_template_versions v
        on v.workspace_id = t.workspace_id and v.template_id = t.id and v.version = t.current_version
      where t.workspace_id = ${wsGov.id}
      order by t.id
    `;

    expect(rows).toHaveLength(2);
    const ownRow = rows.find((r) => r.id === ownId);
    const copyRow = rows.find((r) => r.id === assignedCopyWorkspaceId);

    // Self-created template has NULL provenance
    expect(ownRow?.origin_global_template_id).toBeNull();
    expect(ownRow?.origin_global_template_version).toBeNull();
    expect(ownRow?.origin_assignment_id).toBeNull();
    expect(ownRow?.title).toBe('Self Plan Gov');

    // Assigned copy has explicit origin provenance
    expect(copyRow?.origin_global_template_id).toBe(gtGov);
    expect(copyRow?.origin_global_template_version).toBe(1);
    expect(copyRow?.origin_assignment_id).toBeDefined();
    expect(copyRow?.origin_assignment_id).not.toBeNull();
  });
});
