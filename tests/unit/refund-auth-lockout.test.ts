import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import {
  recordRefundDeactivation,
  runAuthLockout,
  type AuthLockoutJob,
  type AuthLockoutStore,
  type RefundLockoutTransaction,
  type RefundLockoutTx,
} from '../../lib/payments/refund-auth-lockout';

const job: AuthLockoutJob = {
  id: 'outbox-1',
  authUserId: 'auth-user-1',
  attempts: 0,
  status: 'pending',
};

function store(overrides: Partial<AuthLockoutStore> = {}): AuthLockoutStore {
  return {
    markSucceeded: vi.fn(async () => undefined),
    markRetry: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('refund Auth lockout worker', () => {
  it('keeps the service-role admin client behind a server-only worker boundary', () => {
    const source = readFileSync('lib/payments/refund-auth-lockout.ts', 'utf8');
    expect(source.startsWith("import 'server-only';")).toBe(true);
    expect(source).toContain('createAdminClient');
    expect(source).not.toMatch(/console\.|NEXT_PUBLIC_|SERVICE_ROLE_KEY/);
  });
  it('rolls back both refund deactivation and outbox when the transaction fails', async () => {
    const committed = { deactivated: false, outbox: false };
    const makeTransaction =
      (fail: boolean): RefundLockoutTransaction =>
      async <T>(callback: (tx: RefundLockoutTx) => Promise<T>): Promise<T> => {
        const staged = { ...committed };
        const result = await callback({
          deactivateClient: async () => {
            staged.deactivated = true;
          },
          ensureAuthLockout: async () => {
            staged.outbox = true;
          },
        });
        if (fail) throw new Error('transaction aborted');
        Object.assign(committed, staged);
        return result;
      };

    await expect(
      recordRefundDeactivation(makeTransaction(true), {
        clientId: 'client-1',
        authUserId: 'auth-user-1',
      }),
    ).rejects.toThrow('transaction aborted');
    expect(committed).toEqual({ deactivated: false, outbox: false });
  });

  it('uses one idempotent client lockout row across repeated refunds', async () => {
    const rows = new Set<string>();
    const transaction: RefundLockoutTransaction = async <T>(
      callback: (tx: RefundLockoutTx) => Promise<T>,
    ): Promise<T> =>
      callback({
        deactivateClient: async () => undefined,
        ensureAuthLockout: async ({ clientId }) => {
          rows.add(clientId);
        },
      });
    await recordRefundDeactivation(transaction, {
      clientId: 'client-1',
      authUserId: 'auth-user-1',
    });
    await recordRefundDeactivation(transaction, {
      clientId: 'client-1',
      authUserId: 'auth-user-1',
    });
    expect([...rows]).toEqual(['client-1']);
  });
  it('uses the supported id-based Auth Admin ban and records completion', async () => {
    const updateUserById = vi.fn(async () => ({ error: null }));
    const persistence = store();

    const result = await runAuthLockout(job, {
      authAdmin: { updateUserById },
      store: persistence,
      now: () => new Date('2026-10-30T12:00:00.000Z'),
      alertAfterAttempts: 3,
    });

    expect(result).toEqual({ status: 'succeeded' });
    expect(updateUserById).toHaveBeenCalledWith('auth-user-1', {
      ban_duration: '876000h',
    });
    expect(persistence.markSucceeded).toHaveBeenCalledWith(
      'outbox-1',
      new Date('2026-10-30T12:00:00.000Z'),
    );
  });

  it('keeps the refund committed, schedules bounded retry, and raises a safe alert after persistent failure', async () => {
    const updateUserById = vi
      .fn()
      .mockResolvedValueOnce({
        error: {
          code: 'provider_unavailable',
          message: 'private provider text',
        },
      })
      .mockResolvedValueOnce({ error: null });
    const refund = { status: 'committed' };
    const persistence = store();
    const alert = vi.fn(async () => undefined);

    const result = await runAuthLockout(
      { ...job, attempts: 2 },
      {
        authAdmin: { updateUserById },
        store: persistence,
        now: () => new Date('2026-10-30T12:00:00.000Z'),
        alertAfterAttempts: 3,
        alert,
      },
    );

    expect(refund.status).toBe('committed');
    expect(result).toEqual({ status: 'retry_scheduled', attempt: 3 });
    expect(persistence.markRetry).toHaveBeenCalledWith({
      id: 'outbox-1',
      attempt: 3,
      retryAt: new Date('2026-10-30T12:08:00.000Z'),
      safeErrorCode: 'provider_unavailable',
    });
    expect(alert).toHaveBeenCalledWith({
      code: 'refund_auth_lockout_persistently_failing',
      operationId: 'outbox-1',
    });
    expect(JSON.stringify(alert.mock.calls)).not.toContain(
      'private provider text',
    );

    const retry = await runAuthLockout(
      { ...job, attempts: 3, status: 'retry' },
      {
        authAdmin: { updateUserById },
        store: persistence,
        now: () => new Date('2026-10-30T12:00:00.000Z'),
        alertAfterAttempts: 3,
      },
    );
    expect(retry).toEqual({ status: 'succeeded' });
    expect(refund.status).toBe('committed');
    expect(updateUserById).toHaveBeenCalledTimes(2);
    expect(persistence.markSucceeded).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a completed outbox operation', async () => {
    const updateUserById = vi.fn();
    const result = await runAuthLockout(
      { ...job, status: 'succeeded' },
      {
        authAdmin: { updateUserById },
        store: store(),
        now: () => new Date('2026-10-30T12:00:00.000Z'),
        alertAfterAttempts: 3,
      },
    );

    expect(result).toEqual({ status: 'already_succeeded' });
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
