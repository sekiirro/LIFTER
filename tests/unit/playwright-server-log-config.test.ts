import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Playwright server-log config evaluation', () => {
  it('reuses the inherited run manifest without truncating server logs', async () => {
    const envKeys = [
      'U8_SERVER_LOG_RUN_ID',
      'U8_SERVER_LOG_MANIFEST_PATH',
      'U8_SERVER_LOG_RAW_PATH',
      'U8_SERVER_LOG_SUMMARY_PATH',
      'PLAYWRIGHT_BASE_URL',
      'APP_ORIGIN',
    ] as const;
    const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
    let paths: string[] = [];
    const configUrl = new URL('../../playwright.config.ts', import.meta.url);

    try {
      for (const key of envKeys) delete process.env[key];
      configUrl.search = 'first-evaluation';
      await import(configUrl.href);
      const runId = process.env.U8_SERVER_LOG_RUN_ID;
      const manifestPath = process.env.U8_SERVER_LOG_MANIFEST_PATH;
      const manifest = JSON.parse(readFileSync(manifestPath!, 'utf8')) as {
        rawPath: string;
        summaryPath: string;
      };
      paths = [manifestPath!, manifest.rawPath, manifest.summaryPath];
      writeFileSync(manifest.rawPath, 'server output sentinel', 'utf8');
      configUrl.search = 'worker-evaluation';
      await import(configUrl.href);

      expect(process.env.U8_SERVER_LOG_RUN_ID).toBe(runId);
      expect(process.env.U8_SERVER_LOG_MANIFEST_PATH).toBe(manifestPath);
      expect(readFileSync(manifest.rawPath, 'utf8')).toBe(
        'server output sentinel',
      );
    } finally {
      for (const path of paths) rmSync(path, { force: true });
      for (const [key, value] of previousEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
