import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createServerAuthLockoutStore: vi.fn(),
  markSucceeded: vi.fn(),
  markRetry: vi.fn(),
  claimDue: vi.fn(),
  updateUserById: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('../../lib/payments/refund-auth-lockout-store', () => ({
  createServerAuthLockoutStore: mocks.createServerAuthLockoutStore,
}));

import { drainServerAuthLockouts } from '../../lib/payments/refund-auth-lockout';

const job = {
  id: '00000000-0000-4000-8000-000000000001',
  authUserId: '00000000-0000-4000-8000-000000000002',
  attempts: 0,
  status: 'pending' as const,
};

describe('server Auth lockout drain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerAuthLockoutStore.mockReturnValue({
      claimDue: mocks.claimDue,
      markSucceeded: mocks.markSucceeded,
      markRetry: mocks.markRetry,
    });
    mocks.claimDue.mockResolvedValue([job]);
    mocks.markSucceeded.mockResolvedValue(undefined);
    mocks.markRetry.mockResolvedValue(undefined);
    mocks.updateUserById.mockResolvedValue({ error: null });
    mocks.createAdminClient.mockReturnValue({
      auth: { admin: { updateUserById: mocks.updateUserById } },
    });
  });

  it('claims due rows, applies the supported Auth Admin ban, and marks completion', async () => {
    const result = await drainServerAuthLockouts({
      limit: 10,
      now: () => new Date('2026-10-30T12:00:00.000Z'),
      alertAfterAttempts: 3,
      alert: vi.fn(async () => undefined),
    });

    expect(mocks.createServerAuthLockoutStore).toHaveBeenCalledOnce();
    expect(mocks.claimDue).toHaveBeenCalledWith(10);
    expect(mocks.updateUserById).toHaveBeenCalledWith(job.authUserId, {
      ban_duration: '876000h',
    });
    expect(mocks.markSucceeded).toHaveBeenCalledWith(
      job.id,
      new Date('2026-10-30T12:00:00.000Z'),
    );
    expect(result).toEqual({
      claimed: 1,
      results: [{ status: 'succeeded' }],
    });
  });

  it('routes only the safe persistent-failure alert after retry persistence', async () => {
    mocks.claimDue.mockResolvedValue([
      { ...job, attempts: 2, status: 'retry' },
    ]);
    mocks.updateUserById.mockResolvedValue({
      error: { code: 'provider_unavailable', message: 'private provider text' },
    });
    const alert = vi.fn(async () => undefined);

    const result = await drainServerAuthLockouts({
      limit: 10,
      now: () => new Date('2026-10-30T12:00:00.000Z'),
      alertAfterAttempts: 3,
      alert,
    });

    expect(result).toEqual({
      claimed: 1,
      results: [{ status: 'retry_scheduled', attempt: 3 }],
    });
    expect(mocks.markRetry).toHaveBeenCalledWith({
      id: job.id,
      attempt: 3,
      retryAt: new Date('2026-10-30T12:08:00.000Z'),
      safeErrorCode: 'provider_unavailable',
    });
    expect(alert).toHaveBeenCalledWith({
      code: 'refund_auth_lockout_persistently_failing',
      operationId: job.id,
    });
    expect(JSON.stringify(alert.mock.calls)).not.toContain(
      'private provider text',
    );
  });

  it('does not claim work when the server Supabase client is unavailable', async () => {
    mocks.createServerAuthLockoutStore.mockReturnValue(null);
    const result = await drainServerAuthLockouts({
      limit: 10,
      now: () => new Date('2026-10-30T12:00:00.000Z'),
      alertAfterAttempts: 3,
      alert: vi.fn(async () => undefined),
    });

    expect(result).toEqual({ claimed: 0, results: [] });
    expect(mocks.claimDue).not.toHaveBeenCalled();
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
});
