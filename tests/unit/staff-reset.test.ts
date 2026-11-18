import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffResetStatus } from '../../app/login/StaffResetRequestForm';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.client,
}));

const generic = {
  en: "If an account exists for this email address, you'll receive password reset instructions.",
  ar: 'لو الإيميل ده مسجّل عندنا، هتوصلك رسالة فيها لينك تغيير كلمة السر.',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-test-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-test-key');
  vi.stubEnv('APP_ORIGIN', 'https://app.example.test');
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  mocks.client.mockResolvedValue({
    auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('staff password reset request', () => {
  it('T034 eligibility covers the approved staff roles and excludes clients/unknown identities', async () => {
    const { isEligibleStaffRole } = await import('../../lib/auth/staff-reset');
    expect(
      ['platform_owner', 'workspace_owner', 'trainer', 'sales'].every(
        isEligibleStaffRole,
      ),
    ).toBe(true);
    expect(
      [null, 'client', 'unknown'].every((role) => !isEligibleStaffRole(role)),
    ).toBe(true);
  });

  it('rejects malformed email before calling the Auth reset route', async () => {
    const { requestStaffReset } = await import('../../app/login/actions');
    const form = new FormData();
    form.set('email', 'not-an-email');
    expect(await requestStaffReset(null, form)).toEqual({
      status: 'invalidEmail',
    });
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it.each([
    ['eligible', null],
    ['unknown', null],
    ['client', null],
    ['non-permitted', { message: 'policy refused private@example.test' }],
    ['audit failure', { message: 'audit email private@example.test' }],
    ['hook unavailable', { message: 'hook token secret' }],
    ['timeout', new Error('timeout private@example.test')],
  ])(
    'T035 %s maps to the generic confirmation and does not leak provider text',
    async (_label, error) => {
      const { requestStaffReset } = await import('../../app/login/actions');
      if (error instanceof Error)
        mocks.resetPasswordForEmail.mockRejectedValue(error);
      else mocks.resetPasswordForEmail.mockResolvedValue({ error });
      const form = new FormData();
      form.set('email', 'person@example.test');
      const result = await requestStaffReset(null, form);
      expect(result).toEqual({ status: 'ok' });
      expect(JSON.stringify(result)).not.toMatch(
        /private@example|token secret|timeout/i,
      );
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
        'person@example.test',
        { redirectTo: 'https://app.example.test/auth/recovery' },
      );
    },
  );

  it.todo('T035 timing parity: AT-2 method/tolerance pending (S66-R9)');

  it('T036 builds redirectTo from APP_ORIGIN and refuses a non-secure public origin', async () => {
    const { buildStaffResetRedirectTo } =
      await import('../../lib/auth/staff-reset');
    expect(buildStaffResetRedirectTo('https://app.example.test')).toBe(
      'https://app.example.test/auth/recovery',
    );
    expect(() => buildStaffResetRedirectTo('http://evil.test')).toThrow();
  });

  it('T042 has both locale copies for the new request-page keys', () => {
    for (const key of [
      'auth.staffResetTitle',
      'auth.staffResetHelp',
      'auth.requestReset',
      'auth.sendingReset',
      'auth.staffResetConfirm',
      'auth.invalidEmail',
    ]) {
      expect(en[key as keyof typeof en]).toBeTruthy();
      expect(ar[key as keyof typeof ar]).toBeTruthy();
    }
  });

  it('T042b preserves approved reset copy bytes and rendered request confirmation', () => {
    expect(en['auth.staffResetConfirm']).toBe(generic.en);
    expect(ar['auth.staffResetConfirm']).toBe(generic.ar);
    expect(en['auth.staffInvalidLink']).toBe(
      'This password reset link is invalid or has expired. Request a new link to continue.',
    );
    expect(ar['auth.staffInvalidLink']).toBe(
      'اللينك ده مش شغال أو صلاحيته انتهت. اطلب لينك جديد عشان تقدر تغيّر كلمة السر.',
    );
    expect(
      renderToStaticMarkup(
        createElement(StaffResetStatus, { status: 'ok', messages: en }),
      ),
    ).toContain(generic.en.replace("'", '&#x27;'));
    expect(
      renderToStaticMarkup(
        createElement(StaffResetStatus, { status: 'ok', messages: ar }),
      ),
    ).toContain(generic.ar);
  });
});
