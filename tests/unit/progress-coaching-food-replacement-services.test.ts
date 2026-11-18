import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  authorizeClientAccess: vi.fn(),
  createSessionClient: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ getActor: mocks.getActor }));
vi.mock('../../lib/client-access/authorize', () => ({
  authorizeClientAccess: mocks.authorizeClientAccess,
}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));

import { approveFoodReplacementRequest } from '../../lib/progress-coaching/food-replacement/approval';
import { rejectFoodReplacementRequest } from '../../lib/progress-coaching/food-replacement/lifecycle';
import {
  cancelFoodReplacementRequest,
  submitFoodReplacementRequest,
} from '../../lib/progress-coaching/food-replacement/requests';
import { selectExistingAlternative } from '../../lib/progress-coaching/food-replacement/selection';

const WS = '10000000-0000-4000-8000-000000000001';
const FOREIGN_WS = '10000000-0000-4000-8000-000000000002';
const PLAN_VERSION = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const ALT = '33333333-3333-4333-8333-333333333333';
const KEY = '44444444-4444-4444-8444-444444444444';
const REQUEST = '55555555-5555-4555-8555-555555555555';
const FOOD = '66666666-6666-4666-8666-666666666666';

const trainer = (workspaceId: string) => ({
  userId: 'u1',
  role: 'trainer',
  activeWorkspaceIds: [workspaceId],
});
const sales = (workspaceId: string) => ({
  userId: 'u2',
  role: 'sales',
  activeWorkspaceIds: [workspaceId],
});

const approveBody = {
  requestId: REQUEST,
  foodId: FOOD,
  foodVersion: 1,
  quantity: { value: '100', unit: { kind: 'basis', value: 'g' } },
  replaceAlternativeId: null,
  expectedDraftVersion: 1,
  operationKey: KEY,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockResolvedValue({ data: { status: 'ok' }, error: null });
  mocks.maybeSingle.mockResolvedValue({
    data: { workspace_id: WS },
    error: null,
  });
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: mocks.maybeSingle,
  };
  mocks.createSessionClient.mockResolvedValue({
    rpc: mocks.rpc,
    from: () => builder,
  });
  mocks.authorizeClientAccess.mockResolvedValue({
    allowed: true,
    approvalState: 'approved',
  });
  mocks.getActor.mockResolvedValue(trainer(WS));
});

describe('client walls (free selection, submit, cancel)', () => {
  it('denies a caller that fails the client wall before any database call', async () => {
    mocks.authorizeClientAccess.mockResolvedValue({
      allowed: false,
      status: 'not_permitted',
    });
    expect(
      await selectExistingAlternative({
        planVersionId: PLAN_VERSION,
        itemId: ITEM,
        alternativeId: ALT,
        operationKey: KEY,
      }),
    ).toEqual({ status: 'denied' });
    expect(
      await submitFoodReplacementRequest({
        planVersionId: PLAN_VERSION,
        itemId: ITEM,
        requestText: 'x',
      }),
    ).toEqual({ status: 'denied' });
    expect(await cancelFoodReplacementRequest({ requestId: REQUEST })).toEqual({
      status: 'denied',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not touch the database for invalid input', async () => {
    expect(await submitFoodReplacementRequest({ itemId: ITEM })).toEqual({
      status: 'invalid',
    });
    expect(mocks.authorizeClientAccess).not.toHaveBeenCalled();
  });

  it('free selection calls only the F18 RPC and creates no request', async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: 'ok', selection_revision: 1 },
      error: null,
    });
    expect(
      await selectExistingAlternative({
        planVersionId: PLAN_VERSION,
        itemId: ITEM,
        alternativeId: ALT,
        operationKey: KEY,
      }),
    ).toEqual({ status: 'selected' });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('select_nutrition_alternative', {
      p_plan_version_id: PLAN_VERSION,
      p_item_id: ITEM,
      p_alternative_id: ALT,
      p_operation_key: KEY,
    });
  });

  it('maps F18 selection outcomes without leaking database text', async () => {
    for (const status of ['stale_version', 'key_conflict', 'invalid_selection'])
      expect(
        (mocks.rpc.mockResolvedValueOnce({ data: { status }, error: null }),
        await selectExistingAlternative({
          planVersionId: PLAN_VERSION,
          itemId: ITEM,
          alternativeId: null,
          operationKey: KEY,
        })).status,
      ).toBe(status);
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'not_permitted' },
      error: null,
    });
    expect(
      (
        await selectExistingAlternative({
          planVersionId: PLAN_VERSION,
          itemId: ITEM,
          alternativeId: ALT,
          operationKey: KEY,
        })
      ).status,
    ).toBe('denied');
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'raw' },
    });
    expect(
      await selectExistingAlternative({
        planVersionId: PLAN_VERSION,
        itemId: ITEM,
        alternativeId: ALT,
        operationKey: KEY,
      }),
    ).toEqual({ status: 'unavailable' });
  });

  it('submits and cancels through the definer operations with session-derived scope', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'created', request_id: REQUEST },
      error: null,
    });
    expect(
      await submitFoodReplacementRequest({
        planVersionId: PLAN_VERSION,
        itemId: ITEM,
        requestText: '  another protein  ',
      }),
    ).toEqual({ status: 'created', requestId: REQUEST });
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'submit_food_replacement_request',
      {
        p_plan_version_id: PLAN_VERSION,
        p_item_id: ITEM,
        p_request_text: 'another protein',
      },
    );
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'cancelled' },
      error: null,
    });
    expect(await cancelFoodReplacementRequest({ requestId: REQUEST })).toEqual({
      status: 'cancelled',
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'cancel_food_replacement_request',
      { p_request_id: REQUEST },
    );
  });
});

describe('staff walls (approve, reject)', () => {
  it('denies a signed-out caller', async () => {
    mocks.getActor.mockResolvedValue(null);
    expect(await approveFoodReplacementRequest(approveBody)).toEqual({
      status: 'denied',
    });
    expect(await rejectFoodReplacementRequest({ requestId: REQUEST })).toEqual({
      status: 'denied',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('denies Sales and a trainer of another workspace at the app wall', async () => {
    for (const actor of [sales(WS), trainer(FOREIGN_WS)]) {
      mocks.getActor.mockResolvedValue(actor);
      expect(await approveFoodReplacementRequest(approveBody)).toEqual({
        status: 'denied',
      });
      expect(
        await rejectFoodReplacementRequest({ requestId: REQUEST }),
      ).toEqual({ status: 'denied' });
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('denies a request the caller cannot read (RLS hides foreign rows)', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await approveFoodReplacementRequest(approveBody)).toEqual({
      status: 'denied',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('approves into a draft only: the RPC receives no publish input', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'prepared', draft_version: 2, alternative_id: ALT },
      error: null,
    });
    expect(await approveFoodReplacementRequest(approveBody)).toEqual({
      status: 'prepared',
      draftVersion: 2,
      alternativeId: ALT,
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('approve_food_replacement_request', {
      p_request_id: REQUEST,
      p_food_id: FOOD,
      p_food_version: 1,
      p_quantity: approveBody.quantity,
      p_replace_alternative_id: null,
      p_expected_draft_version: 1,
      p_operation_key: KEY,
    });
    const names = mocks.rpc.mock.calls.map((call) => call[0]);
    expect(names).not.toContain('publish_nutrition_revision');
    expect(names).not.toContain('ready_and_publish_plan');
  });

  it('rejects through the definer operation', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'rejected' },
      error: null,
    });
    expect(await rejectFoodReplacementRequest({ requestId: REQUEST })).toEqual({
      status: 'rejected',
    });
  });
});
