import { afterEach, describe, expect, it, vi } from 'vitest';
import { purgeExpiredPoExports } from '../../workers/cron/src/po-export-expiry';
import type { Rpc } from '../../workers/cron/src/drain';

const env = {
  SUPABASE_URL: 'https://db.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
};

afterEach(() => vi.unstubAllGlobals());

describe('PO export expiry sweep', () => {
  it('removes expired objects through storage and only then clears the job reference', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const rpc = (async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === 'po_export_expired_artifacts')
        return [
          {
            job_id: 'job-1',
            object_path: 'job-1/archive.csv',
          },
        ];
      if (name === 'po_export_expired_mark') return true;
      throw new Error('Unexpected RPC');
    }) as unknown as Rpc;
    const requests: Array<{ url: string; method: string | undefined }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: String(input), method: init?.method });
        return new Response(null, { status: 404 });
      }),
    );

    await purgeExpiredPoExports(env, rpc);

    expect(requests).toEqual([
      {
        url: 'https://db.example.test/storage/v1/object/po-export-artifacts/job-1/archive.csv',
        method: 'DELETE',
      },
    ]);
    expect(calls.map(({ name }) => name)).toEqual([
      'po_export_expired_artifacts',
      'po_export_expired_mark',
    ]);
    expect(calls[1]).toEqual({
      name: 'po_export_expired_mark',
      args: { p_job_id: 'job-1', p_object_path: 'job-1/archive.csv' },
    });
  });
});
