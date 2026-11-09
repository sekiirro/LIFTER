import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

/** Parses Git's NUL-delimited name-status output and omits deleted paths. */
export function formatCandidatesFromStatus(raw) {
  const parts = Buffer.isBuffer(raw)
    ? raw.toString('utf8').split('\0')
    : String(raw).split('\0');
  if (parts.at(-1) === '') parts.pop();
  if (parts.length % 2 !== 0)
    throw new Error('Malformed Git name-status output');
  const candidates = [];
  for (let index = 0; index < parts.length; index += 2) {
    const [status, file] = [parts[index], parts[index + 1]];
    if (!status || !file) throw new Error('Malformed Git name-status entry');
    if (status === 'D') continue;
    if (['.md', '.yaml', '.yml', '.json'].includes(extname(file).toLowerCase()))
      candidates.push(file);
  }
  return candidates;
}

/** Checks changed Markdown, YAML, and JSON files without honoring broad ignore rules. */
async function main() {
  const repo = process.cwd();
  let base = process.env.FORMAT_BASE_SHA;
  if (!base && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch')
    base = execFileSync('git', ['rev-parse', 'HEAD^1'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim();
  if (!base)
    throw new Error(
      'FORMAT_BASE_SHA is required to check changed documentation/config files',
    );
  const changed = execFileSync(
    'git',
    [
      'diff',
      '--no-renames',
      '--name-status',
      '--diff-filter=ACMRTUXB',
      '-z',
      `${base}...HEAD`,
    ],
    { cwd: repo, encoding: 'buffer' },
  );
  const candidates = formatCandidatesFromStatus(changed);
  if (!candidates.length) {
    console.log('No changed Markdown, YAML, or JSON files.');
    return;
  }
  const failures = [];
  for (const file of candidates) {
    const text = readFileSync(file, 'utf8');
    const options = (await prettier.resolveConfig(file)) ?? {};
    if (!(await prettier.check(text, { ...options, filepath: file })))
      failures.push(file);
  }
  if (failures.length) {
    console.error(
      `Prettier check failed for changed files:\n${failures.join('\n')}`,
    );
    process.exitCode = 1;
  } else
    console.log(
      `Prettier check passed for ${candidates.length} changed Markdown/YAML/JSON files.`,
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
