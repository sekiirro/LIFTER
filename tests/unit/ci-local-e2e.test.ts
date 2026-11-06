import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// Line-anchored so the password-parity step (`npm run test:integration --
// tests/...`) cannot satisfy the match on the full integration command.
const FULL_INTEGRATION_RUN = /^ {6}- run: npm run test:integration$/m;

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
  expect(integration).toMatch(FULL_INTEGRATION_RUN);
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
  expect(integration.search(FULL_INTEGRATION_RUN)).toBeLessThan(
    integration.indexOf('run: npx playwright install --with-deps chromium'),
  );
  expect(
    integration.indexOf('run: npx playwright install --with-deps chromium'),
  ).toBeLessThan(integration.indexOf('run: npm run e2e -- --workers=1'));
});

it('uses the Vite runner config loader for integration tests', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  expect(packageJson.scripts['test:integration']).toContain(
    '--configLoader=runner',
  );
});
