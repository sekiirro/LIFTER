import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createStaff, sql } from './harness';

const db = sql();
const mutateSchemaUsage = process.env.F14_GC_SCHEMA_USAGE_MUTATION === 'grant';

type FunctionRow = {
  signature: string;
  owner: string;
  owner_login: boolean;
  owner_superuser: boolean;
  owner_bypassrls: boolean;
  owner_inherit: boolean;
  owner_createdb: boolean;
  owner_createrole: boolean;
  security_definer: boolean;
  search_path: string[] | null;
  definition: string;
  public_execute: boolean;
  anon_execute: boolean;
  authenticated_execute: boolean;
  service_role_execute: boolean;
  proxy_execute: boolean;
  validator_execute: boolean;
};

type ServiceRoleAppPrivatePath = { signature: string };

type TableRow = {
  relation: string;
  rls_enabled: boolean;
  rls_forced: boolean;
};

const restrictedFunctionOwners: Record<string, string> = {
  'app_private.branding_validator_upload_binding_matches(text)':
    'branding_upload_check_definer',
};

async function brandingFunctions() {
  return db<FunctionRow[]>`
    select
      p.oid::regprocedure::text as signature,
      owner.rolname as owner,
      owner.rolcanlogin as owner_login,
      owner.rolsuper as owner_superuser,
      owner.rolbypassrls as owner_bypassrls,
      owner.rolinherit as owner_inherit,
      owner.rolcreatedb as owner_createdb,
      owner.rolcreaterole as owner_createrole,
      p.prosecdef as security_definer,
      p.proconfig as search_path,
      pg_get_functiondef(p.oid) as definition,
      has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
      has_function_privilege('branding_proxy', p.oid, 'EXECUTE') as proxy_execute,
      has_function_privilege('branding_validator', p.oid, 'EXECUTE') as validator_execute
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles owner on owner.oid = p.proowner
    where p.prosecdef
      and (
        (n.nspname = 'app_private' and p.proname like 'branding_%')
        or (n.nspname = 'public' and p.proname in ('registration_link_open', 'registration_brand_asset_resolve', 'branding_gc_claim', 'branding_gc_finalize'))
      )
    order by p.oid::regprocedure::text
  `;
}

