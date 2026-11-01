import 'server-only';
import { createAdminClient } from '../supabase/admin';
import { createServerAuthLockoutStore } from './refund-auth-lockout-store';
import {
  AUTH_LOCKOUT_BAN_DURATION,
  authLockoutRetryAt,
  authLockoutSafeErrorCode,
} from './refund-auth-lockout-policy';

export type AuthLockoutJob = {
  id: string;
  authUserId: string;
  attempts: number;
  status: 'pending' | 'retry' | 'succeeded';
};

export type AuthLockoutStore = {
  markSucceeded(id: string, completedAt: Date): Promise<void>;
  markRetry(input: {
    id: string;
    attempt: number;
    retryAt: Date;
    safeErrorCode: string;
  }): Promise<void>;
};

type AuthAdmin = {
  updateUserById(
    userId: string,
    attributes: { ban_duration: string },
  ): Promise<{ error: { code?: string; message?: string } | null }>;
};

type Alert = (input: {
  code: 'refund_auth_lockout_persistently_failing';
  operationId: string;
}) => Promise<void>;

export type AuthLockoutResult =
  | { status: 'succeeded' }
  | { status: 'already_succeeded' }
  | { status: 'retry_scheduled'; attempt: number };

/** Applies the retryable Supabase Auth lockout after its refund transaction commits. */
export async function runAuthLockout(
  job: AuthLockoutJob,
  deps: {
    authAdmin: AuthAdmin;
    store: AuthLockoutStore;
    now: () => Date;
    alertAfterAttempts: number;
    alert?: Alert;
  },
): Promise<AuthLockoutResult> {
  if (job.status === 'succeeded') return { status: 'already_succeeded' };

  try {
    const result = await deps.authAdmin.updateUserById(job.authUserId, {
      ban_duration: AUTH_LOCKOUT_BAN_DURATION,
    });
    if (result.error) throw result.error;
  } catch (error) {
    const attempt = job.attempts + 1;
    const attemptAt = deps.now();
    await deps.store.markRetry({
      id: job.id,
      attempt,
      retryAt: authLockoutRetryAt(attempt, attemptAt),
      safeErrorCode: authLockoutSafeErrorCode(error),
    });
    if (attempt >= deps.alertAfterAttempts)
      await deps.alert?.({
        code: 'refund_auth_lockout_persistently_failing',
        operationId: job.id,
      });
    return { status: 'retry_scheduled', attempt };
  }

  // Preserve the store's void completion semantics. Persistence failures
  // propagate separately and are not classified as Auth Admin failures.
  await deps.store.markSucceeded(job.id, deps.now());
  return { status: 'succeeded' };
}

export type RefundLockoutTx = {
  deactivateClient(clientId: string): Promise<void>;
  ensureAuthLockout(input: {
    clientId: string;
    authUserId: string;
  }): Promise<void>;
};

export type RefundLockoutTransaction = <T>(
  callback: (tx: RefundLockoutTx) => Promise<T>,
) => Promise<T>;

/** Both writes use the caller's refund transaction; the outbox key is unique per client. */
export function recordRefundDeactivation(
  transaction: RefundLockoutTransaction,
  input: { clientId: string; authUserId: string },
): Promise<void> {
  return transaction(async (tx) => {
    await tx.deactivateClient(input.clientId);
    await tx.ensureAuthLockout(input);
  });
}

/** Production worker entry point; the service-role client is created only behind this server-only boundary. */
export function runServerAuthLockout(
  job: AuthLockoutJob,
  deps: {
    store: AuthLockoutStore;
    now: () => Date;
    alertAfterAttempts: number;
    alert?: Alert;
  },
): Promise<AuthLockoutResult> {
  const admin = createAdminClient();
  if (!admin)
    return runAuthLockout(job, {
      authAdmin: {
        updateUserById: async () => ({
          error: { code: 'provider_unavailable' },
        }),
      },
      ...deps,
    });
  return runAuthLockout(job, { authAdmin: admin.auth.admin, ...deps });
}

/**
 * Server-only drain seam for a scheduled caller. A caller must provide the
 * safe operational alert transport; this module does not invent recipients or
 * credentials for one.
 */
export async function drainServerAuthLockouts(deps: {
  limit: number;
  now: () => Date;
  alertAfterAttempts: number;
  alert: Alert;
}): Promise<{ claimed: number; results: AuthLockoutResult[] }> {
  const store = createServerAuthLockoutStore();
  if (!store) return { claimed: 0, results: [] };

  const jobs = await store.claimDue(deps.limit);
  const results: AuthLockoutResult[] = [];
  for (const job of jobs) {
    results.push(
      await runServerAuthLockout(job, {
        store,
        now: deps.now,
        alertAfterAttempts: deps.alertAfterAttempts,
        alert: deps.alert,
      }),
    );
  }
  return { claimed: jobs.length, results };
}
