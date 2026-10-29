/** Local-only U1 provisioning. Run after each reset, with Docker's bin on PATH. */
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import postgres from 'postgres';

const path = '.env.local';
function parseEnv(contents) {
  const normalized = contents
    .replace(/^\uFEFF/, '')
    .replace(/^([A-Z][A-Z0-9_]*)="(.*)"$/gm, '$1=$2');
  return Object.fromEntries(
    normalized.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^([A-Z][A-Z0-9_]*)="?([^"\r\n]*)"?$/);
      return match ? [[match[1], match[2]]] : [];
    }),
  );
}

function stackEndpointsFromStatus() {
  try {
    const status = execFileSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['--yes', 'supabase@2.122.0', 'status', '-o', 'env'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        shell: process.platform === 'win32',
      },
    );
    return parseEnv(status);
  } catch {
    throw new Error('Local stack environment required');
  }
}

let contents;
let env;
if (existsSync(path)) {
  contents = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  env = parseEnv(contents);
} else {
  const processEndpoints = {
    DB_URL: process.env.DB_URL || process.env.SUPABASE_DB_URL,
    API_URL: process.env.API_URL || process.env.SUPABASE_URL,
  };
  const endpoints =
    processEndpoints.DB_URL && processEndpoints.API_URL
      ? processEndpoints
      : stackEndpointsFromStatus();
  env = {
    DB_URL: endpoints.DB_URL || endpoints.SUPABASE_DB_URL,
    API_URL: endpoints.API_URL || endpoints.SUPABASE_URL,
  };
  if (!env.DB_URL || !env.API_URL) {
    throw new Error('Local stack environment required');
  }
  contents = `DB_URL="${env.DB_URL}"\nAPI_URL="${env.API_URL}"\n`;
}

let target;
try {
  target = new URL(env.DB_URL);
} catch {
  throw new Error('Local stack required');
}
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
  if (process.env.GITHUB_ACTIONS === 'true') {
    for (const row of rows) {
      process.stdout.write(`::add-mask::${row.decrypted_secret}\n`);
    }
    if (!process.env.GITHUB_ENV) {
      throw new Error('GitHub Actions environment file required');
    }
    // Export the exact Vault values for server-side code in subsequent steps.
    appendFileSync(
      process.env.GITHUB_ENV,
      rows.map((row) => `${row.name}=${row.decrypted_secret}\n`).join(''),
    );
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
