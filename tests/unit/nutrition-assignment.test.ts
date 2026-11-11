import { describe, expect, it } from 'vitest';
import {
  NutritionAssignmentError,
  resolveNutritionTemplateAssignment,
  type GlobalTemplate,
  type Workspace,
} from '../../lib/plans/nutrition/template-assignment';

/**
 * T006 — Assignment state-machine contract (F18-FR-008, F18-FR-009;
 * F18-SC-007; S43-PO-1; architect mapping (S43-R1)).
 *
 * Contract: `specs/018-nutrition-planner/contracts/template-assignment.md`
 * §2. The pure state machine resolves one PO Assign operation's per-target
 * outcomes: All Workspaces is a one-time distribution to existing workspaces
 * never before assigned nutrition templates (partial workspaces are skipped,
 * never topped up); Specific Workspaces skips and reports every held copy
 * regardless of source version; an operation that would create zero copies
 * is rejected before writes.
 */

function template(
  id: string,
  status: 'active' | 'retired' = 'active',
  currentVersion = 1,
): GlobalTemplate {
  return { id, status, currentVersion };
}

function workspace(
  id: string,
  opts: {
    nutritionInitialized?: boolean;
    eligible?: boolean;
    holdings?: string[];
  } = {},
): Workspace {
  return {
    id,
    nutritionInitialized: opts.nutritionInitialized ?? false,
    eligible: opts.eligible ?? true,
    holdings: opts.holdings ?? [],
  };
}

const T1 = '11111111-1111-1111-1111-111111111111';
const T2 = '22222222-2222-2222-2222-222222222222';
const W1 = 'aaaaaaaa-1111-1111-1111-111111111111';
const W2 = 'aaaaaaaa-2222-2222-2222-222222222222';

