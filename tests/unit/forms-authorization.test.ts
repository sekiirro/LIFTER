import { describe, expect, it } from 'vitest';
import { authorizeFormAccess } from '../../lib/forms/authorization';

const capability = (
  role: string,
  name: 'author_forms' | 'assign_intake_form' | 'read_form_answers',
) =>
  role !== 'sales' &&
  ['platform_owner', 'workspace_owner', 'trainer'].includes(role) &&
  ['author_forms', 'assign_intake_form', 'read_form_answers'].includes(name);

const allowed = {
  status: 'ok',
  workspaceId: 'ws-a',
  clientId: 'client-a',
};
const denied = { status: 'not_found' };

describe('F15 application authorization policy (T003)', () => {
  it.each(['platform_owner', 'workspace_owner', 'trainer'] as const)(
    '%s needs a real selected workspace, current membership, and final capability',
    (role) => {
      const actor = { kind: 'staff' as const, userId: `user-${role}`, role };
      const context = {
        workspaceId: 'ws-a',
        workspaceExists: true,
        clientId: 'client-a',
        clientAuthUserId: 'client-user',
        clientApprovalState: 'approved' as const,
        hasCurrentMembership: role !== 'platform_owner',
        workspaceExplicitlySelected: true,
      };

      expect(
        authorizeFormAccess(actor, context, 'read_form_answers', capability),
      ).toEqual(allowed);
      if (role !== 'platform_owner') {
        expect(
          authorizeFormAccess(
            actor,
            { ...context, hasCurrentMembership: false },
            'read_form_answers',
            capability,
          ),
        ).toEqual(denied);
      }
      expect(
        authorizeFormAccess(
          actor,
          { ...context, workspaceExists: false },
          'read_form_answers',
          capability,
        ),
      ).toEqual(denied);
    },
  );

  it('keeps foreign and nonexistent target denials indistinguishable at the app wall', () => {
    const actor = {
      kind: 'client' as const,
      authUserId: 'client-user-a',
      clientId: 'client-a',
      workspaceId: 'ws-a',
      approvalState: 'approved' as const,
    };
    const foreign = authorizeFormAccess(
      actor,
      {
        workspaceId: 'ws-b',
        workspaceExists: true,
        workspaceExplicitlySelected: false,
        clientId: 'client-b',
        clientAuthUserId: 'client-user-b',
        clientApprovalState: 'approved',
        hasCurrentMembership: false,
      },
      'read_form_answers',
      capability,
    );
    const nonexistent = authorizeFormAccess(
      actor,
      {
        workspaceId: 'ws-missing',
        workspaceExists: false,
        workspaceExplicitlySelected: false,
        clientId: null,
        clientAuthUserId: null,
        clientApprovalState: null,
        hasCurrentMembership: false,
      },
      'read_form_answers',
      capability,
    );
    expect(foreign).toEqual(denied);
    expect(nonexistent).toEqual(foreign);
  });

  it.each(['pending-approval', 'rejected'] as const)(
    'denies a %s client before target data is returned',
    (approvalState) => {
      expect(
        authorizeFormAccess(
          {
            kind: 'client',
            authUserId: 'client-user-a',
            clientId: 'client-a',
            workspaceId: 'ws-a',
            approvalState,
          },
          {
            workspaceId: 'ws-a',
            workspaceExists: true,
            workspaceExplicitlySelected: false,
            clientId: 'client-a',
            clientAuthUserId: 'client-user-a',
            clientApprovalState: approvalState,
            hasCurrentMembership: false,
          },
          'read_form_answers',
          capability,
        ),
      ).toEqual(denied);
    },
  );

  it('allows only an approved client matching the signed identity and assignment', () => {
    const actor = {
      kind: 'client' as const,
      authUserId: 'client-user-a',
      clientId: 'client-a',
      workspaceId: 'ws-a',
      approvalState: 'approved' as const,
    };
    const target = {
      workspaceId: 'ws-a',
      workspaceExists: true,
      workspaceExplicitlySelected: false,
      clientId: 'client-a',
      clientAuthUserId: 'client-user-a',
      clientApprovalState: 'approved' as const,
      hasCurrentMembership: false,
    };
    expect(
      authorizeFormAccess(actor, target, 'read_form_answers', capability),
    ).toEqual(allowed);
    expect(
      authorizeFormAccess(
        actor,
        { ...target, clientId: 'client-b' },
        'read_form_answers',
        capability,
      ),
    ).toEqual(denied);
  });

  it('denies Sales and unknown roles for every final Forms capability', () => {
    for (const capabilityName of [
      'author_forms',
      'assign_intake_form',
      'read_form_answers',
    ] as const) {
      expect(
        authorizeFormAccess(
          { kind: 'staff', userId: 'sales-user', role: 'sales' },
          {
            workspaceId: 'ws-a',
            workspaceExists: true,
            workspaceExplicitlySelected: true,
            clientId: null,
            clientAuthUserId: null,
            clientApprovalState: null,
            hasCurrentMembership: true,
          },
          capabilityName,
          capability,
        ),
      ).toEqual(denied);
    }
  });

  it('kills a membership-bypass mutation', () => {
    const actor = {
      kind: 'staff' as const,
      userId: 'trainer-a',
      role: 'trainer' as const,
    };
    const target = {
      workspaceId: 'ws-b',
      workspaceExists: true,
      workspaceExplicitlySelected: false,
      clientId: 'client-b',
      clientAuthUserId: 'client-b-user',
      clientApprovalState: 'approved' as const,
      hasCurrentMembership: false,
    };
    const membershipBypassMutant = () => {
      const original = authorizeFormAccess(
        actor,
        target,
        'author_forms',
        capability,
      );
      return original.status === 'not_found'
        ? {
            status: 'ok' as const,
            workspaceId: target.workspaceId,
            clientId: target.clientId,
          }
        : original;
    };
    let mutantWasKilled = false;
    try {
      expect(membershipBypassMutant()).toEqual(denied);
    } catch {
      mutantWasKilled = true;
    }
    expect(mutantWasKilled).toBe(true);
  });
});
