import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['./tests/integration/function-drift-guard.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    passWithNoTests: false,
  },
});
