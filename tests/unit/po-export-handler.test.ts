import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHandlers } from '../../workers/cron/src/handlers';
import type { Rpc } from '../../workers/cron/src/drain';

const jobId = '00000000-0000-4000-8000-000000000030';
const leaseToken = '00000000-0000-4000-8000-000000000031';
const env = {
  SUPABASE_URL: 'https://db.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
};

afterEach(() => vi.unstubAllGlobals());

describe('PO export jobs handler (T009)', () => {
  it('uses one MVCC snapshot for the complete UTF-8 archive', async () => {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let currentName = 'Before concurrent update';
    const rpc = (async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === 'po_export_snapshot') {
        const snapshot = [{
          workspace_id: 'workspace-a',
          client_id: 'client-a',
          row: {
            'clients.id': 'client-a',
            'clients.name': currentName,
            'forms.fitness_goals': '=1+1',
            'forms.health_notes': 'health-canary-never-export',
          },
        }];
        currentName = 'After concurrent update';
        return { rows: snapshot, row_count: 1, exceeded_limit: false };
      }
      if (name === 'po_export_finalize') return true;
      if (name === 'po_export_failed') return true;
      throw new Error(`Unexpected RPC ${name}`);
    }) as unknown as Rpc;
    let uploaded = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        uploaded = String(init?.body ?? '');
        return new Response('{}', { status: 200 });
      }),
    );

    await createHandlers(rpc, env)['po.export']!({
      jobId,
      kind: 'po.export',
      workspaceId: null,
      payload: {},
      leaseToken,
    });

    expect(uploaded).toContain('clients.id,clients.workspace_id');
    expect(uploaded).toContain('Before concurrent update');
    expect(uploaded).not.toContain('After concurrent update');
    expect(uploaded).toContain("'=1+1");
    expect(uploaded).not.toContain('health_notes');
    expect(uploaded).not.toContain('health-canary-never-export');
    expect(rpcCalls.filter((call) => call.name === 'po_export_snapshot'))
      .toHaveLength(1);
    expect(rpcCalls.at(-1)).toMatchObject({
      name: 'po_export_finalize',
      args: {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_object_path: `${jobId}/archive.csv`,
        p_row_count: 1,
      },
    });
    expect(rpcCalls.some((call) => call.name === 'po_export_failed')).toBe(
      false,
    );
  });

  it('fails closed over the hard row cap without uploading a partial archive', async () => {
    const calls: string[] = [];
    const rpc = (async (name: string) => {
      calls.push(name);
      if (name === 'po_export_snapshot')
        return { rows: [], row_count: 10001, exceeded_limit: true };
      if (name === 'po_export_failed') return true;
      throw new Error(`Unexpected RPC ${name}`);
    }) as unknown as Rpc;
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createHandlers(rpc, env)['po.export']!({
        jobId,
        kind: 'po.export',
        workspaceId: null,
        payload: {},
        leaseToken,
      }),
    ).rejects.toMatchObject({
      code: 'po_export_row_cap_exceeded',
      permanent: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls).toEqual(['po_export_snapshot', 'po_export_failed']);
  });

  it('records a safe failure and retries the existing job if storage fails', async () => {
    const calls: string[] = [];
    const rpc = (async (name: string) => {
      calls.push(name);
      if (name === 'po_export_snapshot')
        return {
          rows: [{ workspace_id: 'workspace-a', client_id: 'client-a', row: { 'clients.id': 'client-a' } }],
          row_count: 1,
          exceeded_limit: false,
        };
      if (name === 'po_export_failed') return true;
      throw new Error('Unexpected RPC');
    }) as unknown as Rpc;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );

    await expect(
      createHandlers(rpc, env)['po.export']!({
        jobId,
        kind: 'po.export',
        workspaceId: null,
        payload: {},
        leaseToken,
      }),
    ).rejects.toMatchObject({ code: 'po_export_generation_failed' });
    expect(calls).toEqual(['po_export_snapshot', 'po_export_failed']);
  });
});
