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
});
