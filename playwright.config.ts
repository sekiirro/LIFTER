import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const serverLogRunId = randomUUID();
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
    command: 'npm run build && node tests/e2e/start-server-capture.mjs',
    url: new URL('/api/health', baseURL).toString(),
    env: {
      LIFTER_SHOWCASE: '1',
      U8_SERVER_LOG_MANIFEST_PATH: serverLogManifestPath,
      U8_SERVER_LOG_RAW_PATH: serverLogRawPath,
      U8_SERVER_LOG_SUMMARY_PATH: serverLogSummaryPath,
    },
    reuseExistingServer: !process.env.CI,
  },
});
