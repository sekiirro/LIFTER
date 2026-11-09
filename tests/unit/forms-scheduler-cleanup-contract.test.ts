import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('limits scheduler cleanup to run-owned, run-tagged fixtures', () => {
  const source = readFileSync(
    new URL('../integration/f15-scheduler-activation.test.ts', import.meta.url),
    'utf8',
  );

  expect(source).toContain('fixtureOwnedWorkspaceIds');
  expect(source).toContain('fixtureOwnedUserIds');
  expect(source).toContain("raw_user_meta_data->>'f15_scheduler_run'");
  expect(source).not.toContain('knownWorkspaces');
  expect(source).not.toContain('knownUsers');
  expect(source).toContain('baselineWorkspaceIds.length');
  expect(source).toContain('baselineUserIds.length');
  expect(source).toContain("table_type='BASE TABLE'");
});
