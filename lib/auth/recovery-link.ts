import 'server-only';
import { createAdminClient } from '../supabase/admin';
import { createSessionClient } from '../supabase/server';
import { isSecureUrl, readServerEnv } from '../supabase/env';
import { getActor } from './actor';
import { authorize } from './authorize';
import { mapRpcError, type RecoveryLinkResult } from './results';

export function buildRecoveryUrl(origin: string, tokenHash: string): string {
  if (!isSecureUrl(origin)) throw new Error('invalid_origin');
  const url = new URL('/auth/recovery', origin);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', 'recovery');
  return url.toString();
}

export async function generateRecoveryLink(
  targetUserId: string,
): Promise<RecoveryLinkResult> {
  if (
    typeof targetUserId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      targetUserId,
    )
  )
    return { status: 'denied' };
  try {
    const env = readServerEnv();
    if (!env) return { status: 'unavailable' };
    // Actions return a generic denial instead of requireActor's page redirect.
    const actor = await getActor();
    if (!actor) return { status: 'denied' };
    const client = await createSessionClient();
    if (!client) return { status: 'unavailable' };
    const allowed = await client.rpc('recovery_link_authorize', {
      target: targetUserId,
    });
    if (allowed.error) return { status: mapRpcError(allowed.error) };
    if (typeof allowed.data !== 'string') return { status: 'unavailable' };
    if (!authorize(actor, 'generate_recovery_link', allowed.data))
      return { status: 'denied' };
    const admin = createAdminClient();
    if (!admin) return { status: 'unavailable' };
    const user = await admin.auth.admin.getUserById(targetUserId);
    if (user.error || !user.data.user?.email) return { status: 'unavailable' };
    const generated = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: user.data.user.email,
    });
    if (generated.error || !generated.data.properties?.hashed_token)
      return { status: 'unavailable' };
    const recorded = await client.rpc('recovery_link_record', {
      target: targetUserId,
    });
    if (recorded.error) return { status: mapRpcError(recorded.error) };
    if (!recorded.data) return { status: 'unavailable' };
    return {
      status: 'ok',
      link: buildRecoveryUrl(
        env.appOrigin,
        generated.data.properties.hashed_token,
      ),
    };
  } catch {
    return { status: 'unavailable' };
  }
}
