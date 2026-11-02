import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'f18-plan-editor.spec.ts',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3418' },
  workers: 1,
});
