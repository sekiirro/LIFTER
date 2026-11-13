import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  recordManualDateAdjustment,
  type ManualDateActor,
  type ManualDateRpcClient,
} from '../../lib/subscriptions/manual-date-service';

const workspaceId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const clientId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
const subscriptionId = 'cccccccc-cccc-cccc-cccc-ccccccccccc3';
const requestKey = 'dddddddd-dddd-dddd-dddd-ddddddddddd4';
const receipt = {
  operation_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5',
  workspace_id: workspaceId,
  client_id: clientId,
  subscription_id: subscriptionId,
  new_service_start_date: '2026-09-01',
  new_service_end_exclusive: '2026-12-01',
};
const input = {
  workspaceId,
  clientId,
  subscriptionId,
  newServiceStartDate: '2026-09-01',
  newServiceEndExclusive: '2026-12-01',
  requestKey,
};
const po: ManualDateActor = {
  userId: 'ffffffff-ffff-ffff-ffff-fffffffffff6',
  role: 'platform_owner',
  activeWorkspaceIds: [],
};

function rpc(data: unknown, error: { message: string } | null = null) {
  return {
    rpc: vi.fn(async () => ({ data, error })),
  } satisfies ManualDateRpcClient;
}

describe('manual subscription date adjustment service', () => {
  it('submits a PO date adjustment and returns the safe receipt', async () => {
    const client = rpc({ status: 'ok', receipt });
    await expect(
      recordManualDateAdjustment(input, { actor: po, client }),
    ).resolves.toEqual({ status: 'ok', receipt });
    expect(client.rpc).toHaveBeenCalledWith(
      'record_subscription_date_adjustment',
      {
        request: {
          workspace_id: workspaceId,
          client_id: clientId,
          subscription_id: subscriptionId,
          new_service_start_date: '2026-09-01',
          new_service_end_exclusive: '2026-12-01',
          request_key: requestKey,
        },
      },
    );
  });

  it('canonicalizes UUID casing before the RPC and receipt binding check', async () => {
    const upper = {
      ...input,
      workspaceId: workspaceId.toUpperCase(),
      clientId: clientId.toUpperCase(),
      subscriptionId: subscriptionId.toUpperCase(),
      requestKey: requestKey.toUpperCase(),
    };
    const client = rpc({ status: 'ok', receipt });
    await expect(
      recordManualDateAdjustment(upper, { actor: po, client }),
    ).resolves.toEqual({ status: 'ok', receipt });
    expect(client.rpc).toHaveBeenCalledWith(
      'record_subscription_date_adjustment',
      {
        request: {
          workspace_id: workspaceId,
          client_id: clientId,
          subscription_id: subscriptionId,
          new_service_start_date: '2026-09-01',
          new_service_end_exclusive: '2026-12-01',
          request_key: requestKey,
        },
      },
    );
  });

  it('preserves stale_state when a frozen or deactivated subscription refuses an edit', async () => {
    const client = rpc({ status: 'stale_state' });
    await expect(
      recordManualDateAdjustment(input, { actor: po, client }),
    ).resolves.toEqual({ status: 'stale_state' });
    expect(client.rpc).toHaveBeenCalledOnce();
  });

  it.each([
    { role: 'workspace_owner', name: 'workspace owner' },
    { role: 'trainer', name: 'trainer' },
    { role: 'sales', name: 'sales' },
  ] as const)(
    'keeps $name out of the date-adjustment RPC',
    async ({ role }) => {
      const client = rpc({ status: 'ok', receipt });
      await expect(
        recordManualDateAdjustment(input, {
          actor: { ...po, role },
          client,
        }),
      ).resolves.toEqual({ status: 'not_permitted' });
      expect(client.rpc).not.toHaveBeenCalled();
    },
  );

  it('refuses a missing actor before the RPC', async () => {
    const client = rpc({ status: 'ok', receipt });
    await expect(
      recordManualDateAdjustment(input, { actor: null, client }),
    ).resolves.toEqual({ status: 'not_permitted' });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    {
      patch: { workspaceId: 'not-a-uuid' },
      name: 'rejects a bad workspace id',
    },
    {
      patch: { newServiceStartDate: '2026-13-01' },
      name: 'rejects a non-calendar start date',
    },
    {
      patch: { newServiceEndExclusive: '2026-02-30' },
      name: 'rejects a non-calendar end date',
    },
    {
      patch: {
        newServiceStartDate: '2026-12-01',
        newServiceEndExclusive: '2026-12-01',
      },
      name: 'rejects an end that is not after the start',
    },
    {
      patch: {
        newServiceStartDate: '2026-12-02',
        newServiceEndExclusive: '2026-12-01',
      },
      name: 'rejects an inverted date range',
    },
    { patch: { requestKey: 7 }, name: 'rejects a non-string request key' },
  ])('$name', async ({ patch }) => {
    const client = rpc({ status: 'ok', receipt });
    await expect(
      recordManualDateAdjustment({ ...input, ...patch }, { actor: po, client }),
    ).resolves.toEqual({ status: 'invalid_input' });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('maps a changed-intent replay to conflict', async () => {
    const client = rpc({ status: 'key_conflict' });
    await expect(
      recordManualDateAdjustment(input, { actor: po, client }),
    ).resolves.toEqual({ status: 'conflict' });
  });

  it('rejects a receipt carrying revenue fields', async () => {
    const client = rpc({
      status: 'ok',
      receipt: { ...receipt, amount_minor: '100' },
    });
    await expect(
      recordManualDateAdjustment(input, { actor: po, client }),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('returns unavailable when the RPC fails', async () => {
    const client = rpc(null, { message: 'boom' });
    await expect(
      recordManualDateAdjustment(input, { actor: po, client }),
    ).resolves.toEqual({ status: 'unavailable' });
  });
});
