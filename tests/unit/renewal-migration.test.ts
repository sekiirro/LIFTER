import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPaths = [
  'supabase/migrations/20261103126000_f13_renewal.sql',
  'supabase/migrations/20261103127000_f13_renewal_package_lookup_fix.sql',
];

describe('F13 renewal migration', () => {
  it.each(migrationPaths)(
    'writes the final operation receipt once because operation facts are immutable: %s',
    (migrationPath) => {
      const migration = readFileSync(migrationPath, 'utf8');
      const bodyStart = migration.indexOf(
        'function public.record_renewal(request jsonb)',
      );
      const body = migration.slice(
        bodyStart,
        migration.indexOf(
          'alter function public.record_renewal(jsonb) owner to postgres',
          bodyStart,
        ),
      );
      const receiptIndex = body.indexOf(
        "result:=jsonb_build_object('status','ok','receipt',receipt)",
      );
      const operationInsertIndex = body.indexOf(
        'insert into app_private.subscription_renewal_operations',
      );

      expect(bodyStart).toBeGreaterThan(-1);
      expect(receiptIndex).toBeGreaterThan(-1);
      expect(operationInsertIndex).toBeGreaterThan(receiptIndex);
      expect(body).toMatch(
        /expected_revision,canonical_args_hash,result_receipt,recorded_at\)[\s\S]*?values\([\s\S]*?binding,result,sampled\)/,
      );
      expect(body).not.toMatch(
        /update app_private\.subscription_renewal_operations/i,
      );
    },
  );
});
