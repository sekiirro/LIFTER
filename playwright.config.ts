import { defineConfig, devices } from '@playwright/test';
import { serverLogSummaryPath } from './tests/e2e/server-log-capture';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:3000',
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
    url: 'http://localhost:3000/api/health',
    env: {
      LIFTER_SHOWCASE: '1',
      U8_SERVER_LOG_SUMMARY_PATH: serverLogSummaryPath,
    },
    reuseExistingServer: !process.env.CI,
  },
});
