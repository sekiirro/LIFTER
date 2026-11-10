import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const INTEGRATION_SHARD_RUN =
  /^ {8}run: npm run test:integration -- --shard=\$\{\{ matrix\.shard \}\}\/3 --reporter=json --outputFile="\$RUNNER_TEMP\/vitest-report\.json"$/m;
const E2E_SHARD_RUN =
  'npm run e2e -- --shard=${{ matrix.shard }}/3 --workers=1 --reporter=json';

function workflowText(): string {
  return readFileSync('.github/workflows/ci.yml', 'utf8');
}

function shardJob(workflow: string): string {
  const job = workflow.match(
    /^  integration-shard:\n([\s\S]*?)(?=^  integration:)/m,
  )?.[1];
  if (!job) throw new Error('CI integration-shard matrix job is missing');
  return job;
}

function aggregatorJob(workflow: string): string {
  const job = workflow.match(
    /^  integration:\n([\s\S]*?)(?=^  storage:)/m,
  )?.[1];
  if (!job) throw new Error('CI integration aggregator job is missing');
  return job;
}

it('runs a file-level Playwright shard on every integration shard', () => {
  const workflow = workflowText();
  const [validate] = workflow.split(/^  integration-shard:\s*$/m);
  const integration = shardJob(workflow);

  expect(validate).not.toMatch(/run:\s*CI=1 npm run e2e/);
  const supabaseStart = integration.match(
    /^ {6}- run: supabase start .*$/m,
  )?.[0];
  expect(supabaseStart).toBeDefined();
  expect(supabaseStart).not.toMatch(/-x[^\n]*\bstorage-api\b/);
  expect(integration).toMatch(INTEGRATION_SHARD_RUN);
  expect(integration).toContain('shard: [1, 2, 3]');
  expect(integration).not.toContain('if: matrix.shard == 1');
  expect(
    integration.match(/run: npx playwright install --with-deps chromium/g),
  ).toHaveLength(1);
  expect(integration).toContain(`run: ${E2E_SHARD_RUN}`);
  expect(integration).toContain("LOCAL_SUPABASE_STORAGE_TEST: 'true'");
  expect(integration).toContain("LOCAL_SUPABASE_PROVIDER_FAULT_TEST: 'true'");
  expect(integration).toContain('SUPABASE_URL=$API_URL');
  expect(integration).toContain('SUPABASE_ANON_KEY=$ANON_KEY');
  expect(integration).toContain('SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY');
  expect(integration).toContain('APP_ORIGIN=http://localhost:3000');

  // Same ordered preconditions on every shard.
  const order = [
    'run: supabase start',
    'Export local stack environment',
    'Export app server environment',
    'Provision local Vault signup keys',
    'Wait for Storage readiness',
    'Verify Docker CLI',
    'Record shard ${{ matrix.shard }} suite inventories',
    'Run integration shard ${{ matrix.shard }} of 3',
    'run: npx playwright install --with-deps chromium',
    `run: ${E2E_SHARD_RUN}`,
    'Upload shard ${{ matrix.shard }} test reports',
  ];
  const positions = order.map((needle) => {
    const position = integration.indexOf(needle);
    expect(position, needle).toBeGreaterThan(-1);
    return position;
  });
  expect(positions).toEqual([...positions].sort((a, b) => a - b));

  // Non-empty shard list guard, full inventories and artifact upload.
  expect(integration).toContain(
    'npx playwright test --list --reporter=json > "$RUNNER_TEMP/playwright-list-full.json"',
  );
  expect(integration).toContain(
    'npx playwright test --list --shard=${{ matrix.shard }}/3 --reporter=json > "$RUNNER_TEMP/playwright-list-shard.json"',
  );
  expect(integration).toContain('vitest-files.json');
  expect(integration).toContain(
    "readdirSync('tests/integration', { recursive: true })",
  );
  expect(integration).toContain(
    'Playwright shard ${{ matrix.shard }}/3 list is empty or reports errors',
  );
  expect(integration).toContain('actions/upload-artifact@v4');
  expect(integration).toContain(
    'name: integration-shard-${{ matrix.shard }}-reports',
  );
  expect(integration).toContain('if-no-files-found: warn');

  // No test-level parallelisation, retries, presets or new gates.
  expect(workflow).not.toContain('U8_SERVER_LOG_RUN_ID');
  expect(integration).not.toContain('fullyParallel');
  expect(integration).not.toContain('--retries');
  expect(integration).not.toContain('--grep-invert');
});

