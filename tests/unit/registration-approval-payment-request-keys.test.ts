import { expect, it, vi } from 'vitest';
import {
  collectionPaymentStateKey,
  createPaymentRequestKeyStore,
} from '../../components/registration-approval/payment-request-keys';

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

it('creates a fresh key when a payment obligation advances to a new state', () => {
  const generateKey = vi
    .fn<() => string>()
    .mockReturnValueOnce('first-collection')
    .mockReturnValueOnce('corrected-collection');
  const requestKey = createPaymentRequestKeyStore(generateKey);

  expect(requestKey('collection', 'obligation-a', 'revision-1')).toBe(
    'first-collection',
  );
  expect(requestKey('collection', 'obligation-a', 'revision-1')).toBe(
    'first-collection',
  );
  expect(requestKey('collection', 'obligation-a', 'revision-3')).toBe(
    'corrected-collection',
  );
  expect(generateKey).toHaveBeenCalledTimes(2);
});

it('includes the submitted collection date in payment request state', () => {
  expect(collectionPaymentStateKey(2, 'event-a', '2026-10-29')).toBe(
    '2:event-a:2026-10-29',
  );
  expect(collectionPaymentStateKey(2, 'event-a', '2026-10-29')).not.toBe(
    collectionPaymentStateKey(2, 'event-a', '2026-10-30'),
  );
});
