import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DECISIONS_PATH = 'docs/04-changes-and-questions.md';
const FEATURE_DOCUMENTS = ['spec.md', 'plan.md', 'tasks.md'];
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

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
export function validateSpecConsistency(files, options = {}) {
  const { requireAnalyze = true } = options;
  const errors = [];
  /** Extracts matching feature identifiers from a source document. */
  const collect = (text, pattern) =>
    [...String(text || '').matchAll(pattern)].map((m) => m[0]);
  const requirements = new Set(collect(files.spec, /\bFR-\d{3}\b/g));
  const success = new Set(collect(files.spec, /\bSC-\d{3}\b/g));
  const tasks = new Set(collect(files.tasks, /\bT\d{3}\b/g));
  const analyze =
    typeof files.analyze === 'string' && files.analyze.trim()
      ? files.analyze
      : '';
  if (requireAnalyze && !analyze)
    errors.push('checklists/analyze.md is missing');
  const checks = [
    ['tasks.md', files.tasks, /\bFR-\d{3}\b/g, requirements],
    ['tasks.md', files.tasks, /\bSC-\d{3}\b/g, success],
    ['traceability.md', files.traceability, /\bFR-\d{3}\b/g, requirements],
    ['traceability.md', files.traceability, /\bSC-\d{3}\b/g, success],
    ['traceability.md', files.traceability, /\bT\d{3}\b/g, tasks],
  ];
  if (analyze) {
    checks.push(
      ['analyze.md', analyze, /\bFR-\d{3}\b/g, requirements],
      ['analyze.md', analyze, /\bSC-\d{3}\b/g, success],
      ['analyze.md', analyze, /\bT\d{3}\b/g, tasks],
    );
  }
  for (const [file, text, pattern, known] of checks) {
    for (const id of collect(text, pattern)) {
      if (!known.has(id)) errors.push(`${file}: unknown identifier ${id}`);
    }
  }
  if (analyze) {
    // ISO datetimes ("2026-11-09T22:18Z") do not end with a word boundary.
    const date = [...analyze.matchAll(/\b(20\d{2}-\d{2}-\d{2})(?!\d)/g)]
      .map((match) => match[1])
      .sort()
      .at(-1);
    const latest = [files.specDate, files.planDate, files.tasksDate]
      .filter(Boolean)
      .sort()
      .at(-1);
    if (!date || !latest)
      errors.push(
        'Analyze date is missing or the latest spec/plan/tasks date is unavailable',
      );
    else if (date < latest)
      errors.push(
        'Analyze date is missing or precedes the latest spec/plan/tasks change',
      );
  }
  const decisions = new Set(
    collect(files.decisions, /\b(?:S\d{2}-PO-\d+[a-z]?|D-\d+|PO-MCQ-\d+)\b/gi),
  );
  const pendingText = [files.tasks, files.traceability, analyze].join('\n');
  /** Escapes a decided identifier before placing it in a RegExp. */
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const id of decisions) {
    // Token boundaries keep S41-PO-1 from matching S41-PO-10.
    const idPattern = new RegExp(`\\b${escapeRegExp(id)}\\b`, 'i');
    const hasPendingMarker = pendingText
      .split('\n')
      .some((line) => idPattern.test(line) && /pending\s+PO/i.test(line));
    if (hasPendingMarker)
      errors.push(
        `feature task/traceability/analyze docs: decided identifier ${id} still marked pending PO`,
      );
  }
  return errors;
}

/** Maps changed repository paths to the `specs/<feature>` directories they touch. */
export function featureDirectoriesFromPaths(paths) {
  const directories = new Set();
  for (const path of paths) {
    if (typeof path !== 'string') continue;
    const segments = path.split('/');
    if (segments.length >= 3 && segments[0] === 'specs' && segments[1])
      directories.add(`specs/${segments[1]}`);
  }
  return [...directories].sort();
}

/**
 * Checks only the feature directories present in the changed-path list.
 * `latestCommitDate(featureDir)` must return the commit date of the latest
 * change to that feature's spec/plan/tasks and may throw to fail closed.
 */
