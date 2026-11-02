import 'server-only';
import { createAdminClient } from '../supabase/admin';
import type { AuthLockoutJob, AuthLockoutStore } from './refund-auth-lockout';

type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ERROR_CODES = new Set([
  'provider_unavailable',
  'auth_admin_unavailable',
]);

function unavailable(): Error {
  return new Error('Auth lockout store unavailable');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJob(value: unknown): AuthLockoutJob {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !UUID.test(value.id) ||
    typeof value.auth_user_id !== 'string' ||
    !UUID.test(value.auth_user_id) ||
    typeof value.attempts !== 'number' ||
    !Number.isSafeInteger(value.attempts) ||
    value.attempts < 0 ||
    (value.status !== 'pending' && value.status !== 'retry')
  )
    throw unavailable();

  return {
    id: value.id,
    authUserId: value.auth_user_id,
    attempts: value.attempts,
    status: value.status,
  };
}

/** Narrow RPC-only adapter; the server worker never reads or writes the outbox table directly. */
export class SupabaseAuthLockoutStore implements AuthLockoutStore {
  constructor(private readonly client: RpcClient) {}

  async claimDue(limit: number): Promise<AuthLockoutJob[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw unavailable();
    try {
      const { data, error } = await this.client.rpc(
        'claim_refund_auth_lockout_jobs',
        { p_limit: limit },
      );
      if (error || !Array.isArray(data)) throw unavailable();
      return data.map(parseJob);
    } catch {
      throw unavailable();
    }
  }

  async markSucceeded(id: string, completedAt: Date): Promise<void> {
    if (!UUID.test(id) || !Number.isFinite(completedAt.getTime()))
      throw unavailable();
    try {
      const { data, error } = await this.client.rpc(
        'complete_refund_auth_lockout_job',
        { p_id: id, p_completed_at: completedAt.toISOString() },
      );
      if (error || data !== true) throw unavailable();
    } catch {
      throw unavailable();
    }
  }

  async markRetry(input: {
    id: string;
    attempt: number;
    retryAt: Date;
    safeErrorCode: string;
  }): Promise<void> {
    if (
      !UUID.test(input.id) ||
      !Number.isSafeInteger(input.attempt) ||
      input.attempt < 1 ||
      input.attempt > 2_147_483_647 ||
      !Number.isFinite(input.retryAt.getTime()) ||
      !SAFE_ERROR_CODES.has(input.safeErrorCode)
    )
      throw unavailable();
    try {
      const { data, error } = await this.client.rpc(
        'retry_refund_auth_lockout_job',
        {
          p_id: input.id,
          p_attempt: input.attempt,
          p_retry_at: input.retryAt.toISOString(),
          p_safe_error_code: input.safeErrorCode,
        },
      );
      if (error || data !== true) throw unavailable();
    } catch {
      throw unavailable();
    }
  }
}

/** Creates the adapter from the server-only service client when credentials exist. */
export function createServerAuthLockoutStore(): SupabaseAuthLockoutStore | null {
  const client = createAdminClient();
  return client ? new SupabaseAuthLockoutStore(client) : null;
}
