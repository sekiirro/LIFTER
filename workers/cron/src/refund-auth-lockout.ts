import type { Env } from './rpc';
import { createRpc } from './rpc';
import {
  AUTH_LOCKOUT_BAN_DURATION,
  authLockoutRetryAt,
  authLockoutSafeErrorCode,
} from '../../../lib/payments/refund-auth-lockout-policy';

const DEFAULT_BATCH = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LockoutJob = {
  id: string;
  auth_user_id: string;
  attempts: number;
  status: 'pending' | 'retry';
};

function checkedJob(value: unknown): LockoutJob {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !UUID.test(value.id) ||
    !('auth_user_id' in value) ||
    typeof value.auth_user_id !== 'string' ||
    !UUID.test(value.auth_user_id) ||
    !('attempts' in value) ||
    typeof value.attempts !== 'number' ||
    !Number.isSafeInteger(value.attempts) ||
    value.attempts < 0 ||
    !('status' in value) ||
    (value.status !== 'pending' && value.status !== 'retry')
  )
    throw new Error('auth_lockout_invalid_job');
  return value as LockoutJob;
}

/** A bounded scheduled drain. The five-minute sweep runs before claim on every cron tick. */
export async function drainRefundAuthLockouts(
  env: Env,
  options: { limit?: number; now?: () => Date; fetcher?: typeof fetch } = {},
): Promise<{ alerted: number; claimed: number; failed: number }> {
  const limit = options.limit ?? DEFAULT_BATCH;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error('auth_lockout_invalid_batch');
  const now = options.now ?? (() => new Date());
  const fetcher = options.fetcher ?? fetch;
  const rpc = createRpc(env, fetcher);
  const checkedAt = now();
  const alerted = await rpc('alert_expired_refund_auth_lockouts', {
    p_limit: limit,
    p_checked_at: checkedAt.toISOString(),
  });
  const rawJobs = await rpc('claim_refund_auth_lockout_jobs', {
    p_limit: limit,
  });
  if (!Array.isArray(rawJobs) || rawJobs.length > limit)
    throw new Error('auth_lockout_invalid_batch_result');
  const jobs = rawJobs.map(checkedJob);
  let failed = 0;

  for (const job of jobs) {
    const attempt = job.attempts + 1;
    let succeeded = false;
    let safeFailure: unknown;
    try {
      const base = new URL(env.SUPABASE_URL);
      const response = await fetcher(
        `${base.origin}/auth/v1/admin/users/${encodeURIComponent(job.auth_user_id)}`,
        {
          method: 'PUT',
          redirect: 'manual',
          signal: AbortSignal.timeout(30_000),
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ban_duration: AUTH_LOCKOUT_BAN_DURATION }),
        },
      );
      succeeded = response.ok;
      if (!succeeded)
        safeFailure = {
          code:
            response.status >= 500
              ? 'provider_unavailable'
              : 'auth_admin_unavailable',
        };
    } catch {
      succeeded = false;
      safeFailure = { code: 'provider_unavailable' };
    }

    if (succeeded) {
      const completed = await rpc('complete_refund_auth_lockout_job', {
        p_id: job.id,
        p_completed_at: now().toISOString(),
      });
      if (!completed) throw new Error('auth_lockout_completion_failed');
    } else {
      failed++;
      const attemptAt = now();
      const saved = await rpc('retry_refund_auth_lockout_job', {
        p_id: job.id,
        p_attempt: attempt,
        p_retry_at: authLockoutRetryAt(attempt, attemptAt).toISOString(),
        p_safe_error_code: authLockoutSafeErrorCode(safeFailure),
      });
      if (!saved) throw new Error('auth_lockout_retry_failed');
    }
  }

  return { alerted, claimed: jobs.length, failed };
}
