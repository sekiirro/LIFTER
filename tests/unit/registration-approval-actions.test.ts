import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
  loadActorRows: vi.fn(),
  requestHeaders: vi.fn(),
  revalidatePath: vi.fn(),
}));
const { createSessionClient, loadActorRows, requestHeaders } = mocks;

vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));
vi.mock('../../lib/auth/actor', () => ({ loadActorRows: mocks.loadActorRows }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: mocks.requestHeaders }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import {
  approveRegistrationAction,
  correctCollectionAction,
  recordInstallmentAction,
  reconsiderRegistrationAction,
  rejectRegistrationAction,
} from '../../app/(app)/registration-approvals/actions';

const ws = '00000000-0000-0000-0000-000000000001';
const foreignWs = '00000000-0000-0000-0000-000000000099';
const clientId = '00000000-0000-0000-0000-000000000002';
const requestKey = '00000000-0000-0000-0000-000000000003';
const approval = {
  workspaceId: ws,
  clientId,
  requestKey,
  expectedAmountMinor: '9007199254740993',
  currency: 'USD',
  collectedOn: '2026-10-29',
  paymentConfirmed: true,
};

const receipt = {
  id: '00000000-0000-0000-0000-000000000010',
  operation: 'approve',
  workspace_id: ws,
  client_id: clientId,
  subscription_id: '00000000-0000-0000-0000-000000000011',
  obligation_id: '00000000-0000-0000-0000-000000000012',
  event_id: '00000000-0000-0000-0000-000000000013',
  installment_seq: 1,
  revision: 1,
  outcome: 'approved',
  amount_minor: '9007199254740993',
  currency: 'USD',
  collected_on: '2026-10-29',
  recorded_at: '2026-10-29T10:00:00Z',
};

const action = {
  approve: approveRegistrationAction,
  reject: rejectRegistrationAction,
  reconsider: reconsiderRegistrationAction,
  collect: recordInstallmentAction,
  correct: correctCollectionAction,
} as const;

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

function setBackend(data: unknown = { status: 'ok', receipt }) {
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

describe('registration approval server action boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestHeaders.mockResolvedValue(
      new Headers({
        origin: 'https://app.example.test',
        host: 'app.example.test',
      }),
    );
    setActor('platform_owner');
  });

  it('revalidates approval detail and payment pages after a successful mutation', async () => {
    setBackend();

    expect(await approveRegistrationAction(approval)).toEqual({
      status: 'ok',
      receipt,
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/registration-approvals'],
      ['/registration-approvals/[clientId]', 'page'],
      ['/payments/[subscriptionId]', 'page'],
    ]);
  });

  it.each([
    ['platform_owner', [ws], 'approve', true],
    ['platform_owner', [ws], 'reject', true],
    ['platform_owner', [ws], 'reconsider', true],
    ['platform_owner', [ws], 'correct', true],
    ['workspace_owner', [ws], 'approve', true],
    ['workspace_owner', [ws], 'reject', true],
    ['trainer', [ws], 'approve', false],
    ['sales', [ws], 'approve', false],
    ['sales', [ws], 'reject', false],
    ['workspace_owner', [], 'approve', false],
    ['platform_owner', [], 'approve', true],
    ['sales', [ws], 'collect', true],
    ['workspace_owner', [ws], 'collect', true],
    ['platform_owner', [ws], 'collect', true],
    // PO session 14: Trainers may confirm all installments, including renewals.
    ['trainer', [ws], 'collect', true],
    ['sales', [ws], 'reconsider', false],
    ['workspace_owner', [ws], 'reconsider', false],
    ['sales', [ws], 'correct', false],
    ['workspace_owner', [ws], 'correct', false],
  ] as const)(
    '%s membership scope gates %s before an accepting RPC',
    async (role, workspaces, operation, allowed) => {
      setActor(role, [...workspaces]);
      const rpc = setBackend({ status: 'not_permitted' });
      const input =
        operation === 'reject'
          ? {
              workspaceId: ws,
              clientId,
              requestKey,
              reasonCode: 'registration_rejected',
            }
          : operation === 'collect'
            ? {
                workspaceId: ws,
                clientId,
                subscriptionId: receipt.subscription_id,
                obligationId: receipt.obligation_id,
                requestKey,
                expectedInstallmentSeq: 2,
                expectedRevision: 1,
                expectedPreviousEventId: receipt.event_id,
                expectedAmountMinor: '50',
                currency: 'USD',
                collectedOn: '2026-10-29',
                paymentConfirmed: true,
              }
            : operation === 'correct'
              ? {
                  workspaceId: ws,
                  clientId,
                  subscriptionId: receipt.subscription_id,
                  obligationId: receipt.obligation_id,
                  originalEventId: receipt.event_id,
                  requestKey,
                  expectedInstallmentSeq: 1,
                  expectedRevision: 1,
                  expectedPreviousEventId: null,
                  correctionConfirmed: true,
                }
              : approval;
      const result = await action[operation](input);
      if (allowed) {
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ status: 'not_permitted' });
      } else {
        expect(rpc).not.toHaveBeenCalled();
        expect(result).toEqual({ status: 'not_permitted' });
      }
    },
  );

  it('denies Trainer approval-screen collection outside the active workspace before RPC', async () => {
    setActor('trainer', [ws]);
    const rpc = setBackend();

    const result = await recordInstallmentAction({
      workspaceId: foreignWs,
      clientId,
      subscriptionId: receipt.subscription_id,
      obligationId: receipt.obligation_id,
      requestKey,
      expectedInstallmentSeq: 2,
      expectedRevision: 1,
      expectedPreviousEventId: receipt.event_id,
      expectedAmountMinor: '50',
      currency: 'USD',
      collectedOn: '2026-10-29',
      paymentConfirmed: true,
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'not_permitted' });
  });

  it.each([
    ['reconsider', 'workspace_owner', true],
    ['reconsider', 'platform_owner', false],
    ['correct', 'workspace_owner', true],
    ['correct', 'platform_owner', false],
  ] as const)(
    'restricts %s to PO (role %s)',
    async (operation, role, expectDenied) => {
      setActor(role);
      const rpc = setBackend();
      const input =
        operation === 'reconsider'
          ? { ...approval }
          : {
              workspaceId: ws,
              clientId,
              subscriptionId: receipt.subscription_id,
              obligationId: receipt.obligation_id,
              originalEventId: receipt.event_id,
              requestKey,
              expectedInstallmentSeq: 1,
              expectedRevision: 1,
              expectedPreviousEventId: null,
              correctionConfirmed: true,
            };
      const result = await action[operation](input);
      expect(rpc).toHaveBeenCalledTimes(expectDenied ? 0 : 1);
      expect(result.status).toBe(expectDenied ? 'not_permitted' : 'ok');
    },
  );

  it('rejects cross-origin requests before a permissive mocked backend is called', async () => {
    requestHeaders.mockResolvedValue(
      new Headers({
        origin: 'https://attacker.example',
        host: 'app.example.test',
      }),
    );
    const rpc = setBackend({ status: 'ok', receipt });
    expect(await approveRegistrationAction(approval)).toEqual({
      status: 'not_permitted',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects malformed or extended input before RPC, without echoing values', async () => {
    const rpc = setBackend({ status: 'ok', receipt });
    const result = await approveRegistrationAction({
      ...approval,
      reason: 'private canary',
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'invalid_input', fields: [] });
    expect(JSON.stringify(result)).not.toContain('private canary');
  });

  it('retains the exact caller request key and canonical RPC request for a safe retry', async () => {
    const rpc = setBackend({ status: 'unavailable' });
    await approveRegistrationAction(approval);
    await approveRegistrationAction(approval);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc.mock.calls[0]).toEqual([
      'registration_approve',
      {
        request: {
          workspace_id: ws,
          client_id: clientId,
          request_key: requestKey,
          expected_state: 'pending-approval',
          expected_installment_seq: 1,
          expected_amount_minor: '9007199254740993',
          currency: 'USD',
          collected_on: '2026-10-29',
          payment_confirmed: true,
        },
      },
    ]);
  });

  it.each([
    ['approve', 'registration_approve'],
    ['reject', 'registration_reject'],
    ['reconsider', 'registration_reconsider'],
    ['collect', 'installment_collect'],
    ['correct', 'collection_correct'],
  ] as const)(
    'uses the stage 1 RPC name for %s',
    async (operation, rpcName) => {
      const rpc = setBackend({ status: 'not_permitted' });
      const input =
        operation === 'reject'
          ? {
              workspaceId: ws,
              clientId,
              requestKey,
              reasonCode: 'registration_rejected',
            }
          : operation === 'collect'
            ? {
                workspaceId: ws,
                clientId,
                subscriptionId: receipt.subscription_id,
                obligationId: receipt.obligation_id,
                requestKey,
                expectedInstallmentSeq: 2,
                expectedRevision: 1,
                expectedPreviousEventId: receipt.event_id,
                expectedAmountMinor: '50',
                currency: 'USD',
                collectedOn: '2026-10-29',
                paymentConfirmed: true,
              }
            : operation === 'correct'
              ? {
                  workspaceId: ws,
                  clientId,
                  subscriptionId: receipt.subscription_id,
                  obligationId: receipt.obligation_id,
                  originalEventId: receipt.event_id,
                  requestKey,
                  expectedInstallmentSeq: 1,
                  expectedRevision: 1,
                  expectedPreviousEventId: null,
                  correctionConfirmed: true,
                }
              : approval;
      await action[operation](input);
      expect(rpc.mock.calls[0]?.[0]).toBe(rpcName);
    },
  );

  it('scrubs provider details from returned failures and application logs', async () => {
    const error = {
      code: 'XX000',
      message: 'provider raw-input-canary private@example.test',
    };
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    createSessionClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'staff-user' } },
          error: null,
        }),
      },
      rpc,
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const result = await approveRegistrationAction(approval);
      expect(result).toEqual({ status: 'unavailable' });
      expect(
        JSON.stringify(result) + JSON.stringify(log.mock.calls),
      ).not.toMatch(/raw-input-canary|private@example|provider/);
    } finally {
      log.mockRestore();
    }
  });

  it('does not log caller input when an unexpected RPC exception occurs', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('private provider detail'));
    createSessionClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'staff-user' } },
          error: null,
        }),
      },
      rpc,
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await approveRegistrationAction(approval)).toEqual({
        status: 'unavailable',
      });
      expect(log).not.toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain(requestKey);
    } finally {
      log.mockRestore();
    }
  });
});
