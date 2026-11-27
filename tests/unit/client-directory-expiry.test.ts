import { describe, expect, it } from 'vitest';
import {
  directoryHref,
  directoryRpcArgs,
  parseDirectoryQuery,
  parseDirectoryResult,
} from '../../lib/client-directory/query';
import { getMessages } from '../../lib/i18n';

const wsA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const clientId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('Client directory expiring/expired filter query parsing (CB-P8-01, FR-008, B10)', () => {
  it('canonicalizes both URL aliases to subscriptionStatus (B10)', () => {
    const q1 = parseDirectoryQuery({ subscription: 'expiring' });
    expect(q1).not.toBeNull();
    expect(q1?.subscriptionStatus).toBe('expiring');

    const q2 = parseDirectoryQuery({ expiry: 'expiring' });
    expect(q2).not.toBeNull();
    expect(q2?.subscriptionStatus).toBe('expiring');

    const q3 = parseDirectoryQuery({ subscription: 'expired' });
    expect(q3).not.toBeNull();
    expect(q3?.subscriptionStatus).toBe('expired');

    const q4 = parseDirectoryQuery({ expiry: 'expired' });
    expect(q4).not.toBeNull();
    expect(q4?.subscriptionStatus).toBe('expired');
  });

  it('accepts consistent matching subscription and expiry aliases', () => {
    const qExpiring = parseDirectoryQuery({
      subscription: 'expiring',
      expiry: 'expiring',
    });
    expect(qExpiring).not.toBeNull();
    expect(qExpiring?.subscriptionStatus).toBe('expiring');

    const qExpired = parseDirectoryQuery({
      subscription: 'expired',
      expiry: 'expired',
    });
    expect(qExpired).not.toBeNull();
    expect(qExpired?.subscriptionStatus).toBe('expired');
  });

  it('rejects contradictory combinations between subscription and expiry (B10)', () => {
    // Contradictory: active + expiring
    expect(
      parseDirectoryQuery({ subscription: 'active', expiry: 'expiring' }),
    ).toBeNull();

    // Contradictory: frozen + expiring
    expect(
      parseDirectoryQuery({ subscription: 'frozen', expiry: 'expiring' }),
    ).toBeNull();

    // Contradictory: expiring + expired
    expect(
      parseDirectoryQuery({ subscription: 'expiring', expiry: 'expired' }),
    ).toBeNull();

    // Contradictory: expired + expiring
    expect(
      parseDirectoryQuery({ subscription: 'expired', expiry: 'expiring' }),
    ).toBeNull();

    // Contradictory: active + expired
    expect(
      parseDirectoryQuery({ subscription: 'active', expiry: 'expired' }),
    ).toBeNull();
  });

  it('rejects invalid expiry filter values (fails closed)', () => {
    expect(parseDirectoryQuery({ expiry: 'overdue' })).toBeNull();
    expect(parseDirectoryQuery({ expiry: 'active' })).toBeNull();
    expect(parseDirectoryQuery({ expiry: 'EXPIRING' })).toBeNull();
    expect(parseDirectoryQuery({ expiry: 'unknown' })).toBeNull();
  });

  it('generates directory RPC arguments with p_subscription_status only and no p_expiry (B10)', () => {
    for (const input of [
      { subscription: 'expiring' },
      { expiry: 'expiring' },
      { subscription: 'expiring', expiry: 'expiring' },
    ]) {
      const query = parseDirectoryQuery(input)!;
      const args = directoryRpcArgs(wsA, query);
      expect(args).toMatchObject({
        p_workspace_id: wsA,
        p_subscription_status: 'expiring',
      });
      expect(args).not.toHaveProperty('p_expiry');
    }

    for (const input of [
      { subscription: 'expired' },
      { expiry: 'expired' },
      { subscription: 'expired', expiry: 'expired' },
    ]) {
      const query = parseDirectoryQuery(input)!;
      const args = directoryRpcArgs(wsA, query);
      expect(args).toMatchObject({
        p_workspace_id: wsA,
        p_subscription_status: 'expired',
      });
      expect(args).not.toHaveProperty('p_expiry');
    }

    const query = parseDirectoryQuery({ subscription: 'expiring' })!;
    const href = directoryHref(wsA, query, 1);
    expect(href).toContain('subscription=expiring');
  });

  it('parses directory rows with expiry_bucket for badge derivation (B11)', () => {
    const rowWithExpiryBucket = {
      client_id: clientId,
      name: 'Expiring Client',
      approval_state: 'approved',
      subscription_status: 'active',
      refund_scope: null,
      plans_waiting_for_delivery: 0,
      pending_food_replacements: 0,
      expiry_bucket: 'expiring',
    };

    const result = parseDirectoryResult(
      { status: 'ok', clients: [rowWithExpiryBucket], has_more: false },
      null,
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.expiryBucket).toBe('expiring');
      // Status is the underlying active status
      expect(result.rows[0]?.subscriptionStatus).toBe('active');
    }
  });

  it('parses directory rows with expired bucket', () => {
    const rowWithExpiredBucket = {
      client_id: clientId,
      name: 'Expired Client',
      approval_state: 'approved',
      subscription_status: 'expired',
      refund_scope: null,
      plans_waiting_for_delivery: 0,
      pending_food_replacements: 0,
      expiry_bucket: 'expired',
    };

    const result = parseDirectoryResult(
      { status: 'ok', clients: [rowWithExpiredBucket], has_more: false },
      null,
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.expiryBucket).toBe('expired');
      expect(result.rows[0]?.subscriptionStatus).toBe('expired');
    }
  });
});

describe('Screen 2 approved copy strings (CB-P8-01, S71-PO-9)', () => {
  it('verifies exact approved keys and English copy', () => {
    const en = getMessages('en');
    expect(en['staff.clientDirectory.expiring']).toBe('Expiring');
    expect(en['staff.clientDirectory.subscriptionStatus.expired']).toBe(
      'Expired',
    );
    expect(en['staff.clientDirectory.expiring.empty']).toBe(
      'No clients match this filter',
    );
    expect(en['staff.clientDirectory.expiring.loadError']).toBe(
      "We couldn't load this list. Try again.",
    );
  });

  it('verifies exact approved keys and Egyptian Arabic copy', () => {
    const ar = getMessages('ar');
    expect(ar['staff.clientDirectory.expiring']).toBe('قرب ينتهي');
    expect(ar['staff.clientDirectory.subscriptionStatus.expired']).toBe(
      'منتهي',
    );
    expect(ar['staff.clientDirectory.expiring.empty']).toBe(
      'مفيش عملاء مطابقين للفلتر ده',
    );
    expect(ar['staff.clientDirectory.expiring.loadError']).toBe(
      'مقدرناش نحمل القائمة. حاول تاني.',
    );
  });
});
