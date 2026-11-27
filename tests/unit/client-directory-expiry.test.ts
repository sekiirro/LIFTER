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

describe('Client directory expiring/expired filter query parsing (CB-P8-01, FR-008)', () => {
  it('accepts subscription=expiring and maps to expiry filter', () => {
    const query = parseDirectoryQuery({ subscription: 'expiring' });
    expect(query).not.toBeNull();
    expect(query?.subscriptionStatus).toBe('expiring');
    expect(query?.expiry).toBe('expiring');
  });

  it('accepts expiry=expiring and expiry=expired directly', () => {
    const qExpiring = parseDirectoryQuery({ expiry: 'expiring' });
    expect(qExpiring).not.toBeNull();
    expect(qExpiring?.expiry).toBe('expiring');

    const qExpired = parseDirectoryQuery({ expiry: 'expired' });
    expect(qExpired).not.toBeNull();
    expect(qExpired?.expiry).toBe('expired');
  });

  it('rejects invalid expiry filter values (fails closed)', () => {
    expect(parseDirectoryQuery({ expiry: 'overdue' })).toBeNull();
    expect(parseDirectoryQuery({ expiry: 'active' })).toBeNull();
    expect(parseDirectoryQuery({ expiry: 'EXPIRING' })).toBeNull();
    expect(parseDirectoryQuery({ expiry: 'unknown' })).toBeNull();
  });

  it('generates directory RPC arguments and href with expiry filter', () => {
    const query = parseDirectoryQuery({ subscription: 'expiring' })!;
    const args = directoryRpcArgs(wsA, query);
    expect(args).toMatchObject({
      p_workspace_id: wsA,
      p_subscription_status: 'expiring',
      p_expiry: 'expiring',
    });

    const href = directoryHref(wsA, query, 1);
    expect(href).toContain('subscription=expiring');
    expect(href).toContain('expiry=expiring');
  });

  it('parses directory rows with expiring indicators', () => {
    const rowWithExpiryBucket = {
      client_id: clientId,
      name: 'Expiring Client',
      approval_state: 'approved',
      subscription_status: 'active',
      refund_scope: null,
      plans_waiting_for_delivery: 0,
      pending_food_replacements: 0,
      expiry_bucket: 'expiring',
      is_expiring: true,
    };

    const result = parseDirectoryResult(
      { status: 'ok', clients: [rowWithExpiryBucket], has_more: false },
      null,
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.expiryBucket).toBe('expiring');
      expect(result.rows[0]?.isExpiring).toBe(true);
    }
  });

  it('accepts subscription_status="expiring" on rows', () => {
    const rowExpiringStatus = {
      client_id: clientId,
      name: 'Expiring Status Client',
      approval_state: 'approved',
      subscription_status: 'expiring',
      refund_scope: null,
      plans_waiting_for_delivery: 0,
      pending_food_replacements: 0,
    };

    const result = parseDirectoryResult(
      { status: 'ok', clients: [rowExpiringStatus], has_more: false },
      null,
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.subscriptionStatus).toBe('expiring');
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
