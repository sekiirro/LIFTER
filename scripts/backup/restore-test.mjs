import { createReadStream } from 'node:fs';
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import postgres from 'postgres';
import { Decrypter } from 'age-encryption';
import {
  parseArgs,
  requireArgs,
  timeoutOptions,
  UsageError,
} from './lib/args.mjs';
import { collectChecks, compareChecks } from './lib/checks.mjs';
import { FILES, verifyManifest } from './lib/manifest.mjs';
import { docker, supabase } from './lib/exec.mjs';
import { restoreConfig } from './lib/config.mjs';
import { firstErrorLine, redact } from './lib/redact.mjs';
import {
  RESTORE_EXCLUSIONS,
  mergeReason,
  teardownRestoreStack,
} from './lib/restore.mjs';

let args;
let workdir;
let started = false;
let sql;
let code = 'USAGE';
let id = 'unknown';
let log;
let diagnostic;
let commandOptions = {};
const secondaryFailure = (reason, error) => {
  code = mergeReason(code, reason);
  console.error(
    redact(
      `${reason}: ${firstErrorLine(error?.stderr) || error?.message || reason}`,
    ).slice(0, 1024),
  );
};
try {
  args = parseArgs(
    process.argv.slice(2),
    ['backup', 'identity-file', 'log', 'timeout-minutes'],
    ['keep-stack'],
  );
  requireArgs(args, ['backup', 'identity-file']);
  commandOptions = timeoutOptions(args['timeout-minutes']);
  const folder = resolve(args.backup);
  if (/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z$/.test(basename(folder)))
    id = basename(folder);
  log = args.log || join(dirname(folder), 'restore-tests.log');
  code = 'MANIFEST_INVALID';
  let manifest;
  try {
    manifest = await verifyManifest(folder);
  } catch (error) {
    if (error.message === 'HASH_MISMATCH') code = 'HASH_MISMATCH';
    throw error;
  }
  id = manifest.id;
  code = 'DECRYPT_FAILED';
  const decrypter = new Decrypter();
  decrypter.addIdentity((await readFile(args['identity-file'], 'utf8')).trim());
  const plaintext = {};
  for (const name of FILES) {
    const stream = await decrypter.decrypt(
      Readable.toWeb(createReadStream(join(folder, name))),
    );
    plaintext[name] = Buffer.from(await new Response(stream).arrayBuffer());
  }
  const expected = JSON.parse(plaintext['checks.json.age'].toString('utf8'));
  code = 'STACK_EXISTS';
  const containers = await docker(
    ['ps', '-a', '--format', '{{.Names}}'],
    commandOptions,
  );
  if (
    containers.split(/\r?\n/).some((name) => name.endsWith('_lifter-restore'))
  )
    throw new Error(code);
  const volumes = await docker(
    ['volume', 'ls', '--format', '{{.Name}}'],
    commandOptions,
  );
  if (volumes.split(/\r?\n/).some((name) => name.endsWith('_lifter-restore')))
    throw new Error(code);
  code = 'STACK_START_FAILED';
  workdir = await mkdtemp(join(tmpdir(), 'lifter-restore-'));
  await mkdir(join(workdir, 'supabase'));
  const source = await readFile(
    fileURLToPath(new URL('../../supabase/config.toml', import.meta.url)),
    'utf8',
  );
  await writeFile(join(workdir, 'supabase/config.toml'), restoreConfig(source));
  started = true;
  await supabase(
    ['start', '-x', RESTORE_EXCLUSIONS, '--workdir', workdir],
    commandOptions,
  );
  code = 'RESTORE_FAILED';
  await docker(
    [
      'exec',
      '-i',
      'supabase_db_lifter-restore',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '--single-transaction',
      '-U',
      // Managed role parameter grants require the local stack's superuser.
      // This target is exclusively the isolated lifter-restore container.
      'supabase_admin',
      '-d',
      'postgres',
    ],
    {
      ...commandOptions,
      input: Readable.from([
        plaintext['roles.sql.age'],
        Buffer.from('\n'),
        plaintext['schema.sql.age'],
        Buffer.from('\nSET session_replication_role = replica;\n'),
        plaintext['data.sql.age'],
        Buffer.from('\n'),
      ]),
    },
  );
  code = 'CHECKS_FAILED';
  const status = JSON.parse(
    await supabase(
      ['status', '--workdir', workdir, '--output', 'json'],
      commandOptions,
    ),
  );
  const url = new URL(status.DB_URL);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.port !== '55322'
  )
    throw new Error('Unexpected restore target');
  sql = postgres(url.toString(), {
    max: 1,
    connect_timeout: 15,
    onnotice: () => {},
  });
  const actual = await collectChecks(sql);
  if (!compareChecks(expected, actual).ok) throw new Error(code);
  code = 'SMOKE_FAILED';
  const [{ count }] =
    await sql`select count(*)::int as count from information_schema.tables where table_schema = 'public'`;
  if (
    count === 0 &&
    Object.keys(expected).some((key) => key.startsWith('public.'))
  )
    throw new Error(code);
  code = 'OK';
} catch (error) {
  if (error instanceof UsageError) code = 'USAGE';
  else if (error?.code === 'TIMEOUT') code = 'TIMEOUT';
  diagnostic = firstErrorLine(error?.stderr);
} finally {
  if (sql) {
    try {
      await sql.end({ timeout: 5 });
    } catch (error) {
      secondaryFailure('CLEANUP_FAILED', error);
    }
  }
  if (started) {
    try {
      await teardownRestoreStack(workdir, Boolean(args?.['keep-stack']), {
        stop: (argv) => supabase(argv, commandOptions),
      });
    } catch (error) {
      secondaryFailure('CLEANUP_FAILED', error);
    }
  }
  if (workdir && !started && !args?.['keep-stack']) {
    try {
      await rm(workdir, { recursive: true, force: true });
    } catch (error) {
      secondaryFailure('CLEANUP_FAILED', error);
    }
  }
  if (log) {
    // Invalid/untrusted manifest ids are never copied into the log.
    try {
      await appendFile(
        log,
        `${new Date().toISOString()}\t${id}\t${code === 'OK' ? 'PASS' : 'FAIL'}\t${code}\n`,
        { mode: 0o600 },
      );
    } catch (error) {
      secondaryFailure('LOG_FAILED', error);
    }
  }
  console.log(code === 'OK' ? 'PASS' : `FAIL ${code}`);
  if (code !== 'OK' && diagnostic) console.error(diagnostic);
  if (code === 'USAGE')
    console.error(
      'Usage: backup:restore-test --backup <folder> --identity-file <path> [--log <path>] [--keep-stack] [--timeout-minutes <minutes>]',
    );
  process.exitCode = code === 'OK' ? 0 : code === 'USAGE' ? 2 : 1;
}
