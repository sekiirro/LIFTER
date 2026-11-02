import { readFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import {
  CAPABILITIES,
  MATRIX,
  ROLES,
  roleHasCapability,
} from '../../lib/auth/capabilities';
import { sql } from './harness';

const db = sql();
afterAll(() => db.end());

it('T002 compares every known and unknown capability in both TS/SQL directions', async () => {
  for (const role of ROLES) {
    for (const capability of [
      ...CAPABILITIES,
      'unknown_capability',
      'assign_intake_form_typo',
    ]) {
      const [row] = await db`
        select app_private.role_has_capability(${role}::public.staff_role,${capability}) as allowed
      `;
      expect(row?.allowed, `${role}:${capability}`).toBe(
        roleHasCapability(role, capability),
      );
      expect(MATRIX[role].includes(capability as never)).toBe(
        roleHasCapability(role, capability),
      );
    }
  }
});

it('T002 keeps the complete F11/F12/F13/F14 audit mapping installed on Stack D', async () => {
  const migration = readFileSync(
    'supabase/migrations/20261102139000_workspace_branding_audit_extension.sql',
    'utf8',
  );
  const expectedBody = migration.match(
    /create or replace function app_private\.audit_row_change\(\) returns trigger[\s\S]*?as \$\$([\s\S]*?)\$\$;/,
  )?.[1];
  expect(expectedBody).toBeDefined();

  const [actual] = await db`
    select p.prosrc, p.prosecdef, p.proconfig,
      pg_catalog.pg_get_userbyid(p.proowner) as owner,
      has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_exec,
      has_function_privilege('service_role',p.oid,'EXECUTE') as service_exec
    from pg_catalog.pg_proc p
    where p.oid='app_private.audit_row_change()'::regprocedure
  `;
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
  expect(normalize(actual!.prosrc as string)).toBe(normalize(expectedBody!));
  expect(actual).toMatchObject({
    prosecdef: true,
    proconfig: ['search_path=""'],
    owner: 'postgres',
    anon_exec: false,
    authenticated_exec: false,
    service_exec: false,
  });
});