it('fails the integration aggregator unless every shard reports full coverage', () => {
  const workflow = workflowText();
  const aggregator = aggregatorJob(workflow);

  expect(aggregator).toContain('actions/download-artifact@v4');
  expect(aggregator).toContain('pattern: integration-shard-*-reports');
  expect(aggregator).toContain('REPORTS_DIR: ${{ runner.temp }}/reports');
  expect(aggregator).toContain('- name: Verify sharded suite coverage');
  expect(aggregator).toContain("node --input-type=module <<'NODE'");

  // Existing fail-closed checks and access boundaries must stay unchanged.
  expect(aggregator).toMatch(/!= ['"]success['"]/);
  expect(aggregator).toContain('"$PR_1" != "$PR_2"');
  expect(aggregator).not.toMatch(/uses: actions\/checkout/);
  expect(aggregator).not.toMatch(/secrets\./);
});

type PwTest = { file: string; project: string; title: string; status: string };

const BASE_TESTS: PwTest[] = [
  { file: 'a.spec.ts', project: 'chromium', title: 'a1', status: 'expected' },
  { file: 'a.spec.ts', project: 'chromium', title: 'a2', status: 'expected' },
  { file: 'b.spec.ts', project: 'chromium', title: 'b1', status: 'expected' },
  {
    file: 'b.spec.ts',
    project: 'mobile-chromium',
    title: 'b2',
    status: 'expected',
  },
];
const VITEST_FILES = [
  'C:/repo/tests/integration/a.test.ts',
  'C:/repo/tests/integration/b.test.ts',
];

function playwrightJson(tests: PwTest[]) {
  const files = new Map<string, PwTest[]>();
  for (const test of tests)
    files.set(test.file, [...(files.get(test.file) ?? []), test]);
  return {
    suites: [...files.entries()].map(([file, entries]) => ({
      title: file,
      file,
      specs: entries.map((test) => ({
        title: test.title,
        file,
        tests: [
          {
            projectName: test.project,
            status: test.status,
            expectedStatus: test.status === 'skipped' ? 'skipped' : 'passed',
            results: [],
          },
        ],
      })),
      suites: [],
    })),
    errors: [],
    stats: {
      expected: tests.filter((test) => test.status === 'expected').length,
      skipped: tests.filter((test) => test.status === 'skipped').length,
      unexpected: tests.filter((test) => test.status === 'unexpected').length,
      flaky: tests.filter((test) => test.status === 'flaky').length,
    },
  };
}

function vitestJson(files: string[], failed = false) {
  return {
    success: !failed,
    testResults: files.map((file) => ({
      name: file,
      status: failed ? 'failed' : 'passed',
      assertionResults: [{ status: failed ? 'failed' : 'passed' }],
    })),
  };
}

type Mutation = (shard: number, file: string) => unknown | undefined;

function makeReports(mutate?: Mutation): string {
  const root = mkdtempSync(join(tmpdir(), 's40-coverage-'));
  const shardTests: Record<number, PwTest[]> = {
    1: BASE_TESTS.slice(0, 2),
    2: BASE_TESTS.slice(2, 3),
    3: BASE_TESTS.slice(3),
  };
  const shardVitest: Record<number, string[]> = {
    1: VITEST_FILES.slice(0, 1),
    2: VITEST_FILES.slice(1),
    3: [],
  };
  for (const shard of [1, 2, 3]) {
    const dir = join(root, `integration-shard-${shard}-reports`);
    mkdirSync(dir);
    const files: Record<string, unknown> = {
      'playwright-list-full.json': playwrightJson(BASE_TESTS),
      'playwright-list-shard.json': playwrightJson(
        BASE_TESTS.map((test) => ({ ...test, status: 'skipped' })).filter(
          (test) =>
            (shardTests[shard] ?? []).some((item) => item.title === test.title),
        ),
      ),
      'playwright-report.json': playwrightJson(shardTests[shard] ?? []),
      'vitest-files.json': VITEST_FILES,
      'vitest-report.json': vitestJson(shardVitest[shard] ?? []),
    };
    for (const [name, value] of Object.entries(files)) {
      const mutated = mutate?.(shard, name);
      writeFileSync(
        join(dir, name),
        JSON.stringify(mutated === undefined ? value : mutated),
        'utf8',
      );
    }
  }
  return root;
}

function runCoverage(script: string, reports: string) {
  const scriptPath = join(reports, 'coverage.mjs');
  writeFileSync(scriptPath, script, 'utf8');
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, REPORTS_DIR: reports },
  });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

