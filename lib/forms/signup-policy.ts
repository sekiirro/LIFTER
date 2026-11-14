export const RESERVED_SIGNUP_ROLE_NAMES = [
  'platform',
  'system',
  'platformowner',
  'workspaceowner',
  'trainer',
  'sales',
  'client',
  // S55-PO-9 Q14 (F24): blocked case-insensitively at signup and later edits.
  'admin',
  'support',
  'lifter',
  'owner',
] as const;

const reservedRoleNames = new Set<string>(RESERVED_SIGNUP_ROLE_NAMES);

/** Names split on Unicode whitespace; the authored value is never rewritten. */
export function validateSignupName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().split(/\s+/u).filter(Boolean).length >= 3
  );
}

/** The signup contract deliberately specifies only NFKC followed by lowercase. */
export function normalizeSignupUsername(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

/** S55-PO-9 Q14 narrows the S32-PO-7 length bound to 3-20 characters. */
export const SIGNUP_USERNAME_MIN_LENGTH = 3;
export const SIGNUP_USERNAME_MAX_LENGTH = 20;

/** S32-PO-7/S55-PO-9 Q14: validate the normalized username without trimming or rewriting it. */
export function isValidSignupUsername(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z0-9_.]{3,20}$/u.test(normalizeSignupUsername(value))
  );
}

function compactIdentifier(value: string): string {
  return normalizeSignupUsername(value).replace(/[\s_.-]+/gu, '');
}

/** Workspace identifiers are supplied by trusted server context, never the form. */
export function isReservedSignupUsername(
  value: string,
  workspaceIdentifiers: readonly string[] = [],
): boolean {
  const normalized = normalizeSignupUsername(value);
  const compact = compactIdentifier(value);
  return (
    reservedRoleNames.has(compact) ||
    workspaceIdentifiers.some(
      (identifier) =>
        normalized === normalizeSignupUsername(identifier) ||
        compact === compactIdentifier(identifier),
    )
  );
}

/** Empty is valid because Telegram is optional; no linkage is attempted here. */
export function isValidTelegramUsername(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  const username = value.startsWith('@') ? value.slice(1) : value;
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/u.test(username);
}

function cairoCalendarDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function isPastCalendarDate(value: unknown, now: Date): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    !Number.isFinite(now.getTime())
  )
    return false;

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month! - 1 ||
    parsed.getUTCDate() !== day
  )
    return false;

  return value < cairoCalendarDate(now);
}

export function calculateSignupAge(
  dateOfBirth: string,
  now = new Date(),
): number | null {
  if (!isPastCalendarDate(dateOfBirth, now)) return null;
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = cairoCalendarDate(now)
    .split('-')
    .map(Number);
  return (
    todayYear! -
    birthYear! -
    (todayMonth! < birthMonth! ||
    (todayMonth === birthMonth && todayDay! < birthDay!)
      ? 1
      : 0)
  );
}
