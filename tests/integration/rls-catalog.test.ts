import { afterAll, describe, expect, it } from 'vitest';
import { sql } from './harness';

const db = sql();
afterAll(async () => {
  await db.end();
});

describe('tenancy security catalog (T007)', () => {
  it.each(['staff_profiles', 'workspaces', 'workspace_memberships'])(
    '%s forces RLS and has least-privilege grants',
    async (table) => {
      const rows =
        await db`select relrowsecurity, relforcerowsecurity from pg_catalog.pg_class where oid = ${`public.${table}`}::regclass`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE']) {
        const [row] =
          await db`select has_table_privilege('anon', ${`public.${table}`}, ${privilege}) as allowed`;
        expect(row?.allowed).toBe(false);
        const [authenticated] =
          await db`select has_table_privilege('authenticated', ${`public.${table}`}, ${privilege}) as allowed`;
        expect(authenticated?.allowed).toBe(
          table !== 'workspaces' || privilege !== 'UPDATE',
        );
      }
      const [row] =
        await db`select has_table_privilege('authenticated', ${`public.${table}`}, 'DELETE') as allowed`;
      expect(row?.allowed).toBe(false);
    },
  );

  it.each(['id', 'created_by', 'created_at'])(
    'authenticated cannot update workspaces.%s',
    async (column) => {
      const [row] =
        await db`select has_column_privilege('authenticated', 'public.workspaces', ${column}, 'UPDATE') as allowed`;
      expect(row?.allowed).toBe(false);
    },
  );

  it.each(['name', 'slug'])(
    'authenticated can update workspaces.%s subject to RLS',
    async (column) => {
      const [row] =
        await db`select has_column_privilege('authenticated', 'public.workspaces', ${column}, 'UPDATE') as allowed`;
      expect(row?.allowed).toBe(true);
    },
  );

  it('all private functions have hardened ownership, search path and execute grants', async () => {
    const rows = await db`
      select p.proname, p.prosecdef, p.proconfig, pg_catalog.pg_get_userbyid(p.proowner) as owner,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private'`;
    expect(rows.map((row) => row.proname).sort()).toEqual([
      'current_staff_role',
      'guard_membership_update',
      'has_workspace_access',
      'is_platform_owner',
      'role_has_capability',
    ]);
    for (const row of rows) {
      expect(row.prosecdef).toBe(true);
      expect(row.proconfig).toContain('search_path=""');
      expect(row.owner).toBe('postgres');
      expect(row.anon_execute).toBe(false);
      expect(row.authenticated_execute).toBe(true);
    }
  });
});
