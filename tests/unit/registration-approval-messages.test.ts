import { describe, expect, it } from 'vitest';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

describe('registration approval message parity and semantics', () => {
  it('has identical Arabic and English message keys with non-empty values', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(ar) as (keyof typeof ar)[]) {
      expect(ar[key].trim(), `Arabic ${key}`).not.toBe('');
      expect(en[key].trim(), `English ${key}`).not.toBe('');
    }
  });
  it('provides dedicated copy for review, safe failures, payment confirmation and correction', () => {
    for (const key of [
      'registrationApproval.title',
      'registrationApproval.unavailable',
      'registrationApproval.confirmPayment',
      'registrationApproval.paymentDate',
      'registrationApproval.correct',
      'registrationApproval.reconsider',
    ] as const) {
      expect(ar[key]).toBeTruthy();
      expect(en[key]).toBeTruthy();
    }
    expect(en['registrationApproval.unavailable']).not.toMatch(
      /stack|database|provider/i,
    );
  });
});
