import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { middleware } from '../../middleware';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ create: vi.fn(), getUser: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.create }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('SUPABASE_ANON_KEY', 'fixture-anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service');
  vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
  mocks.create.mockReturnValue({ auth: { getUser: mocks.getUser } });
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

it('T025 sets route-level privacy headers for framework and boundary responses', () => {
  const config = readFileSync('next.config.ts', 'utf8');
  const middlewareSource = readFileSync('middleware.ts', 'utf8');

  expect(config).toContain('async headers()');
  expect(config).toContain("source: '/register/:token'");
  expect(config).toContain("'Referrer-Policy'");
  expect(config).toContain("'Cache-Control'");
  expect(middlewareSource).toContain('registrationPath');
  expect(middlewareSource).toContain('registrationTree');
});

it('T025 applies privacy headers after cookie refresh response recreation', async () => {
  mocks.create.mockImplementation((_url, _key, options) => ({
    auth: {
      getUser: async () => {
        options.cookies.setAll([
          { name: 'session', value: 'refreshed', options: {} },
        ]);
        throw new Error('provider detail');
      },
    },
  }));
  const response = await middleware(
    new NextRequest('http://localhost:3000/register/' + 'x'.repeat(43)),
  );
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});

it('T025 keeps privacy headers when the session environment is missing', async () => {
  vi.stubEnv('APP_ORIGIN', '');
  const response = await middleware(
    new NextRequest('http://localhost:3000/register/' + 'x'.repeat(43)),
  );
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});
