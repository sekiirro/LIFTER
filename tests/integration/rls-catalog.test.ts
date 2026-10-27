import { afterAll, describe, expect, it } from 'vitest';
import { sql } from './harness';

const db = sql();
afterAll(async () => {
  await db.end();
});

describe('recovery security catalog', () => {
  it('forces RLS with no policies and no API privileges', async () => {
    const [table] =
      await db`select relrowsecurity, relforcerowsecurity from pg_catalog.pg_class where oid = 'public.recovery_link_issuances'::regclass`;
    expect(table).toMatchObject({
      relrowsecurity: true,
      relforcerowsecurity: true,
    });
    const policies =
      await db`select * from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'recovery_link_issuances'`;
    expect(policies).toHaveLength(0);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const privilege of [
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
        'MAINTAIN',
      ]) {
        const [row] =
          await db`select has_table_privilege(${role}, 'public.recovery_link_issuances', ${privilege}) as allowed`;
        expect(row?.allowed).toBe(false);
      }
    }
  });
  it('attaches insert audit and update/delete/truncate guards', async () => {
    const triggers =
      await db`select tgname, tgtype::int as type from pg_catalog.pg_trigger where tgrelid = 'public.recovery_link_issuances'::regclass and not tgisinternal order by tgname`;
    expect(triggers).toEqual([
      { tgname: 'audit_recovery_link_issuances', type: 5 },
      { tgname: 'recovery_link_issuances_no_delete', type: 11 },
      { tgname: 'recovery_link_issuances_no_truncate', type: 34 },
      { tgname: 'recovery_link_issuances_no_update', type: 19 },
    ]);
  });
  it('hardens all five recovery functions and grants only the public RPCs to authenticated', async () => {
    for (const name of [
      'app_private.recovery_target_workspace(uuid)',
      'app_private.recovery_link_limits()',
      'app_private.recovery_link_guard(uuid)',
      'public.recovery_link_authorize(uuid)',
      'public.recovery_link_record(uuid)',
    ]) {
      const [fn] =
        await db`select prosecdef, proconfig, pg_catalog.pg_get_userbyid(proowner) as owner from pg_catalog.pg_proc where oid = ${name}::regprocedure`;
      expect(fn?.prosecdef).toBe(!name.includes('recovery_link_limits'));
      expect(fn?.owner).toBe('postgres');
      expect(fn?.proconfig).toContain('search_path=""');
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const [grant] =
          await db`select has_function_privilege(${role}, ${name}, 'EXECUTE') as allowed`;
        expect(grant?.allowed).toBe(
          role === 'authenticated' && name.startsWith('public.'),
        );
      }
    }
  });
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
      'enqueue_job',
      'forbid_delete',
      'guard_membership_update',
      'guard_package_offer_update',
      'guard_package_version_insert',
      'has_workspace_access',
      'is_platform_owner',
      'jobs_updated_at',
      'recovery_link_guard',
      'recovery_link_limits',
      'recovery_target_workspace',
      'role_has_capability',
    ]);
    for (const row of rows) {
      expect(row.prosecdef).toBe(
        ![
          'audit_events_immutable',
          'forbid_delete',
          'jobs_updated_at',
          'recovery_link_limits',
        ].includes(row.proname),
      );
      expect(row.proconfig).toContain('search_path=""');
      expect(row.owner).toBe('postgres');
      expect(row.anon_execute).toBe(false);
      expect(row.authenticated_execute).toBe(
        ![
          'audit_events_immutable',
          'audit_row_change',
          'enqueue_job',
          'forbid_delete',
          'guard_package_offer_update',
          'guard_package_version_insert',
          'jobs_updated_at',
          'recovery_link_guard',
          'recovery_link_limits',
          'recovery_target_workspace',
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
    // All emitters plus the separate TRUNCATE statement trigger.
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
        tgname: 'audit_jobs',
        relname: 'jobs',
        type: 17,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_package_offers',
        relname: 'package_offers',
        type: 17,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_package_versions',
        relname: 'package_versions',
        type: 5,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_packages',
        relname: 'packages',
        type: 5,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_recovery_link_issuances',
        relname: 'recovery_link_issuances',
        type: 5,
        tgenabled: 'O',
        proname: 'audit_row_change',
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
      {
        tgname: 'package_versions_no_update',
        relname: 'package_versions',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'packages_no_update',
        relname: 'packages',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'recovery_link_issuances_no_update',
        relname: 'recovery_link_issuances',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
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

describe('jobs security catalog (T006)', () => {
  it('forces RLS and grants service_role SELECT only', async () => {
    const [table] =
      await db`select relrowsecurity, relforcerowsecurity from pg_catalog.pg_class where oid = 'public.jobs'::regclass`;
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
        'MAINTAIN',
      ]) {
        const [row] =
          await db`select has_table_privilege(${role}, 'public.jobs', ${privilege}) as allowed`;
        expect(row?.allowed).toBe(
          role === 'service_role' && privilege === 'SELECT',
        );
      }
    }
  });

  it('hardens RPC ownership/search paths and restricts execution to service_role', async () => {
    const functions = [
      'public.jobs_claim(integer,integer)',
      'public.jobs_complete(uuid,uuid)',
      'public.jobs_fail(uuid,uuid,text,boolean)',
      'app_private.enqueue_job(text,uuid,jsonb,text,timestamptz,integer)',
    ];
    for (const name of functions) {
      const [fn] =
        await db`select prosecdef, proconfig, pg_catalog.pg_get_userbyid(proowner) as owner from pg_catalog.pg_proc where oid = ${name}::regprocedure`;
      expect(fn).toMatchObject({ prosecdef: true, owner: 'postgres' });
      expect(fn?.proconfig).toContain('search_path=""');
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const [row] =
          await db`select has_function_privilege(${role}, ${name}, 'EXECUTE') as allowed`;
        expect(row?.allowed).toBe(
          role === 'service_role' && name.startsWith('public.'),
        );
      }
    }
  });
});

