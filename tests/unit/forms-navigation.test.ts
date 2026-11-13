import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getClientSelfStatus: vi.fn(),
  createSessionClient: vi.fn(),
}));
vi.mock('../../lib/client-access/status', () => ({
  getClientSelfStatus: mocks.getClientSelfStatus,
}));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));

import { preflightClientHomeNavigation } from '../../app/(client)/account/status/actions';

const client = { rpc: vi.fn() };
const assignmentId = '3f8e89d7-7c5b-42b0-976a-7ec70f0d71f8';

describe('T022 approved status destination allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClientSelfStatus.mockResolvedValue({
      status: 'ok',
      approval_state: 'approved',
    });
    mocks.createSessionClient.mockResolvedValue(client);
    client.rpc.mockResolvedValue({
      data: { status: 'ok', assignment_id: assignmentId },
      error: null,
    });
  });

  it('uses an existing own assignment as the bounded redirect destination', async () => {
    await expect(preflightClientHomeNavigation()).resolves.toEqual({
      status: 'ok',
      destination: `/forms/${assignmentId}`,
    });
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith(
      'read_client_intake_destination',
    );
  });

  it('keeps the approved home fallback when no unique assignment exists', async () => {
    client.rpc.mockResolvedValue({
      data: { status: 'ok', assignment_id: null },
      error: null,
    });
    await expect(preflightClientHomeNavigation()).resolves.toEqual({
      status: 'ok',
      destination: '/',
    });
  });

  it('does not resolve or guess a destination before approval', async () => {
    mocks.getClientSelfStatus.mockResolvedValue({
      status: 'ok',
      approval_state: 'pending-approval',
    });
    await expect(preflightClientHomeNavigation()).resolves.toEqual({
      status: 'ok',
      approval_state: 'pending-approval',
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('falls back to the existing home route if destination resolution fails', async () => {
    client.rpc.mockRejectedValue(new Error('private diagnostic'));
    await expect(preflightClientHomeNavigation()).resolves.toEqual({
      status: 'ok',
      destination: '/',
    });
  });
});
