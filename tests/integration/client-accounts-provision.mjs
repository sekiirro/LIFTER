/** Local-only U1 provisioning. Run after each reset, with Docker's bin on PATH. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';

const path = '.env.local';
const contents = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
const env = Object.fromEntries(
  contents.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)="?([^"\r\n]*)"?$/);
    return match ? [[match[1], match[2]]] : [];
  }),
);
const target = new URL(env.DB_URL);
if (
  target.hostname !== '127.0.0.1' ||
  target.port !== '54322' ||
  target.pathname !== '/postgres' ||
  env.API_URL !== 'http://127.0.0.1:54321' ||
  !/^project_id = "lifter"$/m.test(readFileSync('supabase/config.toml', 'utf8'))
) {
  throw new Error('Local stack required');
}

// The extension owner is supabase_admin; postgres cannot revoke its grants.
// No secrets are passed in command arguments, input, output or diagnostics.
execFileSync(
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
    '-v',
    'ON_ERROR_STOP=1',
  ],
  {
    stdio: ['pipe', 'ignore', 'ignore'],
    input: `
      begin;
      revoke all on all tables in schema vault from public, anon, authenticated, service_role;
      revoke all on all functions in schema vault from public, anon, authenticated, service_role;
      do $provision$
      declare key_name text;
      begin
        foreach key_name in array array['SIGNUP_RATE_KEY','SIGNUP_ATTEST_KEY'] loop
          if not exists (select 1 from vault.secrets where name=key_name) then
            perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),key_name);
          end if;
        end loop;
      end;
      $provision$;
      commit;
    `,
  },
);

const db = postgres(env.DB_URL, { max: 1 });
try {
  const rows =
    await db`select name,decrypted_secret from vault.decrypted_secrets
    where name in ('SIGNUP_RATE_KEY','SIGNUP_ATTEST_KEY')`;
  if (
    rows.length !== 2 ||
    rows.some((row) => !/^[0-9a-f]{64}$/.test(row.decrypted_secret))
  ) {
    throw new Error('Invalid local key provisioning');
  }
  const retained = contents
    .split(/\r?\n/)
    .filter((line) => line && !/^SIGNUP_(RATE|ATTEST)_KEY=/.test(line));
  writeFileSync(
    path,
    retained
      .concat(rows.map((row) => `${row.name}="${row.decrypted_secret}"`))
      .join('\n') + '\n',
  );
  console.log(
    'Local Vault provisioned; two matching server-only env copies saved.',
  );
} finally {
  await db.end();
}
