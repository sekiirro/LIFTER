import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const provisioner = readFileSync(
  'tests/integration/client-accounts-provision.mjs',
  'utf8',
);
const integrationConfig = readFileSync('vitest.integration.config.ts', 'utf8');

it('runs Vault provisioning after local stack export and before integration tests', () => {
  const exportStep = workflow.indexOf('name: Export local stack environment');
  const provisionStep = workflow.indexOf(
    'node tests/integration/client-accounts-provision.mjs',
  );
  const integrationStep = workflow.indexOf('npm run test:integration');

  expect(exportStep).toBeGreaterThanOrEqual(0);
  expect(provisionStep).toBeGreaterThan(exportStep);
  expect(integrationStep).toBeGreaterThan(provisionStep);
});

it('can source DB_URL and API_URL from the CI environment without .env.local', () => {
  expect(provisioner).toMatch(/existsSync\(envPath\)/);
  expect(provisioner).toMatch(/process\.env\.DB_URL/);
  expect(provisioner).toMatch(/process\.env\.API_URL/);
});

it('provisions the explicitly selected stack into its own ignored env file', () => {
  expect(provisioner).toContain('const stack = selectStack();');
  expect(provisioner).toContain('const envPath = config.envFile;');
  expect(provisioner).toContain(
    'assertLocalStackTarget({ stack, apiUrl, dbUrl });',
  );
  expect(provisioner).toContain("localSupabaseContainer('db', stack)");
});

it('runs the shared password DB parity suite once through integration shards', () => {
  const integration = workflow.slice(
    workflow.indexOf('\n  integration-shard:'),
  );
  const provision = integration.indexOf(
    'node tests/integration/client-accounts-provision.mjs',
  );
  const shard = integration.indexOf(
    'npm run test:integration -- --shard=${{ matrix.shard }}/3',
  );
  expect(provision).toBeGreaterThanOrEqual(0);
  expect(shard).toBeGreaterThan(provision);
  expect(integration).not.toContain('password-policy-parity.test.ts');
  expect(integrationConfig).toContain(
    "include: ['tests/integration/**/*.test.ts']",
  );
  expect(
    readFileSync('tests/integration/password-policy-parity.test.ts', 'utf8'),
  ).toContain('DB password parity:');
});

it('uses the root profile for the Storage-ready integration e2e gate', () => {
  const integration = workflow.slice(
    workflow.indexOf('\n  integration-shard:'),
  );
  const storageE2e = integration.slice(
    integration.indexOf('Run full Playwright suite against the local stack'),
  );

  expect(integration).not.toMatch(/LIFTER_SUPABASE_STACK:\s*b/);
  expect(integration).not.toContain('working-directory: supabase-stack-b');
  expect(storageE2e).toContain("LOCAL_SUPABASE_STORAGE_TEST: 'true'");
});

it('masks provisioned keys in GitHub Actions before writing the local env file', () => {
  const maskIndex = provisioner.indexOf('::add-mask::');
  const writeIndex = provisioner.indexOf('writeFileSync(');

  expect(maskIndex).toBeGreaterThanOrEqual(0);
  expect(writeIndex).toBeGreaterThan(maskIndex);
});

it('exports the same Vault keys to later CI steps after masking them', () => {
  const maskIndex = provisioner.indexOf('::add-mask::');
  const exportIndex = provisioner.indexOf('appendFileSync(');

  expect(provisioner).toMatch(/process\.env\.GITHUB_ENV/);
  expect(exportIndex).toBeGreaterThan(maskIndex);
  expect(provisioner).toContain('`${row.name}=${row.decrypted_secret}\\n`');
});
