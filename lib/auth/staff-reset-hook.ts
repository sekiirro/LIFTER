import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_WEBHOOK_AGE_SECONDS = 300;
export const STAFF_RESET_TEST_RECIPIENT = 'staff-reset@example.test';

export type StaffResetHookSignature = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export type StaffResetHookEvent = {
  userId: string;
  email: string;
  tokenHash: string;
  locale: 'ar' | 'en';
};

export function isApprovedStaffResetTestRecipient(email: string): boolean {
  return email.trim().toLowerCase() === STAFF_RESET_TEST_RECIPIENT;
}

export function verifyStaffResetHookSignature(
  rawBody: string,
  headers: StaffResetHookSignature,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature)
    return false;
  const match = /^v1,whsec_([A-Za-z0-9+/=_-]+)$/.exec(secret);
  if (!match) return false;
  const encodedKey = match[1];
  if (!encodedKey) return false;

  const timestamp = Number(headers.timestamp);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > MAX_WEBHOOK_AGE_SECONDS
  )
    return false;

  let key: Buffer;
  try {
    key = Buffer.from(encodedKey, 'base64');
  } catch {
    return false;
  }
  if (key.length < 16) return false;

  const expected = createHmac('sha256', key)
    .update(`${headers.id}.${headers.timestamp}.${rawBody}`)
    .digest();
  const candidates = headers.signature
    .trim()
    .split(/\s+/)
    .map((part) => /^v1,([A-Za-z0-9+/=_-]+)$/.exec(part)?.[1])
    .filter((value): value is string => Boolean(value));

  return candidates.some((candidate) => {
    let provided: Buffer;
    try {
      provided = Buffer.from(candidate, 'base64');
    } catch {
      return false;
    }
    return (
      provided.length === expected.length && timingSafeEqual(provided, expected)
    );
  });
}

export function parseStaffResetHookPayload(
  value: unknown,
  appOrigin: string | undefined,
): StaffResetHookEvent | null {
  if (!value || typeof value !== 'object' || !appOrigin) return null;
  const payload = value as {
    user?: { id?: unknown; email?: unknown };
    email_data?: {
      email_action_type?: unknown;
      token_hash?: unknown;
      redirect_to?: unknown;
    };
  };
  const { user, email_data: email } = payload;
  if (
    email?.email_action_type !== 'recovery' ||
    typeof user?.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      user.id,
    ) ||
    typeof user.email !== 'string' ||
    typeof email.token_hash !== 'string' ||
    !email.token_hash ||
    typeof email.redirect_to !== 'string'
  )
    return null;

  let appUrl: URL;
  let redirectUrl: URL;
  try {
    appUrl = new URL(appOrigin);
    redirectUrl = new URL(email.redirect_to);
  } catch {
    return null;
  }
  const defaultSiteRedirect =
    redirectUrl.pathname === '/' && !redirectUrl.search && !redirectUrl.hash;
  if (
    redirectUrl.origin !== appUrl.origin ||
    (redirectUrl.pathname !== '/auth/recovery' && !defaultSiteRedirect) ||
    redirectUrl.username ||
    redirectUrl.password
  )
    return null;

  return {
    userId: user.id,
    email: user.email.trim().toLowerCase(),
    tokenHash: email.token_hash,
    locale: redirectUrl.searchParams.get('locale') === 'en' ? 'en' : 'ar',
  };
}

export function buildStaffResetEmailLink(
  tokenHash: string,
  appOrigin: string,
  locale: 'ar' | 'en',
): string {
  const url = new URL('/auth/recovery', appOrigin);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', 'recovery');
  url.searchParams.set('flow', 'staff');
  url.searchParams.set('locale', locale);
  return url.toString();
}
