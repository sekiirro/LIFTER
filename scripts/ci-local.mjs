import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { getStackConfig } from './local-stack.mjs';
import {
  resolvePlaywrightBaseUrl,
  resolvePlaywrightPort,
} from './playwright-port.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ciPath = path.join(root, '.github/workflows/ci.yml');
const temp = path.join(os.tmpdir(), 'lifter-ci-local');

export function parseArgs(argv) {
  const o = { groups: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') return { ...o, help: true };
    if (a === '--allow-dirty-spec') o.allowDirtySpec = true;
    else if (a === '--stack') o.stack = argv[++i]?.toLowerCase();
    else if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '--summary') o.summaryPath = argv[++i];
    else if (a === '--group') o.groups.push(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!['a', 'b', 'c', 'd'].includes(o.stack))
    throw new Error('--stack is required (a, b, c, or d)');
  o.port ??= 3000;
  resolvePlaywrightPort({ PLAYWRIGHT_PORT: String(o.port) });
  o.groups = o.groups.length
    ? o.groups
    : ['validate', 'integration', 'playwright', 'storage'];
  if (o.groups.includes('all'))
    o.groups = ['validate', 'integration', 'playwright', 'storage'];
  if (
    o.groups.some(
      (g) => !['validate', 'integration', 'playwright', 'storage'].includes(g),
    )
  )
    throw new Error('Groups: validate, integration, playwright, storage, all');
  o.groups = [...new Set(o.groups)];
  return o;
}

export function parseWorkflowSteps(source) {
  const jobs = parse(source).jobs;
  return Object.fromEntries(
    ['validate', 'integration-shard', 'storage'].map((name) => {
      if (!jobs?.[name]) throw new Error(`CI workflow is missing job ${name}`);
      return [
        name,
        jobs[name].steps
          .filter((s) => s.run)
          .map((s) => ({ name: s.name ?? '', run: s.run })),
      ];
    }),
  );
}

const runOf = (steps, marker) => {
  const value = steps.find((s) => s.run.includes(marker))?.run;
  if (!value) throw new Error(`CI workflow command not found: ${marker}`);
  return value;
};
const lineOf = (source, marker) => {
  const line = source.split(/\r?\n/).find((s) => s.includes(marker));
  if (!line) throw new Error(`CI workflow command not found: ${marker}`);
  return line.trim();
};
const split = (s) =>
  (s.match(/"(?:\\.|[^"\\])*"|'[^']*'|\S+/g) ?? []).map((v) =>
    v.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2'),
  );
const add = (p, group, command, extra = {}) =>
  p.push({ group, command, args: split(command), ...extra });

