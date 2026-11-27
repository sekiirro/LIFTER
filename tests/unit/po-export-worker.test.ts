import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rpc } from '../../workers/cron/src/drain';
import { createHandlers } from '../../workers/cron/src/handlers';
import { purgeExpiredPoExports } from '../../workers/cron/src/po-export-expiry';

const env = {
  SUPABASE_URL: 'http://127.0.0.1:35421',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
};

afterEach(() => vi.restoreAllMocks());

describe('PO export worker storage fencing', () => {
  it('records a lease path before upload and never deletes a shared published path', async () => {
    const calls: string[] = [];
    const actions: string[] = [];
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      actions.push(`rpc:${name}`);
      if (name === 'po_export_snapshot')
        return { rows: [], row_count: 0, exceeded_limit: false };
      if (name === 'po_export_finalize') return false;
      return true;
    }) as unknown as Rpc;
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async (input) => {
        actions.push(`fetch:${String(input)}`);
        return new Response(null, { status: 200 });
      })
      .mockImplementationOnce(async (input) => {
        actions.push(`fetch:${String(input)}`);
        return new Response(null, { status: 500 });
      })
      .mockResolvedValue(new Response(null, { status: 200 }));
    const handler = createHandlers(rpc, env)['po.export'];
    await expect(
      handler({
        jobId: '00000000-0000-4000-8000-000000000001',
        kind: 'po.export',
        workspaceId: null,
        payload: {},
        leaseToken: '00000000-0000-4000-8000-000000000002',
      }),
    ).rejects.toMatchObject({ code: 'po_export_generation_failed' });

    const uploadUrl = String(fetcher.mock.calls[0]?.[0]);
    const deleteUrl = String(fetcher.mock.calls[1]?.[0]);
    expect(calls.indexOf('po_export_attempt')).toBeGreaterThan(
      calls.indexOf('po_export_snapshot'),
    );
    expect(actions.indexOf('rpc:po_export_attempt')).toBeLessThan(
      actions.findIndex((action) => action.startsWith('fetch:')),
    );
    expect(uploadUrl).toContain(
      '/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/archive.csv',
    );
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toMatchObject({
      'x-upsert': 'true',
    });
    expect(deleteUrl).toBe(uploadUrl);
    expect(deleteUrl).not.toContain('/archive.csv?');
    expect(calls).not.toContain('po_export_expired_mark');
  });
});

describe('PO export expiry isolation', () => {
  it('continues after one failed delete and retries that artifact on a later run', async () => {
    const failures = new Set(['a']);
    const rpc = vi.fn(async (name: string) => {
      if (name === 'po_export_expired_artifacts')
        return [
          { job_id: 'a', object_path: 'a/archive.csv' },
          { job_id: 'b', object_path: 'b/archive.csv' },
        ];
      return true;
    }) as unknown as Rpc;
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const path = String(input);
        return path.includes('/a/') && failures.has('a')
          ? new Response(null, { status: 500 })
          : new Response(null, { status: 204 });
      });

    await expect(purgeExpiredPoExports(env, rpc)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('po_export_expired_mark', {
      p_job_id: 'b',
      p_object_path: 'b/archive.csv',
    });

    failures.clear();
    vi.mocked(rpc).mockClear();
    fetcher.mockClear();
    await expect(purgeExpiredPoExports(env, rpc)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('po_export_expired_mark', {
      p_job_id: 'a',
      p_object_path: 'a/archive.csv',
    });
  });
});
