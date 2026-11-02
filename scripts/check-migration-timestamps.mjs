import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

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

async function main() {
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
