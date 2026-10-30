import { readFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { sql } from './harness';
import { credential, hash, opaque } from './branding-security-fixture';
const db = sql();
afterAll(() => db.end());
async function allowed(
  c: Awaited<ReturnType<typeof credential>>,
  claims = c.claims,
) {
  return db.begin(async (tx) => {
    await tx.unsafe(`set local role ${c.claims.role}`);
    await tx`select set_config('request.jwt.claims',${JSON.stringify(claims)},true)`;
    const [r] =
      await tx`select app_private.branding_credential_allowed(${c.claims.role}) as ok`;
    return r!.ok as boolean;
  });
}
it('T047 restricted roles have no login, bypass, privileged flags or memberships', async () => {
  const rows =
    await db`select rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit from pg_roles where rolname in ('branding_proxy','branding_validator')`;
  expect(rows.length).toBe(2);
  expect(
    rows.every((r) =>
      Object.entries(r)
        .filter(([k]) => k !== 'rolname')
        .every(([, v]) => v === false),
    ),
  ).toBe(true);
  const [m] =
    await db`select count(*)::int as n from pg_auth_members where member in (select oid from pg_roles where rolname in ('branding_proxy','branding_validator'))`;
  expect(m!.n).toBe(0);
});
it('T047 hash-only registry, signed ID/expiry binding and enable/deploy/disable rotation', async () => {
  const staged = opaque();
  await db`select app_private.branding_credential_register(${staged},'branding_proxy',now()+interval '1 hour')`;
  const [initial] =
    await db`select enabled from app_private.branding_credentials where credential_hash=${hash(staged)}`;
  expect(initial!.enabled).toBe(false);
  const old = await credential(db),
    next = await credential(db),
    validator = await credential(db, 'branding_validator');
  expect(await allowed(old)).toBe(true);
  expect(await allowed(next)).toBe(true);
  expect(await allowed(validator)).toBe(true);
  expect(await allowed(old, { ...old.claims, credential_id: opaque() })).toBe(
    false,
  );
  expect(await allowed(old, { ...old.claims, exp: 1 })).toBe(false);
  expect(await allowed(old, { ...old.claims, role: 'service_role' })).toBe(
    false,
  );
  const [r] =
    await db`select credential_hash from app_private.branding_credentials where credential_hash=${hash(old.id)}`;
  expect(
    r!.credential_hash === hash(old.id) && r!.credential_hash !== old.id,
  ).toBe(true);
  await db`select app_private.branding_credential_set_enabled(${old.id},false,true)`;
  expect(await allowed(old)).toBe(false);
  expect(await allowed(next)).toBe(true);
  const [audit] =
    await db`select count(*)::int as n from app_private.branding_credential_events where credential_hash=${hash(old.id)} and action='emergency_disabled'`;
  expect(audit!.n).toBe(1);
  await db`update app_private.branding_credentials set expires_at=now()-interval '1 second' where credential_hash=${hash(next.id)}`;
  expect(await allowed(next)).toBe(false);
});
it('T047 new tables force RLS; API roles cannot manage or read the registry/audit', async () => {
  for (const table of ['branding_credentials', 'branding_credential_events']) {
    const [t] =
      await db`select relrowsecurity and relforcerowsecurity as ok from pg_class where oid=${`app_private.${table}`}::regclass`;
    expect(t!.ok).toBe(true);
    for (const role of [
      'anon',
      'authenticated',
      'service_role',
      'branding_proxy',
      'branding_validator',
    ]) {
      const [r] =
        await db`select has_table_privilege(${role},${`app_private.${table}`},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as ok`;
      expect(r!.ok).toBe(false);
    }
  }
  await expect(
    db`update app_private.branding_credential_events set action='enabled'`,
  ).rejects.toMatchObject({ code: '42501' });
});
it('T047 Worker reader contains no signer or project signing key', () => {
  const src = readFileSync('lib/branding/credentials.ts', 'utf8');
  expect(/JWT_SECRET|createHmac|sign\(/.test(src)).toBe(false);
  expect(
    src.includes('BRANDING_PROXY_JWT') &&
      src.includes('BRANDING_VALIDATOR_JWT'),
  ).toBe(true);
});
it('feature function inventory has exact hardened ownership, search paths and execution grants', async () => {
  const inventory: Record<string, string[]> = {
    'app_private.branding_credential_event_immutable()': [],
    'app_private.branding_credential_register(text,text,timestamptz)': [],
    'app_private.branding_credential_set_enabled(text,boolean,boolean)': [],
    'app_private.branding_credential_allowed(text)': [
      'branding_proxy',
      'branding_validator',
    ],
    'app_private.branding_render_handles_cleanup(integer)': [],
    'app_private.branding_asset_context(text,text,text)': [],
    'app_private.branding_storage_read_allowed(text,text)': ['branding_proxy'],
    'public.registration_brand_asset_resolve(text,text,text)': [
      'branding_proxy',
    ],
    'public.registration_link_open(text)': ['anon', 'authenticated'],
  };
  for (const [fn, roles] of Object.entries(inventory)) {
    const [r] =
      await db`select prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid=${fn}::regprocedure`;
    expect(
      r!.prosecdef &&
        r!.owner === 'branding_definer' &&
        r!.proconfig.includes('search_path=""'),
    ).toBe(true);
    for (const role of [
      'anon',
      'authenticated',
      'service_role',
      'branding_proxy',
      'branding_validator',
    ]) {
      const [acl] =
        await db`select has_function_privilege(${role},${fn},'EXECUTE') as allowed`;
      expect(acl!.allowed === roles.includes(role)).toBe(true);
    }
  }
  for (const table of [
    'branding_published_versions',
    'branding_current_publications',
    'branding_render_handles',
    'branding_published_assets',
  ]) {
    const [r] =
      await db`select relrowsecurity and relforcerowsecurity as ok from pg_class where oid=${`app_private.${table}`}::regclass`;
    expect(r!.ok).toBe(true);
    for (const role of [
      'anon',
      'authenticated',
      'service_role',
      'branding_proxy',
      'branding_validator',
    ]) {
      const [acl] =
        await db`select has_table_privilege(${role},${`app_private.${table}`},'SELECT,INSERT,UPDATE,DELETE') as allowed`;
      expect(acl!.allowed).toBe(false);
    }
  }
});
