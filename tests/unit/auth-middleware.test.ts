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
  it.each([
    '/register/bogus',
    '/register/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '/register/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/',
  ])(
    'F10 public exact segment has privacy headers on refreshed/error responses',
    async (path) => {
      mocks.create.mockImplementation((_u, _k, options) => ({
        auth: {
          getUser: async () => {
            options.cookies.setAll([
              { name: 'session', value: 'refreshed', options: {} },
            ]);
            throw new Error('network');
          },
        },
      }));
      const r = await middleware(
        new NextRequest('http://localhost:3000' + path),
      );
      expect(r.headers.get('location')).toBeNull();
      expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(r.headers.get('Cache-Control')).toBe('no-store');
      vi.stubEnv('APP_ORIGIN', '');
      const noEnv = await middleware(
        new NextRequest('http://localhost:3000' + path),
      );
      expect(noEnv.headers.get('location')).toBeNull();
      expect(noEnv.headers.get('Referrer-Policy')).toBe('no-referrer');
    },
  );
  it.each([
    '/register',
    '/register/a/b',
    '/register/a/b.svg',
    '/register-prefix/a.svg',
    '/register-prefix/a',
  ])('F10 retains protected %s with privacy headers', async (path) => {
    const r = await middleware(new NextRequest('http://localhost:3000' + path));
    expect(r.status).toBe(307);
    expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });
  it.each([
    '/register',
    '/register/',
    '/register/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa//',
    '/register/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/extra',
    '/register/a/b?next=%2Fregister%2Ftoken',
    '/register-prefix/a',
  ])('never echoes register paths or tokens into login next', async (path) => {
    const response = await middleware(
      new NextRequest('http://localhost:3000' + path),
    );
    const destination = new URL(response.headers.get('location')!);
    expect(response.status).toBe(307);
    expect(destination.pathname.replace(/\/$/, '')).toBe('/login');
    expect(destination.search).toBe('');
  });
  it.each(['GET', 'POST'])(
    'keeps the exact single-segment signup route public for %s with privacy headers',
    async (method) => {
      const response = await middleware(
        new NextRequest('http://localhost:3000/register/' + 'a'.repeat(43), {
          method,
        }),
      );
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    },
  );
  it.each(['/register-prefix/a', '/register/a/nested'])(
    'denied lookalike or nested %s gets privacy headers without token redirects',
    async (path) => {
      const response = await middleware(
        new NextRequest('http://localhost:3000' + path),
      );
      expect(response.status).toBe(307);
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const destination = new URL(response.headers.get('location')!);
      expect(destination.pathname).toBe('/login');
      expect(destination.search).toBe('');
    },
  );
  it('keeps next for non-register staff paths', async () => {
    const response = await middleware(
      new NextRequest(
        'http://localhost:3000/registration-links?workspace=fixture',
      ),
    );
    const destination = new URL(response.headers.get('location')!);
    expect(destination.pathname).toBe('/login');
    expect(destination.searchParams.get('next')).toBe(
      '/registration-links?workspace=fixture',
    );
  });
  it('does not copy a register-prefix lookalike into next', async () => {
    const response = await middleware(
      new NextRequest('http://localhost:3000/register-prefix/a'),
    );
    const destination = new URL(response.headers.get('location')!);
    expect(destination.pathname).toBe('/login');
    expect(destination.search).toBe('');
  });
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
  it.each([
    `/api/branding/${'a'.repeat(43)}/logo?handle=${'b'.repeat(43)}`,
    `/api/branding/${'a'.repeat(43)}/banner?handle=${'b'.repeat(43)}`,
  ])(
    'permits only the image proxy route %s with privacy headers',
    async (path) => {
      const response = await middleware(
        new NextRequest(`http://localhost:3000${path}`),
      );
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    },
  );
  it('does not put malformed branding proxy tokens into login redirects', async () => {
    const response = await middleware(
      new NextRequest(
        `http://localhost:3000/api/branding/${'a'.repeat(43)}/logo/extra`,
      ),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(new URL(response.headers.get('location')!).search).toBe('');
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
