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
  it('fences an old lease attempt from overwriting or deleting the current artifact', async () => {
    const jobId = '00000000-0000-4000-8000-000000000001';
    const oldLease = '00000000-0000-4000-8000-000000000002';
    const newLease = '00000000-0000-4000-8000-000000000003';
    const oldPath = `${jobId}/${oldLease}/00000000-0000-4000-8000-000000000004/archive.csv`;
    const newPath = `${jobId}/${newLease}/00000000-0000-4000-8000-000000000005/archive.csv`;
    const objects = new Map<string, string>();
    const calls: string[] = [];
    let currentLease = oldLease;
    let publishedPath: string | null = null;
    let generatedAuditCount = 0;
    let markOldUploadStarted!: () => void;
    let releaseOldUpload!: () => void;
    const oldUploadStarted = new Promise<void>(
      (resolve) => (markOldUploadStarted = resolve),
    );
    const oldUploadGate = new Promise<void>(
      (resolve) => (releaseOldUpload = resolve),
    );
    const makeRpc = (lease: string, path: string) =>
      (async (name: string, args: Record<string, unknown>) => {
        calls.push(`${lease}:${name}`);
        if (name === 'po_export_snapshot')
          return { rows: [], row_count: 0, exceeded_limit: false };
        if (name === 'po_export_attempt') return path;
        if (name === 'po_export_finalize') {
          if (lease !== currentLease || publishedPath) return false;
          publishedPath = String(args.p_object_path);
          generatedAuditCount += 1;
          return true;
        }
        if (name === 'po_export_failed') return false;
        return true;
      }) as unknown as Rpc;
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        const path = url.split('/po-export-artifacts/')[1]!;
        if (init?.method === 'POST') {
          objects.set(path, String(init.body ?? ''));
          if (path === oldPath) {
            markOldUploadStarted();
            await oldUploadGate;
          }
          return new Response(null, { status: 200 });
        }
        if (init?.method === 'DELETE') {
          objects.delete(path);
          return new Response(null, { status: 200 });
        }
        throw new Error('Unexpected storage method');
      });
    const run = (lease: string, path: string) =>
      createHandlers(makeRpc(lease, path), env)['po.export']!({
        jobId,
        kind: 'po.export',
        workspaceId: null,
        payload: {},
        leaseToken: lease,
      });

    const oldWorker = run(oldLease, oldPath);
    await oldUploadStarted;
    currentLease = newLease;
    await run(newLease, newPath);
    releaseOldUpload();
    await expect(oldWorker).rejects.toMatchObject({
      code: 'po_export_generation_failed',
    });

    expect(calls.indexOf(`${oldLease}:po_export_attempt`)).toBeLessThan(
      calls.indexOf(`${oldLease}:po_export_finalize`),
    );
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toMatchObject({
      'x-upsert': 'true',
    });
    expect(publishedPath).toBe(newPath);
    expect(objects.get(publishedPath!)).toBeDefined();
    expect(objects.has(oldPath)).toBe(false);
    expect(generatedAuditCount).toBe(1);
  });

  it('keeps a failed cleanup attempt tracked for the expiry sweep', async () => {
    const jobId = '00000000-0000-4000-8000-000000000011';
    const leaseToken = '00000000-0000-4000-8000-000000000012';
    const attemptPath = `${jobId}/${leaseToken}/00000000-0000-4000-8000-000000000013/archive.csv`;
    const calls: string[] = [];
    const actions: string[] = [];
    const rpc = vi.fn(async (name: string) => {
      calls.push(name);
      actions.push(`rpc:${name}`);
      if (name === 'po_export_snapshot')
        return { rows: [], row_count: 0, exceeded_limit: false };
      if (name === 'po_export_attempt') return attemptPath;
      if (name === 'po_export_finalize') return false;
      return true;
    }) as unknown as Rpc;
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async (input) => {
        actions.push(`upload:${String(input)}`);
        return new Response(null, { status: 200 });
      })
      .mockImplementationOnce(async (input) => {
        actions.push(`delete:${String(input)}`);
        return new Response(null, { status: 500 });
      });
    const handler = createHandlers(rpc, env)['po.export'];
    await expect(
      handler!({
        jobId,
        kind: 'po.export',
        workspaceId: null,
        payload: {},
        leaseToken,
      }),
    ).rejects.toMatchObject({ code: 'po_export_generation_failed' });
    expect(actions.indexOf('rpc:po_export_attempt')).toBeLessThan(
      actions.findIndex((action) => action.startsWith('upload:')),
    );
    expect(fetcher.mock.calls[0]?.[0]).toContain(attemptPath);
    expect(fetcher.mock.calls[1]?.[0]).toBe(fetcher.mock.calls[0]?.[0]);
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
