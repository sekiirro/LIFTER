import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { pct } from './stats.mjs';

export function positive(value, fallback) {
  const number = value === undefined ? fallback : Number(value);
  pct(0, number);
  return number;
}

export async function output(report, path) {
  if (path)
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o600,
    });
}

export function run(main) {
  main().catch(() => {
    console.error(
      'Free-tier measurement failed; check inputs and target availability',
    );
    process.exitCode = 1;
  });
}

export function isMain(url) {
  return Boolean(
    process.argv[1] && url === pathToFileURL(process.argv[1]).href,
  );
}
