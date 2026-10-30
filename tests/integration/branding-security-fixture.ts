import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadEnv, sql } from './harness';
import {
  issue,
  registrationFixture,
  secret,
} from './registration-links-fixture';
import { issueBrandingCredential } from '../../scripts/branding/issue-credential.mjs';

export const env = loadEnv();
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export const opaque = () => randomBytes(32).toString('base64url');
export async function credential(
  db: ReturnType<typeof sql>,
  role = 'branding_proxy',
) {
  const id = opaque();
  const [clock] =
    await db`select floor(extract(epoch from now()))::float8 as epoch`;
  const expiresAt = clock!.epoch + 3600;
  await db`select app_private.branding_credential_register(${id},${role},${new Date(expiresAt * 1000).toISOString()}::timestamptz)`;
  await db`select app_private.branding_credential_set_enabled(${id},true,false)`;
  const claims = {
    role,
    credential_id: id,
    iat: clock!.epoch - 1,
    exp: expiresAt,
  };
  const key = process.env.JWT_SECRET;
  if (!key) throw new Error('Selected local JWT secret required');
  const jwt = issueBrandingCredential({
    role,
    credentialId: id,
    expiresAt: claims.exp,
    secret: key,
  });
  const client = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  return { id, jwt, claims, client };
}
// Intentionally invalid JWT probes are signed only in this local test process.
export function negativeJwt(claims: Record<string, unknown>) {
  const key = process.env.JWT_SECRET;
  if (!key) throw new Error('Selected local JWT secret required');
  const unsigned = [{ alg: 'HS256', typ: 'JWT' }, claims]
    .map((v) => Buffer.from(JSON.stringify(v)).toString('base64url'))
    .join('.');
  return `${unsigned}.${createHmac('sha256', key).update(unsigned).digest('base64url')}`;
}
export async function brandingFixture(db: ReturnType<typeof sql>) {
  const f = await registrationFixture();
  const s = secret();
  const issued = await issue(f, f.po.client, { token_hash: s.hash });
  if (issued.error) throw new Error('Link fixture issuance failed');
  const [v] =
    await db`insert into app_private.branding_published_versions(workspace_id) values(${f.wsA.id}) returning id`;
  await db`insert into app_private.branding_current_publications(workspace_id,version_id) values(${f.wsA.id},${v!.id})`;
  return {
    ...f,
    token: s.token,
    linkId: issued.data as string,
    versionId: v!.id as string,
  };
}
