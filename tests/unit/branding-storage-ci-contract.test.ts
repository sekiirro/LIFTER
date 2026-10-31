import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertPlaywrightStorageReport,
  assertVitestStorageReport,
} from '../../scripts/assert-storage-suite-zero-skips.mjs';

describe('F14 Storage CI lane contract', () => {
  it('requires a root-profile Storage job, readiness gate, and F14 zero-skip guard', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(workflow).toMatch(/\n  storage:\n/);
    expect(workflow).not.toContain('LIFTER_SUPABASE_STACK: b');
    expect(workflow).not.toContain('working-directory: supabase-stack-b');
    expect(workflow).toContain('node scripts/wait-storage-ready.mjs');
    expect(workflow).toContain('scripts/assert-storage-suite-zero-skips.mjs');
    expect(workflow).toContain('tests/e2e/client-accounts-storage.spec.ts');
    expect(workflow).toContain('tests/e2e/branding-banner-loaded.spec.ts');
    expect(workflow).toContain('tests/e2e/branding-production-ui.spec.ts');
    expect(workflow).toContain('Export local stack environment');
    expect(workflow).toContain('supabase status -o env | sed -E');
    expect(workflow).toContain('SUPABASE_URL=$API_URL');
    for (const file of [
      'tests/e2e/branding-banner-loaded.spec.ts',
      'tests/e2e/branding-production-ui.spec.ts',
    ]) {
      const spec = readFileSync(file, 'utf8');
      const guard = spec.indexOf('test.skip(!local');
      const fixtureImport = spec.indexOf("await import('../integration/");
      expect(spec).toContain('process.env.API_URL');
      expect(guard).toBeGreaterThanOrEqual(0);
      expect(guard).toBeLessThan(fixtureImport);
    }
    expect(workflow).toContain(
      'tests/integration/branding-storage-context.test.ts',
    );
  });

  it('forwards the selected local Supabase and branding proxy credentials to the app server', () => {
    const config = readFileSync('playwright.config.ts', 'utf8');
    expect(config).toMatch(/webServer:[\s\S]*?env:\s*\{\s*\.\.\.process\.env/);
    expect(config).toContain(
      'node scripts/branding/start-playwright-server.mjs',
    );
    const runner = readFileSync(
      'scripts/branding/local-playwright-credential.mjs',
      'utf8',
    );
    expect(runner).toContain("'branding_proxy'");
    expect(runner).toContain('assertLocalStackTarget');
    expect(runner).not.toContain('service_role');
  });

  it('derives the Next.js listener port from a custom Playwright origin', () => {
    const config = readFileSync('playwright.config.ts', 'utf8');
    expect(config).toMatch(/PORT:\s*process\.env\.PORT\s*\?\?/);
    expect(config).toMatch(/new URL\(baseURL\)\.port/);
  });

  it('bounds each Storage readiness request', () => {
    const readiness = readFileSync('scripts/wait-storage-ready.mjs', 'utf8');
    expect(readiness).toContain('signal: AbortSignal.timeout(');
  });

  it('rejects todo assertions in the required Storage suites', () => {
    const script = readFileSync(
      'scripts/assert-storage-suite-zero-skips.mjs',
      'utf8',
    );
    expect(script).toContain("'todo'");
  });

  it('does not overwrite UI geometry evidence when no local cases ran', () => {
    const registration = readFileSync(
      'tests/e2e/branding-registration.spec.ts',
      'utf8',
    );
    const loadedBanner = readFileSync(
      'tests/e2e/branding-banner-loaded.spec.ts',
      'utf8',
    );
    expect(registration).toContain(
      'if (geometryEvidence.length === 0) return;',
    );
    expect(loadedBanner).toContain('if (measurements.length === 0) return;');
  });

  it('fails if any required branding Storage integration is omitted or skipped', () => {
    const files = [
      'branding-banner-pipeline.test.ts',
      'branding-owner-gc.test.ts',
      'branding-proxy-resolution.test.ts',
      'branding-storage-context.test.ts',
      'branding-storage-policy.test.ts',
      'branding-upload-recovery.test.ts',
      'branding-validator.test.ts',
    ];
    expect(() =>
      assertVitestStorageReport(
        {
          testResults: files.map((file) => ({
            name: `/repo/tests/integration/${file}`,
            status: 'passed',
            assertionResults: [{ status: 'passed' }],
          })),
        },
        files,
      ),
    ).not.toThrow();
    const mutated = files.map((file) => ({
      name: `/repo/tests/integration/${file}`,
      status: 'passed',
      assertionResults: [{ status: 'passed' }],
    }));
    mutated[3]!.assertionResults[0]!.status = 'pending';
    expect(() =>
      assertVitestStorageReport({ testResults: mutated }, files),
    ).toThrow(/skipped|pending/i);
    const todoOnlyFile = files.map((file, index) => ({
      name: `/repo/tests/integration/${file}`,
      status: 'passed',
      assertionResults: [{ status: index === 3 ? 'todo' : 'passed' }],
    }));
    expect(() =>
      assertVitestStorageReport({ testResults: todoOnlyFile }, files),
    ).toThrow(/skipped|noPassed/i);
  });

  it('fails if any required F14 or F11 browser spec is skipped', () => {
    const report = {
      stats: { expected: 3, skipped: 0, unexpected: 0, flaky: 0 },
      suites: [
        {
          file: 'tests/e2e/branding-banner-loaded.spec.ts',
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
          file: 'tests/e2e/branding-production-ui.spec.ts',
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
          file: 'tests/e2e/client-accounts-storage.spec.ts',
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
    };
    expect(() => assertPlaywrightStorageReport(report)).not.toThrow();
    const missingProductionSpec = {
      ...report,
      stats: { ...report.stats, expected: 2 },
      suites: report.suites.filter(
        (suite) => !suite.file.endsWith('branding-production-ui.spec.ts'),
      ),
    };
    expect(() => assertPlaywrightStorageReport(missingProductionSpec)).toThrow(
      /missing|noPassed/i,
    );
    for (const skippedFile of [
      'branding-banner-loaded.spec.ts',
      'branding-production-ui.spec.ts',
    ]) {
      const skippedReport = {
        ...report,
        stats: { ...report.stats, skipped: 1, expected: 2 },
        suites: report.suites.map((suite) =>
          suite.file.endsWith(skippedFile)
            ? {
                ...suite,
                specs: [
                  {
                    tests: [
                      {
                        expectedStatus: 'skipped',
                        results: [{ status: 'skipped' }],
                      },
                    ],
                  },
                ],
              }
            : suite,
        ),
      };
      expect(() => assertPlaywrightStorageReport(skippedReport)).toThrow(
        /skip/i,
      );
    }
  });

  it('keeps the required pending-client read and write denials covered by the F11 test', () => {
    const pendingStorageTest = readFileSync(
      'tests/e2e/client-accounts-storage.spec.ts',
      'utf8',
    );
    expect(pendingStorageTest).toContain(
      'a real pending-client JWT cannot read or write Storage',
    );
    expect(pendingStorageTest).toContain('.download(');
    expect(pendingStorageTest).toContain('.upload(');
    expect(pendingStorageTest).toContain(
      'expect(read.error !== null).toBe(true)',
    );
    expect(pendingStorageTest).toContain(
      'expect(write.error !== null).toBe(true)',
    );
  });
});
