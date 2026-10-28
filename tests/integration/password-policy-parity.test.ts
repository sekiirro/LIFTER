import { afterAll, beforeAll, expect, it } from 'vitest';
import vectors from '../fixtures/password-policy-vectors.json';
import { sql } from './harness';

const db = sql();
beforeAll(async () => {
  // PG 17 no longer exposes lc_ctype/lc_collate as SHOW parameters.
  const [locale] = await db`
    select datctype as lc_ctype, datcollate as lc_collate
    from pg_catalog.pg_database where datname=current_database()`;
  const [encoding] = await db`show server_encoding`;
  console.info('Password parity DB locale:', { ...locale, ...encoding });
});
afterAll(() => db.end());

for (const { label, input, valid } of vectors) {
  it(`DB password parity: ${label}`, async () => {
    if (input.includes('\0')) {
      // PostgreSQL text cannot represent NUL. Assert the wire boundary rejects
      // it, without including parameters or provider error text in evidence.
      let code: string | undefined;
      try {
        await db`select app_private.signup_password_acceptable(${input})`;
      } catch (error) {
        code = (error as { code?: string }).code;
      }
      expect(valid).toBe(false);
      expect(code).toBe('22021');
      return;
    }
    const [row] = await db`
      select app_private.signup_password_acceptable(${input}) as default_valid,
        app_private.signup_password_acceptable(${input} collate pg_catalog."C") as c_valid`;
    expect(row?.default_valid, 'database default collation').toBe(valid);
    expect(row?.c_valid, 'C collation').toBe(valid);
  });
}

it('private password helper fails closed for NULL', async () => {
  const [row] =
    await db`select app_private.signup_password_acceptable(null) as valid`;
  expect(row?.valid).toBe(false);
});

it('private password helper has hardened ownership and no API execute grants', async () => {
  const [row] = await db`
    select pg_catalog.pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proconfig,
      exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,
        pg_catalog.acldefault('f', p.proowner))) a
        where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
    from pg_catalog.pg_proc p
    where p.oid='app_private.signup_password_acceptable(text)'::regprocedure`;
  expect(row).toEqual({
    owner: 'postgres',
    prosecdef: true,
    proconfig: ['search_path=""'],
    public_execute: false,
    anon_execute: false,
    authenticated_execute: false,
    service_execute: false,
  });
});

it('client_signup delegates its password check to the private helper', async () => {
  const [row] = await db`
    select pg_catalog.pg_get_functiondef('public.client_signup(text,text,uuid,jsonb)'::regprocedure) as body`;
  expect(row?.body).toContain(
    "if not app_private.signup_password_acceptable(fields->>'password') then",
  );
  expect(row?.body).not.toMatch(/\[\[:(?:digit|alpha|print|space):\]/);
});
