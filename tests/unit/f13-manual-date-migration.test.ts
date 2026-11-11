import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261111221000_f13_manual_date_adjustment.sql',
  'utf8',
);

describe('F13 manual date adjustment migration source', () => {
  it('requires Platform Owner before validation and rechecks after locking', () => {
    expect(migration).toContain('app_private.is_platform_owner()');
    const firstCheck = migration.indexOf('app_private.is_platform_owner()');
    const shapeCheck = migration.indexOf("k not in\n      ('workspace_id'");
    expect(firstCheck).toBeGreaterThanOrEqual(0);
    expect(firstCheck).toBeLessThan(shapeCheck);
    expect(migration).toMatch(/for update[\s\S]*?is_platform_owner/);
  });

  it('writes an immutable audited fact with zero revenue columns', () => {
    expect(migration).toContain('subscription.manual_date_adjusted');
    expect(migration).toContain('f13_no_update');
    expect(migration).toContain('f13_no_delete');
    expect(migration).toContain('f13_no_truncate');
    expect(migration).not.toMatch(
      /payment_events|refund_operations|installments|amount_minor/,
    );
  });

  it('grants the writer to authenticated only and hardens the audit function', () => {
    expect(migration).toMatch(
      /revoke all on function public\.record_subscription_date_adjustment\(jsonb\) from public,anon,authenticated,service_role[\s\S]*grant execute on function public\.record_subscription_date_adjustment\(jsonb\) to authenticated/,
    );
    expect(migration).toMatch(
      /revoke all on function app_private\.f13_audit_manual_date\(\) from public,anon,authenticated,service_role/,
    );
    expect(migration).toContain('owner to postgres');
    expect(migration).toContain("set search_path = ''");
  });
});
