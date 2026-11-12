import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261112011000_catalog_exercise_notes_video_text_cap.sql',
  ),
  'utf8',
);
const rpcMigration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261112043000_catalog_exercise_payload_text_cap.sql',
  ),
  'utf8',
);

describe('T091 exercise Notes and Video text cap migration', () => {
  it('fails closed with an over-limit count before adding any constraints', () => {
    const audit = migration.indexOf(
      'select app_private.catalog_assert_exercise_text_limits()',
    );
    const firstConstraint = migration.indexOf(
      'alter table public.exercise_versions',
    );
    expect(audit).toBeGreaterThan(-1);
    expect(firstConstraint).toBeGreaterThan(audit);
    expect(migration).toContain(
      "raise exception 'catalog_exercise_text_limit_existing_data:%'",
    );
  });

  it('audits and constrains all current and compatibility exercise text stores', () => {
    for (const table of [
      'exercise_versions',
      'workspace_exercise_versions',
      'exercise_override_versions',
      'exercise_variation_versions',
    ]) {
      expect(migration).toContain(`public.${table}`);
    }
    expect(migration).toMatch(/notes, ''\)\) <= 2000/);
    expect(migration).toMatch(/payload->>'video_url', ''\)\) <= 2000/);
    expect(migration.toLowerCase()).not.toMatch(/\b(update|truncate)\b/);
  });

  it('keeps the cap guard private and returns the existing invalid status', () => {
    expect(rpcMigration).toMatch(
      /validate_exercise_payload\(p_request jsonb\)[\s\S]*security definer set search_path = ''/i,
    );
    expect(rpcMigration).toContain("char_length(p_request ->> 'notes') > 2000");
    expect(rpcMigration).toContain(
      "char_length(p_request ->> 'video_url') > 2000",
    );
    expect(rpcMigration).toContain(
      "raise exception 'catalog_exercise_invalid' using errcode = '22023'",
    );
    expect(rpcMigration).toContain(
      'alter function app_private.validate_exercise_payload(jsonb) owner to postgres',
    );
    expect(rpcMigration).toContain(
      'revoke all on function app_private.validate_exercise_payload(jsonb) from public, anon, authenticated, service_role',
    );
  });
});
