import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

const INTEGRATION_SHARD_RUN =
  /^ {8}run: npm run test:integration -- --shard=\$\{\{ matrix\.shard \}\}\/3$/m;

it('runs the full Playwright suite after local-stack integration tests', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const [validate, integration] = workflow.split(/^  integration-shard:\s*$/m);

  expect(validate).not.toMatch(/run:\s*CI=1 npm run e2e/);
  if (!integration)
    throw new Error('CI integration-shard matrix job is missing');
  const supabaseStart = integration.match(
    /^ {6}- run: supabase start .*$/m,
  )?.[0];
  expect(supabaseStart).toBeDefined();
  expect(supabaseStart).not.toMatch(/-x[^\n]*\bstorage-api\b/);
  expect(integration).toMatch(INTEGRATION_SHARD_RUN);
  expect(integration).toContain('shard: [1, 2, 3]');
  expect(integration).toContain(
    'run: npx playwright install --with-deps chromium',
  );
  expect(integration).toContain('run: npm run e2e -- --workers=1');
  expect(integration).toContain("LOCAL_SUPABASE_PROVIDER_FAULT_TEST: 'true'");
  expect(integration).toContain('SUPABASE_URL=$API_URL');
  expect(integration).toContain('SUPABASE_ANON_KEY=$ANON_KEY');
  expect(integration).toContain('SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY');
  expect(integration).toContain('APP_ORIGIN=http://localhost:3000');
  expect(integration.indexOf('Export app server environment')).toBeLessThan(
    integration.indexOf('run: npm run e2e -- --workers=1'),
  );
  expect(integration.search(INTEGRATION_SHARD_RUN)).toBeLessThan(
    integration.indexOf('run: npx playwright install --with-deps chromium'),
  );
  expect(
    integration.indexOf('run: npx playwright install --with-deps chromium'),
  ).toBeLessThan(integration.indexOf('run: npm run e2e -- --workers=1'));
  expect(integration).toMatch(
    /- run: npx playwright install --with-deps chromium\n\s+if: matrix\.shard == 1/,
  );
  expect(integration).toMatch(
    /run: npm run e2e -- --workers=1\n\s+if: matrix\.shard == 1/,
  );
});

it('dispatches CI against a PR merge ref and rejects a mismatched second parent', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  expect(workflow).toMatch(/workflow_dispatch:\n\s+inputs:/);
  expect(workflow).toMatch(
    /pr:\n\s+description: Pull request number to verify\n\s+required: true\n\s+type: number/,
  );
  expect(workflow).toMatch(
    /head_sha:\n\s+description: Exact PR head SHA to verify\n\s+required: true\n\s+type: string/,
  );
  expect(workflow).toContain("format('refs/pull/{0}/merge', inputs.pr)");
  expect(workflow.match(/fetch-depth: 2/g)).toHaveLength(3);
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
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const shardJob = workflow.match(
    /^  integration-shard:\n([\s\S]*?)(?=^  integration:)/m,
  )?.[1];
  const aggregator = workflow.match(
    /^  integration:\n([\s\S]*?)(?=^  storage:)/m,
  )?.[1];

  expect(shardJob).toBeDefined();
  expect(shardJob).toContain('name: integration shard ${{ matrix.shard }}/3');
  expect(shardJob).toContain('id: revision');
  expect(shardJob).toContain(
    "pr_1: ${{ matrix.shard == 1 && steps.revision.outputs.pr || '' }}",
  );
  expect(shardJob).toContain(
    "head_sha_2: ${{ matrix.shard == 2 && steps.revision.outputs.head_sha || '' }}",
  );
  expect(shardJob).toContain(
    "merge_sha_3: ${{ matrix.shard == 3 && steps.revision.outputs.merge_sha || '' }}",
  );
  expect(aggregator).toBeDefined();
  expect(aggregator).toMatch(/^    name: integration$/m);
  expect(aggregator).toMatch(/^    needs: \[integration-shard\]$/m);
  expect(aggregator).toMatch(/^    if: always\(\)$/m);
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
  expect(aggregator).toContain('\"$PR_1\" != \"$PR_2\"');
  expect(aggregator).toContain('\"$HEAD_SHA_1\" != \"$HEAD_SHA_2\"');
  expect(aggregator).toContain('\"$MERGE_SHA_1\" != \"$MERGE_SHA_2\"');
  expect(aggregator).toContain(
    'PR=$PR_1 head_sha=$HEAD_SHA_1 merge_sha=$MERGE_SHA_1',
  );
  expect(aggregator).toMatch(/!= ['"]success['"]/);
  expect(aggregator).toMatch(/exit 1/);
  expect(aggregator).not.toMatch(/uses: actions\/checkout/);
  expect(aggregator).not.toMatch(/secrets\./);
});

it('executes the integration aggregator script against push and PR revision cases', () => {
  const workflowPath =
    process.env.CI_WORKFLOW_FILE ?? '.github/workflows/ci.yml';
  const workflow = readFileSync(workflowPath, 'utf8');
  const aggregator = workflow.match(
    /^  integration:\n([\s\S]*?)(?=^  storage:)/m,
  )?.[1];
  expect(aggregator).toBeDefined();

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
