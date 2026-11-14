import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SUBSCRIPTION_STATUSES,
  projectClientPortalOverview,
  subscriptionStatusLabelKey,
} from '../../lib/client-access/portal-projection';
import { getMessages } from '../../lib/i18n';

// S57-PO-12 (2026-11-15): approved F22 subscription status copy; "Refunded"
// is shown "only if fully refunded".
const approved = {
  awaiting_activation: ['Awaiting Activation', 'اشتراكك لسه ما اتفعّلش'],
  future: ['Future', 'اشتراكك لسه ما بدأش'],
  active: ['Active', 'اشتراكك شغّال'],
  frozen: ['Frozen', 'اشتراكك متوقف مؤقتًا'],
  expired: ['Expired', 'اشتراكك انتهى'],
  refunded: ['Refunded', 'فلوس الاشتراك اترجعت'],
} as const;

describe('F22 subscription status labels (T016/T035; S57-PO-12)', () => {
  it('maps every F13 state to the exact approved EN and AR copy', () => {
    const en = getMessages('en');
    const ar = getMessages('ar');
    for (const status of SUBSCRIPTION_STATUSES) {
      const key = subscriptionStatusLabelKey({ status, refundScope: 'full' });
      expect(key, status).not.toBeNull();
      expect(en[key!], status).toBe(approved[status][0]);
      expect(ar[key!], status).toBe(approved[status][1]);
    }
  });

  it('shows Refunded only for a full refund', () => {
    expect(
      subscriptionStatusLabelKey({ status: 'refunded', refundScope: 'full' }),
    ).toBe('client.portal.subscriptionStatus.refunded');
    expect(
      subscriptionStatusLabelKey({
        status: 'refunded',
        refundScope: 'partial',
      }),
    ).toBeNull();
    expect(subscriptionStatusLabelKey({ status: 'refunded' })).toBeNull();
  });

  it('never upgrades an unknown refund scope to full', () => {
    for (const scope of [undefined, null, 'FULL', 1]) {
      const result = projectClientPortalOverview({
        status: 'restricted',
        subscription: {
          status: 'refunded',
          effective_end_exclusive: null,
          refund_scope: scope,
        },
      });
      expect(result, String(scope)).toEqual({
        status: 'restricted',
        subscription: {
          status: 'refunded',
          effectiveEndExclusive: null,
          refundScope: 'partial',
        },
      });
    }
  });

  it('rejects a refund scope on a non-refunded state', () => {
    expect(
      projectClientPortalOverview({
        status: 'restricted',
        subscription: {
          status: 'expired',
          effective_end_exclusive: '2026-11-01',
          refund_scope: 'full',
        },
      }),
    ).toEqual({ status: 'denied' });
  });

  it('records the approved strings in the spec copy proposal', () => {
    const proposal = readFileSync(
      'specs/022-client-portal-delivery/copy-proposal.md',
      'utf8',
    );
    for (const [, [enText, arText]] of Object.entries(approved)) {
      expect(proposal).toContain(enText);
      expect(proposal).toContain(arText);
    }
  });
});
