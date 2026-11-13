import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getSupabaseStatusCommand } from '../../scripts/playwright-stack-command.mjs';

describe('F16 Stack C Playwright launcher', () => {
  it('maps Supabase CLI env aliases and APP_ORIGIN before starting Playwright', () => {
    const launcher = readFileSync(
      'scripts/branding/run-f16-playwright-stack-c.ps1',
      'utf8',
    );
    for (const mapping of [
      'SUPABASE_URL',
      'API_URL',
      'SUPABASE_ANON_KEY',
      'ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SERVICE_ROLE_KEY',
      'SUPABASE_DB_URL',
      'DB_URL',
      'APP_ORIGIN',
      'http://localhost:3437',
      'lifter-s32-f16-lib15',
    ])
      expect(launcher).toContain(mapping);
    expect(launcher).toContain('PLAYWRIGHT_BASE_URL');
    expect(launcher).toContain('npm run e2e');
    const config = readFileSync('playwright.config.ts', 'utf8');
    expect(config).toMatch(/env:\s*\{\s*\.\.\.process\.env/);
    expect(config).toContain('APP_ORIGIN: process.env.APP_ORIGIN');
  });

  it('loads and validates the selected local stack env before webServer setup', () => {
    const config = readFileSync('playwright.config.ts', 'utf8');
    expect(config).toContain('loadSelectedStackEnv');
    expect(config).toContain('getSupabaseStatusCommand(workdir)');
    expect(config).toContain('assertLocalStackTarget');
    expect(config.indexOf('loadPlaywrightStackEnvironment()')).toBeLessThan(
      config.indexOf('webServer:'),
    );
  });

  it('selects a local Supabase status command for the current platform', () => {
    const windows = getSupabaseStatusCommand('C:\\work\\LFTR', 'win32');
    expect(windows).toEqual({
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "& npx supabase status --workdir 'C:\\work\\LFTR' -o env",
      ],
    });

    for (const platform of ['linux', 'darwin']) {
      expect(getSupabaseStatusCommand('/work/LFTR', platform)).toEqual({
        command: 'npx',
        args: ['supabase', 'status', '--workdir', '/work/LFTR', '-o', 'env'],
      });
    }
  });
});
