import { describe, expect, it } from 'vitest';
import { authorize, type Actor } from '../../lib/auth/authorize';
import {
  CAPABILITIES,
  ROLES,
  roleHasCapability,
  type Capability,
} from '../../lib/auth/capabilities';

// Independent literal oracle: columns are PO, WO, Trainer, Sales (D-09/D-10).
const expected: Record<Capability, readonly boolean[]> = {
  generate_recovery_link: [true, true, false, false],
  set_package_pricing: [true, false, false, false],
  generate_registration_link: [true, true, true, true],
  configure_installment_schedule: [true, true, false, true],
  approve_registration: [true, true, false, false],
  record_payment: [true, true, false, true],
  manage_freeze: [true, true, false, true],
  record_refund: [true, false, false, false],
  delete_client: [true, false, false, false],
  export_client_dataset: [true, false, false, false],
  manage_workspaces: [true, false, false, false],
  manage_staff_access: [true, false, false, false],
  coaching_work: [true, true, true, false],
};

describe('approved matrix', () => {
  for (const capability of CAPABILITIES) {
    ROLES.forEach((role, index) => {
      it(`${role}: ${capability}`, () => {
        expect(roleHasCapability(role, capability)).toBe(
          expected[capability][index],
        );
      });
    });
  }
  it.each(ROLES)('%s denies unknown and inherited object names', (role) => {
    for (const name of ['unknown', 'toString', '__proto__', '']) {
      expect(roleHasCapability(role, name)).toBe(false);
    }
  });
});

describe('authorize', () => {
  const actor: Actor = {
    userId: 'synthetic',
    role: 'trainer',
    activeWorkspaceIds: ['A'],
  };
  it('denies a null role even with membership', () => {
    expect(authorize({ ...actor, role: null }, 'coaching_work', 'A')).toBe(
      false,
    );
  });
  it.each(['workspace_owner', 'trainer', 'sales'] as const)(
    '%s requires active membership',
    (role) => {
      expect(
        authorize({ ...actor, role }, 'generate_registration_link', 'B'),
      ).toBe(false);
      expect(
        authorize({ ...actor, role }, 'generate_registration_link', 'A'),
      ).toBe(true);
      expect(authorize({ ...actor, role }, 'record_refund', 'A')).toBe(false);
    },
  );
  it('treats revoked membership as absent', () => {
    expect(
      authorize({ ...actor, activeWorkspaceIds: [] }, 'coaching_work', 'A'),
    ).toBe(false);
  });
  it('allows PO without memberships for every known capability, denying unknowns', () => {
    const po: Actor = {
      ...actor,
      role: 'platform_owner',
      activeWorkspaceIds: [],
    };
    for (const capability of CAPABILITIES)
      expect(authorize(po, capability, 'B')).toBe(true);
    expect(authorize(po, 'unknown', 'B')).toBe(false);
  });
  it('denies unknown capability for a member', () => {
    expect(authorize(actor, 'unknown', 'A')).toBe(false);
  });
});
