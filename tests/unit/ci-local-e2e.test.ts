import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('runs the full Playwright suite after local-stack integration tests', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const [validate, integration] = workflow.split(/^  integration:\s*$/m);

  expect(validate).not.toMatch(/run:\s*CI=1 npm run e2e/);
  if (!integration) throw new Error('CI integration job is missing');
  expect(integration).toContain('run: npm run test:integration');
  expect(integration).toContain(
    'run: npx playwright install --with-deps chromium',
  );
  expect(integration).toContain('run: npm run e2e -- --workers=1');
  expect(integration).toContain("LOCAL_SUPABASE_PROVIDER_FAULT_TEST: 'true'");
  expect(integration.indexOf('run: npm run test:integration')).toBeLessThan(
    integration.indexOf('run: npx playwright install --with-deps chromium'),
  );
  expect(
    integration.indexOf('run: npx playwright install --with-deps chromium'),
  ).toBeLessThan(integration.indexOf('run: npm run e2e -- --workers=1'));
});
