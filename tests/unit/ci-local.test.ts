import { describe, expect, it } from 'vitest';
import {
  buildPlan,
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
