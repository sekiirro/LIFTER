import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3216);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: '.',
  testMatch: ['f14-hero-prototype.spec.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  outputDir: join(tmpdir(), 'lifter-f14-hero-prototype-results'),
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
  },
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port ${port}`,
    cwd: process.cwd(),
    url: `${baseURL}/api/health`,
    reuseExistingServer: true,
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
