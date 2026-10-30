import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  hasAcceptedTermsForIntake,
  isTermsPolicyPersistable,
  persistTermsConsent,
} from '../../lib/forms/terms-consent';

afterEach(() => vi.unstubAllEnvs());

it('uses the application production flag to block DRAFT policies server-side', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  expect(isTermsPolicyPersistable('draft')).toBe(false);
  expect(isTermsPolicyPersistable('published')).toBe(true);

  const rpc = vi.fn();
  expect(
    await persistTermsConsent(
      { rpc },
      {
        termsAccepted: true,
        termsPolicyVersion: 'draft-1',
        termsPolicyStatus: 'draft',
        marketingAccepted: false,
      },
    ),
  ).toEqual({ status: 'unavailable' });
  expect(rpc).not.toHaveBeenCalled();
});

it('requires checked Terms, sends separate marketing choice, and never submits a timestamp', async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: {
      status: 'accepted',
      policy_version: 'terms-1',
      accepted_at: '2026-10-30T09:00:00Z',
    },
    error: null,
  });
  const client = { rpc };
  expect(
    await persistTermsConsent(client, {
      termsAccepted: false,
      termsPolicyVersion: 'terms-1',
      termsPolicyStatus: 'published',
      marketingAccepted: false,
    }),
  ).toEqual({ status: 'required' });
  expect(rpc).not.toHaveBeenCalled();

  await expect(
    persistTermsConsent(client, {
      termsAccepted: true,
      termsPolicyVersion: 'terms-1',
      termsPolicyStatus: 'published',
      marketingAccepted: false,
    }),
  ).resolves.toMatchObject({ status: 'accepted' });
  expect(rpc).toHaveBeenLastCalledWith('client_accept_terms', {
    p_terms_policy_version: 'terms-1',
    p_marketing_policy_version: null,
    p_marketing_opt_in: false,
  });
  expect(JSON.stringify(rpc.mock.calls)).not.toContain('timestamp');
});

it('fails closed when the intake completion receipt check is absent or unavailable', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  expect(await hasAcceptedTermsForIntake({ rpc }, '')).toBe(false);
  expect(rpc).not.toHaveBeenCalled();
  expect(await hasAcceptedTermsForIntake({ rpc }, 'terms-1')).toBe(true);
  rpc.mockResolvedValueOnce({
    data: null,
    error: new Error('private db error'),
  });
  expect(await hasAcceptedTermsForIntake({ rpc }, 'terms-1')).toBe(false);
});
