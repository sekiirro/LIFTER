import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ client: vi.fn(), reset: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.client,
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-test-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-test-key');
  vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
  mocks.client.mockResolvedValue({
    auth: { resetPasswordForEmail: mocks.reset },
  });
  mocks.reset.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

import nextConfig from '../../next.config';

describe('T037 staff reset privacy', () => {
  it.each([
    ['accepted request', null],
    ['policy refusal', { message: 'policy refused person@example.test' }],
    ['caught audit failure', { message: 'audit failed person@example.test' }],
    ['hook transport timeout', new Error('timeout person@example.test')],
  ])(
    'does not log an email, token or link during a %s',
    async (_label, error) => {
      if (error instanceof Error) mocks.reset.mockRejectedValue(error);
      else mocks.reset.mockResolvedValue({ error });
      const logs = ['log', 'warn', 'error', 'info', 'debug', 'trace'].map(
        (key) =>
          vi.spyOn(console, key as keyof Console).mockImplementation(() => {}),
      );
      const { requestStaffReset } = await import('../../app/login/actions');
      const form = new FormData();
      form.set('email', 'person@example.test');
      await requestStaffReset(null, form);
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    },
  );

  it('T037 recovery response config includes Referrer-Policy: no-referrer', async () => {
    const entries = await nextConfig.headers?.();
    expect(entries).toContainEqual({
      source: '/auth/recovery',
      headers: expect.arrayContaining([
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ]),
    });
  });
});
