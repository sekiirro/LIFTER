import { describe, expect, it } from 'vitest';
import {
  planAssignment,
  assignmentState,
  hasOwnTemplates,
  type AssignmentTemplate,
  type AssignmentWorkspace,
} from '../../lib/workout-planner/assignment';

// T009-note: FR-010/FR-011 assignment state machine pure model (SC-003,
// SC-004). Kendo = intentionally partial (3 of 10), Alpha = full (10),
// Beta = never assigned, Gamma = own templates only. RED first. Mutation
// target: topping up a partial workspace must break the matrix.

const TEMPLATES: AssignmentTemplate[] = Array.from({ length: 10 }, (_, i) => ({
  id: `t${i + 1}`,
  version: 1,
  retired: false,
}));

function workspaces(): AssignmentWorkspace[] {
  return [
    {
      id: 'Kendo',
      everReceivedGlobal: true,
      heldTemplateIds: ['t1', 't2', 't3'],
    },
    {
      id: 'Alpha',
      everReceivedGlobal: true,
      heldTemplateIds: TEMPLATES.map((t) => t.id),
    },
    { id: 'Beta', everReceivedGlobal: false, heldTemplateIds: [] },
    {
      id: 'Gamma',
      everReceivedGlobal: false,
      heldTemplateIds: [],
      hasOwnTemplates: true,
    },
  ];
}

describe('F17 assignment state machine (FR-010, FR-011, SC-003, SC-004)', () => {
  it('All Workspaces x All Templates: skips ever-assigned, assigns the rest', () => {
    const result = planAssignment(
      {
        operationKey: 'op-1',
        selection: { mode: 'all' },
        target: { mode: 'all_workspaces' },
      },
      TEMPLATES,
      workspaces(),
    );
    expect(result.error).toBeUndefined();
    const byId = Object.fromEntries(
      result.outcomes.map((o) => [o.workspaceId, o]),
    );
    expect(byId.Kendo!.outcome).toBe('skipped_already_assigned');
    expect(byId.Kendo!.createdTemplateIds).toEqual([]);
    expect(byId.Alpha!.outcome).toBe('skipped_already_assigned');
    expect(byId.Beta!.outcome).toBe('assigned');
    expect(byId.Beta!.createdTemplateIds).toHaveLength(10);
    // Gamma holds only self-created templates: still eligible (literal A2).
    expect(byId.Gamma!.outcome).toBe('assigned');
    expect(byId.Gamma!.createdTemplateIds).toHaveLength(10);
    expect(result.created).toHaveLength(20);
  });

  it('Specific Workspaces return deliberately without duplicating held copies', () => {
    const result = planAssignment(
      {
        operationKey: 'op-2',
        selection: { mode: 'specific', ids: ['t2', 't4'] },
        target: { mode: 'specific', ids: ['Kendo'] },
      },
      TEMPLATES,
      workspaces(),
    );
    expect(result.error).toBeUndefined();
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]!.outcome).toBe('assigned');
    // t2 already held (any source version): skipped and reported, never duplicated.
    expect(result.outcomes[0]!.createdTemplateIds).toEqual(['t4']);
    expect(result.outcomes[0]!.skippedTemplateIds).toEqual(['t2']);
  });

  it('commits mixed no_copies/assigned batches; rejects total zero before writes', () => {
    const mixed = planAssignment(
      {
        operationKey: 'op-3',
        selection: { mode: 'all' },
        target: { mode: 'specific', ids: ['Alpha', 'Beta'] },
      },
      TEMPLATES,
      workspaces(),
    );
    expect(mixed.error).toBeUndefined();
    const byId = Object.fromEntries(
      mixed.outcomes.map((o) => [o.workspaceId, o]),
    );
    expect(byId.Alpha!.outcome).toBe('no_copies');
    expect(byId.Alpha!.createdTemplateIds).toEqual([]);
    expect(byId.Beta!.outcome).toBe('assigned');
    expect(mixed.created).toHaveLength(10);

    const zero = planAssignment(
      {
        operationKey: 'op-4',
        selection: { mode: 'all' },
        target: { mode: 'specific', ids: ['Alpha'] },
      },
      TEMPLATES,
      workspaces(),
    );
    expect(zero.error).toBe('zero_total');
    expect(zero.created).toEqual([]);
    expect(zero.outcomes).toEqual([]);
  });

  it('never tops up an intentionally partial workspace under All Workspaces', () => {
    const result = planAssignment(
      {
        operationKey: 'op-5',
        selection: { mode: 'all_except', ids: ['t10'] },
        target: { mode: 'all_workspaces' },
      },
      TEMPLATES,
      workspaces(),
    );
    const kendo = result.outcomes.find((o) => o.workspaceId === 'Kendo');
    expect(kendo?.outcome).toBe('skipped_already_assigned');
    expect(kendo?.createdTemplateIds).toEqual([]);
  });
});

describe('F17 assignment retired-held reporting (FR-010, FR-011, SC-004)', () => {
  it('reports an already-held retired template as a skipped pair', () => {
    const templates: AssignmentTemplate[] = [
      { id: 't1', version: 1, retired: false },
      { id: 't2', version: 5, retired: true },
      { id: 't3', version: 1, retired: false },
    ];
    const ws: AssignmentWorkspace[] = [
      { id: 'W', everReceivedGlobal: false, heldTemplateIds: ['t2'] },
    ];
    const result = planAssignment(
      {
        operationKey: 'op-r',
        selection: { mode: 'all' },
        target: { mode: 'all_workspaces' },
      },
      templates,
      ws,
    );
    expect(result.error).toBeUndefined();
    expect(result.outcomes[0]!.createdTemplateIds).toEqual(['t1', 't3']);
    expect(result.outcomes[0]!.skippedTemplateIds).toEqual(['t2']);
  });
});

describe('F17 assignment state classification (FR-011)', () => {
  it('distinguishes never / partial / own-only states', () => {
    expect(
      assignmentState({
        id: 'a',
        everReceivedGlobal: false,
        heldTemplateIds: [],
      }),
    ).toBe('never_assigned');
    expect(
      assignmentState({
        id: 'b',
        everReceivedGlobal: true,
        heldTemplateIds: ['t1'],
      }),
    ).toBe('intentionally_partial');
    expect(
      assignmentState({
        id: 'c',
        everReceivedGlobal: false,
        heldTemplateIds: [],
        hasOwnTemplates: true,
      }),
    ).toBe('own_templates_only');
    expect(
      hasOwnTemplates({
        id: 'x',
        everReceivedGlobal: false,
        heldTemplateIds: [],
      }),
    ).toBe(false);
  });

  it('ignores undocumented alias spellings and requires zero held copies (NEW-3)', () => {
    // Invented aliases must not enable the own-templates report.
    expect(
      hasOwnTemplates({
        id: 'x',
        everReceivedGlobal: false,
        heldTemplateIds: [],
        ownsTemplates: true,
      } as AssignmentWorkspace),
    ).toBe(false);
    // State (c) is derived as zero origin-global copies plus the flag false
    // plus own templates: held copies disqualify it even with the flag set.
    expect(
      assignmentState({
        id: 'w',
        everReceivedGlobal: false,
        heldTemplateIds: ['t1'],
        hasOwnTemplates: true,
      }),
    ).toBe('intentionally_partial');
  });
});
