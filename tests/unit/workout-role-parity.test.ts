import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authorize } from '../../lib/auth/authorize';
import { roleHasCapability, type Role } from '../../lib/auth/capabilities';

type Decision = 'allow' | 'deny';
type Permission = { decision: Decision; scope: string };
type RoleId =
  | 'platform_owner'
  | 'workspace_owner'
  | 'trainer'
  | 'sales'
  | 'client'
  | 'unknown';
type MatrixRole = { id: RoleId; label: string };
type MatrixOperation = {
  id: string;
  description: string;
  tsRule: string;
  permissions: Record<RoleId, Permission>;
};
type RoleMatrix = {
  title: string;
  sources: string[];
  policy: string;
  roles: MatrixRole[];
  operations: MatrixOperation[];
};
type SqlExpectation = {
  source: string;
  roles: RoleId[];
  rows: { operation: string; role: RoleId; allowed: boolean; scope: string }[];
};

const matrixPath = resolve(
  process.cwd(),
  'tests/fixtures/workout-role-parity.json',
);
const sqlExpectationPath = resolve(
  process.cwd(),
  'tests/fixtures/workout-role-parity.sql.json',
);
const matrix = JSON.parse(readFileSync(matrixPath, 'utf8')) as RoleMatrix;
const sqlExpectation = JSON.parse(
  readFileSync(sqlExpectationPath, 'utf8'),
) as SqlExpectation;
const targetWorkspaceId = 'f9aaf239-4298-4e5d-9dfc-8f3026387488';
const globalReadWorkspaceId = 'f0ad0689-235e-4d15-90eb-f235984ad501';

function asAppRole(role: RoleId): Role | null {
  return role === 'client' || role === 'unknown' ? null : role;
}

function tsAuthorization(operation: MatrixOperation, role: RoleId): boolean {
  const appRole = asAppRole(role);
  if (operation.tsRule === 'platform_owner_only')
    return appRole === 'platform_owner';
  if (operation.tsRule === 'global_coaching_read') {
    if (appRole === 'platform_owner') return true;
    if (appRole === null) return false;
    const actor = {
      userId: '00000000-0000-4000-8000-000000000001',
      role: appRole,
      activeWorkspaceIds:
        role === 'workspace_owner' || role === 'trainer'
          ? [globalReadWorkspaceId]
          : [],
    };
    return authorize(actor, 'coaching_work', globalReadWorkspaceId);
  }
  if (appRole === null) return false;
  const actor = {
    userId: '00000000-0000-4000-8000-000000000001',
    role: appRole,
    activeWorkspaceIds:
      appRole === 'platform_owner' ||
      role === 'workspace_owner' ||
      role === 'trainer'
        ? [targetWorkspaceId]
        : [],
  };
  if (operation.tsRule === 'plan_workspace_and_template_visibility') {
    const canUsePlan = authorize(actor, 'coaching_work', targetWorkspaceId);
    const canReadGlobal =
      appRole === 'platform_owner' ||
      (roleHasCapability(appRole, 'coaching_work') &&
        actor.activeWorkspaceIds.length > 0);
    const canReadWorkspaceTemplate = authorize(
      actor,
      'coaching_work',
      targetWorkspaceId,
    );
    return canUsePlan && (canReadGlobal || canReadWorkspaceTemplate);
  }
  return authorize(actor, 'coaching_work', targetWorkspaceId);
}

function expectedSqlRows(source: RoleMatrix) {
  return source.operations.flatMap((operation) =>
    source.roles.map(({ id: role }) => {
      const permission = operation.permissions[role];
      return {
        operation: operation.id,
        role,
        allowed: permission.decision === 'allow',
        scope: permission.scope,
      };
    }),
  );
}

function assertSqlParity(
  expectedRows: ReturnType<typeof expectedSqlRows>,
  sql: SqlExpectation,
) {
  expect(sql.roles).toEqual(matrix.roles.map(({ id }) => id));
  expect(sql.rows).toEqual(expectedRows);
}

