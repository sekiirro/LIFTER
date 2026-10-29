import 'server-only';
import { trustedIp, rateIpInput } from './trusted-ip';
import { isUuid } from '../registration-links/validation';

const utf8 = new TextEncoder();
function bytes(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hex.match(/../g)!, (v) => parseInt(v, 16));
}
function hex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
}
function encode(domain: string, fields: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const tag = utf8.encode(domain + '\0');
  const result = new Uint8Array(
    tag.length + fields.reduce((n, v) => n + 4 + v.length, 0),
  );
  result.set(tag);
  let offset = tag.length;
  for (const field of fields) {
    new DataView(result.buffer).setUint32(offset, field.length, false);
    offset += 4;
    result.set(field, offset);
    offset += field.length;
  }
  return result;
}
async function hmac(
  secret: string,
  domain: string,
  ...fields: Uint8Array[]
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    bytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, encode(domain, fields)));
}
/** At least 256 bits; only the digest may be persisted by the bounded RPC. */
export function newRequestSecret(): string {
  const data = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...data))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
/** Raw IP is an input only; return values contain derived proof material only. */
export async function buildAdmission(input: {
  ip: string;
  token: string;
  issuedAt?: number;
  nonce?: string;
}) {
  const rate = process.env.SIGNUP_RATE_KEY,
    attest = process.env.SIGNUP_ATTEST_KEY;
  if (
    !rate ||
    !attest ||
    !/^[0-9a-f]{64}$/.test(rate) ||
    !/^[0-9a-f]{64}$/.test(attest)
  )
    return null;
  const ip = trustedIp({ get: () => input.ip });
  const ms = input.issuedAt ?? Date.now(),
    nonce = input.nonce ?? crypto.randomUUID();
  if (
    !ip ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.token) ||
    !Number.isSafeInteger(ms) ||
    !isUuid(nonce) ||
    !Number.isFinite(new Date(ms).getTime())
  )
    return null;
  const hash = hex(
    await crypto.subtle.digest('SHA-256', utf8.encode(input.token)),
  );
  const ipKey = await hmac(
    rate,
    'lifter.f11.ip.v1',
    utf8.encode(rateIpInput(ip)),
  );
  const linkKey = await hmac(rate, 'lifter.f11.link.v1', utf8.encode(hash));
  const attestation = await attestAdmission({
    ipKey,
    linkKey,
    issuedAt: ms,
    nonce,
  });
  if (!attestation) return null;
  return {
    ipKey,
    linkKey,
    issuedAt: new Date(ms).toISOString(),
    nonce,
    attestation,
  };
}

/** Signs already derived fields with the server-held attestation key. */
export async function attestAdmission(input: {
  ipKey: string;
  linkKey: string;
  issuedAt: number;
  nonce: string;
}): Promise<string | null> {
  const secret = process.env.SIGNUP_ATTEST_KEY;
  if (
    !secret ||
    !/^[0-9a-f]{64}$/.test(secret) ||
    !/^[0-9a-f]{64}$/.test(input.ipKey) ||
    !/^[0-9a-f]{64}$/.test(input.linkKey) ||
    !Number.isSafeInteger(input.issuedAt) ||
    !isUuid(input.nonce)
  )
    return null;
  return hmac(
    secret,
    'lifter.f11.attest.v1',
    bytes(input.ipKey),
    bytes(input.linkKey),
    utf8.encode(String(input.issuedAt)),
    bytes(input.nonce.replaceAll('-', '')),
  );
}