function coverageScript(): string {
  const aggregator = aggregatorJob(workflowText());
  const script = aggregator.match(
    /node --input-type=module <<'NODE'\n([\s\S]*?)\n {10}NODE\n/,
  )?.[1];
  if (!script)
    throw new Error('coverage script is missing from the aggregator');
  return script.replace(/^ {10}/gm, '');
}

it('executes the sharded coverage proof against tampered reports', () => {
  const script = coverageScript();

  const cases: Array<{
    name: string;
    mutate?: Mutation;
    expected: number;
    expectedOutput?: string;
  }> = [
    {
      name: 'complete reports pass',
      expected: 0,
      expectedOutput: '"listed":4',
    },
    {
      name: 'a missing executed test fails',
      mutate: (shard, file) =>
        shard === 2 && file === 'playwright-report.json'
          ? playwrightJson([])
          : undefined,
      expected: 1,
      expectedOutput: 'missing',
    },
    {
      name: 'a duplicated executed test fails',
      mutate: (shard, file) =>
        shard === 2 && file === 'playwright-report.json'
          ? playwrightJson(BASE_TESTS.slice(0, 3))
          : undefined,
      expected: 1,
      expectedOutput: 'duplicate',
    },
    {
      name: 'a new skipped title fails',
      mutate: (shard, file) =>
        shard === 1 && file === 'playwright-report.json'
          ? playwrightJson([
              { ...BASE_TESTS[0]!, status: 'skipped' },
              BASE_TESTS[1]!,
            ])
          : undefined,
      expected: 1,
      expectedOutput: 'skip',
    },
    {
      name: 'an unexpected failure fails',
      mutate: (shard, file) =>
        shard === 1 && file === 'playwright-report.json'
          ? playwrightJson([
              { ...BASE_TESTS[0]!, status: 'unexpected' },
              BASE_TESTS[1]!,
            ])
          : undefined,
      expected: 1,
      expectedOutput: 'failure',
    },
    {
      name: 'a missing vitest integration file fails',
      mutate: (shard, file) =>
        shard === 2 && file === 'vitest-report.json'
          ? vitestJson([])
          : undefined,
      expected: 1,
      expectedOutput: 'vitest',
    },
  ];

  for (const testCase of cases) {
    const reports = makeReports(testCase.mutate);
    try {
      const result = runCoverage(script, reports);
      expect(result.status, `${testCase.name}: ${result.output}`).toBe(
        testCase.expected,
      );
      if (testCase.expectedOutput)
        expect(result.output.toLowerCase()).toContain(
          testCase.expectedOutput.toLowerCase(),
        );
    } finally {
      rmSync(reports, { recursive: true, force: true });
    }
  }
});

