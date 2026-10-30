import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseURL = 'http://127.0.0.1:3215';
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: '.',
  testMatch: ['branding-banner-production-gate.spec.ts'],
  outputDir: join(tmpdir(), 'lifter-f14-banner-production-gate-results'),
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
  },
  webServer: {
    command:
      'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3215',
    cwd: process.cwd(),
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      APP_ORIGIN: baseURL,
      LIFTER_SHOWCASE: '1',
      NODE_OPTIONS:
        '--require=./tests/integration/f14-banner/no-env-preload.cjs',
    },
  },
});