describe('nutrition assignment state machine (F18-FR-008, T006)', () => {
  it('assigns each selected active template once per uninitialized workspace', () => {
    const plan = resolveNutritionTemplateAssignment({
      templateMode: 'all',
      workspaceMode: 'specific',
      workspaceIds: [W1],
      globalTemplates: [template(T1), template(T2)],
      workspaces: [workspace(W1)],
    });
    expect(plan.items).toHaveLength(2);
    expect(plan.items.map((i) => i.globalTemplateId)).toEqual([T1, T2]);
    for (const item of plan.items) {
      expect(item.workspaceId).toBe(W1);
      expect(item.outcome).toBe('assigned');
      expect(item.createdWorkspaceTemplateId).toBeDefined();
    }
    expect(plan.assignedCount).toBe(2);
    expect(plan.skippedCount).toBe(0);
  });

  it('never tops up a partial workspace under All Workspaces (All×All on a partial workspace)', () => {
    // W1 previously received T1 only (intentionally partial), W2 is fresh
    const plan = resolveNutritionTemplateAssignment({
      templateMode: 'all',
      workspaceMode: 'all',
      globalTemplates: [template(T1), template(T2)],
      workspaces: [
        workspace(W1, { nutritionInitialized: true, holdings: [T1] }),
        workspace(W2),
      ],
    });
    // the partial workspace is skipped entirely: no new copies, no top-up
    expect(plan.items.every((i) => i.workspaceId !== W1)).toBe(true);
    // the uninitialized workspace receives one copy of each active template
    expect(plan.items.filter((i) => i.workspaceId === W2)).toHaveLength(2);
    expect(plan.assignedCount).toBe(2);
  });

  it('excludes workspaces created after the operation (future workspace)', () => {
    const plan = resolveNutritionTemplateAssignment({
      templateMode: 'all',
      workspaceMode: 'all',
      globalTemplates: [template(T1)],
      workspaces: [workspace(W1)],
    });
    // only existing workspaces are present in the resolution; a workspace
    // created later is simply absent from the operation
    expect(plan.items.map((i) => i.workspaceId)).toEqual([W1]);
    // a specific Workspaces operation with an unknown workspace id is invalid
    expect(() =>
      resolveNutritionTemplateAssignment({
        templateMode: 'all',
        workspaceMode: 'specific',
        workspaceIds: ['bbbbbbbb-3333-3333-3333-333333333333'],
        globalTemplates: [template(T1)],
        workspaces: [workspace(W1)],
      }),
    ).toThrowError(NutritionAssignmentError);
  });

  it('skips and reports a workspace already holding a copy of the targeted identity', () => {
    const plan = resolveNutritionTemplateAssignment({
      templateMode: 'specific',
      templateIds: [T1],
      workspaceMode: 'specific',
      workspaceIds: [W1, W2],
      globalTemplates: [template(T1)],
      workspaces: [
        // W1 holds a copy from an older source version (retired copy counts too)
        workspace(W1, { nutritionInitialized: true, holdings: [T1] }),
        workspace(W2),
      ],
    });
    const held = plan.items.find((i) => i.workspaceId === W1)!;
    expect(held.outcome).toBe('skipped_existing');
    expect(held.createdWorkspaceTemplateId).toBeUndefined();
    const fresh = plan.items.find((i) => i.workspaceId === W2)!;
    expect(fresh.outcome).toBe('assigned');
    expect(plan.assignedCount).toBe(1);
    expect(plan.skippedCount).toBe(1);
  });

  it('never overwrites an existing copy: the skipped pair gets no new id', () => {
    // W1 holds T1 but not T2: the held pair is skipped (no overwrite, no new
    // id) while the missing template is still copied
    const plan = resolveNutritionTemplateAssignment({
      templateMode: 'specific',
      templateIds: [T1, T2],
      workspaceMode: 'specific',
      workspaceIds: [W1],
      globalTemplates: [template(T1), template(T2)],
      workspaces: [
        workspace(W1, { nutritionInitialized: true, holdings: [T1] }),
      ],
    });
    const held = plan.items.find((i) => i.globalTemplateId === T1)!;
    const created = plan.items.find((i) => i.globalTemplateId === T2)!;
    expect(held.outcome).toBe('skipped_existing');
    expect(held.createdWorkspaceTemplateId).toBeUndefined();
    expect(created.outcome).toBe('assigned');
    expect(plan.assignedCount).toBe(1);
    expect(plan.skippedCount).toBe(1);
    // a batch whose every pair is already held creates zero copies and is
    // rejected before writes — no report-only batch
    expect(() =>
      resolveNutritionTemplateAssignment({
        templateMode: 'specific',
        templateIds: [T1],
        workspaceMode: 'specific',
        workspaceIds: [W1],
        globalTemplates: [template(T1)],
        workspaces: [
          workspace(W1, { nutritionInitialized: true, holdings: [T1] }),
        ],
      }),
    ).toThrowError(NutritionAssignmentError);
  });

  it('rejects retired templates from specific and excludes them from All', () => {
    expect(() =>
      resolveNutritionTemplateAssignment({
        templateMode: 'specific',
        templateIds: [T1],
        workspaceMode: 'specific',
        workspaceIds: [W1],
        globalTemplates: [template(T1, 'retired')],
        workspaces: [workspace(W1)],
      }),
    ).toThrowError(NutritionAssignmentError);
    // All only offers active templates
    const plan = resolveNutritionTemplateAssignment({
      templateMode: 'all',
      workspaceMode: 'specific',
      workspaceIds: [W1],
      globalTemplates: [template(T1, 'retired'), template(T2)],
      workspaces: [workspace(W1)],
    });
    expect(plan.items.map((i) => i.globalTemplateId)).toEqual([T2]);
  });

  it('records skipped_ineligible for an inaccessible workspace target', () => {
    const plan = resolveNutritionTemplateAssignment({
      templateMode: 'specific',
      templateIds: [T1],
      workspaceMode: 'specific',
      workspaceIds: [W1, W2],
      globalTemplates: [template(T1)],
      workspaces: [workspace(W1, { eligible: false }), workspace(W2)],
    });
    expect(plan.items.find((i) => i.workspaceId === W1)!.outcome).toBe(
      'skipped_ineligible',
    );
    expect(plan.items.find((i) => i.workspaceId === W2)!.outcome).toBe(
      'assigned',
    );
  });

  it('is independent of workout initialization (separate collections)', () => {
    // the machine consumes nutrition-only state: a workspace initialized for
    // workouts (carried here only as an extra fixture field, never an input)
    // is still uninitialized for nutrition
    const workoutInitializedWorkspace = {
      ...workspace(W1),
      workoutInitialized: true,
    } as unknown as Workspace;
    const plan = resolveNutritionTemplateAssignment({
      templateMode: 'all',
      workspaceMode: 'all',
      globalTemplates: [template(T1)],
      workspaces: [workoutInitializedWorkspace],
    });
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]!.outcome).toBe('assigned');
  });

  it('rejects an empty template resolution and duplicate ids with invalid_selection', () => {
    expect(() =>
      resolveNutritionTemplateAssignment({
        templateMode: 'specific',
        templateIds: [],
        workspaceMode: 'specific',
        workspaceIds: [W1],
        globalTemplates: [template(T1)],
        workspaces: [workspace(W1)],
      }),
    ).toThrowError(NutritionAssignmentError);
    expect(() =>
      resolveNutritionTemplateAssignment({
        templateMode: 'specific',
        templateIds: [T1, T1],
        workspaceMode: 'specific',
        workspaceIds: [W1],
        globalTemplates: [template(T1)],
        workspaces: [workspace(W1)],
      }),
    ).toThrowError(NutritionAssignmentError);
    // all_except: excluded ids must exist and be active
    expect(() =>
      resolveNutritionTemplateAssignment({
        templateMode: 'all_except',
        excludeIds: [T1],
        workspaceMode: 'all',
        globalTemplates: [template(T1, 'retired'), template(T2)],
        workspaces: [workspace(W1)],
      }),
    ).toThrowError(NutritionAssignmentError);
  });

  it('copies from the template current immutable version in sorted deterministic order', () => {
    const plan = resolveNutritionTemplateAssignment({
      templateMode: 'specific',
      templateIds: [T2, T1],
      workspaceMode: 'specific',
      workspaceIds: [W2, W1],
      globalTemplates: [template(T1, 'active', 3), template(T2, 'active', 5)],
      workspaces: [workspace(W2), workspace(W1)],
    });
    // workspaces in sorted order, each getting one copy per template
    expect(plan.items.map((i) => i.workspaceId)).toEqual([W1, W1, W2, W2]);
    expect(
      plan.items
        .filter((i) => i.workspaceId === W1)
        .map((i) => i.globalTemplateVersion),
    ).toEqual([3, 5]);
  });
});
