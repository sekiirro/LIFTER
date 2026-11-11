import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from './harness';

const db = sql();
const source = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261106101000_catalog_privileges.sql',
  ),
  'utf8',
);
const tables = [
  'taxonomy_terms',
  'taxonomy_term_versions',
  'exercises',
  'exercise_versions',
  'foods',
  'food_versions',
  'food_serving_units',
  'food_default_alternatives',
  'workspace_exercises',
  'workspace_exercise_versions',
  'exercise_variations',
  'exercise_variation_versions',
  'operation_keys',
];

afterAll(async () => db.end());

describe('catalog privilege boundary', () => {
  it('keeps direct catalog DML denied for every client role', async () => {
    const clients = ['anon', 'authenticated', 'service_role'];
    for (const schemaTable of tables) {
      const schema =
        schemaTable === 'operation_keys' ? 'app_private' : 'public';
      for (const role of clients) {
        const [privileges] = await db`
          select has_table_privilege(${role}, ${`${schema}.${schemaTable}`}, 'INSERT') as can_insert,
            has_table_privilege(${role}, ${`${schema}.${schemaTable}`}, 'UPDATE') as can_update,
            has_table_privilege(${role}, ${`${schema}.${schemaTable}`}, 'DELETE') as can_delete
        `;
        expect(privileges, `${role} ${schema}.${schemaTable}`).toEqual({
          can_insert: false,
          can_update: false,
          can_delete: false,
        });
      }
    }
  });

  it('grants only authenticated access to the catalog read RPC and keeps helpers private', async () => {
    const [read] = await db`
      select p.prosecdef as security_definer,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
        has_function_privilege('anon', 'public.catalog_search(text,text,jsonb,text,uuid)', 'EXECUTE') as anon,
        has_function_privilege('service_role', 'public.catalog_search(text,text,jsonb,text,uuid)', 'EXECUTE') as service_role
      from pg_proc p
      where p.oid = 'public.catalog_search(text,text,jsonb,text,uuid)'::regprocedure
    `;
    expect(read).toEqual({
      security_definer: false,
      authenticated: true,
      anon: false,
      service_role: false,
    });

    const [helper] = await db`
      select p.prosecdef as security_definer,
        pg_get_userbyid(p.proowner) as owner,
        p.proconfig as config,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
      from pg_proc p
      where p.oid = 'app_private.catalog_write_audit(uuid,text,text,uuid,uuid,jsonb)'::regprocedure
    `;
    expect(helper).toMatchObject({
      security_definer: true,
      owner: 'postgres',
      authenticated: false,
      anon: false,
      service_role: false,
    });
    expect(helper?.config).toContain('search_path=""');

    const [variationHelper] = await db`
      select p.prosecdef as security_definer,
        p.proconfig as config,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
      from pg_proc p
      where p.oid = 'app_private.catalog_search_variation(text,jsonb,text,uuid)'::regprocedure
    `;
    expect(variationHelper).toEqual({
      security_definer: true,
      config: ['search_path=""'],
      authenticated: true,
      anon: false,
      service_role: false,
    });
  });

  it('pins the F12-F15 denial and owner/search_path rules in a forward migration', () => {
    expect(source).toContain('public.exercises, public.exercise_versions');
    expect(source).toContain('from public, anon, authenticated, service_role');
    expect(source).toContain('grant execute on function public.catalog_search');
    expect(source).toContain('to authenticated');
    expect(source).toContain('alter function app_private.catalog_write_audit');
    expect(source).toContain('alter function app_private.operation_key_result');
  });
});
