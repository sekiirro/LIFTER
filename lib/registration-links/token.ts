import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
export function generateToken(
  random: (size: number) => Uint8Array = randomBytes,
): string {
  try {
    const bytes = random(32);
    if (!(bytes instanceof Uint8Array) || bytes.length !== 32)
      throw new Error('unavailable');
    const token = Buffer.from(bytes).toString('base64url');
    if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token))
      throw new Error('unavailable');
    return token;
  } catch {
    throw new Error('unavailable');
  }
}
export const hashToken = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');
export function registrationOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || value.includes('?') || value.includes('#'))
    return null;
  try {
    const u = new URL(value);
    if (
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== '/' ||
      !(
        u.protocol === 'https:' ||
        (u.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))
      )
    )
      return null;
    return u.origin;
  } catch {
    return null;
  }
}
export function registrationUrl(origin: string, token: string): string {
  const safe = registrationOrigin(origin);
  if (!safe || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token))
    throw new Error('unavailable');
  return `${safe}/register/${token}`;
}
