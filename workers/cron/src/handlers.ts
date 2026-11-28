import { JobError, type Handler, type Rpc } from './drain';
import {
  PO_EXPORT_FIELDS,
  PO_EXPORT_MAX_ROWS,
} from '../../../lib/po-export/manifest';
import { serializeCsv } from '../../../lib/po-export/csv';
import type { Env } from './rpc';

export function createHandlers(
  rpc: Rpc,
  env?: Env,
): Readonly<Record<string, Handler>> {
  return {
    'system.noop': async () => {},
    'client.distribution': async ({ jobId, leaseToken }) => {
      const handled = await rpc('handle_client_trainer_distribution', {
        p_job_id: jobId,
        p_lease_token: leaseToken,
      });
      if (!handled)
        throw new JobError('distribution_lease_invalid', { permanent: true });
    },
    'po.export': async ({ jobId, leaseToken }) => {
      if (!env)
        throw new JobError('po_export_environment_missing', {
          permanent: true,
        });
      let objectPath: string | null = null;
      let uploadAttempted = false;
      let rowCapExceeded = false;
      try {
        // One definer RPC returns a bounded rowset from one MVCC statement.
        // Never page across transactions: that could mix different source states.
        const snapshot = await rpc('po_export_snapshot', {
          p_job_id: jobId,
          p_lease_token: leaseToken,
        });
        if (
          snapshot.exceeded_limit ||
          snapshot.row_count > PO_EXPORT_MAX_ROWS ||
          snapshot.row_count !== snapshot.rows.length
        ) {
          rowCapExceeded = true;
          throw new Error('po_export_row_cap_exceeded');
        }
        const csv = serializeCsv(
          PO_EXPORT_FIELDS,
          snapshot.rows.map((item) => item.row),
        );
        objectPath = await rpc('po_export_attempt', {
          p_job_id: jobId,
          p_lease_token: leaseToken,
        });
        if (!objectPath) throw new Error('po_export_attempt_lease_invalid');
        const baseUrl = env.SUPABASE_URL.replace(/\/$/u, '');
        uploadAttempted = true;
        const upload = await fetch(
          `${baseUrl}/storage/v1/object/po-export-artifacts/${objectPath}`,
          {
            method: 'POST',
            redirect: 'manual',
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'text/csv; charset=utf-8',
            },
            body: csv,
          },
        );
        if (!upload.ok) throw new Error('po_export_upload_failed');
        const finalized = await rpc('po_export_finalize', {
          p_job_id: jobId,
          p_lease_token: leaseToken,
          p_object_path: objectPath,
          p_row_count: snapshot.row_count,
        });
        if (!finalized) throw new Error('po_export_finalize_failed');
      } catch {
        if (uploadAttempted && objectPath) {
          try {
            const deleted = await fetch(
              `${env.SUPABASE_URL.replace(/\/$/u, '')}/storage/v1/object/po-export-artifacts/${objectPath}`,
              {
                method: 'DELETE',
                redirect: 'manual',
                headers: {
                  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                },
              },
            );
            if (deleted.ok || deleted.status === 404) {
              await rpc('po_export_expired_mark', {
                p_job_id: jobId,
                p_object_path: objectPath,
              });
            }
          } catch {
            // The tracked attempt path remains for the expiry sweep.
          }
        }
        try {
          await rpc('po_export_failed', {
            p_job_id: jobId,
            p_lease_token: leaseToken,
          });
        } catch {
          // Keep the worker error safe; audit failure never includes row data.
        }
        throw new JobError(
          rowCapExceeded
            ? 'po_export_row_cap_exceeded'
            : 'po_export_generation_failed',
          { permanent: rowCapExceeded },
        );
      }
    },
    'quality.monthly_reminder': async ({ jobId, leaseToken }) => {
      const handled = await rpc('handle_quality_monthly_reminder', {
        p_job_id: jobId,
        p_lease_token: leaseToken,
      });
      if (!handled)
        throw new JobError('quality_reminder_lease_invalid', {
          permanent: true,
        });
    },
  };
}

/** The existing every-minute Worker schedule invokes this bounded DB evaluator. */
export function createSubscriptionExpiryHandler(rpc: Rpc): () => Promise<void> {
  return async () => {
    await rpc('run_subscription_expiry_notices', {});
  };
}
