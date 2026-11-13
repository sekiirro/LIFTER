export type FormCapability =
  'author_forms' | 'assign_intake_form' | 'read_form_answers';

export type FormStaffRole =
  'platform_owner' | 'workspace_owner' | 'trainer' | 'sales';

export type FormActor =
  | {
      kind: 'client';
      authUserId: string;
      clientId: string;
      workspaceId: string;
      approvalState: 'pending-approval' | 'approved' | 'rejected';
    }
  | { kind: 'staff'; userId: string; role: FormStaffRole | null };

export type FormAuthorizationContext = {
  workspaceId: string | null;
  workspaceExists: boolean;
  workspaceExplicitlySelected: boolean;
  clientId: string | null;
  clientAuthUserId: string | null;
  clientApprovalState: 'pending-approval' | 'approved' | 'rejected' | null;
  hasCurrentMembership: boolean;
};

export type FormAuthorizationDecision =
  | {
      status: 'ok';
      workspaceId: string;
      clientId: string | null;
    }
  | { status: 'not_found' };

export type FormCapabilityCheck = (
  role: FormStaffRole,
  capability: FormCapability,
) => boolean;

const denied: FormAuthorizationDecision = Object.freeze({
  status: 'not_found',
});

/** App-side Forms wall. Context fields must come from trusted database lookups. */
export function authorizeFormAccess(
  actor: FormActor,
  target: FormAuthorizationContext,
  capability: FormCapability,
  hasCapability: FormCapabilityCheck,
): FormAuthorizationDecision {
  if (!target.workspaceId || !target.workspaceExists || !actor) {
    return denied;
  }

  if (actor.kind === 'client') {
    if (
      actor.approvalState !== 'approved' ||
      target.clientApprovalState !== 'approved' ||
      target.clientAuthUserId !== actor.authUserId ||
      target.clientId !== actor.clientId ||
      target.workspaceId !== actor.workspaceId
    ) {
      return denied;
    }
    return {
      status: 'ok',
      workspaceId: target.workspaceId,
      clientId: target.clientId,
    };
  }

  const role = actor.role;
  if (
    role === null ||
    (role === 'platform_owner' && !target.workspaceExplicitlySelected) ||
    (role !== 'platform_owner' && !target.hasCurrentMembership) ||
    !hasCapability(role, capability)
  ) {
    return denied;
  }

  return {
    status: 'ok',
    workspaceId: target.workspaceId,
    clientId: target.clientId,
  };
}
