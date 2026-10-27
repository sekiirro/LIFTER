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
      'audit_events_immutable',
      'audit_row_change',
      'current_staff_role',
      'forbid_delete',
      'guard_membership_update',
      'has_workspace_access',
      'is_platform_owner',
      'role_has_capability',
    ]);
    for (const row of rows) {
      expect(row.prosecdef).toBe(
        !['audit_events_immutable', 'forbid_delete'].includes(row.proname),
      );
      expect(row.proconfig).toContain('search_path=""');
      expect(row.owner).toBe('postgres');
      expect(row.anon_execute).toBe(false);
      expect(row.authenticated_execute).toBe(
        ![
          'audit_events_immutable',
          'audit_row_change',
          'forbid_delete',
        ].includes(row.proname),
      );
    }
  });
});

describe('audit security catalog (T005)', () => {
  it.each(['workspaces', 'staff_profiles', 'workspace_memberships'])(
    '%s has row DELETE and statement TRUNCATE guards',
    async (table) => {
      const triggers = await db`
        select t.tgname, t.tgtype::int as type, t.tgenabled
        from pg_catalog.pg_trigger t
        join pg_catalog.pg_proc p on p.oid = t.tgfoid
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where t.tgrelid = ${`public.${table}`}::regclass and not t.tgisinternal
          and n.nspname = 'app_private' and p.proname = 'forbid_delete'
        order by t.tgname`;
      expect(triggers).toEqual([
        { tgname: `${table}_no_delete`, type: 11, tgenabled: 'O' },
        { tgname: `${table}_no_truncate`, type: 34, tgenabled: 'O' },
      ]);
      const [guard] = await db`
        select has_function_privilege('service_role', 'app_private.forbid_delete()', 'EXECUTE') as allowed`;
      expect(guard?.allowed).toBe(false);
    },
  );

  it('forces RLS and grants only authenticated SELECT', async () => {
    const [table] =
      await db`select relrowsecurity, relforcerowsecurity from pg_catalog.pg_class where oid = 'public.audit_events'::regclass`;
    expect(table).toMatchObject({
      relrowsecurity: true,
      relforcerowsecurity: true,
    });
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const privilege of [
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
      ]) {
        const [row] =
          await db`select has_table_privilege(${role}, 'public.audit_events', ${privilege}) as allowed`;
        expect(row?.allowed).toBe(
          role === 'authenticated' && privilege === 'SELECT',
        );
      }
    }
    const [policy] =
      await db`select cmd, roles from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'audit_events' and policyname = 'audit_events_select_scoped'`;
    expect(policy).toMatchObject({ cmd: 'SELECT', roles: ['authenticated'] });
  });

  it('attaches all emitters plus row and statement immutability guards', async () => {
    // The four row triggers plus the separate TRUNCATE statement trigger.
    const triggers = await db`
      select t.tgname, c.relname, t.tgtype::int as type, t.tgenabled, p.proname
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_proc p on p.oid = t.tgfoid
      where n.nspname = 'public' and not t.tgisinternal
        and p.proname in ('audit_row_change', 'audit_events_immutable')
      order by t.tgname`;
    expect(triggers).toEqual([
      {
        tgname: 'audit_events_immutable',
        relname: 'audit_events',
        type: 27,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'audit_events_no_truncate',
        relname: 'audit_events',
        type: 34,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'audit_staff_profiles',
        relname: 'staff_profiles',
        type: 21,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_workspace_memberships',
        relname: 'workspace_memberships',
        type: 21,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_workspaces',
        relname: 'workspaces',
        type: 21,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
    ]);
    const [emitter] = await db`select p.prosecdef, p.proconfig,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private' and p.proname = 'audit_row_change'`;
    expect(emitter?.prosecdef).toBe(true);
    expect(emitter?.proconfig).toContain('search_path=""');
    expect(emitter?.service_execute).toBe(false);
  });
});
