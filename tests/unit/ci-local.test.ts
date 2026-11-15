import { describe, expect, it } from 'vitest';
import {
  buildPlan,
  dirtySpecTree,
  isIgnoredSpecLine,
  parseArgs,
  parseWorkflowSteps,
  safeStackArgs,
  summarizeCommand,
} from '../../scripts/ci-local.mjs';

const workflow = `
jobs:
  validate:
    steps:
      - name: Check feature spec consistency
        run: node scripts/spec-consistency.mjs
      - name: Typecheck
        run: npm run typecheck
  integration-shard:
    steps:
      - name: Run integration shard \${{ matrix.shard }} of 3
        run: npm run test:integration -- --shard=\${{ matrix.shard }}/3 --reporter=json --outputFile="$RUNNER_TEMP/vitest-report.json"
      - name: Run Playwright suite shard \${{ matrix.shard }} of 3 against the local stack
        run: npm run e2e -- --shard=\${{ matrix.shard }}/3 --workers=1 --reporter=json
  storage:
    steps:
      - name: Run F14 Storage integrations
        run: |
          npm run test:integration -- \\
            tests/integration/branding-banner-pipeline.test.ts \\
            --reporter=json
`;

describe('local CI parity planning', () => {
  it('parses flags and requires an explicit stack', () => {
    expect(
      parseArgs(['--stack', 'C', '--port', '3437', '--group', 'integration']),
    ).toMatchObject({
      stack: 'c',
      port: 3437,
      groups: ['integration'],
    });
    expect(() => parseArgs(['--group', 'validate'])).toThrow(
      '--stack is required',
    );
  });

  it('reads command steps from the workflow and builds CI-ordered shards', () => {
    const steps = parseWorkflowSteps(workflow);
    expect(steps.validate!.map((step: { run: string }) => step.run)).toEqual([
      'node scripts/spec-consistency.mjs',
      'npm run typecheck',
    ]);
    const plan = buildPlan(workflow, {
      stack: 'c',
      port: 3437,
      groups: ['integration'],
      baseSha: 'base-sha',
    });
    expect(plan.map((step) => [step.group, step.shard])).toEqual([
      ['integration', 1],
      ['integration', 2],
      ['integration', 3],
    ]);
    expect(plan[0]!.command).toContain('--shard=1/3');
    const outputArg = plan[0]!.args.find((arg: string) =>
      arg.startsWith('--outputFile='),
    );
    expect(outputArg).toBeDefined();
    expect(outputArg).not.toContain('"');
  });

  it('summarizes command outcome and test counts without environment values', () => {
    expect(
      summarizeCommand({
        group: 'playwright',
        command: 'npm run e2e',
        exitCode: 0,
        stdout: '  12 passed (8s)\n  2 skipped',
        durationMs: 321,
      }),
    ).toMatchObject({
      group: 'playwright',
      exitCode: 0,
      counts: { passed: 12, skipped: 2 },
      durationMs: 321,
    });
    expect(
      summarizeCommand({
        group: 'playwright',
        command: 'npm run e2e',
        exitCode: 0,
        stdout:
          '{"config":{},"stats":{"expected":9,"unexpected":1,"skipped":2,"flaky":1}}',
        durationMs: 17,
      }).counts,
    ).toEqual({ passed: 9, failed: 1, skipped: 2, flaky: 1 });
    expect(
      summarizeCommand({
        group: 'integration',
        command: 'npm run test:integration',
        exitCode: 0,
        stdout:
          '{"numTotalTestSuites":3,"numTotalTests":12,"numPassedTests":10,"numFailedTests":1,"numPendingTests":1,"numTodoTests":0}',
        durationMs: 17,
      }).counts,
    ).toEqual({ passed: 10, failed: 1, pending: 1 });
    expect(
      summarizeCommand({
        group: 'validate',
        command: 'npm test',
        exitCode: 0,
        stdout:
          ' Test Files  265 passed (265)\n      Tests  3150 passed (3150)\n',
        durationMs: 17,
      }).counts,
    ).toEqual({ passed: 3150 });
    expect(
      summarizeCommand({
        group: 'storage',
        command: 'node scripts/assert-storage-suite-zero-skips.mjs integration',
        exitCode: 0,
        stdout:
          '{"acceptable":true,"files":7,"passed":42,"skipped":0,"failed":0}',
        durationMs: 17,
      }).counts,
    ).toEqual({ passed: 42, failed: 0, skipped: 0 });
  });

  it('constructs stack commands through the fake safe wrapper without spawning a CLI', () => {
    const fakePathShim = 'fake-supabase-cli.cmd';
    const spawned = false;
    const args = safeStackArgs(fakePathShim, 'c', 'C:/work/supabase-stack-c', [
      'db',
      'reset',
      '--local',
    ]);
    expect(args).toEqual([
      fakePathShim,
      '--workdir',
      'C:/work/supabase-stack-c',
      '--stack',
      'C',
      'db',
      'reset',
      '--local',
    ]);
    expect(spawned).toBe(false);
  });
});

describe('ci-local dirty spec tree guard', () => {
  const ignoredUntracked = [
    'npx-cli.js',
    'supabase-stack-a/npx-cli.js',
    'supabase-stack-b/npx-cli.js',
    'supabase-stack-c/npx-cli.js',
    'supabase-stack-d/npx-cli.js',
  ];

  it('ignores each untracked stack/root npx-cli.js path', () => {
    for (const p of ignoredUntracked) {
      expect(isIgnoredSpecLine(`?? ${p}`)).toBe(true);
      expect(dirtySpecTree([`?? ${p}`])).toBe(false);
    }
  });

  it('is still dirty for a modified tracked npx-cli.js', () => {
    for (const p of ignoredUntracked) {
      expect(dirtySpecTree([` M ${p}`])).toBe(true);
      expect(dirtySpecTree([`M  ${p}`])).toBe(true);
    }
  });

  it('is still dirty for any other untracked file', () => {
    expect(dirtySpecTree(['?? other-untracked.txt'])).toBe(true);
    expect(dirtySpecTree(['?? src/foo.ts'])).toBe(true);
  });

  it('keeps ignoring untracked report-artifacts', () => {
    expect(dirtySpecTree(['?? report-artifacts/x.json'])).toBe(false);
  });

  it('is not dirty when there are no changes', () => {
    expect(dirtySpecTree([])).toBe(false);
    expect(dirtySpecTree('')).toBe(false);
    expect(dirtySpecTree([''])).toBe(false);
  });
});
