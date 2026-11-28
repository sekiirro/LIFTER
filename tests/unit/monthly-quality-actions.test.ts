import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
  report: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ getActor: mocks.actor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.client,
}));
vi.mock('../../lib/workforce/report', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/workforce/report')>()),
  fetchWorkforceReport: mocks.report,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

import { recordMonthlyQualityAction } from '../../app/(app)/workforce/quality/actions';
import {
  getMonthlyQuality,
  recordMonthlyQuality,
  type RecordQualityInput,
} from '../../lib/workforce/quality-server';

const workspaceId = '11111111-1111-1111-1111-111111111111';
const trainerId = '22222222-2222-2222-2222-222222222222';
const revision = {
  id: '33333333-3333-3333-3333-333333333333',
  workspace_id: workspaceId,
  trainer_id: trainerId,
  month: '2026-11',
  category: 'feedback',
  revision: 2,
  positive_count: 4,
  negative_count: 1,
  positive_weight: '1.00',
  negative_weight: '-1.00',
  net_points: '3.00',
  idempotency_key: '44444444-4444-4444-4444-444444444444',
  created_at: '2026-11-28T00:00:00Z',
  created_by: '55555555-5555-5555-5555-555555555555',
};

function input() {
  return {
    workspaceId,
    trainerId,
    month: '2026-11',
    category: 'feedback' as const,
    positiveCount: 4,
    negativeCount: 1,
    positiveWeight: '1.00',
    negativeWeight: '-1.00',
    expectedRevision: 1,
    idempotencyKey: revision.idempotency_key,
  };
}

describe('Monthly quality server action and existing RPC boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({
      userId: revision.created_by,
      role: 'platform_owner',
      activeWorkspaceIds: [],
    });
    mocks.client.mockResolvedValue({ rpc: mocks.rpc });
    mocks.report.mockResolvedValue({
      status: 'ok',
      data: { is_closed: false },
    });
  });

  it.each(['workspace_owner', 'trainer', 'sales', null])(
    'rejects %s before any report or quality RPC',
    async (role) => {
      mocks.actor.mockResolvedValue(
        role ? { userId: 'u', role, activeWorkspaceIds: [] } : null,
      );
      expect(await recordMonthlyQualityAction(input())).toEqual({
        status: 'denied',
      });
      expect(mocks.report).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it('rejects an invalid month before creating a client or calling an RPC', async () => {
    expect(
      await recordMonthlyQuality({ ...input(), month: '2026-13' }),
    ).toEqual({ status: 'invalid_input' });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('loads only the existing effective and revision RPCs', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [revision], error: null })
      .mockResolvedValueOnce({ data: [revision], error: null });
    expect(await getMonthlyQuality(workspaceId, '2026-11')).toEqual({
      status: 'ok',
      effective: [revision],
      revisions: [revision],
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      'get_monthly_quality_effective',
      {
        p_workspace_id: workspaceId,
        p_month: '2026-11',
        p_trainer_id: null,
        p_category: null,
      },
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      'get_monthly_quality_revisions',
      {
        p_workspace_id: workspaceId,
        p_month: '2026-11',
        p_trainer_id: null,
        p_category: null,
      },
    );
  });

  it('keeps finalized months read-only before record_monthly_quality', async () => {
    mocks.report.mockResolvedValue({
      status: 'ok',
      data: { is_closed: true },
    });
    expect(await recordMonthlyQualityAction(input())).toEqual({
      status: 'closed',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it('records exact canonical input through the existing RPC and revalidates', async () => {
    mocks.rpc.mockResolvedValue({ data: revision, error: null });
    expect(await recordMonthlyQualityAction(input())).toEqual({
      status: 'ok',
      data: revision,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('record_monthly_quality', {
      p_workspace_id: workspaceId,
      p_trainer_id: trainerId,
      p_month: '2026-11',
      p_category: 'feedback',
      p_positive_count: 4,
      p_negative_count: 1,
      p_positive_weight: '1.00',
      p_negative_weight: '-1.00',
      p_idempotency_key: revision.idempotency_key,
      p_expected_revision: 1,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith('/workforce/quality');
  });

  it('maps a stale revision without leaking the database message', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '40001', message: 'stale_revision' },
    });
    expect(await recordMonthlyQuality(input())).toEqual({ status: 'stale' });
  });

  it('rejects a negative transformation count before the RPC', async () => {
    expect(
      await recordMonthlyQuality({
        ...input(),
        category: 'transformation',
        negativeCount: 1,
      }),
    ).toEqual({ status: 'invalid_input' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects malformed runtime payloads without throwing or calling an RPC', async () => {
    for (const malformed of [
      null,
      { ...input(), idempotencyKey: 123 },
      { ...input(), positiveWeight: 0 },
      { ...input(), negativeWeight: 0 },
      { ...input(), expectedRevision: 2_147_483_648 },
      { ...input(), positiveCount: '4' },
    ]) {
      expect(
        await recordMonthlyQuality(malformed as unknown as RecordQualityInput),
      ).toEqual({ status: 'invalid_input' });
    }
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(
      await getMonthlyQuality(null as unknown as string, '2026-11'),
    ).toEqual({ status: 'invalid_input' });
  });

  it('canonicalizes validated decimal strings before the RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: revision, error: null });
    expect(
      await recordMonthlyQuality({
        ...input(),
        positiveWeight: ' 1.2 ',
        negativeWeight: ' -1 ',
      }),
    ).toEqual({ status: 'ok', data: revision });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'record_monthly_quality',
      expect.objectContaining({
        p_positive_weight: '1.20',
        p_negative_weight: '-1.00',
      }),
    );
  });
});
