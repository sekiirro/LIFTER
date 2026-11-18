import { describe, expect, it } from 'vitest';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

describe('registration approval message parity and semantics', () => {
  it('has a rejection success message distinct from payment success in both locales', () => {
    const enMessages = en as Record<string, string>;
    const arMessages = ar as Record<string, string>;
    expect(enMessages['registrationApproval.rejectSuccess']).toBeTruthy();
    expect(arMessages['registrationApproval.rejectSuccess']).toBeTruthy();
    expect(enMessages['registrationApproval.rejectSuccess']).not.toBe(
      enMessages['registrationApproval.success'],
    );
    expect(arMessages['registrationApproval.rejectSuccess']).not.toBe(
      arMessages['registrationApproval.success'],
    );
  });
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
  it('has bilingual approved strings for the flexible-terms schedule editor', () => {
    for (const key of [
      'registration.schedule',
      'registration.amount',
      'registration.offset',
      'registration.add',
      'registration.remove',
      'registration.total',
      'registration.sumValid',
      'registration.invalid_input',
      'registration.upfrontAmount',
      'registration.paymentCount',
      'registration.defaultSplit',
      'registration.timingAnchorNote',
    ] as const) {
      expect(ar[key], `Arabic ${key}`).toBeTruthy();
      expect(en[key], `English ${key}`).toBeTruthy();
    }
    expect(en['registration.upfrontAmount']).toBe('Upfront amount');
    expect(ar['registration.upfrontAmount']).toBe('المبلغ اللي هيتدفع مقدمًا');
    expect(en['registration.paymentCount']).toBe('Number of payments');
    expect(ar['registration.paymentCount']).toBe('عدد الأقساط');
    expect(en['registration.defaultSplit']).toBe('Use default split');
    expect(ar['registration.defaultSplit']).toBe(
      'قسّم الباقي بالتقسيمة الافتراضية',
    );
    expect(en['registration.timingAnchorNote']).toBe(
      'The remaining balance is due 30 days after activation (Cairo time).',
    );
    expect(ar['registration.timingAnchorNote']).toBe(
      'الباقي يتدفع بعد ٣٠ يوم من التفعيل (بتوقيت القاهرة).',
    );
  });
  it('provides bilingual standalone client status and refresh messages', () => {
    for (const key of [
      'registrationApproval.statusPending',
      'registrationApproval.statusPendingDetail',
      'registrationApproval.statusApproved',
      'registrationApproval.statusApprovedDetail',
      'registrationApproval.statusRejected',
      'registrationApproval.statusRejectedDetail',
      'registrationApproval.statusRefresh',
      'registrationApproval.statusRefreshing',
      'registrationApproval.statusContinue',
      'registrationApproval.statusBudgetReached',
      'registrationApproval.statusDenied',
      'registrationApproval.statusRedirectFallback',
      'registrationApproval.statusLoading',
    ] as const) {
      expect(ar[key], `Arabic ${key}`).toBeTruthy();
      expect(en[key], `English ${key}`).toBeTruthy();
    }
    expect(en['registrationApproval.statusApprovedDetail']).toMatch(
      /not.*active|does not mean.*active/i,
    );
    expect(en['registrationApproval.statusRejectedDetail']).not.toMatch(
      /reason|contact|support/i,
    );
  });
});
