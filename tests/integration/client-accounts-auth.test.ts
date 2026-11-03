import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { anonClient, loadEnv } from './harness';
import manifest from '../fixtures/client-accounts-auth-schema.json';
import * as fixtures from './client-accounts-fixture';
import { clientContext, signupFixture, sql } from './client-accounts-fixture';
import {
  getStackConfig,
  localSupabaseContainer,
  selectStack,
} from '../../scripts/local-stack.mjs';

const db = sql();
const capturedSecrets: string[] = [];
const captureStart = new Date().toISOString();
let context: Awaited<ReturnType<typeof clientContext>>;
beforeAll(async () => {
  const env = loadEnv();
  const config = getStackConfig(selectStack(process.env));
  expect(
    env.apiUrl === `http://127.0.0.1:${config.apiPort}`,
    'local Auth only',
  ).toBe(true);
  const target = new URL(env.dbUrl);
  expect(
    target.hostname === '127.0.0.1' &&
      target.port === String(config.dbPort) &&
      target.pathname === '/postgres',
    'local DB only',
  ).toBe(true);
  context = await clientContext();
});
afterAll(() => db.end());

// Compare booleans only so assertion diagnostics cannot expose row values.
async function parity(left: string, right: string, stage: string) {
  for (const table of ['users', 'identities']) {
    const columns = manifest.columns.filter((c) => c.table === table);
    const catalog =
      await db`select column_name from information_schema.columns where table_schema='auth' and table_name=${table} order by ordinal_position`;
    expect(catalog.map((c) => c.column_name).sort()).toEqual(
      columns.map((c) => c.name).sort(),
    );
    const rows = await db.unsafe(
      `select * from auth.${table} where ${table === 'users' ? 'id' : 'user_id'} in ($1,$2)`,
      [left, right],
    );
    expect(rows.length).toBe(2);
    const a = rows.find(
      (r) => r[table === 'users' ? 'id' : 'user_id'] === left,
    )!;
    const b = rows.find(
      (r) => r[table === 'users' ? 'id' : 'user_id'] === right,
    )!;
    const differences = columns
      .filter(
        (c) =>
          JSON.stringify(
            fixtures.normalizeAuthValue(a[c.name], c.name, c.type),
          ) !==
          JSON.stringify(
            fixtures.normalizeAuthValue(b[c.name], c.name, c.type),
          ),
      )
      .map((c) => c.name);
    expect(
      differences,
      `${stage} auth.${table}: differing column names only`,
    ).toEqual([]);
  }
}

for (const boundary of ['ordinary', 'multibyte', '72-byte'] as const) {
  it(`C2/C3 ${boundary}: exhaustive pre/post parity and exact real password sign-in`, async () => {
    const s = await signupFixture(context);
    if (boundary === 'multibyte') s.fields.password = '界'.repeat(20) + '9!';
    if (boundary === '72-byte') s.fields.password = '界'.repeat(23) + 'a9!';
    capturedSecrets.push(s.fields.password);
    const reference = await fixtures.authReference(s.fields.password);
    await fixtures.anonSignup(s);
    const [user] =
      await db`select id from auth.users where email=${s.fields.email}`;
    const id = user!.id as string;
    if (boundary === '72-byte')
      expect(Buffer.byteLength(s.fields.password, 'utf8')).toBe(72);
    const [cost] =
      await db`select split_part(encrypted_password,'$',3)::integer = ${manifest.bcryptCost} as matches from auth.users where id=${id}`;
    expect(cost!.matches, 'captured GoTrue bcrypt cost').toBe(true);
    expect(
      await db`select 1 from auth.sessions where user_id=${id}`,
    ).toHaveLength(0);
    await parity(id, reference.id, 'before sign-in');
    const client = anonClient();
    expect(
      (
        await client.auth.signInWithPassword({
          email: s.fields.email,
          password: 'X' + s.fields.password.slice(1),
        })
      ).error !== null,
    ).toBe(true);
    for (const [account, email] of [
      [client, s.fields.email],
      [anonClient(), reference.email!],
    ] as const) {
      const signed = await account.auth.signInWithPassword({
        email,
        password: s.fields.password,
      });
      expect(signed.error === null, 'GoTrue accepts crypt bcrypt').toBe(true);
      expect(Boolean(signed.data.session)).toBe(true);
    }
    await parity(id, reference.id, 'after one sign-in');
    await fixtures.pendingHttpAccess(client, context);
    const claims = await client.auth.getClaims();
    expect(claims.error === null).toBe(true);
    await fixtures.probe((tx) =>
      fixtures.pendingRlsAccess(tx, context, claims.data!.claims),
    );
    expect(
      await db`select 1 from public.staff_profiles where user_id=${id}`,
    ).toHaveLength(0);
    expect(
      await db`select 1 from public.workspace_memberships where user_id=${id}`,
    ).toHaveLength(0);
  });
}

