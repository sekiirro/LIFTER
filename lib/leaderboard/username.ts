import {
  SIGNUP_USERNAME_MAX_LENGTH,
  SIGNUP_USERNAME_MIN_LENGTH,
  isReservedSignupUsername,
  normalizeSignupUsername,
} from '../forms/signup-policy';

/**
 * S55-PO-9 Q14 username rule, shared by F11 invitation-link signup and the
 * later client edit. It reuses the F15/F11 normalization seam (NFKC, then
 * lowercase) so case-insensitive workspace uniqueness stays a database key.
 */
export type UsernameIssue =
  'too_short' | 'too_long' | 'invalid_chars' | 'reserved';

export type UsernameCheck =
  { ok: true; normalized: string } | { ok: false; issue: UsernameIssue };

const allowedCharacters = /^[a-z0-9_.]+$/u;

export function checkUsername(
  value: unknown,
  workspaceIdentifiers: readonly string[] = [],
): UsernameCheck {
  if (typeof value !== 'string') return { ok: false, issue: 'invalid_chars' };
  const normalized = normalizeSignupUsername(value);
  const length = [...normalized].length;
  if (length < SIGNUP_USERNAME_MIN_LENGTH)
    return { ok: false, issue: 'too_short' };
  if (length > SIGNUP_USERNAME_MAX_LENGTH)
    return { ok: false, issue: 'too_long' };
  if (!allowedCharacters.test(normalized))
    return { ok: false, issue: 'invalid_chars' };
  // A compact-empty value ("___") is unavailable under S41-PO-12.
  if (
    normalized.replace(/[_.]+/gu, '') === '' ||
    isReservedSignupUsername(normalized, workspaceIdentifiers)
  )
    return { ok: false, issue: 'reserved' };
  return { ok: true, normalized };
}

/** Format-only classification for live form feedback (reserved is server-checked too). */
export function usernameFormatIssue(value: unknown): UsernameIssue | null {
  const result = checkUsername(value);
  if (result.ok || result.issue === 'reserved') return null;
  return result.issue;
}

export const USERNAME_UPDATE_STATUSES = [
  'updated',
  'unchanged',
  'too_short',
  'too_long',
  'invalid_chars',
  'reserved',
  'taken',
  'not_permitted',
  'unavailable',
] as const;
export type UsernameUpdateStatus = (typeof USERNAME_UPDATE_STATUSES)[number];

export function parseUsernameUpdateResult(
  value: unknown,
): UsernameUpdateStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return 'unavailable';
  const status = (value as { status?: unknown }).status;
  return (USERNAME_UPDATE_STATUSES as readonly unknown[]).includes(status)
    ? (status as UsernameUpdateStatus)
    : 'unavailable';
}
