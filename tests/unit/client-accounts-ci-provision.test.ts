import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const provisioner = readFileSync(
  'tests/integration/client-accounts-provision.mjs',
  'utf8',
);

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
  expect(provisioner).toMatch(/existsSync\(path\)/);
  expect(provisioner).toMatch(/process\.env\.DB_URL/);
  expect(provisioner).toMatch(/process\.env\.API_URL/);
});

it('masks provisioned keys in GitHub Actions before writing the local env file', () => {
  const maskIndex = provisioner.indexOf('::add-mask::');
  const writeIndex = provisioner.indexOf('writeFileSync(');

  expect(maskIndex).toBeGreaterThanOrEqual(0);
  expect(writeIndex).toBeGreaterThan(maskIndex);
});
