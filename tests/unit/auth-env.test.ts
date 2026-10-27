import { afterEach, expect, it, vi } from 'vitest';
import { readServerEnv } from '../../lib/supabase/env';

afterEach(() => vi.unstubAllEnvs());
it('requires all four values and secure URLs', () => {
  for (const name of [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'APP_ORIGIN',
  ])
    vi.stubEnv(name, '');
  expect(readServerEnv()).toBeNull();
  vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service');
  vi.stubEnv('APP_ORIGIN', 'https://example.test');
  expect(readServerEnv()).not.toBeNull();
  vi.stubEnv('APP_ORIGIN', 'http://evil');
  expect(readServerEnv()).toBeNull();
  vi.stubEnv('APP_ORIGIN', 'https://example.test');
  vi.stubEnv('SUPABASE_URL', 'http://evil');
  expect(readServerEnv()).toBeNull();
});
