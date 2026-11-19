import 'server-only';

export type StaffResetRole =
  'platform_owner' | 'workspace_owner' | 'trainer' | 'sales' | 'client' | null;

export function isSyntacticallyValidStaffResetEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
}

export function isEligibleStaffRole(role: unknown): boolean {
  return (
    role === 'platform_owner' ||
    role === 'workspace_owner' ||
    role === 'trainer' ||
    role === 'sales'
  );
}

export function buildStaffResetRedirectTo(
  appOrigin: string | undefined,
  untrusted?: { next?: unknown; query?: unknown; headers?: unknown },
): string {
  void untrusted;
  if (!appOrigin) throw new Error('Invalid app origin');
  let url: URL;
  try {
    url = new URL(appOrigin);
  } catch {
    throw new Error('Invalid app origin');
  }
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    throw new Error('Invalid app origin');
  return new URL('/auth/recovery', url.origin).toString();
}
