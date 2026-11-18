import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../../next.config';
import { requestStaffReset } from '../../app/login/actions';

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  createSessionClient: vi.fn(),
  locale: 'ar' as string | undefined,
}));

vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => (mocks.locale ? { value: mocks.locale } : undefined),
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  mocks.locale = 'ar';
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.stubEnv('APP_ORIGIN', 'http://127.0.0.1:3000');
});

describe('staff reset privacy', () => {
  it('rejects malformed email before contacting Auth', async () => {
    const data = new FormData();
    data.set('email', 'not-an-email');

    await expect(requestStaffReset(null, data)).resolves.toEqual({
      status: 'invalidEmail',
    });
    expect(mocks.createSessionClient).not.toHaveBeenCalled();
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('does not log provider errors containing email, token or link values', async () => {
    mocks.createSessionClient.mockResolvedValue({
      auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
    });
    mocks.resetPasswordForEmail.mockRejectedValue(
      new Error(
        'private@example.test token-secret https://secret.example/reset',
      ),
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const data = new FormData();
    data.set('email', 'private@example.test');

    await expect(requestStaffReset(null, data)).resolves.toEqual({
      status: 'staffResetConfirm',
    });

    expect(log).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it.each([
    ['eligible staff', 'staff@example.test', null],
    ['unknown address', 'unknown@example.test', null],
    ['client address', 'client@example.test', null],
    ['non-permitted staff', 'outside@example.test', null],
    [
      'provider policy refusal',
      'refused@example.test',
      { message: 'Email address not authorized' },
    ],
  ] as const)(
    'returns the same generic confirmation for %s',
    async (_kind, email, providerError) => {
      mocks.createSessionClient.mockResolvedValue({
        auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
      });
      mocks.resetPasswordForEmail.mockResolvedValue({ error: providerError });
      const data = new FormData();
      data.set('email', email);

      await expect(requestStaffReset(null, data)).resolves.toEqual({
        status: 'staffResetConfirm',
      });
    },
  );

  it.each([
    'caught audit failure',
    'unavailable hook transport',
    'hook timeout',
  ])('keeps the generic response for a %s exception', async (failure) => {
    mocks.createSessionClient.mockResolvedValue({
      auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
    });
    mocks.resetPasswordForEmail.mockRejectedValue(new Error(failure));
    const data = new FormData();
    data.set('email', 'staff@example.test');

    await expect(requestStaffReset(null, data)).resolves.toEqual({
      status: 'staffResetConfirm',
    });
  });

  it.each([
    ['saved English preference', 'en', 'en'],
    ['missing preference falls back to Arabic', undefined, 'ar'],
  ] as const)(
    'passes the %s through the approved recovery redirect',
    async (_case, locale, expectedLocale) => {
      mocks.locale = locale;
      mocks.createSessionClient.mockResolvedValue({
        auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
      });
      mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
      const data = new FormData();
      data.set('email', 'staff@example.test');

      await requestStaffReset(null, data);

      expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
        'staff@example.test',
        {
          redirectTo: `http://127.0.0.1:3000/auth/recovery?flow=staff&locale=${expectedLocale}`,
        },
      );
    },
  );

  it('sets no-referrer on the recovery route', async () => {
    const headers = await nextConfig.headers?.();
    const recoveryHeaders = headers?.find(
      ({ source }) => source === '/auth/recovery',
    )?.headers;

    expect(recoveryHeaders).toContainEqual({
      key: 'Referrer-Policy',
      value: 'no-referrer',
    });
  });
});
