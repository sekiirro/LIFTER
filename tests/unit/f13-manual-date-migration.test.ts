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

const forward = readFileSync(
  'supabase/migrations/20261111222100_f13_manual_date_projection.sql',
  'utf8',
);

describe('F13 T043 forward manual-date projection migration', () => {
  it('uses the latest immutable manual dates as the entitlement base', () => {
    expect(forward).toContain(
      'create or replace function app_private.f13_project_entitlement',
    );
    expect(forward).toMatch(
      /from public\.subscription_manual_date_adjustments[\s\S]*order by d\.recorded_at desc,d\.id desc limit 1/,
    );
    expect(forward).toContain(
      'term_start:=manual_adjustment.new_service_start_date',
    );
    expect(forward).toContain(
      'term_end:=manual_adjustment.new_service_end_exclusive',
    );
  });

  it('refuses frozen and deactivated date changes before inserting the fact', () => {
    const insertAt = forward.indexOf(
      'insert into public.subscription_manual_date_adjustments',
    );
    const deactivatedAt = forward.indexOf('if c.deactivated_at is not null');
    const frozenAt = forward.indexOf("if projected->>'status'='frozen'");
    expect(deactivatedAt).toBeGreaterThanOrEqual(0);
    expect(frozenAt).toBeGreaterThan(deactivatedAt);
    expect(frozenAt).toBeLessThan(insertAt);
    expect(deactivatedAt).toBeLessThan(insertAt);
    expect(forward).toMatch(/status','stale_state/g);
  });

  it('preserves SECURITY DEFINER hardening and existing execute grants', () => {
    expect(forward.match(/create or replace function/g)).toHaveLength(2);
    expect(forward.match(/security definer/g)).toHaveLength(2);
    expect(forward.match(/set search_path\s*=\s*''/g)).toHaveLength(2);
    expect(forward).toContain('owner to postgres');
    expect(forward).toMatch(
      /grant execute on function app_private\.f13_project_entitlement\(uuid,uuid,date\) to service_role/,
    );
    expect(forward).toMatch(
      /grant execute on function public\.record_subscription_date_adjustment\(jsonb\) to authenticated/,
    );
  });
});
