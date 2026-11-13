import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createSessionClient, loadActorRows } = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
  loadActorRows: vi.fn(),
}));

vi.mock('../../lib/supabase/server', () => ({ createSessionClient }));
vi.mock('../../lib/auth/actor', () => ({ loadActorRows }));
vi.mock('server-only', () => ({}));

import {
  readRegistrationApprovalQueue,
  readRegistrationApprovalCorrection,
  readRegistrationApprovalReview,
  readSubscriptionCommission,
  readSubscriptionPaymentStatus,
  readWorkspacePaymentQueue,
} from '../../lib/registration-approval/read';

const ws = '00000000-0000-0000-0000-000000000001';
const clientId = '00000000-0000-0000-0000-000000000002';
const subscriptionId = '00000000-0000-0000-0000-000000000003';

function setActor(
  role: 'platform_owner' | 'workspace_owner' | 'trainer' | 'sales' | null,
  workspaces: string[] = [ws],
) {
  loadActorRows.mockResolvedValue({
    userId: 'staff-user',
    role,
    activeWorkspaceIds: workspaces,
  });
}

function setBackend(data: unknown) {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  createSessionClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'staff-user' } },
        error: null,
      }),
    },
    rpc,
  });
  return rpc;
}

describe('registration approval safe readers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActor('platform_owner');
  });

  it.each([
    [
      'queue',
      readRegistrationApprovalQueue,
      { workspaceId: ws },
      'registration_approval_queue',
      'platform_owner',
    ],
    [
      'review',
      readRegistrationApprovalReview,
      { workspaceId: ws, clientId },
      'registration_approval_review',
      'workspace_owner',
    ],
    [
      'payment queue',
      readWorkspacePaymentQueue,
      { workspaceId: ws },
      'workspace_payment_queue',
      'sales',
    ],
    [
      'payment status',
      readSubscriptionPaymentStatus,
      { workspaceId: ws, clientId, subscriptionId },
      'subscription_payment_status',
      'sales',
    ],
  ] as const)(
    'uses app authorization before the bounded %s RPC',
    async (_name, reader, input, rpcName, role) => {
      setActor(role);
      const rpc = setBackend({
        status: 'ok',
        items: [],
        obligations: [],
        commission_minor: '123456',
      });
      await reader(input);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc.mock.calls[0]?.[0]).toBe(rpcName);
      expect(rpc.mock.calls[0]?.[1]).toMatchObject({ workspace_id: ws });
    },
  );

  it('denies target and capability failures before a permissive reader RPC', async () => {
    for (const [role, workspaces] of [
      ['trainer', [ws]],
      ['sales', []],
      [null, [ws]],
    ] as const) {
      setActor(role, [...workspaces]);
      const rpc = setBackend({
        status: 'ok',
        items: [{ client_id: clientId }],
      });
      const result = await readRegistrationApprovalQueue({ workspaceId: ws });
      expect(result).toEqual({ status: 'not_permitted' });
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it('returns column-limited projections even if the mocked backend includes commission or private fields', async () => {
    setActor('workspace_owner');
    setBackend({
      status: 'ok',
      commission_minor: '777',
      rate_bp: 500,
      items: [
        {
          client_id: clientId,
          name: 'Client',
          price_minor: '5000',
          currency: 'USD',
          commission_minor: '777',
          email: 'private@example.test',
        },
      ],
      next_cursor: null,
    });
    const result = await readRegistrationApprovalQueue({ workspaceId: ws });
    expect(result).toEqual({
      status: 'ok',
      items: [
        {
          client_id: clientId,
          name: 'Client',
          price_minor: '5000',
          currency: 'USD',
        },
      ],
      next_cursor: null,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /commission|rate_bp|private@example/,
    );
  });

  it('returns only currency and unpaid amount from payment queue totals', async () => {
    setActor('sales');
    setBackend({
      status: 'ok',
      items: [],
      totals: [
        {
          currency: 'EGP',
          unpaid_minor: '500',
          commission_minor: '999',
        },
      ],
      next_cursor: null,
    });
    const result = await readWorkspacePaymentQueue({ workspaceId: ws });
    expect(result).toEqual({
      status: 'ok',
      items: [],
      totals: [{ currency: 'EGP', unpaid_minor: '500' }],
      next_cursor: null,
    });
    expect(JSON.stringify(result)).not.toContain('commission');
  });

  it('keeps payment status safe and maps only the U5 obligation columns', async () => {
    setActor('sales');
    setBackend({
      status: 'ok',
      obligations: [
        {
          obligation_id: subscriptionId,
          seq: 2,
          amount_minor: '500',
          currency: 'USD',
          due_on: null,
          paid: true,
          revision: 2,
          tail_event_id: clientId,
          kind: 'collection',
          collected_on: '2026-10-29',
          effective_on: null,
          recorded_by: 'staff-user',
          commission_minor: '99',
        },
      ],
    });
    const result = await readSubscriptionPaymentStatus({
      workspaceId: ws,
      clientId,
      subscriptionId,
    });
    expect(result).toEqual({
      status: 'ok',
      obligations: [
        {
          obligation_id: subscriptionId,
          seq: 2,
          amount_minor: '500',
          currency: 'USD',
          due_on: null,
          paid: true,
          revision: 2,
          tail_event_id: clientId,
          kind: 'collection',
          collected_on: '2026-10-29',
          effective_on: null,
          recorded_by: 'staff-user',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('commission');
  });

  it('allows commission projection only for PO/WO and uses its separate RPC', async () => {
    setActor('sales');
    const deniedRpc = setBackend({
      status: 'ok',
      events: [{ commission_minor: '50' }],
    });
    expect(
      await readSubscriptionCommission({ workspaceId: ws, subscriptionId }),
    ).toEqual({ status: 'not_permitted' });
    expect(deniedRpc).not.toHaveBeenCalled();

    setActor('workspace_owner');
    const allowedRpc = setBackend({
      status: 'ok',
      events: [{ event_id: clientId, rate_bp: 100, commission_minor: '50' }],
    });
    const result = await readSubscriptionCommission({
      workspaceId: ws,
      subscriptionId,
    });
    expect(allowedRpc.mock.calls[0]).toEqual([
      'subscription_commission',
      { workspace_id: ws, subscription_id: subscriptionId },
    ]);
    expect(result).toEqual({
      status: 'ok',
      events: [{ event_id: clientId, rate_bp: 100, commission_minor: '50' }],
    });
  });

  it('does not import service-role credentials or retain projections in a shared cache', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(
        new URL('../../lib/registration-approval/read.ts', import.meta.url),
        'utf8',
      ),
    );
    expect(source).not.toMatch(
      /service[_-]?role|SUPABASE_SERVICE_ROLE|createServiceClient/,
    );
    expect(source).not.toMatch(
      /\b(new Map|globalThis|let cached|const cache\s*=)/,
    );
  });

  it('reads only PO correction identifiers and drops extra backend columns', async () => {
    const rpc = setBackend({
      status: 'ok',
      subscription_id: subscriptionId,
      corrections: {
        '1': {
          obligation_id: '00000000-0000-0000-0000-000000000004',
          revision: 1,
          tail_event_id: '00000000-0000-0000-0000-000000000005',
          amount_minor: '1200',
          email: 'private@example.test',
        },
      },
      email: 'private@example.test',
    });
    const result = await readRegistrationApprovalCorrection({
      workspaceId: ws,
      clientId,
    });
    expect(rpc).toHaveBeenCalledWith('registration_approval_correction', {
      workspace_id: ws,
      client_id: clientId,
    });
    expect(result).toEqual({
      status: 'ok',
      subscriptionId,
      corrections: [
        {
          seq: 1,
          obligationId: '00000000-0000-0000-0000-000000000004',
          revision: 1,
          tailEventId: '00000000-0000-0000-0000-000000000005',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/email|amount_minor|private@/);
  });

  it.each(['workspace_owner', 'trainer', 'sales', null] as const)(
    'does not call the correction reader for %s',
    async (role) => {
      setActor(role);
      const rpc = setBackend({
        status: 'ok',
        subscription_id: subscriptionId,
        corrections: {},
      });
      expect(
        await readRegistrationApprovalCorrection({
          workspaceId: ws,
          clientId,
        }),
      ).toEqual({ status: 'not_permitted' });
      expect(rpc).not.toHaveBeenCalled();
    },
  );
});
