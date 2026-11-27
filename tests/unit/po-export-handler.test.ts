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
  it('streams ordered 500-row pages to one UTF-8 artifact and finalizes once', async () => {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const rpc = (async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === 'po_export_page') {
        return rpcCalls.filter((call) => call.name === 'po_export_page')
          .length === 1
          ? [
              {
                workspace_id: 'workspace-a',
                client_id: 'client-a',
                row: {
                  'clients.id': 'client-a',
                  'clients.name': 'Mona, "M"',
                  'forms.fitness_goals': '=1+1',
                  'forms.health_notes': 'health-canary-never-export',
                },
              },
            ]
          : [];
      }
      if (name === 'po_export_finalize') return true;
      if (name === 'po_export_failed') return true;
      throw new Error(`Unexpected RPC ${name}`);
    }) as unknown as Rpc;
    let uploaded = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const reader = (init?.body as ReadableStream<Uint8Array>).getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const result = await reader.read();
          if (result.done) break;
          uploaded += decoder.decode(result.value, { stream: true });
        }
        uploaded += decoder.decode();
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
    expect(uploaded).toContain('"Mona, ""M"""');
    expect(uploaded).toContain("'=1+1");
    expect(uploaded).not.toContain('health_notes');
    expect(uploaded).not.toContain('health-canary-never-export');
    expect(
      rpcCalls.filter((call) => call.name === 'po_export_page'),
    ).toHaveLength(2);
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

  it('records a safe failure and retries the existing job if storage fails', async () => {
    const calls: string[] = [];
    const rpc = (async (name: string) => {
      calls.push(name);
      if (name === 'po_export_page')
        return [
          {
            workspace_id: 'workspace-a',
            client_id: 'client-a',
            row: { 'clients.id': 'client-a' },
          },
        ];
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
    expect(calls).toEqual(['po_export_page', 'po_export_failed']);
  });
});
