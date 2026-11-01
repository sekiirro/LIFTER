import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  recordRefund,
  type RefundRpcClient,
} from '../../lib/payments/refund-service';

const request = {
  workspaceId: '00000000-0000-0000-0000-000000000001',
  clientId: '00000000-0000-0000-0000-000000000002',
  purchaseId: '00000000-0000-0000-0000-000000000003',
  requestKey: '00000000-0000-0000-0000-000000000004',
  amountMinor: '1250',
  externalConfirmation: true,
};
const actor = {
  userId: 'po-1',
  role: 'platform_owner' as const,
  activeWorkspaceIds: [],
};

describe('refund operation contract', () => {
  it('uses the request-envelope RPC and exposes only the allow-listed receipt', async () => {
    const receipt = {
      operation_id: '00000000-0000-0000-0000-000000000005',
      workspace_id: request.workspaceId,
      client_id: request.clientId,
      purchase_id: request.purchaseId,
      amount_minor: request.amountMinor,
      currency: 'USD',
    };
    const rpc = vi.fn(async () => ({
      data: { status: 'ok', receipt },
      error: null,
    }));
    const client = { rpc } satisfies RefundRpcClient;
    await expect(recordRefund(request, { actor, client })).resolves.toEqual({
      status: 'ok',
      receipt,
    });
    expect(rpc).toHaveBeenCalledWith('record_refund', {
      request: {
        workspace_id: request.workspaceId,
        client_id: request.clientId,
        purchase_id: request.purchaseId,
        request_key: request.requestKey,
        amount_minor: request.amountMinor,
        external_confirmation: true,
      },
    });
    expect(JSON.stringify(receipt)).not.toMatch(
      /commission|email|phone|reference|provider/i,
    );
  });

  it('returns the same replay receipt and hides it after database authorization recheck fails', async () => {
    const receipt = {
      operation_id: '00000000-0000-0000-0000-000000000005',
      workspace_id: request.workspaceId,
      client_id: request.clientId,
      purchase_id: request.purchaseId,
      amount_minor: '1250',
      currency: 'USD',
    };
    const replayClient = {
      rpc: vi.fn(async () => ({
        data: { status: 'ok', receipt },
        error: null,
      })),
    } satisfies RefundRpcClient;
    await expect(
      recordRefund(request, { actor, client: replayClient }),
    ).resolves.toEqual({ status: 'ok', receipt });
    const revokedClient = {
      rpc: vi.fn(async () => ({
        data: { status: 'not_permitted', receipt },
        error: null,
      })),
    } satisfies RefundRpcClient;
    await expect(
      recordRefund(request, { actor, client: revokedClient }),
    ).resolves.toEqual({ status: 'not_permitted' });
  });

  it('maps an altered idempotency binding to conflict without returning stored data', async () => {
    const client = {
      rpc: vi.fn(async () => ({
        data: { status: 'key_conflict', receipt: { secret: 'hidden' } },
        error: null,
      })),
    } satisfies RefundRpcClient;
    await expect(recordRefund(request, { actor, client })).resolves.toEqual({
      status: 'conflict',
    });
  });
});
