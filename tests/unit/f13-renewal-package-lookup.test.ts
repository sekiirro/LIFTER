import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('F13 renewal package lookup migration', () => {
  it('avoids the PL/pgSQL variable/column ambiguity in the version lookup', () => {
    const migration = readFileSync(
      'supabase/migrations/20261103127000_f13_renewal_package_lookup_fix.sql',
      'utf8',
    );

    expect(migration).toContain('requested_offer_id');
    expect(migration).toMatch(/v\.offer_id\s*=\s*requested_offer_id/);
    expect(migration).not.toMatch(/v\.offer_id\s*=\s*offer_id\b/);
  });

  it('validates the renewal version snapshot with a row comparison in the guard', () => {
    const migration = readFileSync(
      'supabase/migrations/20261103127000_f13_renewal_package_lookup_fix.sql',
      'utf8',
    );

    expect(migration).toContain(
      'create or replace function app_private.f12_guard_subscription()',
    );
    expect(migration).toContain(
      'is not distinct from (v.price_minor,v.currency,v.commission_rate_bp,v.duration_days,v.duration_months)',
    );
    expect(migration).not.toContain(
      'is distinct from (select v.price_minor,v.currency,v.commission_rate_bp,v.duration_days,v.duration_months',
    );
  });

  it('validates renewal snapshots without a multi-column scalar subquery', () => {
    const migration = readFileSync(
      'supabase/migrations/20261103127000_f13_renewal_package_lookup_fix.sql',
      'utf8',
    );

    expect(migration).toContain(
      'create or replace function app_private.f13_validate_renewal',
    );
    expect(migration).toContain(
      'is not distinct from (v.price_minor,v.currency,v.commission_rate_bp,v.duration_days,v.duration_months)',
    );
    expect(migration).not.toContain(
      'is distinct from (select v.price_minor,v.currency,v.commission_rate_bp,v.duration_days,v.duration_months',
    );
  });

  it('reads renewal operations from their private schema in the validator', () => {
    const migration = readFileSync(
      'supabase/migrations/20261103127000_f13_renewal_package_lookup_fix.sql',
      'utf8',
    );

    const validator = migration.slice(
      migration.indexOf(
        'create or replace function app_private.f13_validate_renewal',
      ),
    );
    expect(validator).toContain(
      'app_private.subscription_renewal_operations o',
    );
    expect(validator).not.toContain('public.subscription_renewal_operations o');
  });
});
