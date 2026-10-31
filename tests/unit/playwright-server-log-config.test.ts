import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('Playwright server-log config evaluation', () => {
  it('reuses the inherited run manifest without truncating server logs', () => {
    const configPath = fileURLToPath(
      new URL('../../playwright.config.ts', import.meta.url),
    );
    const script = `
      import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
      import { pathToFileURL } from 'node:url';
      delete process.env.U8_SERVER_LOG_RUN_ID;
      const config = pathToFileURL(${JSON.stringify(configPath)}).href;
      await import(config + '?first-evaluation');
      const runId = process.env.U8_SERVER_LOG_RUN_ID;
      const manifestPath = process.env.U8_SERVER_LOG_MANIFEST_PATH;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      writeFileSync(manifest.rawPath, 'server output sentinel', 'utf8');
      await import(config + '?worker-evaluation');
      if (process.env.U8_SERVER_LOG_RUN_ID !== runId) throw new Error('run id changed');
      if (process.env.U8_SERVER_LOG_MANIFEST_PATH !== manifestPath) throw new Error('manifest changed');
      if (readFileSync(manifest.rawPath, 'utf8') !== 'server output sentinel') throw new Error('server log truncated');
      for (const path of [manifestPath, manifest.rawPath, manifest.summaryPath]) unlinkSync(path);
    `;

    expect(() =>
      execFileSync(
        process.execPath,
        ['--experimental-strip-types', '--input-type=module', '-e', script],
        { cwd: process.cwd(), stdio: 'pipe' },
      ),
    ).not.toThrow();
  });
});
