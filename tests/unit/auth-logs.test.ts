import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ client: vi.fn(), reset: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.client,
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-test-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-test-key');
  vi.stubEnv('APP_ORIGIN', 'https://app.example.test');
  mocks.client.mockResolvedValue({
    auth: { resetPasswordForEmail: mocks.reset },
  });
  mocks.reset.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('T037 staff reset privacy', () => {
  it('does not log an email, token or link during a reset request', async () => {
    const logs = ['log', 'warn', 'error', 'info', 'debug', 'trace'].map((key) =>
      vi.spyOn(console, key as keyof Console).mockImplementation(() => {}),
    );
    const { requestStaffReset } = await import('../../app/login/actions');
    const form = new FormData();
    form.set('email', 'person@example.test');
    await requestStaffReset(null, form);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it.todo('recovery response includes Referrer-Policy: no-referrer (T045)');
});
