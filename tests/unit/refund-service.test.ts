import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  recordRefund,
  type RefundActor,
  type RefundRpcClient,
} from '../../lib/payments/refund-service';

const workspaceId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const clientId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
const purchaseId = 'cccccccc-cccc-cccc-cccc-ccccccccccc3';
const requestKey = 'dddddddd-dddd-dddd-dddd-ddddddddddd4';
const receipt = {
  operation_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5',
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
  userId: 'ffffffff-ffff-ffff-ffff-fffffffffff6',
  role: 'platform_owner',
  activeWorkspaceIds: [],
};

function rpc(data: unknown, error: { message: string } | null = null) {
  return {
    rpc: vi.fn(async () => ({ data, error })),
  } satisfies RefundRpcClient;
}

describe('refund service', () => {
  it('canonicalizes UUID casing before the RPC and receipt binding check', async () => {
    const upper = {
      ...input,
      workspaceId: workspaceId.toUpperCase(),
      clientId: clientId.toUpperCase(),
      purchaseId: purchaseId.toUpperCase(),
      requestKey: requestKey.toUpperCase(),
    };
    const client = rpc({ status: 'ok', receipt });
    await expect(recordRefund(upper, { actor: po, client })).resolves.toEqual({
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

  it('forwards an optional expected revision to the refund RPC', async () => {
    const client = rpc({ status: 'ok', receipt });
    await expect(
      recordRefund({ ...input, expectedRevision: 7 }, { actor: po, client }),
    ).resolves.toMatchObject({ status: 'ok' });
    expect(client.rpc).toHaveBeenCalledWith('record_refund', {
      request: {
        workspace_id: workspaceId,
        client_id: clientId,
        purchase_id: purchaseId,
        request_key: requestKey,
        amount_minor: '1250',
        external_confirmation: true,
        expected_revision: 7,
      },
    });
  });

  it.each([
    { expectedRevision: null, caseName: 'rejects null' },
    { expectedRevision: -1, caseName: 'rejects negative revisions' },
    { expectedRevision: 1.5, caseName: 'rejects fractional revisions' },
    {
      expectedRevision: 1_000_000_000,
      caseName: 'rejects revisions above SQL range',
    },
    { expectedRevision: '1', caseName: 'rejects string revisions' },
    { expectedRevision: Number.NaN, caseName: 'rejects non-finite revisions' },
  ])('$caseName for expected revision', async ({ expectedRevision }) => {
    const client = rpc({ status: 'ok', receipt });
    await expect(
      recordRefund({ ...input, expectedRevision }, { actor: po, client }),
    ).resolves.toMatchObject({ status: 'invalid_input' });
    expect(client.rpc).not.toHaveBeenCalled();
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

  it('preserves stale preview status for the caller', async () => {
    const client = rpc({ status: 'stale_state' });
    await expect(recordRefund(input, { actor: po, client })).resolves.toEqual({
      status: 'stale_state',
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
