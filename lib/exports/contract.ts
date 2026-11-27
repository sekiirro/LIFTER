// Spec 030 (PO full export) UI-side contract.
// The export field manifest is SERVER-DEFINED. This module deliberately carries
// no field list and never names or requests health notes (S71-R27).

export const EXPORT_RPC = {
  request: 'request_po_client_export',
  status: 'read_po_client_export_status',
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
  pending: 'queued',
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

export const EXPORT_IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_-]{16,96}$/;

export function generateExportIdempotencyKey(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
}

export function isValidExportIdempotencyKey(key: unknown): key is string {
  return typeof key === 'string' && EXPORT_IDEMPOTENCY_KEY_REGEX.test(key);
}

/** Only the explicit scope and idempotency key are sent. No manifest, no fields, no health notes. */
export function buildExportArgs(
  scope: ExportScope,
  idempotencyKey: string,
): {
  p_workspace_id: string | null;
  p_idempotency_key: string;
} {
  return {
    p_workspace_id: scope.kind === 'workspace' ? scope.workspaceId : null,
    p_idempotency_key: idempotencyKey,
  };
}

/** Authenticated, same-origin download route (never a public or bearer URL). */
export function exportDownloadHref(jobId: string): string {
  return `/api/reports/po-export/${encodeURIComponent(jobId)}`;
}
