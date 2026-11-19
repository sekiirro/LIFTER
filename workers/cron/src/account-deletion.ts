import {
  DELETION_AUTH_BAN_DURATION,
  buildClearedMetadataPayload,
  deletionRetryAt,
  deletionSafeErrorCode,
  isMetadataEmpty,
  placeholderDeletionEmail,
  type DeletionSafeErrorCode,
} from '../../../lib/client-accounts/deletion-policy';
import type { Env } from './rpc';
import { createRpc, validateSupabaseUrl } from './rpc';

const DEFAULT_BATCH = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DeletionIntentState =
  | 'pending_ban'
  | 'banned_pending_db'
  | 'release_pending'
  | 'auth_release_in_progress';

export type ClaimedDeletionIntent = {
  id: string;
  target_user_id: string;
  target_kind: 'client' | 'staff';
  state: DeletionIntentState;
  attempts: number;
  lease_token: string;
};

type AuthAdminUser = {
  id?: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: unknown;
};

function checkedIntent(value: unknown): ClaimedDeletionIntent {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !UUID.test(value.id) ||
    !('target_user_id' in value) ||
    typeof value.target_user_id !== 'string' ||
    !UUID.test(value.target_user_id) ||
    !('target_kind' in value) ||
    (value.target_kind !== 'client' && value.target_kind !== 'staff') ||
    !('state' in value) ||
    (value.state !== 'pending_ban' &&
      value.state !== 'banned_pending_db' &&
      value.state !== 'release_pending' &&
      value.state !== 'auth_release_in_progress') ||
    !('attempts' in value) ||
    typeof value.attempts !== 'number' ||
    !Number.isSafeInteger(value.attempts) ||
    value.attempts < 0 ||
    !('lease_token' in value) ||
    typeof value.lease_token !== 'string' ||
    !UUID.test(value.lease_token)
  ) {
    throw new Error('account_deletion_invalid_intent');
  }
  return value as ClaimedDeletionIntent;
}

function authAdminHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function fetchAuthAdminUser(
  baseOrigin: string,
  env: Env,
  userId: string,
  fetcher: typeof fetch,
): Promise<AuthAdminUser> {
  let response: Response;
  try {
    response = await fetcher(
      `${baseOrigin}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
        headers: authAdminHeaders(env),
      },
    );
  } catch {
    throw { code: 'provider_unavailable' as DeletionSafeErrorCode };
  }
  if (!response.ok) {
    throw {
      code: (response.status >= 500
        ? 'provider_unavailable'
        : 'auth_admin_unavailable') as DeletionSafeErrorCode,
    };
  }
  const body = (await response.json()) as unknown;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw { code: 'auth_admin_unavailable' as DeletionSafeErrorCode };
  }
  return body as AuthAdminUser;
}

async function putAuthAdminUser(
  baseOrigin: string,
  env: Env,
  userId: string,
  payload: Record<string, unknown>,
  fetcher: typeof fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await fetcher(
      `${baseOrigin}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        method: 'PUT',
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
        headers: authAdminHeaders(env),
        body: JSON.stringify(payload),
      },
    );
  } catch {
    throw { code: 'provider_unavailable' as DeletionSafeErrorCode };
  }
  if (!response.ok) {
    throw {
      code: (response.status >= 500
        ? 'provider_unavailable'
        : 'auth_admin_unavailable') as DeletionSafeErrorCode,
    };
  }
}

async function executeStepCAuthRelease(
  baseOrigin: string,
  env: Env,
  intent: ClaimedDeletionIntent,
  fetcher: typeof fetch,
): Promise<void> {
  const placeholderEmail = placeholderDeletionEmail(intent.id);
  const current = await fetchAuthAdminUser(
    baseOrigin,
    env,
    intent.target_user_id,
    fetcher,
  );
  const metadataPatch = buildClearedMetadataPayload(current.user_metadata);
  const updateBody: Record<string, unknown> = {
    email: placeholderEmail,
    email_confirm: true,
    ...(current.phone ? { phone: '' } : {}),
    ...(metadataPatch ? { user_metadata: metadataPatch } : {}),
  };
  await putAuthAdminUser(
    baseOrigin,
    env,
    intent.target_user_id,
    updateBody,
    fetcher,
  );

  let verified = await fetchAuthAdminUser(
    baseOrigin,
    env,
    intent.target_user_id,
    fetcher,
  );

  // If GoTrue re-populated or retained any metadata key (e.g. email_verified on email update),
  // perform one explicit metadata-only null pass and re-read to confirm {}.
  if (!isMetadataEmpty(verified.user_metadata)) {
    const secondPatch = buildClearedMetadataPayload(verified.user_metadata);
    if (secondPatch) {
      await putAuthAdminUser(
        baseOrigin,
        env,
        intent.target_user_id,
        { user_metadata: secondPatch },
        fetcher,
      );
      verified = await fetchAuthAdminUser(
        baseOrigin,
        env,
        intent.target_user_id,
        fetcher,
      );
    }
  }

  if (
    !isMetadataEmpty(verified.user_metadata) ||
    verified.email?.toLowerCase() !== placeholderEmail ||
    Boolean(verified.phone)
  ) {
    throw {
      code: (!isMetadataEmpty(verified.user_metadata)
        ? 'metadata_not_empty'
        : 'auth_admin_unavailable') as DeletionSafeErrorCode,
    };
  }
}

