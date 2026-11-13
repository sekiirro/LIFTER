import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('rejects mismatched API and database endpoints for the selected stack', async () => {
  vi.stubEnv('LIFTER_SUPABASE_STACK', 'd');
  vi.stubEnv('API_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('ANON_KEY', 'test-anon-key');
  vi.stubEnv('SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.stubEnv('DB_URL', 'postgres://test:test@127.0.0.1:54322/postgres');

  await expect(import('../integration/harness')).rejects.toThrow(
    'Local Supabase target required',
  );
});

it('accepts only loopback endpoints matching the selected stack', async () => {
  vi.stubEnv('LIFTER_SUPABASE_STACK', 'd');
  vi.stubEnv('API_URL', 'http://127.0.0.1:45421');
  vi.stubEnv('ANON_KEY', 'test-anon-key');
  vi.stubEnv('SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.stubEnv('DB_URL', 'postgres://test:test@127.0.0.1:45422/postgres');

  const harness = await import('../integration/harness');
  expect(harness.loadEnv().apiUrl).toBe('http://127.0.0.1:45421');
});

it('routes F15 integration SQL through the checked local-stack harness', () => {
  const files = [
    'forms-builder-mutations.test.ts',
    'forms-builder-persistence.test.ts',
    'forms-r3-core.test.ts',
    'forms-r3-reader.test.ts',
  ];
  for (const file of files) {
    const source = readFileSync(
      new URL(`../integration/${file}`, import.meta.url),
      'utf8',
    );
    expect(source).toMatch(
      /import\s+\{[^}]*\bsql\b[^}]*\}\s+from\s+'\.\/harness'/u,
    );
    expect(source).not.toContain('postgres(process.env.DB_URL');
  }
});

it('runs pending-client RLS probes in the fixture transaction and checks the seeded client', () => {
  const fixture = readFileSync(
    new URL('../integration/client-accounts-fixture.ts', import.meta.url),
    'utf8',
  );
  const catalog = readFileSync(
    new URL('../integration/client-accounts-catalog.test.ts', import.meta.url),
    'utf8',
  );
  expect(fixture).toContain('seededClientId');
  expect(fixture).toContain('tx.savepoint');
  expect(fixture).not.toContain('const tableDb = sql()');
  expect(catalog).toMatch(
    /pendingRlsAccess\(\s*tx,\s*context,\s*\{[^}]+\},\s*c\.id,/su,
  );
});
