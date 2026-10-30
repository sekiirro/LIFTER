import { expect, it, vi } from 'vitest';
import { createApprovalRequestKeyStore } from '../../components/registration-approval/approval-request-keys';

it('reuses approval keys for the same submitted date and separates changed dates', () => {
  const generateKey = vi
    .fn<() => string>()
    .mockReturnValueOnce('approval-date-one')
    .mockReturnValueOnce('approval-date-two');
  const requestKey = createApprovalRequestKeyStore(generateKey);

  expect(requestKey('approve', '2026-10-29')).toBe('approval-date-one');
  expect(requestKey('approve', '2026-10-29')).toBe('approval-date-one');
  expect(requestKey('approve', '2026-10-30')).toBe('approval-date-two');
  expect(generateKey).toHaveBeenCalledTimes(2);
});

it('keeps rejection keys independent of payment dates', () => {
  const generateKey = vi.fn<() => string>().mockReturnValue('rejection-key');
  const requestKey = createApprovalRequestKeyStore(generateKey);

  expect(requestKey('reject')).toBe('rejection-key');
  expect(requestKey('reject')).toBe('rejection-key');
  expect(generateKey).toHaveBeenCalledTimes(1);
});
