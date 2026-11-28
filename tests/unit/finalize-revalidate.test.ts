import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('../../lib/auth/actor', () => ({ requireActor: mocks.actor }));
vi.mock('../../lib/workforce/finalize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/workforce/finalize')>()),
  finalizeMonthRpc: mocks.rpc,
}));

import { finalizeMonthAction } from '../../app/(app)/workforce/finalize/actions';

const workspaceId = '11111111-1111-1111-1111-111111111111';
const endedMonth = '2020-01';
const input = { workspaceId, month: endedMonth };
const finalizedDataPaths = [
  '/workforce/finalize',
  '/reports',
  '/workforce/report',
  '/workforce/sales-projection',
  '/sales-projection',
];

describe('finalizeMonthAction revalidation (CUMREV-027-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({
      userId: '22222222-2222-2222-2222-222222222222',
      role: 'platform_owner',
      activeWorkspaceIds: [],
    });
    mocks.rpc.mockResolvedValue({ status: 'finalized' });
  });

  it('revalidates every page showing finalized data after success, in order', async () => {
    expect(await finalizeMonthAction(input)).toEqual({ status: 'finalized' });
    expect(mocks.rpc).toHaveBeenCalledWith(workspaceId, endedMonth);
    expect(mocks.revalidate).toHaveBeenCalledTimes(finalizedDataPaths.length);
    expect(mocks.revalidate.mock.calls.map((call) => call[0])).toEqual(
      finalizedDataPaths,
    );
  });

  it.each([
    'already_finalized',
    'stale',
    'error',
    'invalid_period',
    'not_permitted',
  ])('revalidates nothing when the RPC returns %s', async (status) => {
    mocks.rpc.mockResolvedValue({ status });
    expect(await finalizeMonthAction(input)).toEqual({ status });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each(['workspace_owner', 'trainer', 'sales'])(
    'revalidates nothing when role %s is denied',
    async (role) => {
      mocks.actor.mockResolvedValue({
        userId: 'u',
        role,
        activeWorkspaceIds: [],
      });
      expect(await finalizeMonthAction(input)).toEqual({
        status: 'not_permitted',
      });
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.revalidate).not.toHaveBeenCalled();
    },
  );

  it.each(['2026-13', 'not-a-month', '2999-01'])(
    'revalidates nothing for invalid or non-ended month %s',
    async (month) => {
      expect(await finalizeMonthAction({ workspaceId, month })).toEqual({
        status: 'invalid_period',
      });
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.revalidate).not.toHaveBeenCalled();
    },
  );
});
