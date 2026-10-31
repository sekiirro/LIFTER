import { describe, expect, it } from 'vitest';
import {
  assertPlaywrightStorageReport,
  assertVitestStorageReport,
} from '../../scripts/assert-storage-suite-zero-skips.mjs';

describe('storage suite report guards', () => {
  it('rejects a Vitest report-level failure even when its test assertion passed', () => {
    expect(() =>
      assertVitestStorageReport(
        {
          success: false,
          testResults: [
            {
              name: 'branding-storage-policy.test.ts',
              status: 'passed',
              assertionResults: [{ status: 'passed' }],
            },
          ],
        },
        ['branding-storage-policy.test.ts'],
      ),
    ).toThrow('Storage integration guard failed');
  });

  it('rejects a failed Vitest file status even when its assertion passed', () => {
    expect(() =>
      assertVitestStorageReport(
        {
          success: true,
          testResults: [
            {
              name: 'branding-storage-policy.test.ts',
              status: 'failed',
              assertionResults: [{ status: 'passed' }],
            },
          ],
        },
        ['branding-storage-policy.test.ts'],
      ),
    ).toThrow('Storage integration guard failed');
  });

  it('rejects Playwright report-level errors even when stats show a passed test', () => {
    expect(() =>
      assertPlaywrightStorageReport(
        {
          stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0 },
          errors: [{ message: 'global teardown failed' }],
          suites: [{ file: 'client-accounts-storage.spec.ts' }],
        },
        ['client-accounts-storage.spec.ts'],
      ),
    ).toThrow('Storage Playwright guard failed');
  });
});