describe('package security catalog', () => {
  it.each(['packages', 'package_offers', 'package_versions'])(
    '%s forces RLS, scoped SELECT and no API writes',
    async (table) => {
      const relation = `public.${table}`;
      const [row] =
        await db`select relrowsecurity,relforcerowsecurity from pg_class where oid=${relation}::regclass`;
      expect(row).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
      const policies =
        await db`select policyname,cmd,roles,qual from pg_policies where schemaname='public' and tablename=${table}`;
      expect(policies).toHaveLength(1);
      expect(policies[0]).toMatchObject({
        policyname: `${table}_select_scoped`,
        cmd: 'SELECT',
        roles: ['authenticated'],
      });
      expect(policies[0]?.qual).toContain('generate_registration_link');
      for (const role of ['anon', 'authenticated', 'service_role'])
        for (const privilege of [
          'SELECT',
          'INSERT',
          'UPDATE',
          'DELETE',
          'TRUNCATE',
          'REFERENCES',
          'TRIGGER',
        ]) {
          const [grant] =
            await db`select has_table_privilege(${role},${relation},${privilege}) as allowed`;
          expect(grant?.allowed).toBe(
            role === 'authenticated' &&
              privilege === 'SELECT' &&
              table !== 'package_versions',
          );
        }
      const triggers =
        await db`select tgname,tgtype::int as type,tgenabled from pg_trigger where tgrelid=${relation}::regclass and not tgisinternal order by tgname`;
      const expected = [
        { tgname: `${table}_no_delete`, type: 11, tgenabled: 'O' },
        { tgname: `${table}_no_truncate`, type: 34, tgenabled: 'O' },
      ];
      if (table === 'package_offers')
        expected.push(
          { tgname: 'package_offers_guard', type: 19, tgenabled: 'O' },
          { tgname: 'audit_package_offers', type: 17, tgenabled: 'O' },
        );
      else {
        expected.push(
          { tgname: `${table}_no_update`, type: 19, tgenabled: 'O' },
          { tgname: `audit_${table}`, type: 5, tgenabled: 'O' },
        );
        if (table === 'package_versions')
          expected.push({
            tgname: 'package_versions_insert_guard',
            type: 7,
            tgenabled: 'O',
          });
      }
      expect(triggers).toEqual(
        expected.sort((a, b) => a.tgname.localeCompare(b.tgname)),
      );
    },
  );
  it('grants only safe columns and uses an exact-text security-invoker view', async () => {
    const columns =
      await db`select column_name from information_schema.columns where table_schema='public' and table_name='package_versions' order by ordinal_position`;
    for (const column of columns)
      for (const role of ['authenticated', 'anon', 'service_role']) {
        const [grant] =
          await db`select has_column_privilege(${role},'public.package_versions',${column.column_name},'SELECT') as allowed`;
        expect(grant?.allowed).toBe(
          role === 'authenticated' &&
            column.column_name !== 'commission_rate_bp',
        );
      }
    const [view] =
      await db`select reloptions,pg_get_viewdef(oid) as definition from pg_class where oid='public.package_versions_safe'::regclass`;
    expect(view?.reloptions).toContain('security_invoker=true');
    expect(view?.definition).toMatch(/price_minor\)?::text/);
    expect(view?.definition).not.toContain('commission_rate_bp');
    expect(view?.definition).not.toContain('*');
    const projection =
      await db`select column_name,data_type from information_schema.columns where table_schema='public' and table_name='package_versions_safe' order by ordinal_position`;
    expect(projection.map((r) => r.column_name)).toEqual([
      'workspace_id',
      'id',
      'offer_id',
      'version',
      'name_ar',
      'name_en',
      'price_minor',
      'currency',
      'duration_days',
      'duration_months',
      'published_at',
      'published_by',
    ]);
    expect(
      projection.find((r) => r.column_name === 'price_minor')?.data_type,
    ).toBe('text');
  });
  it('has all restrictive foreign keys including workspace pair and same-offer triple', async () => {
    const fks =
      await db`select conrelid::regclass::text as tbl,pg_get_constraintdef(oid) as definition from pg_constraint where contype='f' and conrelid in ('public.packages'::regclass,'public.package_offers'::regclass,'public.package_versions'::regclass)`;
    expect(fks).toHaveLength(8);
    for (const fk of fks) expect(fk.definition).toContain('ON DELETE RESTRICT');
    for (const definition of [
      'FOREIGN KEY (workspace_id, offer_id) REFERENCES package_offers(workspace_id, id) ON DELETE RESTRICT',
      'FOREIGN KEY (workspace_id, current_version_id) REFERENCES package_versions(workspace_id, id) ON DELETE RESTRICT',
      'FOREIGN KEY (workspace_id, current_version_id, id) REFERENCES package_versions(workspace_id, id, offer_id) ON DELETE RESTRICT',
    ])
      expect(fks.map((f) => f.definition)).toContain(definition);
  });
  it('hardens all four package RPCs and two private guards', async () => {
    for (const name of [
      'public.create_package(text)',
      'public.publish_package_version(uuid,uuid,smallint,integer,text,text,bigint,text,integer)',
      'public.set_package_offer_available(uuid,uuid,boolean)',
      'public.get_package_version_commissions(uuid)',
      'app_private.guard_package_offer_update()',
      'app_private.guard_package_version_insert()',
    ]) {
      const [fn] =
        await db`select prosecdef,proconfig,provolatile,pg_get_userbyid(proowner) as owner from pg_proc where oid=${name}::regprocedure`;
      expect(fn).toMatchObject({ prosecdef: true, owner: 'postgres' });
      expect(fn?.proconfig).toContain('search_path=""');
      expect(fn?.provolatile).toBe(name.includes('commissions') ? 's' : 'v');
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const [grant] =
          await db`select has_function_privilege(${role},${name},'EXECUTE') as allowed`;
        expect(grant?.allowed).toBe(
          role === 'authenticated' && name.startsWith('public.'),
        );
      }
    }
  });
});
