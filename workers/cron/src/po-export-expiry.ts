import type { Rpc } from './drain';
import { createRpc, type Env } from './rpc';

export async function purgeExpiredPoExports(
  env: Env,
  rpc: Rpc = createRpc(env),
): Promise<void> {
  const expired = await rpc('po_export_expired_artifacts', { p_limit: 100 });
  for (const artifact of expired) {
    try {
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
      // A failed object stays queued, while later artifacts keep progressing.
      if (!response.ok && response.status !== 404) {
        console.error('po_export_expiry_storage_failed', artifact.job_id);
        continue;
      }
      const marked = await rpc('po_export_expired_mark', {
        p_job_id: artifact.job_id,
        p_object_path: artifact.object_path,
      });
      if (!marked)
        console.error('po_export_expiry_mark_failed', artifact.job_id);
    } catch {
      console.error('po_export_expiry_item_failed', artifact.job_id);
    }
  }
}
