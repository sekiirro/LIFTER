import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const serverLogRunId = randomUUID();
const serverLogRawPath = join(tmpdir(), `lftr-u8-${serverLogRunId}.server.log`);
const serverLogSummaryPath = join(
  tmpdir(),
  `lftr-u8-${serverLogRunId}.summary.json`,
);
const e2ePort = process.env.LIFTER_E2E_PORT ?? '3000';
export default defineConfig({
  globalTeardown: './tests/e2e/server-log-global-teardown.ts',
  testDir: './tests/e2e',
  use: {
    baseURL: `http://localhost:${e2ePort}`,
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
    url: `http://localhost:${e2ePort}/api/health`,
    env: {
      LIFTER_SHOWCASE: '1',
      PORT: e2ePort,
      U8_SERVER_LOG_RAW_PATH: serverLogRawPath,
      U8_SERVER_LOG_SUMMARY_PATH: serverLogSummaryPath,
    },
    reuseExistingServer: !process.env.CI,
  },
});
