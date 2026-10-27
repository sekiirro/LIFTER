import { defineConfig, devices } from '@playwright/test';

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
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000/api/health',
    env: { LIFTER_SHOWCASE: '1' },
    reuseExistingServer: !process.env.CI,
  },
});
