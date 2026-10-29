// External operator tooling ONLY. Do not import from app/lib/Workers.
// The operator supplies a pre-registered random credential ID and sends the
// returned bearer directly to a secret-store API/stdin. Never print/save it.
import { createHmac } from 'node:crypto';

/**
 * @param {{ role: string, credentialId: string, expiresAt: number, secret: string }} options
 * @returns {string}
 */
export function issueBrandingCredential({
  role,
  credentialId,
  expiresAt,
  secret,
}) {
  if (
    !['branding_proxy', 'branding_validator'].includes(role) ||
    !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(credentialId) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000) ||
    !secret
  )
    throw new Error('Invalid branding issuance parameters');
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, credential_id: credentialId, iat: Math.floor(Date.now() / 1000), exp: expiresAt })}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}
