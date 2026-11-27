import type { Rpc } from './drain';
import { createRpc, type Env } from './rpc';

export async function purgeExpiredPoExports(
  env: Env,
  rpc: Rpc = createRpc(env),
): Promise<void> {
  const expired = await rpc('po_export_expired_artifacts', { p_limit: 100 });
  for (const artifact of expired) {
    const path = artifact.object_path
      .split('/')
      .map(encodeURIComponent)
      .join('/');
    const response = await fetch(
      `${env.SUPABASE_URL.replace(/\/$/u, '')}/storage/v1/object/po-export-artifacts/${path}`,
      {
        method: 'DELETE',
        redirect: 'manual',
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    // A missing file is already expired; other storage failures stay queued
    // for the next existing cron invocation.
    if (!response.ok && response.status !== 404)
      throw new Error('po_export_expiry_storage_failed');
    const marked = await rpc('po_export_expired_mark', {
      p_job_id: artifact.job_id,
    });
    if (!marked) throw new Error('po_export_expiry_mark_failed');
  }
}
