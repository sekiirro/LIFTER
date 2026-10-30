import { readdirSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import {
  MATRIX,
  ROLES,
  roleHasCapability,
  type Role,
} from '../../lib/auth/capabilities';
import { sql } from './harness';

const db = sql();
const f14MigrationPresent = readdirSync('supabase/migrations').some((name) =>
  /^20261102131000_manage_branding_capability\.sql$/.test(name),
);
const requireF14 = process.env.F13_REQUIRE_F14_CAPABILITIES === '1';
const expectationSet =
  f14MigrationPresent || requireF14 ? 'F12+F13+F14' : 'F12+F13 (pre-F14)';

const requiredCapabilities: Record<Role, string[]> = {
  platform_owner: [
    'generate_recovery_link',
    'set_package_pricing',
    'generate_registration_link',
    'configure_installment_schedule',
    'approve_registration',
    'record_payment',
    'manage_freeze',
    'record_refund',
    'delete_client',
    'export_client_dataset',
    'manage_workspaces',
    'manage_staff_access',
    'coaching_work',
  ],
  workspace_owner: [
    'generate_recovery_link',
    'generate_registration_link',
    'configure_installment_schedule',
    'approve_registration',
    'record_payment',
    'manage_freeze',
    'coaching_work',
  ],
  trainer: [
    'generate_registration_link',
    'record_payment',
    'manage_freeze',
    'coaching_work',
  ],
  sales: [
    'generate_registration_link',
    'configure_installment_schedule',
    'record_payment',
    'manage_freeze',
  ],
};
if (f14MigrationPresent || requireF14) {
  requiredCapabilities.platform_owner.push('manage_branding');
  requiredCapabilities.workspace_owner.push('manage_branding');
}

it(`T017 expectation set ${expectationSet}: TypeScript capability union`, () => {
  for (const role of ROLES) {
    expect([...MATRIX[role]].sort(), `${role} TypeScript matrix`).toEqual(
      [...requiredCapabilities[role]].sort(),
    );
  }
  expect(roleHasCapability('trainer', 'record_payment')).toBe(true);
  expect(roleHasCapability('trainer', 'manage_freeze')).toBe(true);
  expect(roleHasCapability('trainer', 'record_refund')).toBe(false);
  expect(roleHasCapability('sales', 'approve_registration')).toBe(false);
});

it(`T017 expectation set ${expectationSet}: SQL capability union`, async () => {
  for (const role of ROLES) {
    const actual: string[] = [];
    for (const capability of new Set([
      ...requiredCapabilities.platform_owner,
      'manage_branding',
    ])) {
      const [row] = await db`
        select app_private.role_has_capability(${role}::public.staff_role, ${capability}) as allowed
      `;
      if (row?.allowed) actual.push(capability);
    }
    expect(actual.sort(), `${role} SQL matrix`).toEqual(
      [...requiredCapabilities[role]].sort(),
    );
  }
});

it('T017 F13 audit mappings retain freeze and refund ledger actions', async () => {
  const rows = await db`
    select p.proname, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    where p.oid in (
      'app_private.audit_row_change()'::regprocedure,
      'app_private.f13_audit_freeze()'::regprocedure,
      'app_private.f13_audit_refund_ledger()'::regprocedure
    )
  `;
  const definitions = new Map(
    rows.map((row) => [row.proname as string, row.definition as string]),
  );
  for (const action of [
    'client.approved',
    'client.rejected',
    'client.reconsidered',
    'payment.collected',
    'payment.collection_corrected',
  ]) {
    expect(definitions.get('audit_row_change')).toContain(action);
  }
  expect(definitions.get('f13_audit_freeze')).toContain(
    'subscription.freeze_applied',
  );
  expect(definitions.get('f13_audit_freeze')).toContain(
    "'subscription.freeze_'||new.kind",
  );
  for (const action of [
    'payment.refund_recorded',
    'payment.refund_allocated',
    'payment.obligation_cancelled',
  ]) {
    expect(definitions.get('f13_audit_refund_ledger')).toContain(action);
  }
});

afterAll(async () => db.end());
