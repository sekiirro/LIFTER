import { defineConfig, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertLocalStackTarget,
  getStackConfig,
  loadSelectedStackEnv,
  selectStack,
} from './scripts/local-stack.mjs';

function loadPlaywrightStackEnvironment() {
  if (!process.env.LIFTER_SUPABASE_STACK) return;
  const stack = selectStack();
  loadSelectedStackEnv();

  const required = ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'DB_URL'];
  if (required.some((key) => !process.env[key])) {
    const { workdir } = getStackConfig(stack);
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `& npx supabase status --workdir '${workdir}' -o env`,
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    for (const line of output.split(/\r?\n/)) {
      const separator = line.indexOf('=');
      if (separator < 1) continue;
      const name = line.slice(0, separator).trim();
      const value = line
        .slice(separator + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      if (process.env[name] === undefined) process.env[name] = value;
    }
  }

  const aliases: [string, string][] = [
    ['SUPABASE_URL', 'API_URL'],
    ['SUPABASE_ANON_KEY', 'ANON_KEY'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY'],
    ['SUPABASE_DB_URL', 'DB_URL'],
  ];
  for (const [target, source] of aliases) {
    if (process.env[target] === undefined && process.env[source])
      process.env[target] = process.env[source];
  }
  const apiUrl = process.env.API_URL || process.env.SUPABASE_URL;
  const dbUrl = process.env.DB_URL || process.env.SUPABASE_DB_URL;
  if (!apiUrl || !dbUrl || required.some((key) => !process.env[key]))
    throw new Error('Selected local Supabase stack environment is incomplete.');
  assertLocalStackTarget({ stack, apiUrl, dbUrl });
}

loadPlaywrightStackEnvironment();

const isFirstEvaluation = !process.env.U8_SERVER_LOG_RUN_ID;
const serverLogRunId =
  process.env.U8_SERVER_LOG_RUN_ID ??
  (process.env.U8_SERVER_LOG_RUN_ID = randomUUID());
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const serverLogManifestPath = join(
  tmpdir(),
  `lftr-u8-${serverLogRunId}.manifest.json`,
);
const serverLogRawPath = join(tmpdir(), `lftr-u8-${serverLogRunId}.server.log`);
const serverLogSummaryPath = join(
  tmpdir(),
  `lftr-u8-${serverLogRunId}.summary.json`,
);
process.env.U8_SERVER_LOG_MANIFEST_PATH = serverLogManifestPath;
// Test modules read this manifest while Playwright collects tests, before its
// webServer wrapper is guaranteed to have started. The wrapper replaces this
// bootstrap manifest with the same paths once it is running.
if (isFirstEvaluation) {
  writeFileSync(
    serverLogManifestPath,
    JSON.stringify({
      rawPath: serverLogRawPath,
      summaryPath: serverLogSummaryPath,
    }),
    'utf8',
  );
  writeFileSync(serverLogRawPath, '', 'utf8');
  writeFileSync(
    serverLogSummaryPath,
    JSON.stringify({
      totalLines: 0,
      captureStarted: false,
      stdoutLines: 0,
      stderrLines: 0,
      registrationRelatedLines: 0,
      errorLikeLines: 0,
      storedPayload: 'scrubbed counts only',
      rawLogDeleted: false,
    }),
    'utf8',
  );
}
export default defineConfig({
  globalTeardown: './tests/e2e/server-log-global-teardown.ts',
  testDir: './tests/e2e',
  use: {
    baseURL,
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
    command:
      process.env.PLAYWRIGHT_FIXTURE_ONLY === '1'
        ? 'npm run build && node tests/e2e/start-server-capture.mjs'
        : 'npm run build && node scripts/branding/start-playwright-server.mjs',
    url: new URL('/api/health', baseURL).toString(),
    env: {
      ...process.env,
      PORT: process.env.PORT ?? (new URL(baseURL).port || '3000'),
      LIFTER_SHOWCASE: '1',
      APP_ORIGIN: process.env.APP_ORIGIN ?? new URL(baseURL).origin,
      U8_SERVER_LOG_MANIFEST_PATH: serverLogManifestPath,
      U8_SERVER_LOG_RAW_PATH: serverLogRawPath,
      U8_SERVER_LOG_SUMMARY_PATH: serverLogSummaryPath,
    },
    reuseExistingServer: !process.env.CI,
  },
});
