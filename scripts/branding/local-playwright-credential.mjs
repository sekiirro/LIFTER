import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import {
  assertLocalStackTarget,
  loadSelectedStackEnv,
  selectStack,
} from '../local-stack.mjs';
import { issueBrandingCredential } from './issue-credential.mjs';

/** Create an expiring Stack-local proxy JWT in memory for Playwright's app server. */
export async function prepareLocalBrandingProxyCredential(env = process.env) {
  const stack = selectStack(env);
  loadSelectedStackEnv(env);
  const apiUrl = env.API_URL || env.SUPABASE_URL;
  const dbUrl = env.DB_URL || env.SUPABASE_DB_URL;
  if (!apiUrl || !dbUrl) return null;
  let api;
  try {
    api = new URL(apiUrl);
  } catch {
    return null;
  }
  if (api.hostname !== '127.0.0.1') return null;
  assertLocalStackTarget({ stack, apiUrl, dbUrl });
  if (!env.JWT_SECRET) throw new Error('Selected local JWT secret required');

  const credentialId = randomBytes(32).toString('base64url');
  const db = postgres(dbUrl, { max: 1, connect_timeout: 10 });
  let expiresAt;
  try {
    const [clock] = await db`
      select floor(extract(epoch from now()))::float8 as epoch
    `;
    expiresAt = clock.epoch + 3600;
    await db`
      select app_private.branding_credential_register(
        ${credentialId}, 'branding_proxy', to_timestamp(${expiresAt})
      )
    `;
    await db`
      select app_private.branding_credential_set_enabled(${credentialId}, true, false)
    `;
  } finally {
    await db.end();
  }
  return issueBrandingCredential({
    role: 'branding_proxy',
    credentialId,
    expiresAt,
    secret: env.JWT_SECRET,
  });
}
