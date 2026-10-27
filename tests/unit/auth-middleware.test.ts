import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';

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

describe('auth middleware', () => {
  it.each(['/', '/unknown/path?tab=2'])(
    'redirects anonymous %s with path and query',
    async (path) => {
      const response = await middleware(
        new NextRequest(`http://localhost:3000${path}`),
      );
      const destination = new URL(response.headers.get('location')!);
      expect(destination.pathname).toBe('/login');
      expect(destination.searchParams.get('next')).toBe(path);
      expect(response.status).toBe(307);
    },
  );
  it.each([
    '/login',
    '/auth/recovery',
    '/api/health',
    '/showcase',
    '/showcase/shell',
    '/print-sample',
    '/_next/test',
    '/image.svg',
    '/font.woff2',
  ])('permits public %s', async (path) => {
    const response = await middleware(
      new NextRequest(`http://localhost:3000${path}`),
    );
    expect(response.headers.get('location')).toBeNull();
  });
  it('allows a verified identity', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'verified' } },
      error: null,
    });
    expect(
      (await middleware(new NextRequest('http://localhost:3000/'))).headers.get(
        'location',
      ),
    ).toBeNull();
  });
  it('ignores forged identity headers and an unverified user', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'forged' } },
      error: { code: 'invalid' },
    });
    const response = await middleware(
      new NextRequest('http://localhost:3000/', {
        headers: {
          'x-role': 'platform_owner',
          'x-workspace': 'B',
          cookie: 'sb-access-token=forged',
        },
      }),
    );
    expect(response.headers.get('location')).toContain('/login?next=%2F');
  });
  it.each(['env', 'network'])('fails closed on %s failure', async (kind) => {
    if (kind === 'env') vi.stubEnv('APP_ORIGIN', '');
    else mocks.getUser.mockRejectedValue(new Error('network'));
    const response = await middleware(
      new NextRequest('http://localhost:3000/'),
    );
    expect(response.headers.get('location')).toContain('/login?next=%2F');
  });
  it('propagates refreshed cookies to the request and response', async () => {
    const request = new NextRequest('http://localhost:3000/');
    mocks.create.mockImplementation((_url, _key, options) => ({
      auth: {
        getUser: async () => {
          options.cookies.setAll([
            {
              name: 'session',
              value: 'refreshed',
              options: { httpOnly: true },
            },
          ]);
          return { data: { user: { id: 'verified' } }, error: null };
        },
      },
    }));
    const response = await middleware(request);
    expect(request.cookies.get('session')?.value).toBe('refreshed');
    expect(response.cookies.get('session')).toMatchObject({
      value: 'refreshed',
      httpOnly: true,
    });
  });
});
