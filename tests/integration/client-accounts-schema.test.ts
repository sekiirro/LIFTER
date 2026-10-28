import { spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, expect, it } from 'vitest';
import manifest from '../fixtures/client-accounts-auth-schema.json';
import { sql } from './harness';

const db = sql();
afterAll(() => db.end());

async function rolledBack(body: (tx: TransactionSql) => Promise<void>) {
  const rollback = new Error('U1 rolled-back probe');
  try {
    await db.begin(async (tx) => {
      await body(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

function catalogProbe(mutation: string) {
  // Only the local platform owner may alter Auth-owned catalogs. The complete
  // perturbation and both assertions run in ONE transaction, always rolled back.
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_lifter',
      'psql',
      '-U',
      'supabase_admin',
      '-d',
      'postgres',
      '-Atq',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    {
      encoding: 'utf8',
      input: `begin;
      create temporary table f11_before as select
        (select count(*) from auth.users) as users,
        (select count(*) from auth.identities) as identities,
        (select count(*) from public.registration_links) as links,
        (select count(*) from public.registration_links where consumed_at is not null) as consumed,
        (select count(*) from public.audit_events) as audit;
      ${mutation};
      grant select on f11_before to postgres;
      set local role postgres;
      select app_private.signup_auth_schema_compatible() is false;
      select users=(select count(*) from auth.users)
        and identities=(select count(*) from auth.identities)
        and links=(select count(*) from public.registration_links)
        and consumed=(select count(*) from public.registration_links where consumed_at is not null)
        and audit=(select count(*) from public.audit_events) from f11_before;
      rollback;`,
    },
  );
  expect(result.status).toBe(0);
  expect(result.stdout.trim().split(/\r?\n/)).toEqual(['t', 't']);
}

it('C1 accepts the captured real local Auth schema', async () => {
  const [row] =
    await db`select app_private.signup_auth_schema_compatible() as compatible`;
  expect(row?.compatible).toBe(true);
  const columns =
    await db`select table_name as "table",column_name as name,udt_name as type,is_generated as generated
    from information_schema.columns where table_schema='auth' and table_name in ('users','identities') order by table_name,ordinal_position`;
  expect(columns).toEqual(
    manifest.columns.map(({ table, name, type, generated }) => ({
      table,
      name,
      type,
      generated,
    })),
  );
});

it('C1 rejects an unsupported latest migration without effects (rollback)', () => {
  catalogProbe(
    "insert into auth.schema_migrations(version) values ('99999999999999')",
  );
});

for (const column of manifest.columns.filter((column) => column.written)) {
  it(`C1 rejects missing written column ${column.table}.${column.name} without effects`, () => {
    catalogProbe(
      `alter table auth.${column.table} rename column ${column.name} to f11_missing_column`,
    );
  });
}

it('C1 rejects a wrong written-column type without effects (rollback)', () => {
  catalogProbe(
    'alter table auth.users alter column raw_user_meta_data type json using raw_user_meta_data::json',
  );
});

it('private definers have postgres ownership, empty search_path and no caller EXECUTE', async () => {
  for (const name of [
    'signup_auth_schema_compatible()',
    'signup_link_key_matches(text,bytea)',
  ]) {
    const [row] = await db`select p.prosecdef, r.rolname, p.proconfig,
      has_function_privilege('anon',p.oid,'execute') as anon,
      has_function_privilege('authenticated',p.oid,'execute') as authenticated,
      has_function_privilege('service_role',p.oid,'execute') as service
      from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=to_regprocedure(${'app_private.' + name})`;
    expect(row).toMatchObject({
      prosecdef: true,
      rolname: 'postgres',
      proconfig: ['search_path=""'],
      anon: false,
      authenticated: false,
      service: false,
    });
  }
});

it('Vault keys are provisioned for the definer owner', async () => {
  const [provisioned] =
    await db`select count(*)::int from vault.decrypted_secrets
    where name in ('SIGNUP_RATE_KEY','SIGNUP_ATTEST_KEY') and length(decrypted_secret)=64`;
  expect(provisioned?.count).toBe(2);
});

it('Vault keys are inaccessible to API roles, including service_role', async () => {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const table of ['secrets', 'decrypted_secrets']) {
      const [row] =
        await db`select has_table_privilege(${role},${'vault.' + table},'select') as readable`;
      expect(row?.readable).toBe(false);
    }
    const [privilege] =
      await db`select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='vault' and has_function_privilege(${role},p.oid,'execute')) as callable`;
    expect(privilege?.callable).toBe(false);
  }
});

it('DB link_key verification binds canonical token_hash independently of attestation', async () => {
  // Synthetic random values remain in memory and never enter assertion output.
  const tokenHash = randomBytes(32).toString('hex');
  const [secret] =
    await db`select decrypted_secret as key from vault.decrypted_secrets where name='SIGNUP_RATE_KEY'`;
  const length = Buffer.alloc(4);
  length.writeUInt32BE(64);
  const linkKey = createHmac('sha256', Buffer.from(secret?.key ?? '', 'hex'))
    .update(
      Buffer.concat([
        Buffer.from('lifter.f11.link.v1\0'),
        length,
        Buffer.from(tokenHash),
      ]),
    )
    .digest();
  const [row] =
    await db`select app_private.signup_link_key_matches(${tokenHash},${linkKey}) as matches`;
  expect(row?.matches).toBe(true);
  for (const [hash, supplied] of [
    [tokenHash, randomBytes(32)],
    [tokenHash, randomBytes(31)],
    [tokenHash.toUpperCase(), linkKey],
    ['invalid', linkKey],
    [null, linkKey],
    [tokenHash, null],
  ] as const) {
    const [negative] =
      await db`select app_private.signup_link_key_matches(${hash},${supplied}) as matches`;
    expect(negative?.matches).toBe(false);
  }
  await rolledBack(async (tx) => {
    await tx`delete from vault.secrets where name='SIGNUP_RATE_KEY'`;
    const [missing] =
      await tx`select app_private.signup_link_key_matches(${tokenHash},${linkKey}) as matches`;
    expect(missing?.matches).toBe(false);
  });
});

it('C1 fails closed when the migration catalog is empty', () => {
  catalogProbe('delete from auth.schema_migrations');
});
