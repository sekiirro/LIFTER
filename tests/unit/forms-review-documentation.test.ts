import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const root = process.cwd();
const serverScript = readFileSync(
  resolve(root, 'scripts/branding/start-playwright-server.mjs'),
  'utf8',
);
const quickstart = readFileSync(
  resolve(root, 'specs/015-forms-intake/quickstart.md'),
  'utf8',
);
const tasks = readFileSync(
  resolve(root, 'specs/015-forms-intake/tasks.md'),
  'utf8',
);

it('preserves defined targets and never assigns undefined environment values', () => {
  const normalizedServerScript = serverScript.replace(/\s+/gu, ' ');
  for (const [target, source] of [
    ['SUPABASE_URL', 'API_URL'],
    ['SUPABASE_ANON_KEY', 'ANON_KEY'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY'],
  ]) {
    expect(normalizedServerScript).toContain(
      `process.env.${target} === undefined && process.env.${source} !== undefined`,
    );
  }
  expect(serverScript).not.toContain('??= process.env.');
});

it('documents portable runtime inputs for local setup and image provenance', () => {
  expect(quickstart).toContain('$repoRootForNode = $repoRoot -replace');
  expect(quickstart).toContain("process.chdir('$repoRootForNode')");
  expect(quickstart).toContain('$provisionerUri');
  expect(tasks).toContain('--source-root');
  expect(tasks).toContain('BODY_FAT_SOURCE_ROOT');
  expect(tasks).toContain(
    'specs/015-forms-intake/assets/body-fat/PROVENANCE.md',
  );
  expect(tasks).not.toContain('C:/Users/NEW LAP/Desktop/YBS SYSTEM');
});
