// Spec 030 (PO full export) UI-side contract.
// The export field manifest is SERVER-DEFINED. This module deliberately carries
// no field list and never names or requests health notes (S71-R27).

export const EXPORT_RPC = {
  request: 'request_client_data_export',
  status: 'get_client_data_export_status',
} as const;

export type ExportScope =
  { kind: 'all' } | { kind: 'workspace'; workspaceId: string };

/** States the Reports surface is approved to render (CB-P8-03 screen 1). */
export type ExportStatus =
  'queued' | 'running' | 'ready' | 'failed' | 'expired';
export type ExportViewState = ExportStatus | 'empty' | 'error' | 'idle';

const SERVER_STATE_MAP: Record<string, ExportStatus> = {
  accepted: 'queued',
  queued: 'queued',
  processing: 'running',
  running: 'running',
  ready: 'ready',
  failed: 'failed',
  expired: 'expired',
};

/** Maps a safe server state to an approved UI status; unknown states fail closed. */
export function mapServerExportState(state: unknown): ExportStatus | null {
  if (typeof state !== 'string') return null;
  return SERVER_STATE_MAP[state] ?? null;
}

export function isTerminalExportStatus(status: ExportStatus): boolean {
  return status === 'ready' || status === 'failed' || status === 'expired';
}

/** Only the explicit scope is sent. No manifest, no fields, no health notes. */
export function buildExportScopeArgs(scope: ExportScope): {
  p_scope: 'all' | 'workspace';
  p_workspace_id: string | null;
} {
  return scope.kind === 'all'
    ? { p_scope: 'all', p_workspace_id: null }
    : { p_scope: 'workspace', p_workspace_id: scope.workspaceId };
}

/** Authenticated, same-origin download route (never a public or bearer URL). */
export function exportDownloadHref(jobId: string): string {
  return `/api/exports/${encodeURIComponent(jobId)}/download`;
}
