import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { probe, sql } from './client-accounts-fixture';
const lp = (value: Buffer) => {
  const n = Buffer.alloc(4);
  n.writeUInt32BE(value.length);
  return Buffer.concat([n, value]);
};
export const mac = (key: string, domain: string, ...fields: Buffer[]) =>
  createHmac('sha256', Buffer.from(key, 'hex'))
    .update(Buffer.concat([Buffer.from(domain + '\0'), ...fields.map(lp)]))
    .digest();
const uuidBytes = (nonce: string) =>
  Buffer.from(nonce.replaceAll('-', ''), 'hex');
export function proof(token: string, patch: Record<string, unknown> = {}) {
  const rate = process.env.SIGNUP_RATE_KEY,
    attest = process.env.SIGNUP_ATTEST_KEY;
  if (!rate || !attest) {
    throw new Error('SIGNUP_* env missing; run provisioning');
  }
  const hash = createHash('sha256').update(token).digest('hex');
  const p = {
    token,
    request: randomBytes(32).toString('base64url'),
    ip: mac(rate, 'lifter.f11.ip.v1', Buffer.from(randomUUID())),
    link: mac(rate, 'lifter.f11.link.v1', Buffer.from(hash)),
    ms: Date.now() - 1000,
    nonce: randomUUID(),
    ...patch,
  };
  return {
    ...p,
    attestation: mac(
      attest,
      'lifter.f11.attest.v1',
      p.ip,
      p.link,
      Buffer.from(String(p.ms)),
      uuidBytes(p.nonce),
    ),
  };
}
type Proof = ReturnType<typeof proof>;
export async function admit(
  tx: ReturnType<typeof sql> | Parameters<Parameters<typeof probe>[0]>[0],
  p: Proof,
) {
  try {
    const [r] =
      await tx`select public.client_signup_admit(${p.token},${p.request},${p.ip},${p.link},${new Date(p.ms).toISOString()},${p.nonce},${p.attestation}) as result`;
    return r!.result;
  } catch (error) {
    throw new Error(
      'Admission SQL failed: ' + String((error as { code?: string }).code),
    );
  }
}
export async function counts(
  tx: ReturnType<typeof sql> | Parameters<Parameters<typeof probe>[0]>[0],
) {
  const [r] =
    await tx`select (select count(*)::int from app_private.signup_rate_counters) as counters,(select coalesce(sum(count),0)::int from app_private.signup_rate_counters) as credits,(select count(*)::int from app_private.signup_admission_nonces) as nonces,(select count(*)::int from app_private.signup_admission_tickets) as tickets,(select count(*)::int from app_private.client_signup_attempts) as attempts,(select count(*)::int from public.audit_events) as audits`;
  return r;
}

export async function countsForAdmission(
  tx: ReturnType<typeof sql> | Parameters<Parameters<typeof probe>[0]>[0],
  p: Proof,
  linkId: string,
) {
  const [r] = await tx`
    select
      (select count(*)::int from app_private.signup_rate_counters
        where (scope='link' and key=${p.link}) or (scope='ip' and key=${p.ip})) as counters,
      (select coalesce(sum(count),0)::int from app_private.signup_rate_counters
        where (scope='link' and key=${p.link}) or (scope='ip' and key=${p.ip})) as credits,
      (select count(*)::int from app_private.signup_admission_nonces where nonce=${p.nonce}) as nonces,
      (select count(*)::int from app_private.signup_admission_tickets where link_id=${linkId}) as tickets,
      (select count(*)::int from app_private.client_signup_attempts where link_id=${linkId}) as attempts,
      (select count(*)::int from public.audit_events e
        join app_private.client_signup_attempts a on a.id=e.target_id
        where a.link_id=${linkId}) as audits`;
  return r;
}
