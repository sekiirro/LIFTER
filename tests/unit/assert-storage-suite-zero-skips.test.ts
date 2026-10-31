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

  it('rejects a Playwright expected failure even when stats count it as expected', () => {
    expect(() =>
      assertPlaywrightStorageReport(
        {
          stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0 },
          suites: [
            {
              file: 'branding-banner-loaded.spec.ts',
              specs: [
                {
                  tests: [
                    {
                      expectedStatus: 'failed',
                      results: [{ status: 'failed' }],
                    },
                  ],
                },
              ],
            },
            {
              file: 'client-accounts-storage.spec.ts',
              specs: [
                {
                  tests: [
                    {
                      expectedStatus: 'passed',
                      results: [{ status: 'passed' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        ['branding-banner-loaded.spec.ts', 'client-accounts-storage.spec.ts'],
      ),
    ).toThrow('Storage Playwright guard failed');
  });

  it('requires an executed passing result for every required Playwright file', () => {
    expect(() =>
      assertPlaywrightStorageReport(
        {
          stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0 },
          suites: [
            {
              file: 'branding-banner-loaded.spec.ts',
              specs: [
                {
                  tests: [
                    {
                      expectedStatus: 'passed',
                      results: [{ status: 'passed' }],
                    },
                  ],
                },
              ],
            },
            { file: 'client-accounts-storage.spec.ts', specs: [] },
          ],
        },
        ['branding-banner-loaded.spec.ts', 'client-accounts-storage.spec.ts'],
      ),
    ).toThrow('Storage Playwright guard failed');
  });

  it('accepts executed passing results from every required Playwright file', () => {
    expect(
      assertPlaywrightStorageReport(
        {
          stats: { expected: 2, skipped: 0, unexpected: 0, flaky: 0 },
          suites: [
            {
              file: 'branding-banner-loaded.spec.ts',
              specs: [
                {
                  tests: [
                    {
                      expectedStatus: 'passed',
                      results: [{ status: 'passed' }],
                    },
                  ],
                },
              ],
            },
            {
              file: 'client-accounts-storage.spec.ts',
              specs: [
                {
                  tests: [
                    {
                      expectedStatus: 'passed',
                      results: [{ status: 'passed' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        ['branding-banner-loaded.spec.ts', 'client-accounts-storage.spec.ts'],
      ),
    ).toEqual({
      files: 2,
      passed: 2,
      skipped: 0,
      failed: 0,
      flaky: 0,
      errors: 0,
    });
  });
});
