import { describe, expect, it } from 'vitest';
import {
  decideF17,
  type F17Action,
  type F17Actor,
} from '../../lib/workout-planner/authorization';

// T003-note: FR-020 authorization matrix (SC-010). Table-driven: every row
// must agree with spec.md FR-020. RED: at least one row mismatches.

type MatrixRow = {
  label: string;
  actor: F17Actor;
  action: F17Action;
  expected: boolean;
};

const own = 'own' as const;
const foreign = 'foreign' as const;

const MATRIX: MatrixRow[] = [
  // PO, own workspace, current coaching_work: full plan/template/export/volume + PO-only globals
  { label: 'PO own plan.edit', actor: { role: 'PO', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'plan.edit', expected: true },
  { label: 'PO own workspace-template.manage', actor: { role: 'PO', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'workspace-template.manage', expected: true },
  { label: 'PO own global-template.manage', actor: { role: 'PO', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'global-template.manage', expected: true },
  { label: 'PO own assignment.run', actor: { role: 'PO', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'assignment.run', expected: true },
  { label: 'PO own export.read', actor: { role: 'PO', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'export.read', expected: true },
  { label: 'PO own volume.read', actor: { role: 'PO', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'volume.read', expected: true },
  // PO cross-workspace: template governance allowed, plan access denied to every role
  { label: 'PO foreign plan.edit denied', actor: { role: 'PO', workspaceRelation: foreign, coachingWork: true, membershipRevoked: false }, action: 'plan.edit', expected: false },
  { label: 'PO foreign workspace-template.manage', actor: { role: 'PO', workspaceRelation: foreign, coachingWork: true, membershipRevoked: false }, action: 'workspace-template.manage', expected: true },
  { label: 'PO foreign global-template.manage', actor: { role: 'PO', workspaceRelation: foreign, coachingWork: false, membershipRevoked: false }, action: 'global-template.manage', expected: true },
  { label: 'PO foreign assignment.run', actor: { role: 'PO', workspaceRelation: foreign, coachingWork: false, membershipRevoked: false }, action: 'assignment.run', expected: true },
  { label: 'PO foreign export.read denied', actor: { role: 'PO', workspaceRelation: foreign, coachingWork: true, membershipRevoked: false }, action: 'export.read', expected: false },
  // WO own workspace with current coaching_work
  { label: 'WO own plan.edit', actor: { role: 'WO', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'plan.edit', expected: true },
  { label: 'WO own workspace-template.manage', actor: { role: 'WO', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'workspace-template.manage', expected: true },
  { label: 'WO own global-template.manage denied', actor: { role: 'WO', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'global-template.manage', expected: false },
  { label: 'WO own assignment.run denied', actor: { role: 'WO', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'assignment.run', expected: false },
  { label: 'WO own export.read', actor: { role: 'WO', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'export.read', expected: true },
  { label: 'WO own volume.read', actor: { role: 'WO', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'volume.read', expected: true },
  // WO without current coaching_work: plan/template/export/volume denied
  { label: 'WO own no-coaching plan.edit denied', actor: { role: 'WO', workspaceRelation: own, coachingWork: false, membershipRevoked: false }, action: 'plan.edit', expected: false },
  { label: 'WO own no-coaching export.read denied', actor: { role: 'WO', workspaceRelation: own, coachingWork: false, membershipRevoked: false }, action: 'export.read', expected: false },
  // WO foreign workspace: no cross-workspace plan or template access
  { label: 'WO foreign plan.edit denied', actor: { role: 'WO', workspaceRelation: foreign, coachingWork: true, membershipRevoked: false }, action: 'plan.edit', expected: false },
  { label: 'WO foreign workspace-template.manage denied', actor: { role: 'WO', workspaceRelation: foreign, coachingWork: true, membershipRevoked: false }, action: 'workspace-template.manage', expected: false },
  // Trainer own workspace with current coaching_work (may edit any client plan incl. another trainer's)
  { label: 'Trainer own plan.edit', actor: { role: 'Trainer', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'plan.edit', expected: true },
  { label: 'Trainer own workspace-template.manage', actor: { role: 'Trainer', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'workspace-template.manage', expected: true },
  { label: 'Trainer own global-template.manage denied', actor: { role: 'Trainer', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'global-template.manage', expected: false },
  { label: 'Trainer own assignment.run denied', actor: { role: 'Trainer', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'assignment.run', expected: false },
  { label: 'Trainer own export.read', actor: { role: 'Trainer', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'export.read', expected: true },
  { label: 'Trainer own volume.read', actor: { role: 'Trainer', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'volume.read', expected: true },
  // Sales: denied everywhere, even with coaching_work in own workspace
  { label: 'Sales own plan.edit denied', actor: { role: 'Sales', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'plan.edit', expected: false },
  { label: 'Sales own workspace-template.manage denied', actor: { role: 'Sales', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'workspace-template.manage', expected: false },
  { label: 'Sales own assignment.run denied', actor: { role: 'Sales', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'assignment.run', expected: false },
  { label: 'Sales own export.read denied', actor: { role: 'Sales', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'export.read', expected: false },
  { label: 'Sales own volume.read denied', actor: { role: 'Sales', workspaceRelation: own, coachingWork: true, membershipRevoked: false }, action: 'volume.read', expected: false },
  // Client: no F17 surface at all
  { label: 'client own plan.edit denied', actor: { role: 'client', workspaceRelation: own, coachingWork: false, membershipRevoked: false }, action: 'plan.edit', expected: false },
  { label: 'client own export.read denied', actor: { role: 'client', workspaceRelation: own, coachingWork: false, membershipRevoked: false }, action: 'export.read', expected: false },
  { label: 'client own volume.read denied', actor: { role: 'client', workspaceRelation: own, coachingWork: false, membershipRevoked: false }, action: 'volume.read', expected: false },
  // Revoked membership: denied even for WO with coaching history
  { label: 'revoked WO own plan.edit denied', actor: { role: 'WO', workspaceRelation: own, coachingWork: true, membershipRevoked: true }, action: 'plan.edit', expected: false },
  { label: 'revoked WO own export.read denied', actor: { role: 'WO', workspaceRelation: own, coachingWork: true, membershipRevoked: true }, action: 'export.read', expected: false },
  { label: 'revoked PO global-template.manage denied', actor: { role: 'PO', workspaceRelation: own, coachingWork: true, membershipRevoked: true }, action: 'global-template.manage', expected: false },
  // Unaffiliated: denied everywhere
  { label: 'unaffiliated plan.edit denied', actor: { role: 'unaffiliated', workspaceRelation: foreign, coachingWork: false, membershipRevoked: false }, action: 'plan.edit', expected: false },
  { label: 'unaffiliated assignment.run denied', actor: { role: 'unaffiliated', workspaceRelation: foreign, coachingWork: false, membershipRevoked: false }, action: 'assignment.run', expected: false },
];

describe('F17 role/permission matrix (FR-020, SC-010)', () => {
  it.each(MATRIX)('$label', (row) => {
    expect(decideF17(row.actor, row.action).allowed).toBe(row.expected);
  });

  it('denies generically without revealing existence, counts or distinctions', () => {
    const denied = MATRIX.filter((row) => !row.expected).map((row) =>
      decideF17(row.actor, row.action),
    );
    expect(denied.length).toBeGreaterThan(0);
    for (const decision of denied) {
      expect(decision).toEqual({ allowed: false, code: 'denied' });
    }
  });
});
