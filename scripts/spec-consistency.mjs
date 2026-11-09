import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Classifies a complete changed-path list using the PO-approved docs allow-list. */
export function classifyDocsOnlyPaths(input) {
  if (!Array.isArray(input) || input.length === 0) return false;
  /** Checks one canonical repository-relative path against the allow-list. */
  const allowed = (raw) => {
    if (typeof raw !== 'string' || !raw || raw.includes('\\')) return false;
    const path = raw;
    if (path.split('/').some((segment) => segment === '.' || segment === '..'))
      return false;
    if (path === 'README.md' || path === 'CHANGELOG.md') return true;
    return /^(?:docs|specs|\.specify)\/.+\.md$/.test(path);
  };
  return input.every((path) => {
    if (typeof path !== 'string') return false;
    // Git name-status rename/copy records are represented as "old\0new" by the caller.
    const endpoints = path.split('\0');
    return endpoints.length > 0 && endpoints.every(allowed);
  });
}

/** Validates feature references, Analyze freshness, and decided PO markers. */
export function validateSpecConsistency(files) {
  const errors = [];
  /** Extracts matching feature identifiers from a source document. */
  const collect = (text, pattern) =>
    [...String(text || '').matchAll(pattern)].map((m) => m[0]);
  const requirements = new Set(collect(files.spec, /\bFR-\d{3}\b/g));
  const success = new Set(collect(files.spec, /\bSC-\d{3}\b/g));
  const tasks = new Set(collect(files.tasks, /\bT\d{3}\b/g));
  const checks = [
    ['tasks.md', files.tasks, /\bFR-\d{3}\b/g, requirements],
    ['tasks.md', files.tasks, /\bSC-\d{3}\b/g, success],
    ['traceability.md', files.traceability, /\bFR-\d{3}\b/g, requirements],
    ['traceability.md', files.traceability, /\bSC-\d{3}\b/g, success],
    ['traceability.md', files.traceability, /\bT\d{3}\b/g, tasks],
    ['analyze.md', files.analyze, /\bFR-\d{3}\b/g, requirements],
    ['analyze.md', files.analyze, /\bSC-\d{3}\b/g, success],
    ['analyze.md', files.analyze, /\bT\d{3}\b/g, tasks],
  ];
  for (const [file, text, pattern, known] of checks) {
    for (const id of collect(text, pattern)) {
      if (!known.has(id)) errors.push(`${file}: unknown identifier ${id}`);
    }
  }
  const date = [
    ...String(files.analyze || '').matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g),
  ]
    .map((match) => match[1])
    .sort()
    .at(-1);
  const latest = [files.specDate, files.planDate, files.tasksDate]
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!date || !latest || date < latest)
    errors.push(
      'Analyze date is missing or precedes the latest spec/plan/tasks change',
    );
  const decisions = new Set(
    collect(files.decisions, /\b(?:S\d{2}-PO-\d+[a-z]?|D-\d+|PO-MCQ-\d+)\b/gi),
  );
  const pendingText = [files.tasks, files.traceability, files.analyze].join(
    '\n',
  );
  for (const id of decisions) {
    const hasPendingMarker = pendingText
      .split('\n')
      .some(
        (line) =>
          line.toLowerCase().includes(id.toLowerCase()) &&
          /pending\s+PO/i.test(line),
      );
    if (hasPendingMarker)
      errors.push(
        `feature task/traceability/analyze docs: decided identifier ${id} still marked pending PO`,
      );
  }
  return errors;
}

/** Runs the consistency validator or the workflow's path-classification mode. */
function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (process.argv[2] === '--classify-paths') {
    try {
      const raw = readFileSync(process.argv[3]);
      const paths = raw.toString('utf8').split('\0').filter(Boolean);
      console.log(`docs_only=${classifyDocsOnlyPaths(paths)}`);
    } catch {
      console.log('docs_only=false');
    }
    return;
  }
  const feature = resolve(root, 'specs/001-project-scaffold-ci');
  const read = (name) => readFileSync(resolve(feature, name), 'utf8');
  const files = {
    spec: read('spec.md'),
    tasks: read('tasks.md'),
    traceability: read('traceability.md'),
    analyze: read('checklists/analyze.md'),
    decisions: readFileSync(
      resolve(root, 'docs/04-changes-and-questions.md'),
      'utf8',
    ),
  };
  const dates = execFileSync(
    'git',
    [
      'log',
      '-1',
      '--format=%cs',
      '--',
      'specs/001-project-scaffold-ci/spec.md',
      'specs/001-project-scaffold-ci/plan.md',
      'specs/001-project-scaffold-ci/tasks.md',
    ],
    { cwd: root, encoding: 'utf8' },
  ).trim();
  Object.assign(files, { specDate: dates, planDate: dates, tasksDate: dates });
  const errors = validateSpecConsistency(files);
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else console.log('Spec consistency checks passed.');
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
