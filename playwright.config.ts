import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const isFirstEvaluation = !process.env.U8_SERVER_LOG_RUN_ID;
const serverLogRunId =
  process.env.U8_SERVER_LOG_RUN_ID ??
  (process.env.U8_SERVER_LOG_RUN_ID = randomUUID());
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const serverLogManifestPath = join(
  tmpdir(),
  `lftr-u8-${serverLogRunId}.manifest.json`,
);
const serverLogRawPath = join(tmpdir(), `lftr-u8-${serverLogRunId}.server.log`);
const serverLogSummaryPath = join(
  tmpdir(),
  `lftr-u8-${serverLogRunId}.summary.json`,
);
process.env.U8_SERVER_LOG_MANIFEST_PATH = serverLogManifestPath;
// Test modules read this manifest while Playwright collects tests, before its
// webServer wrapper is guaranteed to have started. The wrapper replaces this
// bootstrap manifest with the same paths once it is running.
if (isFirstEvaluation) {
  writeFileSync(
    serverLogManifestPath,
    JSON.stringify({
      rawPath: serverLogRawPath,
      summaryPath: serverLogSummaryPath,
    }),
    'utf8',
  );
  writeFileSync(serverLogRawPath, '', 'utf8');
  writeFileSync(
    serverLogSummaryPath,
    JSON.stringify({
      totalLines: 0,
      captureStarted: false,
      stdoutLines: 0,
      stderrLines: 0,
      registrationRelatedLines: 0,
      errorLikeLines: 0,
      storedPayload: 'scrubbed counts only',
      rawLogDeleted: false,
    }),
    'utf8',
  );
}
export default defineConfig({
  globalTeardown: './tests/e2e/server-log-global-teardown.ts',
  testDir: './tests/e2e',
  use: {
    baseURL,
  },
  projects: [
    {
      name: 'chromium',
      testMatch: '**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
      testMatch: 'shell.spec.ts',
    },
  ],
  webServer: {
    command:
      'npm run build && node scripts/branding/start-playwright-server.mjs',
    url: new URL('/api/health', baseURL).toString(),
    env: {
      ...process.env,
      PORT: process.env.PORT ?? (new URL(baseURL).port || '3000'),
      LIFTER_SHOWCASE: '1',
      APP_ORIGIN: process.env.APP_ORIGIN ?? new URL(baseURL).origin,
      U8_SERVER_LOG_MANIFEST_PATH: serverLogManifestPath,
      U8_SERVER_LOG_RAW_PATH: serverLogRawPath,
      U8_SERVER_LOG_SUMMARY_PATH: serverLogSummaryPath,
    },
    reuseExistingServer: !process.env.CI,
  },
});
