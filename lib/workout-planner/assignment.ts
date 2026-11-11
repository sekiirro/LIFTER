// F17 assignment state machine pure model (T009; FR-010, FR-011, SC-003,
// SC-004). S44-PO-2 (architect mapping S44-R2); S43-PO-1 skip-regardless-of-
// version; S42-PO-8 total zero-copy rejection.
//
// Inputs: template selection mode, target mode, workspace state
// (never-assigned / intentionally partial / own-templates-only), existing
// copies. Outputs per workspace: assigned / skipped_already_assigned /
// no_copies plus the created set. A committed no_copies receipt is allowed
// for a targeted workspace when another target receives a copy; the entire
// operation is rejected before writes only when total copies = 0.

export type SelectionMode = 'all' | 'specific' | 'all_except';
export type TargetMode = 'all_workspaces' | 'specific';

export type AssignmentSelection =
  { mode: 'all' } | { mode: 'specific' | 'all_except'; ids: string[] };

export type AssignmentTarget =
  { mode: 'all_workspaces' } | { mode: 'specific'; ids: string[] };

export type AssignmentRequest = {
  operationKey: string;
  selection: AssignmentSelection;
  target: AssignmentTarget;
};

export type AssignmentTemplate = {
  id: string;
  version: number;
  retired: boolean;
};

export type AssignmentWorkspace = {
  id: string;
  /** Durable flag: has this workspace ever received a global assignment. */
  everReceivedGlobal: boolean;
  /** Template identities already held as copies, regardless of source version. */
  heldTemplateIds: string[];
};

export type WorkspaceOutcome =
  'assigned' | 'skipped_already_assigned' | 'no_copies';

export type AssignmentOutcome = {
  workspaceId: string;
  outcome: WorkspaceOutcome;
  createdTemplateIds: string[];
  skippedTemplateIds: string[];
};

export type AssignmentResult = {
  operationKey: string;
  outcomes: AssignmentOutcome[];
  created: {
    workspaceId: string;
    templateId: string;
    templateVersion: number;
  }[];
  flagUpdates: { workspaceId: string; everReceivedGlobal: boolean }[];
  error?: 'zero_total';
};

export function planAssignment(
  request: AssignmentRequest,
  templates: AssignmentTemplate[],
  workspaces: AssignmentWorkspace[],
): AssignmentResult {
  const selection = request.selection;
  const target = request.target;
  const selectable = templates.filter((t) => !t.retired);
  const selected =
    selection.mode === 'all'
      ? selectable
      : selection.mode === 'specific'
        ? selectable.filter((t) => selection.ids.includes(t.id))
        : selectable.filter((t) => !selection.ids.includes(t.id));

  const targets =
    target.mode === 'all_workspaces'
      ? workspaces
      : workspaces.filter((w) => target.ids.includes(w.id));

  const outcomes: AssignmentOutcome[] = [];
  const created: AssignmentResult['created'] = [];
  const flagUpdates: AssignmentResult['flagUpdates'] = [];

  for (const workspace of targets) {
    if (
      request.target.mode === 'all_workspaces' &&
      workspace.everReceivedGlobal
    ) {
      // One-time distribution: skip, never top up (not even partial).
      outcomes.push({
        workspaceId: workspace.id,
        outcome: 'skipped_already_assigned',
        createdTemplateIds: [],
        skippedTemplateIds: [],
      });
      continue;
    }
    const held = new Set(workspace.heldTemplateIds);
    const missing = selected.filter((t) => !held.has(t.id));
    const skipped = selected.filter((t) => held.has(t.id));
    if (missing.length === 0) {
      outcomes.push({
        workspaceId: workspace.id,
        outcome: 'no_copies',
        createdTemplateIds: [],
        skippedTemplateIds: skipped.map((t) => t.id),
      });
      continue;
    }
    for (const template of missing) {
      created.push({
        workspaceId: workspace.id,
        templateId: template.id,
        templateVersion: template.version,
      });
    }
    outcomes.push({
      workspaceId: workspace.id,
      outcome: 'assigned',
      createdTemplateIds: missing.map((t) => t.id),
      skippedTemplateIds: skipped.map((t) => t.id),
    });
    if (!workspace.everReceivedGlobal) {
      flagUpdates.push({ workspaceId: workspace.id, everReceivedGlobal: true });
    }
  }

  if (created.length === 0) {
    // S42-PO-8: reject before any batch or state write.
    return {
      operationKey: request.operationKey,
      outcomes: [],
      created: [],
      flagUpdates: [],
      error: 'zero_total',
    };
  }
  return { operationKey: request.operationKey, outcomes, created, flagUpdates };
}