it('dispatches CI against a PR merge ref and rejects a mismatched second parent', () => {
  const workflow = workflowText();
  expect(workflow).toMatch(/workflow_dispatch:\n\s+inputs:/);
  expect(workflow).toMatch(
    /pr:\n\s+description: Pull request number to verify\n\s+required: true\n\s+type: number/,
  );
  expect(workflow).toMatch(
    /head_sha:\n\s+description: Exact PR head SHA to verify\n\s+required: true\n\s+type: string/,
  );
  expect(workflow).toContain("format('refs/pull/{0}/merge', inputs.pr)");
  const validate = workflow.slice(
    workflow.indexOf('  validate:'),
    workflow.indexOf('  integration-shard:'),
  );
  expect(validate).toContain('fetch-depth: 0');
  expect(workflow.match(/fetch-depth: 2/g)).toHaveLength(2);
  expect(workflow.match(/git rev-parse HEAD\^2/g)).toHaveLength(3);
  expect(
    workflow.match(/CI_REPO: \$\{\{ github\.repository \}\}/g),
  ).toHaveLength(3);
  expect(workflow.match(/GH_TOKEN: \$\{\{ github\.token \}\}/g)).toHaveLength(
    3,
  );
  expect(
    workflow.match(
      /curl --fail --silent --show-error --max-time 20 --retry 3 --retry-max-time 60 --retry-all-errors -H "Authorization: Bearer \$GH_TOKEN" -H "Accept: application\/vnd\.github\+json" --output "\$response_file"/g,
    ),
  ).toHaveLength(3);
  expect(workflow.match(/response_file=\$\(mktemp\)/g)).toHaveLength(3);
  expect(workflow.match(/trap 'rm -f "\$response_file"' EXIT/g)).toHaveLength(
    3,
  );
  expect(
    workflow.match(/head_repo=\$\(jq -r .* "\$response_file"\)/g),
  ).toHaveLength(3);
  expect(
    workflow.match(
      /refusing fork PR before running untrusted code with repository secrets/g,
    ),
  ).toHaveLength(3);
  expect(
    workflow.match(
      /CI_HEAD_SHA: \$\{\{ inputs\.head_sha \|\| github\.event\.pull_request\.head\.sha \}\}/g,
    ),
  ).toHaveLength(3);
  const revisionSteps = workflow
    .split('- name: Verify and record CI revision')
    .slice(1)
    .map((step) => step.split('\n      - ')[0]);
  expect(revisionSteps).toHaveLength(3);
  expect(
    revisionSteps.every((step) => {
      const run = (step ?? '').split('run: |')[1] ?? '';
      return !run.includes('${{');
    }),
  ).toBe(true);
  expect(workflow).toContain('github.run_id');
  expect(workflow).toContain(
    "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
  );
  expect(workflow).toContain('permissions:\n  contents: read');
});

