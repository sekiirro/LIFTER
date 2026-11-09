import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const INTEGRATION_SHARD_RUN =
  /^ {8}run: npm run test:integration -- --shard=\$\{\{ matrix\.shard \}\}\/3$/m;

it('runs the full Playwright suite after local-stack integration tests', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const [validate, integration] = workflow.split(/^  integration:\s*$/m);

  expect(validate).not.toMatch(/run:\s*CI=1 npm run e2e/);
  if (!integration) throw new Error('CI integration job is missing');
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
      const run = step.split('run: |')[1] ?? '';
      return !run.includes('${{');
    }),
  ).toBe(true);
  expect(workflow).toContain('github.run_id');
  expect(workflow).toContain(
    "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
  );
  expect(workflow).toContain('permissions:\n  contents: read');
});
