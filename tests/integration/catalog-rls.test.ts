import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from './harness';

const db = sql();
const source = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261106102000_catalog_rls.sql'),
  'utf8',
);
const globalTables = [
  'taxonomy_terms',
  'taxonomy_term_versions',
  'exercises',
  'exercise_versions',
  'foods',
  'food_versions',
  'food_serving_units',
  'food_alternatives',
];
const workspaceTables = [
  'workspace_exercises',
  'workspace_exercise_versions',
  'exercise_variations',
  'exercise_variation_versions',
];

afterAll(async () => db.end());

describe('F16 catalog row-level security', () => {
  it('forces RLS and uses one global predicate or the selected workspace predicate', async () => {
    const names = [...globalTables, ...workspaceTables];
    const relations = await db`
      select c.relname as name, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = any(${names})
    `;
    expect(relations).toHaveLength(names.length);
    expect(relations.every((row) => row.enabled && row.forced)).toBe(true);

    const policies = await db`
      select tablename, policyname, cmd, roles::text[] as roles, qual
      from pg_policies where schemaname = 'public' and tablename = any(${names})
    `;
    for (const table of names) {
      const tablePolicies = policies.filter(
        (policy) => policy.tablename === table,
      );
      expect(tablePolicies.length, table).toBeGreaterThan(0);
      expect(
        tablePolicies.every((policy) => policy.cmd === 'SELECT'),
        table,
      ).toBe(true);
      expect(
        tablePolicies.every((policy) => policy.roles.includes('authenticated')),
        table,
      ).toBe(true);
      if (globalTables.includes(table))
        expect(
          tablePolicies.every((policy) =>
            policy.qual.includes('catalog_can_read_global'),
          ),
          table,
        ).toBe(true);
      else
        expect(
          tablePolicies.every(
            (policy) =>
              policy.qual.includes('has_workspace_access') &&
              policy.qual.includes('coaching_work'),
          ),
          table,
        ).toBe(true);
    }
  });

  it('keeps global and tenant denial guards in a forward migration', () => {
    expect(source).toContain('catalog_can_read_global');
    expect(source).toContain(
      "has_workspace_access(workspace_id, 'coaching_work')",
    );
    expect(source).toContain('force row level security');
    expect(source).toContain('create policy');
  });
});