describe('F14 definer function privileges', () => {
  beforeAll(async () => {
    await db`select 1`;
    if (mutateSchemaUsage)
      await db`grant usage on schema app_private to service_role`;
  });
  afterAll(async () => {
    if (mutateSchemaUsage) {
      await db`revoke usage on schema app_private from service_role`;
      console.log('F14 schema usage mutation restored');
    }
    await db.end();
  });

  it('uses explicit restricted non-login owners and an empty search path', async () => {
    const functions = await brandingFunctions();
    expect(functions.length).toBeGreaterThan(0);
    for (const ownerRole of [
      'branding_definer',
      'branding_upload_check_definer',
    ]) {
      const [memberships] = await db`
        select count(*)::int as n from pg_auth_members
        where member=(select oid from pg_roles where rolname=${ownerRole})`;
      expect(memberships?.n, ownerRole).toBe(0);
    }
    for (const fn of functions) {
      const expectedOwner =
        restrictedFunctionOwners[fn.signature] ?? 'branding_definer';
      expect(fn.owner, fn.signature).toBe(expectedOwner);
      expect(fn.owner_login, fn.signature).toBe(false);
      expect(fn.owner_superuser, fn.signature).toBe(false);
      expect(fn.owner_bypassrls, fn.signature).toBe(false);
      expect(fn.owner_inherit, fn.signature).toBe(false);
      expect(fn.owner_createdb, fn.signature).toBe(false);
      expect(fn.owner_createrole, fn.signature).toBe(false);
      expect(fn.search_path, fn.signature).toContain('search_path=""');
      expect(fn.definition, fn.signature).not.toMatch(
        /\b(?:FROM|JOIN|UPDATE)\s+(?:workspaces|workspace_memberships|registration_links|branding_[a-z_]+)\b/i,
      );
    }
  });

  it('revokes default API/service execution and grants only the contract roles', async () => {
    const functions = await brandingFunctions();
    for (const fn of functions) {
      const publicRoles = [
        fn.public_execute,
        fn.anon_execute,
        fn.authenticated_execute,
        fn.service_role_execute,
      ];
      if (fn.signature === 'registration_link_open(text)') {
        expect(fn.anon_execute).toBe(true);
        expect(fn.authenticated_execute).toBe(true);
        expect(fn.proxy_execute).toBe(false);
        expect(fn.validator_execute).toBe(false);
      } else if (fn.signature.startsWith('app_private.branding_validation_')) {
        expect(publicRoles, fn.signature).toEqual([false, false, false, false]);
      } else if (
        fn.signature ===
          'app_private.branding_upload_begin(uuid,text,bigint)' ||
        fn.signature === 'app_private.branding_draft_save(uuid,bigint,jsonb)' ||
        fn.signature === 'app_private.branding_draft_read(uuid)' ||
        fn.signature === 'app_private.branding_current_read(uuid)' ||
        fn.signature === 'app_private.branding_asset_attach(uuid,bigint)' ||
        fn.signature === 'app_private.branding_publish(uuid,bigint)'
      ) {
        expect(publicRoles, fn.signature).toEqual([false, false, true, false]);
      } else if (
        fn.signature === 'app_private.branding_gc_claim(integer)' ||
        fn.signature === 'app_private.branding_gc_finalize(uuid)'
      ) {
        expect(publicRoles, fn.signature).toEqual([false, false, false, true]);
      } else if (
        fn.signature === 'branding_gc_claim(integer)' ||
        fn.signature === 'branding_gc_finalize(uuid)' ||
        fn.signature === 'public.branding_gc_claim(integer)' ||
        fn.signature === 'public.branding_gc_finalize(uuid)'
      ) {
        expect(publicRoles, fn.signature).toEqual([false, false, false, true]);
      } else if (
        fn.signature ===
        'app_private.branding_staging_upload_allowed(text,text)'
      ) {
        expect(publicRoles, fn.signature).toEqual([false, false, true, false]);
      } else {
        expect(publicRoles, fn.signature).toEqual([false, false, false, false]);
      }
      if (fn.signature.startsWith('app_private.branding_validation_')) {
        expect(fn.proxy_execute, fn.signature).toBe(false);
        expect(fn.validator_execute, fn.signature).toBe(true);
      } else if (
        fn.signature.startsWith('app_private.branding_validator_upload_')
      ) {
        expect(fn.proxy_execute, fn.signature).toBe(false);
        expect(fn.validator_execute, fn.signature).toBe(true);
      } else if (
        fn.signature === 'registration_brand_asset_resolve(text,text,text)' ||
        fn.signature === 'app_private.branding_storage_read_allowed(text,text)'
      ) {
        expect(fn.proxy_execute, fn.signature).toBe(true);
        expect(fn.validator_execute, fn.signature).toBe(false);
      } else if (
        fn.signature === 'app_private.branding_credential_allowed(text)'
      ) {
        expect(fn.proxy_execute).toBe(true);
        expect(fn.validator_execute).toBe(true);
      } else {
        expect(fn.proxy_execute, fn.signature).toBe(false);
        expect(fn.validator_execute, fn.signature).toBe(false);
      }
      expect(fn.definition, fn.signature).not.toMatch(
        /\bEXECUTE\s+(?!FUNCTION\b)/i,
      );
    }
  });

  it('keeps app_private schema usage away from service_role', async () => {
    const [row] = await db<{ has_usage: boolean }[]>`
      select has_schema_privilege('service_role', 'app_private', 'USAGE') as has_usage
    `;
    expect(row?.has_usage).toBe(false);
  });

  it('limits service-role app_private call paths to the public GC and lockout-worker wrappers', async () => {
    const paths = await db<ServiceRoleAppPrivatePath[]>`
      select format('%I.%I(%s)', n.nspname, p.proname,
        oidvectortypes(p.proargtypes)) as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where has_function_privilege('service_role', p.oid, 'EXECUTE')
        and p.prokind = 'f'
        and has_schema_privilege('service_role', n.oid, 'USAGE')
        and pg_get_functiondef(p.oid) ilike '%app_private.%'
      order by signature
    `;
    expect(paths).toEqual([
      {
        signature:
          'public.alert_expired_refund_auth_lockouts(integer, timestamp with time zone)',
      },
      { signature: 'public.branding_gc_claim(integer)' },
      { signature: 'public.branding_gc_finalize(uuid)' },
      { signature: 'public.claim_refund_auth_lockout_jobs(integer)' },
      {
        signature:
          'public.complete_refund_auth_lockout_job(uuid, timestamp with time zone)',
      },
      {
        signature:
          'public.retry_refund_auth_lockout_job(uuid, integer, timestamp with time zone, text)',
      },
    ]);

    const deniedRoles = await db<
      {
        signature: string;
        anon_execute: boolean;
        authenticated_execute: boolean;
      }[]
    >`
      select format('%I.%I(%s)', n.nspname, p.proname,
        oidvectortypes(p.proargtypes)) as signature,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where p.oid in (
        'public.branding_gc_claim(integer)'::regprocedure,
        'public.branding_gc_finalize(uuid)'::regprocedure
      )
      order by signature
    `;
    expect(deniedRoles).toEqual([
      {
        signature: 'public.branding_gc_claim(integer)',
        anon_execute: false,
        authenticated_execute: false,
      },
      {
        signature: 'public.branding_gc_finalize(uuid)',
        anon_execute: false,
        authenticated_execute: false,
      },
    ]);
  });

  it('denies anon and authenticated callers the public GC wrappers', async () => {
    const authenticated = await createStaff(
      'platform_owner',
      'gc-wrapper-denial',
    );
    const callers = [anonClient(), authenticated.client];
    for (const caller of callers) {
      expect(
        (await caller.rpc('branding_gc_claim', { batch_size: 1 })).error,
      ).toBeTruthy();
      expect(
        (
          await caller.rpc('branding_gc_finalize', {
            claim_id: crypto.randomUUID(),
          })
        ).error,
      ).toBeTruthy();
    }
  });

  it('forces RLS on every private F14 branding table', async () => {
    const tables = await db<TableRow[]>`
      select c.oid::regclass::text as relation,
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app_private'
        and c.relkind in ('r', 'p')
        and c.relname like 'branding_%'
      order by c.oid::regclass::text
    `;
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(table.rls_enabled, table.relation).toBe(true);
      expect(table.rls_forced, table.relation).toBe(true);
    }
  });

  it('removes the superseded validator upload binding privilege path', async () => {
    const obsoleteFunctions = await db<{ signature: string }[]>`
      select p.oid::regprocedure::text as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private'
        and p.proname = 'branding_validator_upload_matches'
    `;
    expect(obsoleteFunctions).toEqual([]);

    const bindingFunctions = await db<{ signature: string }[]>`
      select p.oid::regprocedure::text as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private'
        and p.proname in (
          'branding_validator_upload_matches',
          'branding_validator_upload_binding_matches'
        )
      order by signature
    `;
    expect(bindingFunctions).toEqual([
      {
        signature:
          'app_private.branding_validator_upload_binding_matches(text)',
      },
    ]);

    const [validatorPolicy] = await db<{ with_check: string | null }[]>`
      select with_check
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'branding_validator_insert_validated'
    `;
    expect(validatorPolicy?.with_check).toMatch(
      /branding_validator_upload_binding_matches/,
    );
    expect(validatorPolicy?.with_check).not.toMatch(
      /branding_validator_upload_matches\(/,
    );

    const obsoleteRole = await db<{ role: string }[]>`
      select rolname as role from pg_roles
      where rolname = 'branding_upload_binding_definer'
    `;
    expect(obsoleteRole).toEqual([]);

    const obsoletePolicy = await db<{ policy: string }[]>`
      select policyname as policy
      from pg_policies
      where schemaname = 'app_private'
        and tablename = 'branding_uploads'
        and policyname = 'branding_upload_binding_definer_internal'
    `;
    expect(obsoletePolicy).toEqual([]);
  });
});
