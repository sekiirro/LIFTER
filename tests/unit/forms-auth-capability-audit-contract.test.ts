import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  CAPABILITIES,
  MATRIX,
  ROLES,
  type Role,
} from '../../lib/auth/capabilities';

const capabilityMigration = readFileSync(
  'supabase/migrations/20261112021800_f15_shared_forms_capability_reconciliation.sql',
  'utf8',
);
const auditMigration = readFileSync(
  'supabase/migrations/20261102139000_workspace_branding_audit_extension.sql',
  'utf8',
);

function parseSqlMatrix(source: string): Record<Role, Set<string>> {
  const matrix: Record<Role, Set<string>> = {
    platform_owner: new Set(),
    workspace_owner: new Set(),
    trainer: new Set(),
    sales: new Set(),
  };
  const rule =
    /when cap ([\s\S]*?)\s+then r ([\s\S]*?)(?=\s+when cap|\s+else false)/gi;
  for (const match of source.matchAll(rule)) {
    const capabilities = [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map(
      (item) => item[1]!,
    );
    const roles = [...(match[2] ?? '').matchAll(/'([^']+)'/g)].map(
      (item) => item[1] as Role,
    );
    for (const capability of capabilities)
      for (const role of roles) matrix[role].add(capability);
  }
  return matrix;
}

function capabilityMismatches(
  ts: Record<Role, Set<string>>,
  sql: Record<Role, Set<string>>,
) {
  return ROLES.flatMap((role) =>
    [...new Set([...ts[role], ...sql[role]])]
      .filter(
        (capability) => ts[role].has(capability) !== sql[role].has(capability),
      )
      .map((capability) => `${role}:${capability}`),
  );
}

function readTsMatrix(): Record<Role, Set<string>> {
  return Object.fromEntries(
    ROLES.map((role) => [role, new Set<string>(MATRIX[role])]),
  ) as Record<Role, Set<string>>;
}

function listedSqlCapabilities(matrix: Record<Role, Set<string>>) {
  return new Set([...matrix.platform_owner]);
}

const auditMappings: Record<string, string[]> = {
  workspaces: ['workspace.created', 'workspace.updated'],
  staff_profiles: ['staff_role.assigned', 'staff_role.changed'],
  workspace_memberships: ['membership.granted', 'membership.revoked'],
  recovery_link_issuances: ['recovery_link.generated'],
  packages: ['package.created'],
  package_versions: ['package_version.published'],
  package_offers: ['package_offer.availability_changed'],
  registration_links: [
    'registration_link.issued',
    'registration_link.opened',
    'registration_link.consumed',
  ],
  clients: [
    'client.signup_succeeded',
    'client.approved',
    'client.rejected',
    'client.reconsidered',
  ],
  payment_events: ['payment.collected', 'payment.collection_corrected'],
  branding_published_versions: ['branding.published'],
  jobs: ['job.dead_lettered'],
};

function auditMappingsMissing(source: string) {
  return Object.entries(auditMappings).flatMap(([table, actions]) => [
    ...(!source.includes(`tg_table_name = '${table}'`)
      ? [`table:${table}`]
      : []),
    ...actions
      .filter((action) => !source.includes(action))
      .map((action) => `${table}:${action}`),
  ]);
}

it('T002 keeps the complete TypeScript and SQL capability maps in parity', () => {
  const ts = readTsMatrix();
  const sql = parseSqlMatrix(capabilityMigration);
  expect(CAPABILITIES).toContain('assign_intake_form');
  expect([...listedSqlCapabilities(sql)].sort()).toEqual(
    [...CAPABILITIES].sort(),
  );
  expect(capabilityMismatches(ts, sql)).toEqual([]);
  const unknownGrant = parseSqlMatrix(capabilityMigration);
  unknownGrant.sales.add('unknown_capability');
  expect(capabilityMismatches(ts, unknownGrant)).toContain(
    'sales:unknown_capability',
  );
  for (const role of ROLES) {
    expect(ts[role].has('unknown_capability')).toBe(false);
    expect(sql[role].has('unknown_capability')).toBe(false);
  }
});

it.each([
  ['platform_owner', 'assign_intake_form'],
  ['workspace_owner', 'assign_intake_form'],
  ['trainer', 'assign_intake_form'],
] as const)('T002 catches a removed %s grant for %s', (role, capability) => {
  const ts = readTsMatrix();
  const sql = parseSqlMatrix(capabilityMigration);
  sql[role].delete(capability);
  expect(capabilityMismatches(ts, sql)).toContain(`${role}:${capability}`);
});

it('T002 catches a restored Sales grant and either one-way capability omission', () => {
  const ts = readTsMatrix();
  const sql = parseSqlMatrix(capabilityMigration);
  sql.sales.add('assign_intake_form');
  expect(capabilityMismatches(ts, sql)).toContain('sales:assign_intake_form');

  const withoutTsDirection = readTsMatrix();
  withoutTsDirection.platform_owner.delete('assign_intake_form');
  expect(capabilityMismatches(withoutTsDirection, sql)).toContain(
    'platform_owner:assign_intake_form',
  );
  const withoutSqlDirection = parseSqlMatrix(capabilityMigration);
  for (const role of ROLES)
    withoutSqlDirection[role].delete('assign_intake_form');
  expect(capabilityMismatches(ts, withoutSqlDirection)).toContain(
    'platform_owner:assign_intake_form',
  );
});

it('T002 preserves every F11–F14 audit table/action mapping and catches a dropped mapping', () => {
  expect(auditMappingsMissing(auditMigration)).toEqual([]);
  const dropped = auditMigration.replace(
    "'payment.collection_corrected'",
    "'payment.mapping_removed'",
  );
  expect(auditMappingsMissing(dropped)).toContain(
    'payment_events:payment.collection_corrected',
  );
});
