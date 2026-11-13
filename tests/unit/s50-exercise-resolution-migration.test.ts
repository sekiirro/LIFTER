import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261112130020_catalog_exercise_payload_text_cap.sql',
  ),
  'utf8',
);

describe('S50 F16 forward RPC corrections', () => {
  it('guards cutover against concurrent global and workspace version changes', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20261112130011_catalog_exercise_cutover.sql',
      ),
      'utf8',
    );
    const start = migration.indexOf(
      'create or replace function app_private.cutover_identity_guard',
    );
    const end = migration.indexOf(
      'alter function app_private.cutover_identity_guard',
      start,
    );
    expect(start).toBeGreaterThan(-1);
    const guard = migration.slice(start, end);
    expect(guard).toContain("verified->'exercise_versions'");
    expect(guard).toContain("verified->'workspace_exercise_versions'");
    expect(guard).toContain('live_exercise_versions');
    expect(guard).toContain('live_workspace_exercise_versions');
    expect(guard).toContain(
      "verified->'exercise_versions' is distinct from live_exercise_versions",
    );
    expect(guard).toContain(
      "verified->'workspace_exercise_versions' is distinct from live_workspace_exercise_versions",
    );
    expect(migration).toMatch(
      /lock table public\.exercise_versions, public\.workspace_exercise_versions[\s\S]*?in share row exclusive mode/i,
    );
    expect(
      readFileSync(
        resolve(
          process.cwd(),
          'supabase/migrations/20261112130020_catalog_exercise_payload_text_cap.sql',
        ),
        'utf8',
      ),
    ).not.toContain(
      'create or replace function app_private.cutover_identity_guard',
    );
  });

  it('filters resolved Video values through the approved host policy', () => {
    const start = migration.indexOf(
      'create or replace function app_private.catalog_effective_exercise_fields',
    );
    const end = migration.indexOf(
      'alter function app_private.catalog_effective_exercise_fields',
      start,
    );
    expect(start).toBeGreaterThan(-1);
    const functionSql = migration.slice(start, end);
    expect(functionSql).toContain('app_private.catalog_video_url_allowed');
  });

  it('searches effective workspace names after checking the requested scope', () => {
    const start = migration.indexOf(
      'create or replace function public.catalog_search',
    );
    const end = migration.indexOf(
      'alter function public.catalog_search(text, text, jsonb, text, uuid) owner to postgres',
      start,
    );
    expect(start).toBeGreaterThan(-1);
    const search = migration.slice(start, end);
    expect(search).toMatch(/security invoker set search_path = ''/);
    expect(search).not.toContain('security definer');
    expect(search.indexOf("if kind in ('exercise', 'food')")).toBeGreaterThan(
      -1,
    );
    expect(search.indexOf('not app_private.has_workspace_access')).toBeLessThan(
      search.indexOf('if filters is null'),
    );
    expect(search).toContain('app_private.catalog_search_variation');
    expect(search).toContain('app_private.catalog_search_pre_cutover');
    expect(search).toContain("nullif(ov.payload->>'name_en', '')");
    expect(search).toContain("nullif(ov.payload->>'name_ar', '')");
    const page = search.indexOf('with page as materialized');
    const resolution = search.indexOf(
      'catalog_effective_exercise_fields($5, page.id)',
    );
    expect(page).toBeGreaterThan(-1);
    expect(resolution).toBeGreaterThan(page);
    expect(search.slice(page, resolution)).toContain('limit page_limit');
  });

  it('pages the workspace library candidates before resolving full effective fields', () => {
    const start = migration.lastIndexOf(
      'create or replace function public.catalog_workspace_library',
    );
    expect(start).toBeGreaterThan(-1);
    const library = migration.slice(start);
    const auth = library.indexOf('if auth.uid() is null');
    const page = library.indexOf('page as materialized');
    const resolve = library.indexOf(
      'catalog_effective_exercise_fields(p_workspace_id',
    );
    expect(auth).toBeGreaterThan(-1);
    expect(page).toBeGreaterThan(auth);
    expect(resolve).toBeGreaterThan(page);
    expect(library.slice(page, resolve)).toContain('limit page_limit');
    expect(library.slice(page, resolve)).toContain('cursor_name');
  });
});