it('exposes the required integration aggregator for all shard results', () => {
  const workflow = workflowText();
  const shard = shardJob(workflow);
  const aggregator = aggregatorJob(workflow);

  expect(shard).toContain('name: integration shard ${{ matrix.shard }}/3');
  expect(shard).toContain('id: revision');
  expect(shard).toContain(
    "pr_1: ${{ matrix.shard == 1 && steps.revision.outputs.pr || '' }}",
  );
  expect(shard).toContain(
    "head_sha_2: ${{ matrix.shard == 2 && steps.revision.outputs.head_sha || '' }}",
  );
  expect(shard).toContain(
    "merge_sha_3: ${{ matrix.shard == 3 && steps.revision.outputs.merge_sha || '' }}",
  );
  expect(aggregator).toMatch(/^    name: integration$/m);
  expect(aggregator).toMatch(/^    needs: \[docs-only, integration-shard\]$/m);
  expect(aggregator).toMatch(/^    if: always\(\) && /m);
  expect(aggregator).toMatch(/needs\.integration-shard\.result/);
  expect(aggregator).toContain(
    'PR_1: ${{ needs.integration-shard.outputs.pr_1 }}',
  );
  expect(aggregator).toContain(
    'HEAD_SHA_2: ${{ needs.integration-shard.outputs.head_sha_2 }}',
  );
  expect(aggregator).toContain(
    'MERGE_SHA_3: ${{ needs.integration-shard.outputs.merge_sha_3 }}',
  );
  expect(aggregator).toContain('"$PR_1" != "$PR_2"');
  expect(aggregator).toContain('"$HEAD_SHA_1" != "$HEAD_SHA_2"');
  expect(aggregator).toContain('"$MERGE_SHA_1" != "$MERGE_SHA_2"');
  expect(aggregator).toContain(
    'PR=$PR_1 head_sha=$HEAD_SHA_1 merge_sha=$MERGE_SHA_1',
  );
  expect(aggregator).toMatch(/!= ['"]success['"]/);
  expect(aggregator).toMatch(/exit 1/);
  expect(aggregator).not.toMatch(/uses: actions\/checkout/);
  expect(aggregator).not.toMatch(/secrets\./);
});

it('runs full CI outside pull-request docs-only changes and keeps dispatch jobs unconditional', () => {
  const workflow = workflowText();
  const docs = workflow.slice(
    workflow.indexOf('  docs-only:'),
    workflow.indexOf('  validate:'),
  );
  const shard = shardJob(workflow);
  const storage = workflow.slice(workflow.indexOf('  storage:'));
  expect(docs).toContain('git diff --no-renames --name-only -z');
  expect(docs).toContain('scripts/spec-consistency.mjs --classify-paths');
  expect(docs).toContain("github.event_name == 'pull_request'");
  expect(shard).toContain(
    "if: ${{ !cancelled() && (github.event_name != 'pull_request' || needs.docs-only.outputs.docs_only != 'true') }}",
  );
  expect(shard).toContain("github.event_name != 'pull_request'");
  expect(storage).toContain(
    "if: ${{ !cancelled() && (github.event_name != 'pull_request' || needs.docs-only.outputs.docs_only != 'true') }}",
  );
  const aggregator = aggregatorJob(workflow);
  expect(aggregator).toMatch(/^    if: always\(\) && /m);
  expect(storage).toContain("github.event_name != 'pull_request'");
  expect(workflow).toContain('Check feature spec consistency');
  expect(workflow).toContain(
    'Check formatting of changed Markdown, YAML, and JSON',
  );
});

it('executes the integration aggregator script against push and PR revision cases', () => {
  const workflowPath =
    process.env.CI_WORKFLOW_FILE ?? '.github/workflows/ci.yml';
  const workflow = readFileSync(workflowPath, 'utf8');
  const aggregator = aggregatorJob(workflow);

  const script = aggregator?.match(
    /^        run: \|\n((?:          .*\n|          \n)+)/m,
  )?.[1];
  expect(script).toBeDefined();
  const bash =
    process.platform === 'win32'
      ? (process.env.GIT_BASH_PATH ??
        'C:\\Program Files\\Git\\usr\\bin\\bash.exe')
      : 'bash';
  const head = 'a'.repeat(40);
  const merge = 'b'.repeat(40);
  const makeEnv = (
    overrides: Record<string, string> = {},
  ): NodeJS.ProcessEnv => ({
    NODE_ENV: 'test',
    PR_1: '72',
    PR_2: '72',
    PR_3: '72',
    HEAD_SHA_1: head,
    HEAD_SHA_2: head,
    HEAD_SHA_3: head,
    MERGE_SHA_1: merge,
    MERGE_SHA_2: merge,
    MERGE_SHA_3: merge,
    CI_EVENT_NAME: 'pull_request',
    SHARD_RESULT: 'success',
    ...overrides,
  });
  const run = (env: NodeJS.ProcessEnv) =>
    spawnSync(bash, ['-e', '-c', script ?? ''], {
      encoding: 'utf8',
      env,
    });

  const cases = [
    {
      name: 'push permits empty PR/head values with a valid merge SHA',
      env: makeEnv({
        CI_EVENT_NAME: 'push',
        PR_1: '',
        PR_2: '',
        PR_3: '',
        HEAD_SHA_1: '',
        HEAD_SHA_2: '',
        HEAD_SHA_3: '',
      }),
      expected: 0,
    },
    {
      name: 'pull_request accepts valid revisions',
      env: makeEnv(),
      expected: 0,
    },
    {
      name: 'a failed shard matrix fails',
      env: makeEnv({ SHARD_RESULT: 'failure' }),
      expected: 1,
    },
    {
      name: 'a shard revision mismatch fails',
      env: makeEnv({ HEAD_SHA_3: 'c'.repeat(40) }),
      expected: 1,
    },
    {
      name: 'an invalid SHA fails',
      env: makeEnv({
        MERGE_SHA_1: 'not-a-sha',
        MERGE_SHA_2: 'not-a-sha',
        MERGE_SHA_3: 'not-a-sha',
      }),
      expected: 1,
    },
  ];

  for (const testCase of cases) {
    const result = run(testCase.env);
    if (result.error) throw result.error;
    expect(result.status, testCase.name).toBe(testCase.expected);
  }
});

it('uses the Vite runner config loader for integration tests', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  expect(packageJson.scripts['test:integration']).toContain(
    '--configLoader=runner',
  );
});