export function buildPlan(source, o) {
  const j = parseWorkflowSteps(source),
    p = [],
    has = (g) => o.groups.includes(g),
    v = j.validate,
    i = j['integration-shard'],
    s = j.storage;
  if (has('validate')) {
    add(p, 'validate', runOf(v, 'node scripts/spec-consistency.mjs'), {
      spec: true,
    });
    add(p, 'validate', runOf(v, 'npm run check:migration-timestamps'));
    add(p, 'validate', 'npm run check:migration-versions:remote');
    for (const cmd of runOf(v, 'node -p process.versions.unicode')
      .split(/\r?\n/)
      .filter(Boolean))
      add(p, 'validate', cmd.trim());
    for (const cmd of [
      "node -e \"require('esbuild').transformSync('const x=1')\"",
      'npx --no-install workerd --version',
    ])
      add(p, 'validate', cmd);
    for (const name of ['typecheck', 'lint', 'format:check'])
      add(p, 'validate', runOf(v, `npm run ${name}`));
    add(p, 'validate', runOf(v, 'node scripts/format-check-changed.mjs'), {
      formatBase: o.baseSha,
    });
    for (const cmd of [
      'npm test',
      'npm run build:edge',
      'npm run check:secrets',
      'npm run build:cron',
      'npm run size',
    ])
      add(p, 'validate', runOf(v, cmd));
  }
  if (has('integration'))
    for (let n = 1; n <= 3; n++)
      add(
        p,
        'integration',
        runOf(i, 'npm run test:integration -- --shard=')
          .replaceAll('${{ matrix.shard }}', String(n))
          .replaceAll('$RUNNER_TEMP', temp),
        { stack: true, reset: true, shard: n },
      );
  if (has('playwright')) {
    add(
      p,
      'playwright',
      runOf(i, 'npx playwright install --with-deps chromium').replace(
        ' --with-deps',
        process.platform === 'win32' ? '' : ' --with-deps',
      ),
    );
    for (let n = 1; n <= 3; n++)
      add(
        p,
        'playwright',
        runOf(i, 'npm run e2e -- --shard=').replaceAll(
          '${{ matrix.shard }}',
          String(n),
        ),
        { stack: true, reset: true, shard: n },
      );
  }
  if (has('storage')) {
    add(
      p,
      'storage',
      runOf(s, 'npx playwright install --with-deps chromium').replace(
        ' --with-deps',
        process.platform === 'win32' ? '' : ' --with-deps',
      ),
    );
    const block = runOf(
      s,
      'tests/integration/branding-banner-pipeline.test.ts',
    );
    const iReport = path.join(temp, 'branding-storage-integration.json');
    add(
      p,
      'storage',
      block
        .split(/\r?\nnode scripts\/assert-storage-suite-zero-skips\.mjs/)[0]
        .replace(/\\\s*\r?\n/g, ' ')
        .replaceAll('$RUNNER_TEMP/branding-storage-integration.json', iReport)
        .trim(),
      { stack: true, reset: true },
    );
    add(
      p,
      'storage',
      lineOf(
        runOf(
          s,
          'node scripts/assert-storage-suite-zero-skips.mjs integration',
        ),
        'node scripts/assert-storage-suite-zero-skips.mjs integration',
      ).replaceAll('$RUNNER_TEMP/branding-storage-integration.json', iReport),
    );
    const bReport = path.join(temp, 'branding-storage-playwright.json'),
      browser = runOf(s, 'tests/e2e/branding-banner-loaded.spec.ts');
    add(p, 'storage', lineOf(browser, 'npm run e2e'), {
      stack: true,
      playwright: true,
    });
    add(
      p,
      'storage',
      lineOf(
        runOf(s, 'node scripts/assert-storage-suite-zero-skips.mjs playwright'),
        'node scripts/assert-storage-suite-zero-skips.mjs playwright',
      ).replaceAll('$RUNNER_TEMP/branding-storage-playwright.json', bReport),
    );
  }
  return p;
}

export function summarizeCommand({
  group,
  command,
  exitCode,
  stdout = '',
  durationMs,
}) {
  const counts = {},
    start = stdout.indexOf('{"config"');
  if (start >= 0)
    try {
      const stats = JSON.parse(stdout.slice(start)).stats ?? {};
      for (const [key, value] of Object.entries({
        passed: stats.expected,
        failed: stats.unexpected,
        skipped: stats.skipped,
        flaky: stats.flaky,
      }))
        if (Number.isFinite(Number(value))) counts[key] = Number(value);
    } catch {
      /* Fall back to text counts below. */
    }
  for (const [key, re] of Object.entries({
    passed: /(\d+) passed/gi,
    failed: /(\d+) failed/gi,
    skipped: /(\d+) skipped/gi,
    pending: /(\d+) pending/gi,
  })) {
    const values = [...stdout.matchAll(re)].map((m) => Number(m[1]));
    if (values.length && counts[key] === undefined)
      counts[key] = values.reduce((a, b) => a + b, 0);
  }
  return { group, command, exitCode, counts, durationMs };
}

