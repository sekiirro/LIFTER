import { expect, it } from 'vitest';
import { parseStoragePlaywrightSummary } from '../../scripts/client-accounts-storage-result.mjs';

it('rejects a Storage run that skipped instead of passing', () => {
  expect(parseStoragePlaywrightSummary('1 skipped')).toEqual({
    passed: 0,
    skipped: 1,
    failed: 0,
    flaky: 0,
    interrupted: 0,
    acceptable: false,
  });
});
