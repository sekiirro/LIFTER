import { describe, expect, it } from 'vitest';
import { buildRefundLedgerBatch } from '../../lib/payments/refund-ledger';

const header = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  workspaceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  subscriptionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  operationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  actorUserId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  amountMinor: '1500',
  currency: 'XTS',
  effectiveOn: '2026-11-03',
  expectedRevision: 2,
} as const;

describe('refund ledger row mapping', () => {
  it('maps one purchase aggregate and partial allocations into append-only deltas', () => {
    const batch = buildRefundLedgerBatch({
      header,
      allocations: [
        {
          obligationId: '11111111-1111-4111-8111-111111111111',
          sourceCollectionEventId: '22222222-2222-4222-8222-222222222222',
          principalMinor: '1000',
          commissionReversalMinor: '2',
        },
        {
          obligationId: '33333333-3333-4333-8333-333333333333',
          sourceCollectionEventId: '44444444-4444-4444-8444-444444444444',
          principalMinor: '500',
          commissionReversalMinor: '1',
        },
      ],
      cancelledObligationIds: ['55555555-5555-4555-8555-555555555555'],
    });

    expect(batch.operation).toMatchObject({
      id: header.id,
      amount_minor: '1500',
      currency: 'XTS',
      expected_revision: 2,
    });
    expect(
      batch.allocations.map(({ amount_minor, commission_minor }) => [
        amount_minor,
        commission_minor,
      ]),
    ).toEqual([
      ['-1000', '-2'],
      ['-500', '-1'],
    ]);
    expect(batch.cancellations).toEqual([
      {
        workspace_id: header.workspaceId,
        subscription_id: header.subscriptionId,
        obligation_id: '55555555-5555-4555-8555-555555555555',
        refund_operation_id: header.id,
        actor_user_id: header.actorUserId,
        effective_on: header.effectiveOn,
      },
    ]);
  });

  it('rejects zero totals, mismatched aggregate sums and duplicate sources', () => {
    const allocation = {
      obligationId: '11111111-1111-4111-8111-111111111111',
      sourceCollectionEventId: '22222222-2222-4222-8222-222222222222',
      principalMinor: '1500',
      commissionReversalMinor: '0',
    } as const;
    expect(() =>
      buildRefundLedgerBatch({
        header: { ...header, amountMinor: '0' },
        allocations: [allocation],
      }),
    ).toThrow(/positive minor units/i);
    expect(() =>
      buildRefundLedgerBatch({
        header,
        allocations: [{ ...allocation, principalMinor: '1499' }],
      }),
    ).toThrow(/equal the refund aggregate/i);
    expect(() =>
      buildRefundLedgerBatch({ header, allocations: [allocation, allocation] }),
    ).toThrow(/each source only once/i);
  });

  it('rejects duplicate cancellation facts and malformed ledger identifiers', () => {
    const allocation = {
      obligationId: '11111111-1111-4111-8111-111111111111',
      sourceCollectionEventId: '22222222-2222-4222-8222-222222222222',
      principalMinor: '1500',
      commissionReversalMinor: '0',
    } as const;
    expect(() =>
      buildRefundLedgerBatch({
        header,
        allocations: [allocation],
        cancelledObligationIds: [
          '33333333-3333-4333-8333-333333333333',
          '33333333-3333-4333-8333-333333333333',
        ],
      }),
    ).toThrow(/cancelled only once/i);
    expect(() =>
      buildRefundLedgerBatch({
        header: { ...header, workspaceId: 'invalid' },
        allocations: [allocation],
      }),
    ).toThrow(/Workspace ID must be a UUID/i);
  });
});
