import { describe, expect, it, vi } from 'vitest';
import { recordRenewal } from '../../lib/subscriptions/renewal-service';

const ws = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const client = 'abcdefab-cdef-4abc-8def-abcdefabcdee';
const predecessor = 'abcdefab-cdef-4abc-8def-abcdefabcded';
const offer = 'abcdefab-cdef-4abc-8def-abcdefabcdcc';
const key = 'abcdefab-cdef-4abc-8def-abcdefabcdcb';
const request = {
  workspaceId: ws,
  clientId: client,
  predecessorSubscriptionId: predecessor,
  packageOfferId: offer,
  requestKey: key,
  expectedRevision: 0,
  renewalConfirmed: true,
  installments: null,
};
const receipt = {
  operation_id: key,
  renewal_id: 'abcdefab-cdef-4abc-8def-abcdefabcdc8',
  workspace_id: ws,
  client_id: client,
  predecessor_subscription_id: predecessor,
  subscription_id: 'abcdefab-cdef-4abc-8def-abcdefabcdca',
  package_version_id: 'abcdefab-cdef-4abc-8def-abcdefabcdc9',
  price_minor: '30000',
  currency: 'EGP',
  duration_days: 30,
  recording_date: '2026-11-10',
  service_start_date: '2026-11-20',
  service_end_exclusive: '2026-12-20',
};

describe('recordRenewal', () => {
  it('authorizes Trainer renewal confirmation before calling the RPC and returns only the safe snapshot receipt', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'ok', receipt },
      error: null,
    }));
    const result = await recordRenewal(request, {
      actor: { userId: 'trainer-1', role: 'trainer', activeWorkspaceIds: [ws] },
      client: { rpc },
    });

    expect(rpc).toHaveBeenCalledWith('record_renewal', {
      request: {
        workspace_id: ws,
        client_id: client,
        predecessor_subscription_id: predecessor,
        package_offer_id: offer,
        request_key: key,
        expected_revision: 0,
        renewal_confirmed: true,
        installments: null,
      },
    });
    expect(result).toEqual({ status: 'ok', receipt });
  });

  it('normalizes uppercase UUID inputs before RPC and accepts the canonical receipt', async () => {
    const upper = {
      ...request,
      workspaceId: ws.toUpperCase(),
      clientId: client.toUpperCase(),
      predecessorSubscriptionId: predecessor.toUpperCase(),
      packageOfferId: offer.toUpperCase(),
      requestKey: key.toUpperCase(),
    };
    const rpc = vi.fn(async () => ({
      data: { status: 'ok', receipt },
      error: null,
    }));
    const result = await recordRenewal(upper, {
      actor: { userId: 'trainer-1', role: 'trainer', activeWorkspaceIds: [ws] },
      client: { rpc },
    });
    expect(rpc).toHaveBeenCalledWith(
      'record_renewal',
      expect.objectContaining({
        request: expect.objectContaining({
          workspace_id: ws,
          client_id: client,
          predecessor_subscription_id: predecessor,
          package_offer_id: offer,
          request_key: key,
        }),
      }),
    );
    expect(result).toEqual({ status: 'ok', receipt });
  });

  it('returns an exact replay receipt stored before renewal_id was added', async () => {
    const legacyReceipt = Object.fromEntries(
      Object.entries(receipt).filter(([field]) => field !== 'renewal_id'),
    );
    const rpc = vi.fn(async () => ({
      data: { status: 'ok', receipt: legacyReceipt },
      error: null,
    }));
    const result = await recordRenewal(request, {
      actor: { userId: 'trainer-1', role: 'trainer', activeWorkspaceIds: [ws] },
      client: { rpc },
    });

    expect(result).toEqual({ status: 'ok', receipt: legacyReceipt });
  });

  it('denies actors outside the authorized workspace before RPC disclosure', async () => {
    const rpc = vi.fn();
    const result = await recordRenewal(request, {
      actor: { userId: 'trainer-1', role: 'trainer', activeWorkspaceIds: [] },
      client: { rpc },
    });
    expect(result).toEqual({ status: 'not_permitted' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('keeps schedule configuration within the existing configure capability', async () => {
    const rpc = vi.fn();
    const installments = [
      { amountMinor: '10000', dueOffsetDays: 0 },
      { amountMinor: '20000', dueOffsetDays: 30 },
    ];
    expect(
      await recordRenewal(
        { ...request, installments },
        {
          actor: {
            userId: 'trainer-1',
            role: 'trainer',
            activeWorkspaceIds: [ws],
          },
          client: { rpc },
        },
      ),
    ).toEqual({ status: 'not_permitted' });
    expect(rpc).not.toHaveBeenCalled();
    expect(
      await recordRenewal(
        { ...request, installments },
        {
          actor: {
            userId: 'po-1',
            role: 'platform_owner',
            activeWorkspaceIds: [],
          },
          client: {
            rpc: vi.fn(async () => ({
              data: { status: 'ok', receipt },
              error: null,
            })),
          },
        },
      ),
    ).toMatchObject({ status: 'ok' });
  });

  it('rejects malformed input and false confirmation before RPC', async () => {
    const rpc = vi.fn();
    const deps = {
      actor: {
        userId: 'po-1',
        role: 'platform_owner' as const,
        activeWorkspaceIds: [],
      },
      client: { rpc },
    };
    expect(
      await recordRenewal({ ...request, expectedRevision: -1 }, deps),
    ).toEqual({ status: 'invalid_input' });
    expect(
      await recordRenewal({ ...request, renewalConfirmed: false }, deps),
    ).toEqual({ status: 'invalid_input' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not return a receipt that disagrees with the requested client, purchase or recording dates', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'ok', receipt: { ...receipt, client_id: predecessor } },
      error: null,
    }));
    const result = await recordRenewal(request, {
      actor: { userId: 'po-1', role: 'platform_owner', activeWorkspaceIds: [] },
      client: { rpc },
    });
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('rejects a successful renewal receipt with a malformed renewal id', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'ok', receipt: { ...receipt, renewal_id: 'invalid' } },
      error: null,
    }));
    const result = await recordRenewal(request, {
      actor: { userId: 'po-1', role: 'platform_owner', activeWorkspaceIds: [] },
      client: { rpc },
    });
    expect(result).toEqual({ status: 'unavailable' });
  });
});
