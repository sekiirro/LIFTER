import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261103126000_f13_renewal.sql',
  'utf8',
);

describe('F13 renewal migration', () => {
  it('writes the final operation receipt once because operation facts are immutable', () => {
    const body = migration.slice(
      migration.indexOf('create function public.record_renewal(request jsonb)'),
      migration.indexOf(
        'alter function public.record_renewal(jsonb) owner to postgres',
      ),
    );
    const receiptIndex = body.indexOf(
      "result:=jsonb_build_object('status','ok','receipt',receipt)",
    );
    const operationInsertIndex = body.indexOf(
      'insert into app_private.subscription_renewal_operations',
    );

    expect(receiptIndex).toBeGreaterThan(-1);
    expect(operationInsertIndex).toBeGreaterThan(receiptIndex);
    expect(body).toMatch(
      /expected_revision,canonical_args_hash,result_receipt,recorded_at\)[\s\S]*?values\([\s\S]*?binding,result,sampled\)/,
    );
    expect(body).not.toMatch(
      /update app_private\.subscription_renewal_operations/i,
    );
  });
});
