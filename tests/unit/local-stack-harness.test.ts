import { afterEach, expect, it, vi } from 'vitest';

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
