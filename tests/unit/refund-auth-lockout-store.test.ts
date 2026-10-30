import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { SupabaseAuthLockoutStore } from '../../lib/payments/refund-auth-lockout-store';

const job = {
  id: '00000000-0000-4000-8000-000000000001',
  auth_user_id: '00000000-0000-4000-8000-000000000002',
  attempts: 2,
  status: 'retry',
};

function rpcClient(response: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => response) };
}

describe('Supabase Auth lockout store', () => {
  it('claims due jobs through the dedicated RPC and maps only worker fields', async () => {
    const client = rpcClient({ data: [job], error: null });
    const store = new SupabaseAuthLockoutStore(client);

    await expect(store.claimDue(12)).resolves.toEqual([
      {
        id: job.id,
        authUserId: job.auth_user_id,
        attempts: 2,
        status: 'retry',
      },
    ]);
    expect(client.rpc).toHaveBeenCalledWith('claim_refund_auth_lockout_jobs', {
      p_limit: 12,
    });
  });

  it('rejects malformed rows without returning database error text', async () => {
    const client = rpcClient({
      data: [{ ...job, auth_user_id: 'private-user-data' }],
      error: null,
    });
    const store = new SupabaseAuthLockoutStore(client);

    await expect(store.claimDue(1)).rejects.toThrow(
      'Auth lockout store unavailable',
    );
    await expect(store.claimDue(1)).rejects.not.toThrow('private-user-data');
  });

  it('rejects invalid claim limits before making an RPC call', async () => {
    const client = rpcClient({ data: [], error: null });
    const store = new SupabaseAuthLockoutStore(client);

    await expect(store.claimDue(0)).rejects.toThrow(
      'Auth lockout store unavailable',
    );
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('marks success only through its narrow RPC', async () => {
    const client = rpcClient({ data: true, error: null });
    const store = new SupabaseAuthLockoutStore(client);
    const completedAt = new Date('2026-10-30T12:00:00.000Z');

    await expect(
      store.markSucceeded(job.id, completedAt),
    ).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledWith(
      'complete_refund_auth_lockout_job',
      { p_id: job.id, p_completed_at: completedAt.toISOString() },
    );
  });

  it('stores only allowed safe error codes through its narrow retry RPC', async () => {
    const client = rpcClient({ data: true, error: null });
    const store = new SupabaseAuthLockoutStore(client);
    const retryAt = new Date('2026-10-30T12:08:00.000Z');

    await expect(
      store.markRetry({
        id: job.id,
        attempt: 3,
        retryAt,
        safeErrorCode: 'provider_unavailable',
      }),
    ).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledWith('retry_refund_auth_lockout_job', {
      p_id: job.id,
      p_attempt: 3,
      p_retry_at: retryAt.toISOString(),
      p_safe_error_code: 'provider_unavailable',
    });
  });

  it('fails closed on persistence errors without exposing provider text', async () => {
    const client = rpcClient({
      data: false,
      error: { message: 'private database details' },
    });
    const store = new SupabaseAuthLockoutStore(client);

    await expect(store.markSucceeded(job.id, new Date())).rejects.toThrow(
      'Auth lockout store unavailable',
    );
    await expect(store.markSucceeded(job.id, new Date())).rejects.not.toThrow(
      'private database details',
    );
  });

  it('rejects unsafe retry metadata before making an RPC call', async () => {
    const client = rpcClient({ data: true, error: null });
    const store = new SupabaseAuthLockoutStore(client);

    await expect(
      store.markRetry({
        id: job.id,
        attempt: 1,
        retryAt: new Date('2026-10-30T12:08:00.000Z'),
        safeErrorCode: 'private provider message',
      }),
    ).rejects.toThrow('Auth lockout store unavailable');
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
