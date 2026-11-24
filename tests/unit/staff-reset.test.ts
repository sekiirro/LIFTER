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
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-test-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-test-key');
  vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
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

  it('keeps valid recovery requests generic without contacting hosted Auth', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('APP_ORIGIN', 'https://app.example.test');
    const { requestStaffReset } = await import('../../app/login/actions');
    const form = new FormData();
    form.set('email', 'person@example.test');
    expect(await requestStaffReset(null, form)).toEqual({ status: 'ok' });
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('allows only HTTP loopback URLs for local staff recovery', async () => {
    const { isLocalStaffResetEnvironment } =
      await import('../../lib/auth/staff-reset');
    expect(
      isLocalStaffResetEnvironment(
        'http://127.0.0.1:54321',
        'http://localhost:3000',
      ),
    ).toBe(true);
    expect(
      isLocalStaffResetEnvironment(
        'https://supabase.example.test',
        'https://app.example.test',
      ),
    ).toBe(false);
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
      const startedAt = performance.now();
      const result = await requestStaffReset(null, form);
      const elapsed = performance.now() - startedAt;
      expect(result).toEqual({ status: 'ok' });
      expect(elapsed).toBeGreaterThanOrEqual(500);
      expect(JSON.stringify(result)).not.toMatch(
        /private@example|token secret|timeout/i,
      );
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
        'person@example.test',
        { redirectTo: 'http://localhost:3000/auth/recovery' },
      );
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    },
  );

  it('T035 records 30 interleaved response-floor samples for each request class', async () => {
    const { requestStaffReset } = await import('../../app/login/actions');
    const labels = [
      'eligible-permitted',
      'unknown',
      'client',
      'policy-refused',
      'audit-failure',
      'hook-unavailable',
      'timeout',
    ] as const;
    const samples = new Map<(typeof labels)[number], number[]>();
    for (const label of labels) samples.set(label, []);
    const form = new FormData();
    form.set('email', 'person@example.test');

    for (let iteration = 0; iteration < 30; iteration += 1) {
      for (const label of labels) {
        if (label === 'policy-refused')
          mocks.resetPasswordForEmail.mockResolvedValue({
            error: { message: 'policy refused' },
          });
        else if (label === 'audit-failure')
          mocks.resetPasswordForEmail.mockResolvedValue({
            error: { message: 'audit failed' },
          });
        else if (label === 'hook-unavailable')
          mocks.resetPasswordForEmail.mockResolvedValue({
            error: { message: 'hook unavailable' },
          });
        else if (label === 'timeout')
          mocks.resetPasswordForEmail.mockRejectedValue(new Error('timeout'));
        else mocks.resetPasswordForEmail.mockResolvedValue({ error: null });

        const startedAt = performance.now();
        expect(await requestStaffReset(null, form)).toEqual({ status: 'ok' });
        samples.get(label)!.push(performance.now() - startedAt);
      }
    }

    const median = (values: number[]) => {
      const sorted = [...values].sort((left, right) => left - right);
      return sorted[Math.floor(sorted.length / 2)]!;
    };
    const reference = median(samples.get('eligible-permitted')!);
    process.stdout.write(
      `T035 timing samples ms: ${JSON.stringify(
        Object.fromEntries(
          labels.map((label) => [
            label,
            {
              n: samples.get(label)!.length,
              median: Number(median(samples.get(label)!).toFixed(1)),
            },
          ]),
        ),
      )}\n`,
    );
    for (const label of labels) {
      const values = samples.get(label)!;
      expect(values).toHaveLength(30);
      expect(Math.abs(median(values) - reference)).toBeLessThanOrEqual(100);
    }
  }, 180_000);

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

  it('T042 matches approved copy-proposal auth rows and the five FR-031 bytes', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const copy = readFileSync(
      resolve(process.cwd(), 'specs/004-auth/copy-proposal.md'),
      'utf8',
    );
    const rows = copy
      .split(/\r?\n/)
      .map((line) => line.match(/^\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .flatMap((match) => {
        const key = match[1]!.match(/`(auth\.[^`]+)`/)?.[1];
        return key ? [[key, match[2]!.trim(), match[3]!.trim()] as const] : [];
      });
    expect(rows.length).toBeGreaterThan(0);
    for (const [key, english, arabic] of rows) {
      expect(en[key as keyof typeof en]).toBe(english);
      expect(ar[key as keyof typeof ar]).toBe(arabic);
    }
    expect(en['auth.newPassword']).toBe('New password');
    expect(ar['auth.newPassword']).toBe('كلمة السر الجديدة');
    expect(en['auth.confirmPassword']).toBe('Confirm password');
    expect(ar['auth.confirmPassword']).toBe('تأكيد كلمة السر');
    expect(en['auth.setPassword']).toBe('Set password');
    expect(ar['auth.setPassword']).toBe('حفظ كلمة السر');
    expect(en['auth.weak_password']).toBe('Choose a stronger password.');
    expect(ar['auth.weak_password']).toBe('اختر كلمة سر أقوى.');
    expect(en['auth.mismatch']).toBe('The passwords do not match.');
    expect(ar['auth.mismatch']).toBe('كلمتا السر غير متطابقتين.');
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