describe('F17 TypeScript and SQL role parity matrix', () => {
  it('matches the role and operation coverage frozen in the documented matrix', () => {
    expect(matrix.roles.map(({ label }) => label)).toEqual([
      'PO',
      'WO',
      'Trainer',
      'Sales',
      'Client',
      'Unknown/unauthenticated',
    ]);
    expect(matrix.operations.map(({ id }) => id)).toEqual([
      'plan.read',
      'plan.mutate',
      'template.global_read',
      'template.workspace_read',
      'template.workspace_write',
      'template.global_governance',
      'template.load_into_draft',
      'export.published_pdf',
      'export.published_excel',
      'volume.read',
    ]);
    expect(sqlExpectation.source).toBe(
      'tests/fixtures/workout-role-parity.json',
    );
  });

  it('derives the TypeScript authorization expectation from every matrix cell', () => {
    for (const operation of matrix.operations) {
      for (const { id: role } of matrix.roles) {
        const expected = operation.permissions[role].decision === 'allow';
        expect(
          tsAuthorization(operation, role),
          `${operation.id} / ${role} (${operation.permissions[role].scope})`,
        ).toBe(expected);
      }
    }
  });

  it('matches the SQL expectation fixture derived from the same matrix', () => {
    assertSqlParity(expectedSqlRows(matrix), sqlExpectation);
  });

  it('fails parity when any role permission is changed or removed', () => {
    const expectedRows = expectedSqlRows(matrix);
    const baseline: SqlExpectation = {
      source: 'tests/fixtures/workout-role-parity.json',
      roles: matrix.roles.map(({ id }) => id),
      rows: expectedRows,
    };
    for (const { id: role } of matrix.roles) {
      const changed: SqlExpectation = structuredClone(baseline);
      const changedRow = changed.rows.find((row) => row.role === role);
      if (!changedRow) throw new Error(`missing_SQL_role_${role}`);
      changedRow.allowed = !changedRow.allowed;
      expect(
        () => assertSqlParity(expectedRows, changed),
        `${role} changed`,
      ).toThrow();

      const removed: SqlExpectation = structuredClone(baseline);
      const removedRow = removed.rows.find((row) => row.role === role);
      if (!removedRow) throw new Error(`missing_SQL_role_${role}`);
      delete (removedRow as Partial<typeof removedRow>).allowed;
      expect(
        () => assertSqlParity(expectedRows, removed),
        `${role} removed`,
      ).toThrow();
    }
  });

  it('keeps workspace, global-read, and PO governance scopes distinct', () => {
    const planRead = matrix.operations.find(({ id }) => id === 'plan.read')!;
    const globalRead = matrix.operations.find(
      ({ id }) => id === 'template.global_read',
    )!;
    const globalGovernance = matrix.operations.find(
      ({ id }) => id === 'template.global_governance',
    )!;
    expect(planRead.permissions.platform_owner.scope).toBe(
      'any_explicit_workspace',
    );
    expect(globalRead.permissions.workspace_owner.scope).toBe(
      'coaching_work_any_workspace',
    );
    expect(globalGovernance.permissions.platform_owner.decision).toBe('allow');
    expect(globalGovernance.permissions.trainer.decision).toBe('deny');
  });

  it('applies explicit PO workspace scope and current coaching membership to staff', () => {
    const po = {
      userId: '00000000-0000-4000-8000-000000000001',
      role: 'platform_owner' as const,
      activeWorkspaceIds: [],
    };
    const trainer = {
      userId: '00000000-0000-4000-8000-000000000002',
      role: 'trainer' as const,
      activeWorkspaceIds: [targetWorkspaceId],
    };
    const trainerWithoutWorkspace = { ...trainer, activeWorkspaceIds: [] };
    expect(authorize(po, 'coaching_work', targetWorkspaceId)).toBe(true);
    expect(authorize(trainer, 'coaching_work', targetWorkspaceId)).toBe(true);
    expect(
      authorize(
        trainer,
        'coaching_work',
        'f0ad0689-235e-4d15-90eb-f235984ad501',
      ),
    ).toBe(false);
    expect(
      authorize(trainerWithoutWorkspace, 'coaching_work', targetWorkspaceId),
    ).toBe(false);
  });
});
