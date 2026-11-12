import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authorize } from '../../lib/auth/authorize';
import { ROLES, roleHasCapability } from '../../lib/auth/capabilities';

const capabilitySql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261103129200_f13_f14_capability_reconciliation.sql',
  ),
  'utf8',
);
const ownerSql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261027140000_access_capability_for_po.sql',
  ),
  'utf8',
);

function databaseCoachingRoles(sql: string): string[] {
  const match = sql.match(/when cap = 'coaching_work'\s+then r in \(([^)]*)\)/);
  if (!match?.[1]) throw new Error('Database coaching_work capability missing');
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((role) => role[1] ?? '');
}

describe('Client Notes authorization parity (T002)', () => {
  it('grants coaching_work to the same staff roles in app and database', () => {
    const expected = ['platform_owner', 'workspace_owner', 'trainer'];
    expect(databaseCoachingRoles(capabilitySql)).toEqual(expected);
    expect(
      ROLES.filter((role) => roleHasCapability(role, 'coaching_work')),
    ).toEqual(expected);
    expect(roleHasCapability('sales', 'coaching_work')).toBe(false);
  });

  it('requires active membership for non-PO actors but keeps the approved PO branch', () => {
    expect(ownerSql).toMatch(/app_private\.is_platform_owner\(\) or \(/);
    expect(ownerSql).toMatch(/revoked_at is null/);
    expect(
      authorize(
        { userId: 'trainer', role: 'trainer', activeWorkspaceIds: ['A'] },
        'coaching_work',
        'A',
      ),
    ).toBe(true);
    expect(
      authorize(
        { userId: 'trainer', role: 'trainer', activeWorkspaceIds: [] },
        'coaching_work',
        'A',
      ),
    ).toBe(false);
    expect(
      authorize(
        { userId: 'po', role: 'platform_owner', activeWorkspaceIds: [] },
        'coaching_work',
        'B',
      ),
    ).toBe(true);
  });
});
