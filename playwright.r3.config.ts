import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const root =
  path.basename(process.cwd()) === 'supabase-stack-b'
    ? path.resolve(process.cwd(), '..')
    : process.cwd();
process.chdir(root);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4345';
const port = new URL(baseURL).port || '4345';

export default defineConfig({
  testDir: path.join(root, 'tests/e2e'),
  testMatch: 'glass-r3-authenticated.spec.ts',
  timeout: 900_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: { ...devices['Desktop Chrome'], baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    cwd: root,
    url: new URL('/api/health', baseURL).toString(),
    env: {
      ...process.env,
      PORT: port,
      APP_ORIGIN: process.env.APP_ORIGIN ?? baseURL,
      NEXT_TELEMETRY_DISABLED: '1',
    },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
