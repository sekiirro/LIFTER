import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireActor, createSessionClient } = vi.hoisted(() => ({
  requireActor: vi.fn(),
  createSessionClient: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ requireActor }));
vi.mock('../../lib/supabase/server', () => ({ createSessionClient }));

import {
  listOpenRefundFaultReviewsAction,
  resolveRefundFaultReviewAction,
} from '../../app/(app)/workforce/report/refund-fault-actions';

describe('refund-fault review server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireActor.mockResolvedValue({
      userId: '11111111-1111-1111-1111-111111111111',
      role: 'workspace_owner',
      activeWorkspaceIds: [],
    });
  });

  it('rejects a non-PO list request before calling the RPC', async () => {
    await expect(
      listOpenRefundFaultReviewsAction('22222222-2222-2222-2222-222222222222'),
    ).resolves.toEqual({ status: 'denied' });
    expect(createSessionClient).not.toHaveBeenCalled();
  });

  it('rejects a non-PO resolution before calling the RPC', async () => {
    await expect(
      resolveRefundFaultReviewAction({
        workspaceId: '22222222-2222-2222-2222-222222222222',
        reviewId: '33333333-3333-3333-3333-333333333333',
        requestKey: '44444444-4444-4444-4444-444444444444',
        staffFault: false,
        staffDeductions: [],
      }),
    ).resolves.toEqual({ status: 'denied' });
    expect(createSessionClient).not.toHaveBeenCalled();
  });

  it('calls only the approved refund-fault RPCs for an authorized PO', async () => {
    requireActor.mockResolvedValue({
      userId: '11111111-1111-1111-1111-111111111111',
      role: 'platform_owner',
      activeWorkspaceIds: [],
    });
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: { status: 'ok', reviews: [] },
        error: null,
      })
      .mockResolvedValueOnce({ data: { status: 'ok' }, error: null });
    createSessionClient.mockResolvedValue({ rpc });

    await expect(
      listOpenRefundFaultReviewsAction('22222222-2222-2222-2222-222222222222'),
    ).resolves.toEqual({ status: 'ok', reviews: [] });
    await expect(
      resolveRefundFaultReviewAction({
        workspaceId: '22222222-2222-2222-2222-222222222222',
        reviewId: '33333333-3333-3333-3333-333333333333',
        requestKey: '44444444-4444-4444-4444-444444444444',
        staffFault: false,
        staffDeductions: [],
      }),
    ).resolves.toEqual({ status: 'ok' });

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'p7_list_open_refund_fault_reviews',
      'p7_resolve_refund_fault_review',
    ]);
  });
});
