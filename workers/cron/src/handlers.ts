import { JobError, type Handler, type Rpc } from './drain';
import { PO_EXPORT_FIELDS } from '../../../lib/po-export/manifest';
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
      const objectPath = `${jobId}/archive.csv`;
      let afterWorkspaceId: string | null = null;
      let afterClientId: string | null = null;
      let rowCount = 0;
      let headerWritten = false;
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        pull: async (controller) => {
          try {
            const page = await rpc('po_export_page', {
              p_job_id: jobId,
              p_lease_token: leaseToken,
              p_after_workspace_id: afterWorkspaceId,
              p_after_client_id: afterClientId,
              p_limit: 500,
            });
            if (page.length === 0) {
              controller.close();
              return;
            }
            const serialized = serializeCsv(
              PO_EXPORT_FIELDS,
              page.map((item) => item.row),
            );
            const chunk = headerWritten
              ? serialized.slice(serialized.indexOf('\r\n') + 2)
              : serialized;
            headerWritten = true;
            rowCount += page.length;
            const last = page.at(-1)!;
            afterWorkspaceId = last.workspace_id;
            afterClientId = last.client_id;
            controller.enqueue(encoder.encode(chunk));
          } catch {
            controller.error(new Error('po_export_page_failed'));
          }
        },
      });

      try {
        const baseUrl = env.SUPABASE_URL.replace(/\/$/u, '');
        const upload = await fetch(
          `${baseUrl}/storage/v1/object/po-export-artifacts/${objectPath}`,
          {
            method: 'POST',
            redirect: 'manual',
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'text/csv; charset=utf-8',
              'x-upsert': 'true',
            },
            body: stream,
          },
        );
        if (!upload.ok) throw new Error('po_export_upload_failed');
        const finalized = await rpc('po_export_finalize', {
          p_job_id: jobId,
          p_lease_token: leaseToken,
          p_object_path: objectPath,
          p_row_count: rowCount,
        });
        if (!finalized) throw new Error('po_export_finalize_failed');
      } catch {
        try {
          await fetch(
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
        } catch {
          // The expiry sweep will retry cleanup without exposing the artifact.
        }
        try {
          await rpc('po_export_failed', {
            p_job_id: jobId,
            p_lease_token: leaseToken,
          });
        } catch {
          // Keep the worker error safe; audit failure never includes row data.
        }
        throw new JobError('po_export_generation_failed');
      }
    },
  };
}
