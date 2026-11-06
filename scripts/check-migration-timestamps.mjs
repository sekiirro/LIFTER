import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// S25-PO-7 permits exactly these 11 already-merged migration versions. New
// invalid timestamps must fail validation; do not extend this exception set.
export const ALLOWED_MERGED_TIMESTAMP_EXCEPTIONS = new Set([
  '20261102136000',
  '20261102137000',
  '20261102138000',
  '20261102139000',
  '20261103126000',
  '20261103127000',
  '20261103127900',
  '20261103128000',
  '20261103129000',
  '20261103129100',
  '20261103129200',
]);

function isValidUtcTimestamp(version) {
  if (!/^\d{14}$/.test(version)) return false;
  const year = Number(version.slice(0, 4));
  const month = Number(version.slice(4, 6));
  const day = Number(version.slice(6, 8));
  const hour = Number(version.slice(8, 10));
  const minute = Number(version.slice(10, 12));
  const second = Number(version.slice(12, 14));

  if (hour > 23 || minute > 59 || second > 59) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateMigrationFilenames(filenames) {
  const errors = [];
  const seen = new Set();

  for (const filename of filenames) {
    const match = /^(\d{14})_.+\.sql$/.exec(filename);
    if (!match) {
      errors.push(`${filename}: expected a 14-digit version and SQL filename`);
      continue;
    }

    const version = match[1];
    if (seen.has(version))
      errors.push(`${filename}: duplicate version ${version}`);
    seen.add(version);

    if (
      !isValidUtcTimestamp(version) &&
      !ALLOWED_MERGED_TIMESTAMP_EXCEPTIONS.has(version)
    ) {
      errors.push(`${filename}: invalid UTC migration timestamp ${version}`);
    }
  }

  return errors;
}

// Cross-branch (opt-in) guard: reports a 14-digit version that maps to two or
// more different filenames across any of the given refs. The same filename on
// several refs is fine. Filenames without a 14-digit version are ignored here;
// they are the in-tree validator's concern.
export function findCrossRefVersionConflicts(refMigrations) {
  const byVersion = new Map();

  for (const { ref, filenames } of refMigrations) {
    for (const filename of filenames) {
      const match = /^(\d{14})_.+\.sql$/.exec(filename);
      if (!match) continue;

      const version = match[1];
      if (!byVersion.has(version)) byVersion.set(version, new Map());
      const byName = byVersion.get(version);
      if (!byName.has(filename)) byName.set(filename, new Set());
      byName.get(filename).add(ref);
    }
  }

  const conflicts = [];
  for (const [version, byName] of byVersion) {
    if (byName.size <= 1) continue;
    const files = [...byName.entries()]
      .map(([filename, refs]) => ({ filename, refs: [...refs].sort() }))
      .sort((a, b) => a.filename.localeCompare(b.filename));
    conflicts.push({ version, files });
  }

  return conflicts.sort((a, b) => a.version.localeCompare(b.version));
}

// Parser for `git for-each-ref --format=%(refname) refs/remotes/origin` output.
// Only the designated symbolic ref `refs/remotes/origin/HEAD` is excluded;
// other refs whose last path segment is HEAD (e.g. `refs/remotes/origin/feature/HEAD`)
// are kept so their migration conflicts are still checked.
export function parseOriginRemoteRefs(refsOut) {
  return refsOut
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== 'refs/remotes/origin/HEAD');
}

// Parser for `git ls-tree -z --name-only` output. `-z` emits raw, NUL-delimited,
// unquoted paths, so non-ASCII migration filenames are not dropped.
export function parseMigrationTreeOutput(treeOut) {
  return treeOut
    .split('\0')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.posix.basename(entry))
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

// `listRefMigrations` is injected so unit tests never touch a real repository.
export async function checkRemoteRefs(listRefMigrations) {
  const refMigrations = await listRefMigrations();
  const conflicts = findCrossRefVersionConflicts(refMigrations);
  return {
    ok: conflicts.length === 0,
    conflicts,
    refCount: refMigrations.length,
  };
}

async function listRemoteRefMigrations() {
  const { stdout: refsOut } = await execFileAsync('git', [
    'for-each-ref',
    '--format=%(refname)',
    'refs/remotes/origin',
  ]);
  const refs = parseOriginRemoteRefs(refsOut);

  const results = [];
  for (const ref of refs) {
    const { stdout: treeOut } = await execFileAsync('git', [
      'ls-tree',
      '-r',
      '-z',
      '--name-only',
      ref,
      '--',
      'supabase/migrations',
    ]);
    const filenames = parseMigrationTreeOutput(treeOut);
    results.push({ ref, filenames });
  }
  return results;
}

async function main() {
  if (process.argv.includes('--all-remote-refs')) {
    const { ok, conflicts, refCount } = await checkRemoteRefs(
      listRemoteRefMigrations,
    );
    if (!ok) {
      for (const conflict of conflicts) {
        console.error(
          `version ${conflict.version} maps to different filenames across remote refs:`,
        );
        for (const file of conflict.files) {
          console.error(`  ${file.filename}  refs: ${file.refs.join(', ')}`);
        }
      }
      process.exitCode = 1;
      return;
    }
    console.log(
      `Cross-ref migration-version check passed across ${refCount} remote refs; no version maps to different filenames.`,
    );
    return;
  }

  if (ALLOWED_MERGED_TIMESTAMP_EXCEPTIONS.size !== 11) {
    throw new Error(
      'The merged timestamp exception allowlist must contain 11 entries',
    );
  }
  const migrationsDirectory = path.resolve('supabase/migrations');
  const filenames = (await readdir(migrationsDirectory)).filter((name) =>
    name.endsWith('.sql'),
  );
  const errors = validateMigrationFilenames(filenames);
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(
    `Validated ${filenames.length} migration timestamps; 11 documented merged exceptions allowed.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
