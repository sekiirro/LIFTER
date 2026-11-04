export const RESERVED_SIGNUP_ROLE_NAMES = [
  'platform',
  'system',
  'platformowner',
  'workspaceowner',
  'trainer',
  'sales',
  'client',
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

/** The accepted username alphabet is deliberately limited to ASCII. */
export function isValidSignupUsername(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_.]{3,30}$/u.test(value);
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

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return value < today;
}

export function calculateSignupAge(
  dateOfBirth: string,
  now = new Date(),
): number | null {
  if (!isPastCalendarDate(dateOfBirth, now)) return null;
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
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
