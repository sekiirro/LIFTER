'use server';

import { requireActor } from '../../../lib/auth/actor';
import { createSessionClient } from '../../../lib/supabase/server';
import {
  buildExportScopeArgs,
  EXPORT_RPC,
  mapServerExportState,
  type ExportScope,
  type ExportStatus,
} from '../../../lib/exports/contract';

export type ExportRequestResult =
  | { status: ExportStatus | 'empty'; jobId: string | null }
  | { status: 'error'; jobId: null };

export type ExportStatusResult = { status: ExportStatus | 'error' };

async function isPlatformOwner(): Promise<boolean> {
  const actor = await requireActor();
  return actor.role === 'platform_owner';
}

/** Request an asynchronous CSV export. Scope only; fields are server-defined. */
export async function requestClientExport(
  scope: ExportScope,
): Promise<ExportRequestResult> {
  if (!(await isPlatformOwner())) return { status: 'error', jobId: null };
  const client = await createSessionClient();
  if (!client) return { status: 'error', jobId: null };

  const { data, error } = await client.rpc(
    EXPORT_RPC.request,
    buildExportScopeArgs(scope),
  );
  if (error || !data || typeof data !== 'object' || Array.isArray(data))
    return { status: 'error', jobId: null };

  const row = data as { status?: unknown; state?: unknown; job_id?: unknown };
  if (row.status === 'empty' || row.state === 'empty')
    return { status: 'empty', jobId: null };

  const status = mapServerExportState(row.status ?? row.state);
  const jobId =
    typeof row.job_id === 'string' && row.job_id ? row.job_id : null;
  if (!status || !jobId) return { status: 'error', jobId: null };
  return { status, jobId };
}

/** Poll a safe job status. Unknown / inaccessible jobs fail closed. */
export async function getClientExportStatus(
  jobId: string,
): Promise<ExportStatusResult> {
  if (!(await isPlatformOwner())) return { status: 'error' };
  if (typeof jobId !== 'string' || !jobId) return { status: 'error' };
  const client = await createSessionClient();
  if (!client) return { status: 'error' };

  const { data, error } = await client.rpc(EXPORT_RPC.status, {
    p_job_id: jobId,
  });
  if (error || !data || typeof data !== 'object' || Array.isArray(data))
    return { status: 'error' };
  const status = mapServerExportState(
    (data as { status?: unknown; state?: unknown }).status ??
      (data as { state?: unknown }).state,
  );
  return status ? { status } : { status: 'error' };
}