export function checkChangedFeatures({
  changedPaths,
  root,
  exists = (path) => existsSync(path),
  read = (path) => readFileSync(path, 'utf8'),
  latestCommitDate,
  decisions = '',
}) {
  const errors = [];
  const features = featureDirectoriesFromPaths(changedPaths);
  for (const featureDir of features) {
    const directory = resolve(root, featureDir);
    const specPath = resolve(directory, 'spec.md');
    const tasksPath = resolve(directory, 'tasks.md');
    const traceabilityPath = resolve(directory, 'traceability.md');
    const analyzePath = resolve(directory, 'checklists/analyze.md');
    const hasSpec = exists(specPath);
    const hasTasks = exists(tasksPath);
    if (!hasSpec) errors.push(`${featureDir}: missing spec.md`);
    if (!hasTasks) errors.push(`${featureDir}: missing tasks.md`);
    if (!hasSpec && !hasTasks) continue;
    const hasTraceability = exists(traceabilityPath);
    const hasAnalyze = exists(analyzePath);
    let latest;
    try {
      latest = String(latestCommitDate(featureDir) || '').trim();
    } catch (error) {
      errors.push(`${featureDir}: ${error.message}`);
      continue;
    }
    if (!latest) {
      errors.push(
        `${featureDir}: latest spec/plan/tasks commit date is unavailable`,
      );
      continue;
    }
    const featureErrors = validateSpecConsistency(
      {
        spec: hasSpec ? read(specPath) : '',
        tasks: hasTasks ? read(tasksPath) : '',
        traceability: hasTraceability ? read(traceabilityPath) : '',
        analyze: hasAnalyze ? read(analyzePath) : '',
        decisions,
        specDate: latest,
        planDate: latest,
        tasksDate: latest,
      },
      { requireAnalyze: hasAnalyze },
    );
    for (const error of featureErrors) errors.push(`${featureDir}: ${error}`);
  }
  return { features, errors };
}

/**
 * Resolves the Git diff range for the event. Enumeration inputs are explicit;
 * any missing or malformed input throws so the caller can fail closed.
 * @param {Record<string, any>} [options]
 */
export function resolveDiffRange(eventName, options = {}) {
  const {
    specBaseSha,
    eventPath,
    localBase,
    mergeBase,
    readEvent = (path) => readFileSync(path, 'utf8'),
  } = options;
  if (specBaseSha) {
    if (!SHA_PATTERN.test(String(specBaseSha)))
      throw new Error(`invalid SPEC_BASE_SHA: ${specBaseSha}`);
    return `${specBaseSha}...HEAD`;
  }
  if (eventName === 'workflow_dispatch') return 'HEAD^1...HEAD';
  if (eventName === 'pull_request' && SHA_PATTERN.test(String(mergeBase || '')))
    return `${mergeBase}...HEAD`;
  if (eventName === 'pull_request' || eventName === 'push') {
    if (!eventPath)
      throw new Error(
        'GITHUB_EVENT_PATH is required to determine the changed-path range',
      );
    let payload;
    try {
      payload = JSON.parse(String(readEvent(eventPath)));
    } catch (error) {
      throw new Error(`cannot read GitHub event payload: ${error.message}`);
    }
    const sha =
      eventName === 'pull_request'
        ? payload?.pull_request?.base?.sha
        : payload?.before;
    if (!SHA_PATTERN.test(String(sha || '')))
      throw new Error(
        `cannot determine base revision for the ${eventName} event`,
      );
    return `${sha}...HEAD`;
  }
  if (localBase) {
    if (!SHA_PATTERN.test(String(localBase)))
      throw new Error(`invalid local base revision: ${localBase}`);
    return `${localBase}...HEAD`;
  }
  throw new Error(
    'cannot determine changed paths: no GitHub event, SPEC_BASE_SHA or local base',
  );
}

