import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  recordRefund,
  type RefundActor,
  type RefundRpcClient,
} from '../../lib/payments/refund-service';

const workspaceId = '00000000-0000-0000-0000-000000000001';
const clientId = '00000000-0000-0000-0000-000000000002';
const purchaseId = '00000000-0000-0000-0000-000000000003';
const requestKey = '00000000-0000-0000-0000-000000000004';
const receipt = {
  operation_id: '00000000-0000-0000-0000-000000000005',
  workspace_id: workspaceId,
  client_id: clientId,
  purchase_id: purchaseId,
  amount_minor: '1250',
  currency: 'USD',
};
const input = {
  workspaceId,
  clientId,
  purchaseId,
  requestKey,
  amountMinor: '1250',
  externalConfirmation: true,
};
const po: RefundActor = {
  userId: '00000000-0000-0000-0000-000000000006',
  role: 'platform_owner',
  activeWorkspaceIds: [],
};

function rpc(data: unknown, error: { message: string } | null = null) {
  return {
    rpc: vi.fn(async () => ({ data, error })),
  } satisfies RefundRpcClient;
}

describe('refund service', () => {
  it('submits an explicit positive refund for an attested purchase and returns the safe receipt', async () => {
    const client = rpc({ status: 'ok', receipt });
    await expect(recordRefund(input, { actor: po, client })).resolves.toEqual({
      status: 'ok',
      receipt,
    });
    expect(client.rpc).toHaveBeenCalledWith('record_refund', {
      request: {
        workspace_id: workspaceId,
        client_id: clientId,
        purchase_id: purchaseId,
        request_key: requestKey,
        amount_minor: '1250',
        external_confirmation: true,
      },
    });
  });

  it.each([
    { role: 'workspace_owner', name: 'workspace owner' },
    { role: 'trainer', name: 'trainer' },
    { role: 'sales', name: 'sales' },
  ] as const)('keeps $name out of the refund RPC', async ({ role }) => {
    const client = rpc({ status: 'ok', receipt });
    await expect(
      recordRefund(input, { actor: { ...po, role }, client }),
    ).resolves.toEqual({ status: 'not_permitted' });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    {
      candidate: { ...input, purchaseId: undefined },
      caseName: 'requires explicit purchase selection',
    },
    {
      candidate: { ...input, amountMinor: '0' },
      caseName: 'rejects zero',
    },
    {
      candidate: { ...input, amountMinor: '-1' },
      caseName: 'rejects negative amount',
    },
    {
      candidate: { ...input, amountMinor: '1.5' },
      caseName: 'rejects fractional amount',
    },
    {
      candidate: { ...input, externalConfirmation: false },
      caseName: 'requires external confirmation',
    },
  ])('$caseName', async ({ candidate }) => {
    const client = rpc({ status: 'ok', receipt });
    await expect(
      recordRefund(candidate, { actor: po, client }),
    ).resolves.toMatchObject({
      status: 'invalid_input',
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('maps exact replay to the stored safe receipt', async () => {
    const client = rpc({ status: 'ok', receipt });
    await expect(recordRefund(input, { actor: po, client })).resolves.toEqual({
      status: 'ok',
      receipt,
    });
  });

  it('rejects a receipt that does not bind to the requested purchase and amount', async () => {
    const client = rpc({
      status: 'ok',
      receipt: { ...receipt, amount_minor: '1249' },
    });
    await expect(recordRefund(input, { actor: po, client })).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('maps changed request-key binding to a generic conflict', async () => {
    const client = rpc({ status: 'key_conflict' });
    await expect(recordRefund(input, { actor: po, client })).resolves.toEqual({
      status: 'conflict',
    });
  });

  it('authorizes before the RPC can disclose a previous receipt to a revoked actor', async () => {
    const client = rpc({ status: 'ok', receipt });
    await expect(recordRefund(input, { actor: null, client })).resolves.toEqual(
      { status: 'not_permitted' },
    );
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('maps authorization revoked during the database operation without exposing its receipt', async () => {
    const client = rpc({ status: 'not_permitted', receipt });
    await expect(recordRefund(input, { actor: po, client })).resolves.toEqual({
      status: 'not_permitted',
    });
  });

  it('returns generic unauthorized for missing or foreign workspace authorization', async () => {
    const client = rpc({ status: 'ok', receipt });
    const actor = {
      ...po,
      role: 'workspace_owner' as const,
      activeWorkspaceIds: [],
    };
    await expect(recordRefund(input, { actor, client })).resolves.toEqual({
      status: 'not_permitted',
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
