import { describe, expect, it, vi } from 'vitest';
import { recordRenewal } from '../../lib/subscriptions/renewal-service';

const ws = '00000000-0000-4000-8000-000000000001';
const client = '00000000-0000-4000-8000-000000000002';
const predecessor = '00000000-0000-4000-8000-000000000003';
const offer = '00000000-0000-4000-8000-000000000004';
const key = '00000000-0000-4000-8000-000000000005';
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
  workspace_id: ws,
  client_id: client,
  predecessor_subscription_id: predecessor,
  subscription_id: '00000000-0000-4000-8000-000000000006',
  package_version_id: '00000000-0000-4000-8000-000000000007',
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
});