export const safeStackArgs = (wrapper, stack, workdir, action) => [
  wrapper,
  '--workdir',
  workdir,
  '--stack',
  stack.toUpperCase(),
  ...action,
];
function run(command, args, env = process.env) {
  const r = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32' && /\.cmd$/i.test(command),
    maxBuffer: 128 * 1024 * 1024,
  });
  const secrets = Object.entries(env)
    .filter(
      ([name, value]) =>
        value &&
        /(?:KEY|TOKEN|SECRET|PASSWORD|DB_URL|CONNECTION_STRING)$/i.test(name),
    )
    .map(([, value]) => String(value));
  const redact = (s = '') =>
    secrets.reduce((t, secret) => t.split(secret).join('[REDACTED]'), s);
  const out = redact(r.stdout),
    err = redact(r.stderr ?? r.error?.message ?? '');
  process.stdout.write(out);
  process.stderr.write(err);
  return { code: r.status ?? 1, out, err };
}
const git = (args) => {
  const r = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (r.status) throw new Error(`git ${args[0]} failed`);
  return r.stdout.trim();
};
function dirtySpecTree() {
  return git(['status', '--porcelain'])
    .split(/\r?\n/)
    .filter(Boolean)
    .some(
      (s) =>
        !s.endsWith('supabase-stack-c/npx-cli.js') &&
        !(s.startsWith('??') && s.slice(3).startsWith('report-artifacts/')),
    );
}
function wrapperPath() {
  const paths = [
    process.env.SUPABASE_SAFE_WRAPPER,
    path.join(os.homedir(), '.lifter/tools/supabase-safe.mjs'),
    path.join(root, 'tools/supabase-safe.mjs'),
  ].filter(Boolean);
  const found = paths.find(existsSync);
  if (!found)
    throw new Error(
      'supabase-safe.mjs was not found; set SUPABASE_SAFE_WRAPPER',
    );
  return found;
}
function actionFromCi(steps, marker) {
  const words = split(lineOf(runOf(steps, marker), marker)),
    index = words.indexOf('supabase');
  if (index < 0) throw new Error(`CI workflow command not found: ${marker}`);
  return words.slice(index + 1);
}
function safeAction(wrapper, stack, action) {
  const config = getStackConfig(stack, root),
    env = {
      ...process.env,
      LIFTER_SUPABASE_STACK: stack,
      SUPABASE_SAFE_CLI: 'node npx-cli.js',
    };
  return run(
    process.execPath,
    safeStackArgs(wrapper, stack, config.workdir, action),
    env,
  ).code;
}
function prepareStack(wrapper, stack, start) {
  if (
    safeAction(wrapper, stack, start) ||
    safeAction(wrapper, stack, ['db', 'reset', '--local'])
  )
    return 1;
  const config = getStackConfig(stack, root),
    env = {
      ...process.env,
      LIFTER_SUPABASE_STACK: stack,
      SUPABASE_SAFE_CLI: 'node npx-cli.js',
    };
  for (const args of [
    ['node', 'tests/integration/client-accounts-provision.mjs'],
    ['node', 'scripts/wait-storage-ready.mjs'],
  ])
    if (
      run(
        process.execPath,
        safeStackArgs(wrapper, stack, config.workdir, ['exec', '--', ...args]),
        env,
      ).code
    )
      return 1;
  return 0;
}

