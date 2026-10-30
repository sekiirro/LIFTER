export const AUTH_LOCKOUT_BAN_DURATION = '876000h';
const MAX_AUTH_LOCKOUT_BACKOFF_MS = 24 * 60 * 60 * 1000;

export type AuthLockoutSafeErrorCode =
  'provider_unavailable' | 'auth_admin_unavailable';

export function authLockoutSafeErrorCode(
  error: unknown,
): AuthLockoutSafeErrorCode {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'provider_unavailable'
  ) {
    return 'provider_unavailable';
  }
  return 'auth_admin_unavailable';
}

export function authLockoutRetryAt(attempt: number, now: Date): Date {
  if (
    !Number.isSafeInteger(attempt) ||
    attempt < 1 ||
    !Number.isFinite(now.getTime())
  )
    throw new Error('auth_lockout_invalid_retry');
  const backoffMs = Math.min(
    2 ** attempt * 60_000,
    MAX_AUTH_LOCKOUT_BACKOFF_MS,
  );
  return new Date(now.getTime() + backoffMs);
}
