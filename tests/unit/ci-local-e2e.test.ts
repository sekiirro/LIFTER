import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// Line-anchored so the password-parity step (`npm run test:integration --
// tests/...`) cannot satisfy the match on the full integration command.
const FULL_INTEGRATION_RUN = /^ {6}- run: npm run test:integration$/m;

it('runs the full Playwright suite after local-stack integration tests', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const [validate = '', integrationAndStorage = ''] =
    workflow.split(/^  integration:\s*$/m);
  const [integration] = integrationAndStorage.split(/^  storage:\s*$/m);

  expect(validate).not.toMatch(/run:\s*CI=1 npm run e2e/);
  if (!integration) throw new Error('CI integration job is missing');
  const supabaseStarts = [
    ...integration.matchAll(
      /^[ \t]*(?:"\$LIFTER_SUPABASE_CLI"|supabase) start -x ([^\r\n]+)$/gm,
    ),
  ];
  expect(supabaseStarts).toHaveLength(2);
  expect(supabaseStarts.map((match) => match[1])).toEqual([
    'studio,mailpit,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta',
    'studio,mailpit,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta',
  ]);
  expect(supabaseStarts.join('\n')).not.toMatch(/\bstorage-api\b/);
  expect(integration).toMatch(FULL_INTEGRATION_RUN);
  const isolatedInstallCondition = integration.indexOf(
    `if [ "$LIFTER_CI_ISOLATED" = 'true' ]; then`,
  );
  const isolatedBrowserInstall = integration.indexOf(
    'npx playwright install chromium',
  );
  const hostedBrowserInstall = integration.indexOf(
    'npx playwright install --with-deps chromium',
  );
  expect(isolatedInstallCondition).toBeGreaterThanOrEqual(0);
  expect(isolatedInstallCondition).toBeLessThan(isolatedBrowserInstall);
  expect(isolatedBrowserInstall).toBeLessThan(hostedBrowserInstall);
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
    hostedBrowserInstall,
  );
  expect(hostedBrowserInstall).toBeLessThan(
    integration.indexOf('run: npm run e2e -- --workers=1'),
  );
});