for (const boundary of ['73-byte', 'NUL']) {
  it(`C3 rejects ${boundary} without persistence or diagnostic plaintext`, async () => {
    const s = await signupFixture(context);
    s.fields.password =
      boundary === 'NUL' ? 'Synthetic9!\u0000tail' : '界'.repeat(23) + 'ab9!';
    capturedSecrets.push(s.fields.password);
    const result = await anonClient().rpc('client_signup', {
      token: s.token,
      request_secret: s.request,
      admission_ticket: s.ticket,
      fields: s.fields,
    });
    if (boundary === '73-byte')
      expect(Buffer.byteLength(s.fields.password, 'utf8')).toBe(73);
    expect(
      JSON.stringify(result).includes(s.fields.password) ||
        JSON.stringify(result).includes(
          JSON.stringify(s.fields.password).slice(1, -1),
        ),
      'no diagnostic plaintext',
    ).toBe(false);
    expect(result.error !== null || result.data?.status === 'invalid').toBe(
      true,
    );
    expect(
      await db`select 1 from auth.users where email=${s.fields.email}`,
    ).toHaveLength(0);
  });
}

it('C2 normalizer preserves NULL/token/metadata differences and instance scope', () => {
  const normalize = fixtures.normalizeAuthValue;
  expect(
    normalize(null, 'recovery_token', 'text') ===
      normalize('', 'recovery_token', 'text'),
  ).toBe(false);
  expect(
    normalize(null, 'last_sign_in_at', 'timestamptz') ===
      normalize(new Date(), 'last_sign_in_at', 'timestamptz'),
  ).toBe(false);
  expect(
    normalize('a', 'instance_id', 'uuid') ===
      normalize('b', 'instance_id', 'uuid'),
  ).toBe(false);
  for (const key of [
    'email_verified',
    'phone_verified',
    'providers',
    'email_change_confirm_status',
  ]) {
    expect(
      JSON.stringify(normalize({ [key]: false }, 'identity_data')) ===
        JSON.stringify(normalize({ [key]: true }, 'identity_data')),
    ).toBe(false);
  }
});

it('signup-created account supports SMTP-free recovery OTP and updateUser without 500', async () => {
  const s = await signupFixture(context);
  capturedSecrets.push(s.fields.password);
  await fixtures.anonSignup(s);
  const client = anonClient();
  const requested = await client.auth.resetPasswordForEmail(s.fields.email);
  expect(requested.error === null, 'local recovery request succeeds').toBe(
    true,
  );
  // Local server-only mailbox substitute: read only the issued opaque hash;
  // this is not admin API authority and never modifies Auth lifecycle state.
  const [row] =
    await db`select recovery_token from auth.users where email=${s.fields.email}`;
  expect(
    typeof row!.recovery_token === 'string' && row!.recovery_token.length > 0,
  ).toBe(true);
  const verified = await client.auth.verifyOtp({
    type: 'recovery',
    token_hash: row!.recovery_token,
  });
  expect(verified.error === null, 'real recovery OTP accepted').toBe(true);
  const password = 'Updated9!' + s.fields.password;
  capturedSecrets.push(password);
  const updated = await client.auth.updateUser({ password });
  expect(updated.error === null, 'recovery updateUser does not 500').toBe(true);
  expect(
    (
      await anonClient().auth.signInWithPassword({
        email: s.fields.email,
        password,
      })
    ).error === null,
  ).toBe(true);
});

it('C3 captured passwords are absent from every application/Auth table and captured local logs', async () => {
  const tables =
    await db`select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','app_private') and c.relkind in ('r','p')`;
  for (const table of tables) {
    for (const password of capturedSecrets.filter(
      (p) => !p.includes('\u0000'),
    )) {
      // Only a boolean leaves PostgreSQL. No row dumps or hash diagnostics.
      const [result] =
        await db`select exists(select 1 from ${db(table.nspname + '.' + table.relname)} t where position(${password} in to_jsonb(t)::text)>0) as leaked`;
      expect(
        result!.leaked,
        `${table.nspname}.${table.relname}: no plaintext`,
      ).toBe(false);
    }
  }
  for (const container of [
    localSupabaseContainer('auth'),
    localSupabaseContainer('db'),
    localSupabaseContainer('kong'),
  ]) {
    const captured = spawnSync(
      'docker',
      ['logs', '--since', captureStart, container],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(captured.status === 0, 'required local log capture succeeds').toBe(
      true,
    );
    const logs = captured.stdout + captured.stderr;
    expect(
      capturedSecrets.some(
        (p) =>
          logs.includes(p) || logs.includes(JSON.stringify(p).slice(1, -1)),
      ),
      `${container}: no plaintext`,
    ).toBe(false);
  }
});
