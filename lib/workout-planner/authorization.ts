// F17 role/permission matrix fixture (T001; FR-020, SC-010).
//
// Pure-TS encoding of spec.md FR-020. Denials are generic and identical for
// every actor (no existence/count/distinction leak).

export type F17Role =
  | 'PO'
  | 'WO'
  | 'Trainer'
  | 'Sales'
  | 'client'
  | 'unaffiliated';

export type F17Actor = {
  role: F17Role;
  /** 'own' = acting inside the plan/template workspace; 'foreign' otherwise. */
  workspaceRelation: 'own' | 'foreign';
  /** Current `coaching_work` authorization in the relevant workspace. */
  coachingWork: boolean;
  /** Workspace membership revoked (or PO authority revoked). */
  membershipRevoked: boolean;
};

export type F17Action =
  | 'plan.edit'
  | 'workspace-template.manage'
  | 'global-template.manage'
  | 'assignment.run'
  | 'export.read'
  | 'volume.read';

export type F17Decision =
  | { allowed: true; code: 'ok' }
  | { allowed: false; code: 'denied' };

const STAFF_ROLES: ReadonlySet<F17Role> = new Set(['PO', 'WO', 'Trainer']);

function deny(): F17Decision {
  return { allowed: false, code: 'denied' };
}

function allow(): F17Decision {
  return { allowed: true, code: 'ok' };
}

export function decideF17(actor: F17Actor, action: F17Action): F17Decision {
  if (actor.membershipRevoked) return deny();

  // PO-only globals: no workspace scoping, but revocation still denies.
  if (action === 'global-template.manage' || action === 'assignment.run') {
    return actor.role === 'PO' ? allow() : deny();
  }

  // Cross-workspace plan access is denied to every role (FR-020), including PO.
  if (actor.workspaceRelation === 'foreign') {
    // PO retains cross-workspace workspace-template governance (FR-012).
    if (action === 'workspace-template.manage' && actor.role === 'PO') {
      return allow();
    }
    return deny();
  }

  // Own workspace: staff with current coaching_work; Sales and clients never.
  if (!STAFF_ROLES.has(actor.role)) return deny();
  if (!actor.coachingWork) return deny();
  return allow();
}
