import 'server-only';
import { createAdminClient } from '../supabase/admin';

const BAN_DURATION = '876000h';
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;

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

function safeErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'provider_unavailable'
  )
    return 'provider_unavailable';
  return 'auth_admin_unavailable';
}

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
      ban_duration: BAN_DURATION,
    });
    if (result.error) throw result.error;
    await deps.store.markSucceeded(job.id, deps.now());
    return { status: 'succeeded' };
  } catch (error) {
    const attempt = job.attempts + 1;
    const backoffMs = Math.min(2 ** attempt * 60_000, MAX_BACKOFF_MS);
    await deps.store.markRetry({
      id: job.id,
      attempt,
      retryAt: new Date(deps.now().getTime() + backoffMs),
      safeErrorCode: safeErrorCode(error),
    });
    if (attempt >= deps.alertAfterAttempts)
      await deps.alert?.({
        code: 'refund_auth_lockout_persistently_failing',
        operationId: job.id,
      });
    return { status: 'retry_scheduled', attempt };
  }
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
