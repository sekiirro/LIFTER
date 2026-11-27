'use server';

import { requireActor } from '../../../lib/auth/actor';
import { createSessionClient } from '../../../lib/supabase/server';
import {
  buildExportArgs,
  EXPORT_RPC,
  isValidExportIdempotencyKey,
  mapServerExportState,
  type ExportScope,
  type ExportStatus,
} from '../../../lib/exports/contract';

export type ExportRequestResult =
  | { status: ExportStatus | 'empty'; jobId: string | null }
  | { status: 'error'; jobId: null };

export type ExportStatusResult = { status: ExportStatus | 'error' };

export type RequestClientExportInput =
  { scope: ExportScope; idempotencyKey: string } | ExportScope;

async function isPlatformOwner(): Promise<boolean> {
  try {
    const actor = await requireActor();
    return actor.role === 'platform_owner';
  } catch {
    return false;
  }
}

/** Request an asynchronous CSV export. Scope and idempotency key only; fields are server-defined. */
export async function requestClientExport(
  scopeOrInput: RequestClientExportInput,
  idempotencyKeyArg?: string,
): Promise<ExportRequestResult> {
  const scope: ExportScope =
    'kind' in scopeOrInput ? scopeOrInput : scopeOrInput.scope;
  const idempotencyKey: string | undefined =
    'idempotencyKey' in scopeOrInput
      ? scopeOrInput.idempotencyKey
      : idempotencyKeyArg;

  if (!(await isPlatformOwner())) return { status: 'error', jobId: null };
  if (!isValidExportIdempotencyKey(idempotencyKey))
    return { status: 'error', jobId: null };
  if (
    scope.kind === 'workspace' &&
    (!scope.workspaceId || typeof scope.workspaceId !== 'string')
  )
    return { status: 'error', jobId: null };

  const client = await createSessionClient();
  if (!client) return { status: 'error', jobId: null };

  const { data, error } = await client.rpc(
    EXPORT_RPC.request,
    buildExportArgs(scope, idempotencyKey),
  );
  if (error || !data) return { status: 'error', jobId: null };

  const jobId =
    typeof data === 'string'
      ? data
      : typeof data === 'object' && data !== null && 'job_id' in data
        ? (data as { job_id: unknown }).job_id
        : null;
  if (typeof jobId !== 'string' || !jobId)
    return { status: 'error', jobId: null };

  return { status: 'queued', jobId };
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
  if (error || !data) return { status: 'error' };

  const rawState =
    typeof data === 'string'
      ? data
      : typeof data === 'object' && data !== null && 'status' in data
        ? (data as { status: unknown }).status
        : null;

  const status = mapServerExportState(rawState);
  return status ? { status } : { status: 'error' };
}
