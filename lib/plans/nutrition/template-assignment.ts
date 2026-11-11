/**
 * F18 nutrition template assignment state machine (F18-FR-008, F18-FR-009).
 *
 * Contract: `specs/018-nutrition-planner/contracts/template-assignment.md`
 * §2; data-model.md §5. Pure resolution of one PO Assign operation's
 * per-target outcomes. The machine consumes nutrition-collection state
 * only: a workspace's initialization and holdings are computed
 * independently of the workout collection (no shared rows, ids or
 * statuses). Idempotent replay and locking are database concerns (T014);
 * this module returns the resolution a new operation would apply.
 */

export type TemplateSelectionMode = 'all' | 'specific' | 'all_except';
export type WorkspaceSelectionMode = 'all' | 'specific';

export type GlobalTemplate = {
  id: string;
  status: 'active' | 'retired';
  currentVersion: number;
};

export type Workspace = {
  id: string;
  /** Any nutrition assignment item with outcome 'assigned', ever. */
  nutritionInitialized: boolean;
  /** Retired or inaccessible at operation time ⇒ skipped_ineligible. */
  eligible: boolean;
  /** Global template identities held as any retained copy (active or retired). */
  holdings: readonly string[];
};

export type AssignmentOutcome =
  'assigned' | 'skipped_existing' | 'skipped_ineligible';

export type AssignmentItemPlan = {
  workspaceId: string;
  globalTemplateId: string;
  globalTemplateVersion: number;
  outcome: AssignmentOutcome;
  /** Deterministic new-copy id; set only for 'assigned'. */
  createdWorkspaceTemplateId?: string;
};

export type AssignmentPlan = {
  items: AssignmentItemPlan[];
  assignedCount: number;
  skippedCount: number;
};

export type NutritionAssignmentErrorCode = 'invalid_selection' | 'zero_copies';

export class NutritionAssignmentError extends Error {
  readonly code: NutritionAssignmentErrorCode;

  constructor(code: NutritionAssignmentErrorCode, message: string) {
    super(message);
    this.name = 'NutritionAssignmentError';
    this.code = code;
  }
}

export type ResolveAssignmentInput = {
  templateMode: TemplateSelectionMode;
  /** required for 'specific' */
  templateIds?: readonly string[];
  /** required for 'all_except' */
  excludeIds?: readonly string[];
  workspaceMode: WorkspaceSelectionMode;
  /** required for 'specific' */
  workspaceIds?: readonly string[];
  /** Active templates at operation time (All/All-except resolve from these). */
  globalTemplates: readonly GlobalTemplate[];
  /** Workspaces existing at operation time. */
  workspaces: readonly Workspace[];
};

function sortedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

export function resolveNutritionTemplateAssignment(
  input: ResolveAssignmentInput,
): AssignmentPlan {
  // Step 1 — template set
  let templateIds: string[];
  if (input.templateMode === 'all') {
    templateIds = sortedUnique(
      input.globalTemplates
        .filter((t) => t.status === 'active')
        .map((t) => t.id),
    );
  } else if (input.templateMode === 'specific') {
    const requested = input.templateIds ?? [];
    if (requested.length === 0) {
      throw new NutritionAssignmentError(
        'invalid_selection',
        'templateIds is required for specific mode',
      );
    }
    for (const id of requested) {
      const template = input.globalTemplates.find((t) => t.id === id);
      if (!template) {
        throw new NutritionAssignmentError(
          'invalid_selection',
          `template ${id} does not exist`,
        );
      }
      if (template.status !== 'active') {
        throw new NutritionAssignmentError(
          'invalid_selection',
          `template ${id} is retired`,
        );
      }
    }
    templateIds = sortedUnique(requested);
    if (templateIds.length !== requested.length) {
      throw new NutritionAssignmentError(
        'invalid_selection',
        'templateIds must be distinct',
      );
    }
  } else {
    const excluded = input.excludeIds ?? [];
    for (const id of excluded) {
      const template = input.globalTemplates.find((t) => t.id === id);
      if (!template) {
        throw new NutritionAssignmentError(
          'invalid_selection',
          `excluded template ${id} does not exist`,
        );
      }
      if (template.status !== 'active') {
        throw new NutritionAssignmentError(
          'invalid_selection',
          `excluded template ${id} is retired`,
        );
      }
    }
    templateIds = sortedUnique(
      input.globalTemplates
        .filter((t) => t.status === 'active' && !excluded.includes(t.id))
        .map((t) => t.id),
    );
  }
  if (templateIds.length === 0) {
    throw new NutritionAssignmentError(
      'invalid_selection',
      'empty template set after resolution',
    );
  }

  // Step 2 — workspace set
  let workspaceIds: string[];
  if (input.workspaceMode === 'all') {
    // one-time distribution to existing workspaces never before assigned
    // nutrition templates; workspaces created after the operation are absent
    // from the resolution entirely
    workspaceIds = sortedUnique(
      input.workspaces.filter((w) => !w.nutritionInitialized).map((w) => w.id),
    );
  } else {
    const requested = input.workspaceIds ?? [];
    for (const id of requested) {
      if (!input.workspaces.some((w) => w.id === id)) {
        throw new NutritionAssignmentError(
          'invalid_selection',
          `workspace ${id} does not exist`,
        );
      }
    }
    workspaceIds = sortedUnique(requested);
    if (workspaceIds.length !== requested.length) {
      throw new NutritionAssignmentError(
        'invalid_selection',
        'workspaceIds must be distinct',
      );
    }
  }

  // Per (workspace, template) outcomes in deterministic order: workspaces
  // sorted, then templates sorted
  const items: AssignmentItemPlan[] = [];
  for (const workspaceId of workspaceIds) {
    const workspace = input.workspaces.find((w) => w.id === workspaceId)!;
    for (const templateId of templateIds) {
      const template = input.globalTemplates.find((t) => t.id === templateId)!;
      let outcome: AssignmentOutcome;
      let createdWorkspaceTemplateId: string | undefined;
      if (!workspace.eligible) {
        outcome = 'skipped_ineligible';
      } else if (workspace.holdings.includes(templateId)) {
        // any retained copy (active or retired, any source version) skips:
        // no duplicate, overwrite or customization change (S43-PO-1)
        outcome = 'skipped_existing';
      } else {
        outcome = 'assigned';
        createdWorkspaceTemplateId = `${workspaceId}:${templateId}:v${template.currentVersion}`;
      }
      items.push({
        workspaceId,
        globalTemplateId: templateId,
        globalTemplateVersion: template.currentVersion,
        outcome,
        ...(createdWorkspaceTemplateId !== undefined
          ? { createdWorkspaceTemplateId }
          : {}),
      });
    }
  }

  const assignedCount = items.filter((i) => i.outcome === 'assigned').length;
  const skippedCount = items.length - assignedCount;
  if (assignedCount === 0) {
    // a new operation whose resolved pairs would all be skipped or
    // ineligible creates zero copies and is rejected before writes
    throw new NutritionAssignmentError(
      'zero_copies',
      'the resolved Assign would create zero copies',
    );
  }

  return { items, assignedCount, skippedCount };
}
