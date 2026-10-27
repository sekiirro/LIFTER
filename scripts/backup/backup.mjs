import { createWriteStream } from 'node:fs';
import {
  access,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import postgres from 'postgres';
import { Encrypter } from 'age-encryption';
import {
  parseArgs,
  requireArgs,
  timeoutOptions,
  UsageError,
} from './lib/args.mjs';
import { collectChecks } from './lib/checks.mjs';
import { buildManifest, verifyManifest } from './lib/manifest.mjs';
import { selectRetained, shouldPrune } from './lib/retention.mjs';
import { supabase } from './lib/exec.mjs';

let folder;
let complete = false;
let sql;
try {
  const args = parseArgs(
    process.argv.slice(2),
    ['db-url', 'recipient', 'recipient-file', 'out-root', 'timeout-minutes'],
    ['no-prune'],
  );
  args['db-url'] ||= process.env.BACKUP_DB_URL;
  requireArgs(args, ['db-url', 'out-root']);
  const commandOptions = timeoutOptions(args['timeout-minutes']);
  if (Boolean(args.recipient) === Boolean(args['recipient-file']))
    throw new UsageError('Choose one recipient source');
  const recipient =
    args.recipient || (await readFile(args['recipient-file'], 'utf8')).trim();
  const encrypter = new Encrypter();
  encrypter.addRecipient(recipient);
  const now = new Date();
  const id = now.toISOString().replace(/[:.]/g, '-');
  const root = resolve(args['out-root']);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const target = join(root, id);
  await mkdir(target, { mode: 0o700 });
  folder = target;
  sql = postgres(args['db-url'], {
    max: 1,
    connect_timeout: 15,
    onnotice: () => {},
  });
  const [{ count }] =
    await sql`select count(*)::text as count from storage.buckets`;
  if (count !== '0') throw new Error('STORAGE_EXPORT_UNSUPPORTED');
  console.log('Storage: 0 buckets');
  for (const [name, flags] of [
    ['roles', ['--role-only']],
    ['schema', []],
    ['data', ['--data-only', '--use-copy']],
  ]) {
    await supabase(['db', 'dump', '--db-url', args['db-url'], ...flags], {
      ...commandOptions,
      output: async (stream) =>
        pipeline(
          Readable.fromWeb(await encrypter.encrypt(Readable.toWeb(stream))),
          createWriteStream(join(folder, `${name}.sql.age`), {
            flags: 'wx',
            mode: 0o600,
          }),
        ),
    });
  }
  const checks = await collectChecks(sql);
  await writeFile(
    join(folder, 'checks.json.age'),
    await encrypter.encrypt(JSON.stringify(checks)),
    { flag: 'wx', mode: 0o600 },
  );
  await writeFile(
    join(folder, 'manifest.json'),
    JSON.stringify(
      await buildManifest(folder, id, now.toISOString()),
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  complete = true;
  if (!args['no-prune']) {
    const backups = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (
        !entry.isDirectory() ||
        !/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z$/.test(entry.name)
      )
        continue;
      const path = join(root, entry.name);
      const idDate = new Date(
        entry.name.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/, 'T$1:$2:$3.$4Z'),
      );
      if (idDate > now) continue;
      try {
        const manifest = await verifyManifest(path);
        backups.push({ path, idDate, date: new Date(manifest.created_at) });
      } catch {
        // Only a missing manifest marks an incomplete folder. Preserve corrupt
        // completed archives for investigation rather than silently deleting them.
        try {
          await access(join(path, 'manifest.json'));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          if (shouldPrune(idDate, false, false, now))
            await rm(path, { recursive: true });
        }
      }
    }
    const retained = selectRetained(
      backups.map((backup) => backup.date),
      now,
    );
    for (const backup of backups)
      if (
        shouldPrune(
          backup.idDate,
          retained.has(backup.date.getTime()),
          true,
          now,
        )
      )
        await rm(backup.path, { recursive: true });
  }
  console.log('BACKUP_COMPLETE');
} catch (error) {
  if (folder && !complete) await rm(folder, { recursive: true, force: true });
  console.error(
    error instanceof UsageError
      ? 'Usage: backup --out-root <path> --recipient <public key> [--db-url <url> | BACKUP_DB_URL] [--no-prune] [--timeout-minutes <minutes>]'
      : 'BACKUP_FAILED',
  );
  process.exitCode = error instanceof UsageError ? 2 : 1;
} finally {
  if (sql) await sql.end({ timeout: 5 });
}
