import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
});