export function main(argv = process.argv.slice(2)) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 2;
    return;
  }
  if (o.help) {
    console.log(
      'npm run ci:local -- --stack C [--port 3437] [--group validate|integration|playwright|storage|all] [--summary path] [--allow-dirty-spec]',
    );
    return;
  }
  const baseSha = git(['merge-base', 'HEAD', 'origin/main']),
    workflow = readFileSync(ciPath, 'utf8'),
    jobs = parseWorkflowSteps(workflow);
  const plan = buildPlan(workflow, { ...o, baseSha }),
    wrapper = wrapperPath(),
    start = actionFromCi(jobs['integration-shard'], 'supabase start'),
    stop = actionFromCi(jobs['integration-shard'], 'supabase stop');
  const summaryPath = path.resolve(
    root,
    o.summaryPath ?? 'report-artifacts/ci-local-summary.json',
  );
  mkdirSync(path.dirname(summaryPath), { recursive: true });
  mkdirSync(temp, { recursive: true });
  const summary = [];
  let failed = false;
  for (const step of plan) {
    if (step.spec && !o.allowDirtySpec && dirtySpecTree()) {
      summary.push({
        group: step.group,
        command: step.command,
        exitCode: 2,
        counts: {},
        durationMs: 0,
      });
      failed = true;
      continue;
    }
    if (step.reset) {
      const t = Date.now(),
        code = prepareStack(wrapper, o.stack, start);
      summary.push({
        group: step.group,
        command: `safe reset/provision Stack ${o.stack.toUpperCase()}`,
        exitCode: code,
        counts: {},
        durationMs: Date.now() - t,
      });
      if (code) {
        failed = true;
        continue;
      }
    }
    const env = {
      ...process.env,
      PLAYWRIGHT_PORT: String(o.port),
      LIFTER_SUPABASE_STACK: o.stack,
    };
    if (step.formatBase) env.FORMAT_BASE_SHA = step.formatBase;
    if (step.group === 'playwright' || step.playwright) {
      env.PLAYWRIGHT_BASE_URL = resolvePlaywrightBaseUrl(env);
      env.APP_ORIGIN = new URL(env.PLAYWRIGHT_BASE_URL).origin;
      env.LOCAL_SUPABASE_STORAGE_TEST = 'true';
    }
    if (step.group === 'playwright') {
      env.LOCAL_SUPABASE_PROVIDER_FAULT_TEST = 'true';
      env.PLAYWRIGHT_JSON_OUTPUT_NAME = path.join(
        temp,
        `playwright-report-${step.shard}.json`,
      );
    }
    if (step.playwright)
      env.PLAYWRIGHT_JSON_OUTPUT_NAME = path.join(
        temp,
        'branding-storage-playwright.json',
      );
    const [bin, ...args] = step.args,
      command =
        /^(npm|npx)$/i.test(bin) && process.platform === 'win32'
          ? `${bin}.cmd`
          : bin;
    const actual = step.stack
      ? safeStackArgs(wrapper, o.stack, getStackConfig(o.stack, root).workdir, [
          'exec',
          '--',
          command,
          ...args,
        ])
      : args;
    if (step.stack) env.SUPABASE_SAFE_CLI = 'node npx-cli.js';
    const display = step.command.replace(
      /(ANON_KEY|SERVICE_ROLE_KEY|SUPABASE_[A-Z_]*KEY)=\S+/g,
      '$1=[REDACTED]',
    );
    console.log(`\n[${step.group}] ${display}`);
    const t = Date.now(),
      result = run(step.stack ? process.execPath : command, actual, env);
    const output =
      env.PLAYWRIGHT_JSON_OUTPUT_NAME &&
      existsSync(env.PLAYWRIGHT_JSON_OUTPUT_NAME)
        ? readFileSync(env.PLAYWRIGHT_JSON_OUTPUT_NAME, 'utf8')
        : result.out;
    summary.push(
      summarizeCommand({
        group: step.group,
        command: display,
        exitCode: result.code,
        stdout: output,
        durationMs: Date.now() - t,
      }),
    );
    if (result.code) failed = true;
  }
  if (plan.some((s) => s.stack)) {
    const t = Date.now(),
      code = safeAction(wrapper, o.stack, stop);
    summary.push({
      group: 'stack',
      command: `safe stop Stack ${o.stack.toUpperCase()}`,
      exitCode: code,
      counts: {},
      durationMs: Date.now() - t,
    });
    if (code) failed = true;
  }
  writeFileSync(
    summaryPath,
    `${JSON.stringify({ stack: o.stack, port: o.port, baseSha, commands: summary }, null, 2)}\n`,
  );
  console.log(`Local CI summary: ${summaryPath}`);
  if (failed) process.exitCode = 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
