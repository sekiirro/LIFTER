import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import prettier from 'prettier';

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
const names = execFileSync(
  'git',
  ['diff', '--no-renames', '--name-only', '-z', `${base}...HEAD`],
  { cwd: repo, encoding: 'buffer' },
)
  .toString('utf8')
  .split('\0')
  .filter(Boolean);
const candidates = names.filter((name) =>
  ['.md', '.yaml', '.yml', '.json'].includes(extname(name).toLowerCase()),
);
if (!candidates.length) {
  console.log('No changed Markdown, YAML, or JSON files.');
  process.exit(0);
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
