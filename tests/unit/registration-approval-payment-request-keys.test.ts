import { expect, it, vi } from 'vitest';
import { createPaymentRequestKeyStore } from '../../components/registration-approval/payment-request-keys';

it('reuses uncertain collection and correction keys per obligation and operation', () => {
  const generateKey = vi
    .fn<() => string>()
    .mockReturnValueOnce('collection-key')
    .mockReturnValueOnce('correction-key')
    .mockReturnValueOnce('other-collection-key');
  const requestKey = createPaymentRequestKeyStore(generateKey);

  expect(requestKey('collection', 'obligation-a')).toBe('collection-key');
  expect(requestKey('collection', 'obligation-a')).toBe('collection-key');
  expect(requestKey('correction', 'obligation-a')).toBe('correction-key');
  expect(requestKey('collection', 'obligation-b')).toBe('other-collection-key');
  expect(generateKey).toHaveBeenCalledTimes(3);
});
