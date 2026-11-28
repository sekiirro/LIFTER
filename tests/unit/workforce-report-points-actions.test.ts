import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  postPointAdjustmentAction,
  reattributePointEntryAction,
} from '../../app/(app)/workforce/report/actions';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ requireActor: mocks.actor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.session,
}));
vi.mock('next/cache', () => ({ refresh: mocks.refresh }));

const workspaceId = '00000000-0000-4000-8000-000000000001';
const trainerId = '11111111-1111-4000-8000-111111111111';
const salesId = '22222222-2222-4000-8000-222222222222';
const entryId = '33333333-3333-4000-8000-333333333333';
const idempotencyKey = '44444444-4444-4000-8000-444444444444';

const addInput = {
  workspaceId,
  staffUserId: trainerId,
  operation: 'add' as const,
  points: '2.5',
  effectiveMonth: '2026-11',
  originalEntryKind: null,
  originalEntryId: null,
  reason: '  Approved manual point change  ',
  idempotencyKey,
};

describe('T013 workforce report point Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({
      userId: 'po-user',
      role: 'platform_owner',
      activeWorkspaceIds: [],
    });
    mocks.session.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: { status: 'ok' }, error: null });
  });

  it.each(['workspace_owner', 'trainer', 'sales', null])(
    'rejects a non-PO caller (%s) before creating a client or calling an RPC',
    async (role) => {
      mocks.actor.mockResolvedValue({
        userId: 'staff-user',
        role,
        activeWorkspaceIds: [workspaceId],
      });

      expect(await postPointAdjustmentAction(addInput)).toEqual({
        status: 'not_permitted',
      });
      expect(
        await reattributePointEntryAction({
          workspaceId,
          originalEntryKind: 'earned',
          originalEntryId: entryId,
          targetStaffUserId: salesId,
          reason: 'Move attribution',
          idempotencyKey,
        }),
      ).toEqual({ status: 'not_permitted' });
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    },
  );

  it('posts an add with canonical decimal text, trimmed reason, and only the #393 RPC', async () => {
    expect(await postPointAdjustmentAction(addInput)).toEqual({ status: 'ok' });

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('p7_post_point_adjustment', {
      p_workspace_id: workspaceId,
      p_staff_user_id: trainerId,
      p_operation: 'add',
      p_points: '2.50',
      p_effective_month: '2026-11-01',
      p_original_entry_kind: null,
      p_original_entry_id: null,
      p_reason: 'Approved manual point change',
      p_idempotency_key: idempotencyKey,
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('converts a positive deduction magnitude to the RPC signed value', async () => {
    expect(
      await postPointAdjustmentAction({
        ...addInput,
        operation: 'deduct',
        points: '0.75',
      }),
    ).toEqual({ status: 'ok' });

    expect(mocks.rpc).toHaveBeenCalledWith(
      'p7_post_point_adjustment',
      expect.objectContaining({
        p_operation: 'deduct',
        p_points: '-0.75',
      }),
    );
  });

  it('posts a correction with immutable original lineage and no effective month', async () => {
    expect(
      await postPointAdjustmentAction({
        ...addInput,
        operation: 'correct',
        points: '-0.25',
        effectiveMonth: null,
        originalEntryKind: 'earned',
        originalEntryId: entryId,
      }),
    ).toEqual({ status: 'ok' });

    expect(mocks.rpc).toHaveBeenCalledWith('p7_post_point_adjustment', {
      p_workspace_id: workspaceId,
      p_staff_user_id: trainerId,
      p_operation: 'correct',
      p_points: '-0.25',
      p_effective_month: null,
      p_original_entry_kind: 'earned',
      p_original_entry_id: entryId,
      p_reason: 'Approved manual point change',
      p_idempotency_key: idempotencyKey,
    });
  });

  it('reattributes through only the #393 reversal/replacement RPC', async () => {
    expect(
      await reattributePointEntryAction({
        workspaceId,
        originalEntryKind: 'adjustment',
        originalEntryId: entryId,
        targetStaffUserId: salesId,
        reason: '  Correct the responsible employee  ',
        idempotencyKey,
      }),
    ).toEqual({ status: 'ok' });

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('p7_reattribute_point_entry', {
      p_workspace_id: workspaceId,
      p_original_entry_kind: 'adjustment',
      p_original_entry_id: entryId,
      p_target_staff_user_id: salesId,
      p_reason: 'Correct the responsible employee',
      p_idempotency_key: idempotencyKey,
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(['', '   ', '\t\r\n '])(
    'rejects an empty trimmed reason (%j) before the RPC',
    async (reason) => {
      expect(await postPointAdjustmentAction({ ...addInput, reason })).toEqual({
        status: 'reason_required',
      });
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it('rejects a 501-character reason and accepts exactly 500 trimmed characters', async () => {
    expect(
      await postPointAdjustmentAction({
        ...addInput,
        reason: 'x'.repeat(501),
      }),
    ).toEqual({ status: 'invalid_input' });
    expect(mocks.rpc).not.toHaveBeenCalled();

    const reason = 'x'.repeat(500);
    expect(
      await postPointAdjustmentAction({ ...addInput, reason: `  ${reason}  ` }),
    ).toEqual({ status: 'ok' });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'p7_post_point_adjustment',
      expect.objectContaining({ p_reason: reason }),
    );
  });

  it.each([
    { points: '' },
    { points: '0' },
    { points: '0.00' },
    { points: '-1.00' },
    { points: '1.234' },
    { points: '100000000.00' },
    { effectiveMonth: '2026-13' },
    { staffUserId: 'not-a-uuid' },
    { idempotencyKey: 'not-a-uuid' },
  ])('rejects invalid add input %j before the RPC', async (override) => {
    expect(
      await postPointAdjustmentAction({ ...addInput, ...override }),
    ).toEqual({ status: 'invalid_input' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires original lineage for a correction', async () => {
    expect(
      await postPointAdjustmentAction({
        ...addInput,
        operation: 'correct',
        effectiveMonth: null,
        originalEntryKind: null,
        originalEntryId: null,
      }),
    ).toEqual({ status: 'invalid_input' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('maps RPC authorization and transport failures without claiming success', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'not_permitted' },
      error: null,
    });
    expect(await postPointAdjustmentAction(addInput)).toEqual({
      status: 'not_permitted',
    });

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'not_permitted' },
    });
    expect(await postPointAdjustmentAction(addInput)).toEqual({
      status: 'not_permitted',
    });

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'db_connection_error' },
    });
    expect(await postPointAdjustmentAction(addInput)).toEqual({
      status: 'error',
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
