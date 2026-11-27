import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({
  requireActor: mocks.actor,
}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.session,
}));

import {
  getClientExportStatus,
  requestClientExport,
} from '../../app/(app)/reports/actions';
import { EXPORT_RPC, type ExportScope } from '../../lib/exports/contract';

const validKey = 'valid-idempotency-key-12345';
const validJobId = '00000000-0000-0000-0000-000000000099';
const wsId = '00000000-0000-0000-0000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({
    userId: 'po-user-id',
    role: 'platform_owner',
  });
  mocks.session.mockResolvedValue({
    rpc: mocks.rpc,
  });
});

describe('requestClientExport server action', () => {
  it('allows Platform Owner and passes exact RPC arguments for all-workspaces scope', async () => {
    mocks.rpc.mockResolvedValue({ data: validJobId, error: null });

    const result = await requestClientExport({ kind: 'all' }, validKey);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(EXPORT_RPC.request, {
      p_workspace_id: null,
      p_idempotency_key: validKey,
    });
    expect(result).toEqual({ status: 'queued', jobId: validJobId });
  });

  it('allows Platform Owner and passes exact RPC arguments for selected workspace', async () => {
    mocks.rpc.mockResolvedValue({ data: validJobId, error: null });

    const result = await requestClientExport(
      { kind: 'workspace', workspaceId: wsId },
      validKey,
    );

    expect(mocks.rpc).toHaveBeenCalledWith(EXPORT_RPC.request, {
      p_workspace_id: wsId,
      p_idempotency_key: validKey,
    });
    expect(result).toEqual({ status: 'queued', jobId: validJobId });
  });

  it('accepts options object style input with scope and idempotencyKey', async () => {
    mocks.rpc.mockResolvedValue({ data: validJobId, error: null });

    const result = await requestClientExport({
      scope: { kind: 'all' },
      idempotencyKey: validKey,
    });

    expect(mocks.rpc).toHaveBeenCalledWith(EXPORT_RPC.request, {
      p_workspace_id: null,
      p_idempotency_key: validKey,
    });
    expect(result).toEqual({ status: 'queued', jobId: validJobId });
  });

  it('denies non-PO roles without calling database RPC', async () => {
    const roles = [
      'workspace_owner',
      'trainer',
      'sales',
      'client',
      'member',
    ] as const;

    for (const role of roles) {
      mocks.actor.mockResolvedValueOnce({
        userId: 'other-user',
        role,
      });

      const result = await requestClientExport({ kind: 'all' }, validKey);
      expect(result).toEqual({ status: 'error', jobId: null });
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('denies unauthenticated / anonymous callers', async () => {
    mocks.actor.mockRejectedValueOnce(new Error('unauthenticated'));

    const result = await requestClientExport({ kind: 'all' }, validKey);
    expect(result).toEqual({ status: 'error', jobId: null });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('validates idempotency key format and fails closed without calling RPC', async () => {
    const invalidKeys = [
      '',
      'short',
      'a'.repeat(15),
      'a'.repeat(97),
      'has spaces in key!',
      'invalid@chars#$',
      null,
      undefined,
    ];

    for (const key of invalidKeys) {
      const result = await requestClientExport(
        { kind: 'all' },
        key as unknown as string,
      );
      expect(result).toEqual({ status: 'error', jobId: null });
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('fails closed when workspace scope is missing workspaceId', async () => {
    const result = await requestClientExport(
      { kind: 'workspace', workspaceId: '' } as unknown as ExportScope,
      validKey,
    );
    expect(result).toEqual({ status: 'error', jobId: null });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('maps Supabase RPC error to safe error state', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'function request_po_client_export does not exist' },
    });

    const result = await requestClientExport({ kind: 'all' }, validKey);
    expect(result).toEqual({ status: 'error', jobId: null });
  });

  it('fails closed if session client creation fails', async () => {
    mocks.session.mockResolvedValueOnce(null);

    const result = await requestClientExport({ kind: 'all' }, validKey);
    expect(result).toEqual({ status: 'error', jobId: null });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('handles object-wrapped job_id response shape gracefully', async () => {
    mocks.rpc.mockResolvedValue({
      data: { job_id: validJobId },
      error: null,
    });

    const result = await requestClientExport({ kind: 'all' }, validKey);
    expect(result).toEqual({ status: 'queued', jobId: validJobId });
  });
});

describe('getClientExportStatus server action', () => {
  it('allows Platform Owner and passes exact p_job_id RPC argument', async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: 'ready' },
      error: null,
    });

    const result = await getClientExportStatus(validJobId);

    expect(mocks.rpc).toHaveBeenCalledWith(EXPORT_RPC.status, {
      p_job_id: validJobId,
    });
    expect(result).toEqual({ status: 'ready' });
  });

  it('maps all safe server states to approved UI statuses', async () => {
    const states = ['queued', 'running', 'ready', 'failed', 'expired'] as const;

    for (const state of states) {
      mocks.rpc.mockResolvedValueOnce({
        data: { status: state },
        error: null,
      });

      const result = await getClientExportStatus(validJobId);
      expect(result).toEqual({ status: state });
    }
  });

  it('handles raw string status response from RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: 'running',
      error: null,
    });

    const result = await getClientExportStatus(validJobId);
    expect(result).toEqual({ status: 'running' });
  });

  it('denies non-PO callers without calling status RPC', async () => {
    mocks.actor.mockResolvedValueOnce({
      userId: 'wo-user',
      role: 'workspace_owner',
    });

    const result = await getClientExportStatus(validJobId);
    expect(result).toEqual({ status: 'error' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('denies unauthenticated callers', async () => {
    mocks.actor.mockRejectedValueOnce(new Error('unauthenticated'));

    const result = await getClientExportStatus(validJobId);
    expect(result).toEqual({ status: 'error' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('fails closed for invalid or empty jobId', async () => {
    for (const badId of ['', null, undefined]) {
      const result = await getClientExportStatus(badId as unknown as string);
      expect(result).toEqual({ status: 'error' });
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('maps RPC error to error status', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'RPC failure' },
    });

    const result = await getClientExportStatus(validJobId);
    expect(result).toEqual({ status: 'error' });
  });

  it('fails closed on unknown server state', async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: 'not_permitted' },
      error: null,
    });

    const result = await getClientExportStatus(validJobId);
    expect(result).toEqual({ status: 'error' });
  });
});
