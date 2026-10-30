import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseURL = 'http://127.0.0.1:3214';
process.env.PLAYWRIGHT_BASE_URL = baseURL;
export default defineConfig({
  testDir: '.',
  testMatch: ['branding-banner-blend.spec.ts', 'branding-editor.spec.ts'],
  fullyParallel: false,
  workers: 1,
  outputDir: join(tmpdir(), 'lifter-f14-banner-blend-playwright-results'),
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
  },
  webServer: {
    command:
      'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3214',
    cwd: process.cwd(),
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      APP_ORIGIN: baseURL,
      LIFTER_SHOWCASE: '1',
      NEXT_TELEMETRY_DISABLED: '1',
      NODE_OPTIONS:
        '--require=./tests/integration/f14-banner/no-env-preload.cjs',
    },
  },
});
