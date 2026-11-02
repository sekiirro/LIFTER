import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['f18-plan-editor.spec.ts', 'f18-template-manager.spec.ts'],
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3418' },
  workers: 1,
});