/** Runs `git diff --name-only` for the resolved range and rejects empty output. */
export function gitChangedPaths(range, git) {
  const output = git([
    'diff',
    '--no-renames',
    '--name-only',
    // Deletions count as touches: deleting spec.md/tasks.md must fail closed.
    '--diff-filter=ACDMRTUXB',
    '-z',
    range,
  ]);
  const paths = String(output).split('\0').filter(Boolean);
  if (!paths.length)
    throw new Error(`git diff ${range} returned no changed paths`);
  return paths;
}

/**
 * Wraps range resolution, enumeration and per-feature checks to fail closed.
 * @param {Record<string, any>} [options]
 */
export function runCiCheck(options = {}) {
  const {
    eventName,
    root,
    env = {},
    git,
    exists = (path) => existsSync(path),
    read = (path) => readFileSync(path, 'utf8'),
    latestCommitDate,
    decisions = '',
    readEvent = (path) => readFileSync(path, 'utf8'),
    localBase,
    mergeBase,
  } = options;
  if (typeof git !== 'function')
    return {
      features: [],
      errors: ['changed-path enumeration failed: git runner is required'],
      range: null,
    };
  if (typeof latestCommitDate !== 'function')
    return {
      features: [],
      errors: [
        'feature consistency check failed: latestCommitDate is required',
      ],
      range: null,
    };
  let range = null;
  try {
    range = resolveDiffRange(eventName, {
      specBaseSha: env.SPEC_BASE_SHA,
      eventPath: env.GITHUB_EVENT_PATH,
      localBase,
      mergeBase,
      readEvent,
    });
  } catch (error) {
    return {
      features: [],
      errors: [`changed-path range resolution failed: ${error.message}`],
      range,
    };
  }
  let changedPaths;
  try {
    changedPaths = gitChangedPaths(range, git);
  } catch (error) {
    return {
      features: [],
      errors: [`changed-path enumeration failed: ${error.message}`],
      range,
    };
  }
  try {
    const result = checkChangedFeatures({
      changedPaths,
      root,
      exists,
      read,
      latestCommitDate,
      decisions,
    });
    return { ...result, range };
  } catch (error) {
    return {
      features: [],
      errors: [`feature consistency check failed: ${error.message}`],
      range,
    };
  }
}

/** Runs the consistency check for CI or the workflow's path-classification mode. */
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
  const git = (args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  /** Latest commit date touching one feature's spec, plan or tasks. */
  const latestCommitDate = (featureDir) => {
    const value = git([
      'log',
      '-1',
      '--format=%cs',
      '--',
      ...FEATURE_DOCUMENTS.map((name) => `${featureDir}/${name}`),
    ]).trim();
    if (!value)
      throw new Error(`no spec/plan/tasks commit history for ${featureDir}`);
    return value;
  };
  /** First parent of the PR merge commit is the base the merge ref was built on. */
  const pullRequestMergeBase = () => {
    try {
      const [, ...parents] = git(['rev-list', '--parents', '-n', '1', 'HEAD'])
        .trim()
        .split(/\s+/);
      return parents.length >= 2 ? parents[0] : null;
    } catch {
      return null;
    }
  };
  /** Uses the main branch merge base only for local runs with no event. */
  const localBase = () => {
    for (const candidate of ['origin/main', 'main']) {
      try {
        return git(['merge-base', 'HEAD', candidate]).trim();
      } catch {
        // Try the next local base ref.
      }
    }
    return null;
  };
  let result;
  try {
    const decisions = readFileSync(resolve(root, DECISIONS_PATH), 'utf8');
    const eventName = process.env.GITHUB_EVENT_NAME;
    result = runCiCheck({
      eventName,
      root,
      env: process.env,
      git,
      latestCommitDate,
      decisions,
      localBase: eventName ? undefined : localBase(),
      mergeBase:
        eventName === 'pull_request' ? pullRequestMergeBase() : undefined,
    });
  } catch (error) {
    result = {
      features: [],
      errors: [`spec consistency check failed: ${error.message}`],
      range: null,
    };
  }
  if (result.errors.length) {
    for (const error of result.errors) console.error(error);
    process.exitCode = 1;
  } else
    console.log(
      `Spec consistency checks passed for ${result.features.length} touched feature(s).`,
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