/**
 * Restricted system continuation for F11 account deletion (P-S40-1, S64-R46 Option 1).
 * Drives pending intents through steps (A) -> (B) -> (C) -> (D) using narrow
 * lease-checked service_role RPCs and GoTrue Admin HTTP calls.
 */
export async function drainAccountDeletions(
  env: Env,
  options: { limit?: number; now?: () => Date; fetcher?: typeof fetch } = {},
): Promise<{
  claimed: number;
  completed: number;
  failed: number;
}> {
  const limit = options.limit ?? DEFAULT_BATCH;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('account_deletion_invalid_batch');
  }
  const baseUrl = validateSupabaseUrl(env.SUPABASE_URL);
  const now = options.now ?? (() => new Date());
  const fetcher = options.fetcher ?? fetch;
  const rpc = createRpc(env, fetcher);

  const rawIntents = await rpc('claim_account_deletion_intents', {
    p_limit: limit,
  });
  if (!Array.isArray(rawIntents) || rawIntents.length > limit) {
    throw new Error('account_deletion_invalid_batch_result');
  }
  const intents = rawIntents.map(checkedIntent);
  let completed = 0;
  let failed = 0;
  let persistenceFailed = false;

  for (const intent of intents) {
    const attempt = intent.attempts + 1;
    let currentState: DeletionIntentState = intent.state;
    let safeFailure: unknown = null;

    try {
      if (currentState === 'pending_ban') {
        await putAuthAdminUser(
          baseUrl.origin,
          env,
          intent.target_user_id,
          { ban_duration: DELETION_AUTH_BAN_DURATION },
          fetcher,
        );
        const advanced = await rpc('advance_deletion_step_a', {
          p_intent_id: intent.id,
          p_lease_token: intent.lease_token,
        });
        if (!advanced) {
          throw { code: 'auth_admin_unavailable' as DeletionSafeErrorCode };
        }
        currentState = 'banned_pending_db';
      }

      if (currentState === 'banned_pending_db') {
        const stepB = await rpc('execute_deletion_step_b', {
          p_intent_id: intent.id,
          p_lease_token: intent.lease_token,
        });
        if (!stepB) {
          throw { code: 'step_b_failed' as DeletionSafeErrorCode };
        }
        currentState = 'release_pending';
      }

      if (currentState === 'release_pending') {
        const beganC = await rpc('begin_deletion_step_c', {
          p_intent_id: intent.id,
          p_lease_token: intent.lease_token,
        });
        if (!beganC) {
          throw { code: 'step_b_failed' as DeletionSafeErrorCode };
        }
        currentState = 'auth_release_in_progress';
      }

      if (currentState === 'auth_release_in_progress') {
        await executeStepCAuthRelease(baseUrl.origin, env, intent, fetcher);
        const stepD = await rpc('execute_deletion_step_d', {
          p_intent_id: intent.id,
          p_lease_token: intent.lease_token,
        });
        if (!stepD) {
          throw { code: 'step_d_failed' as DeletionSafeErrorCode };
        }
        completed++;
      }
    } catch (error) {
      safeFailure = error;
      failed++;
      try {
        const attemptAt = now();
        const saved = await rpc('retry_account_deletion_intent', {
          p_intent_id: intent.id,
          p_lease_token: intent.lease_token,
          p_attempt: attempt,
          p_retry_at: deletionRetryAt(attempt, attemptAt).toISOString(),
          p_safe_error_code: deletionSafeErrorCode(safeFailure),
        });
        if (!saved) persistenceFailed = true;
      } catch {
        persistenceFailed = true;
      }
    }
  }

  if (persistenceFailed) {
    throw new Error('account_deletion_persistence_failed');
  }

  return {
    claimed: intents.length,
    completed,
    failed,
  };
}
