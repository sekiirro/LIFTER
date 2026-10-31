import { describe, expect, it, vi } from 'vitest';
import { createRpc } from '../../workers/cron/src/rpc';

describe('cron RPC timeout', () => {
  it('rejects a stalled fetch with a sanitized timeout error', async () => {
    const controller = new AbortController();
    const timeoutSignal = vi.fn((milliseconds: number) => {
      expect(milliseconds).toBe(30_000);
      return controller.signal;
    });
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      if (!signal) throw new Error('missing timeout signal');
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new Error('sensitive token and database detail')),
          { once: true },
        );
      });
    });

    const rpcPromise = createRpc(
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      },
      fetcher as typeof fetch,
      timeoutSignal,
    )('jobs_claim', { batch: 1 });
    controller.abort(new Error('sensitive token and database detail'));

    await expect(rpcPromise).rejects.toThrow('rpc_timeout');
    expect(timeoutSignal).toHaveBeenCalledOnce();
  });
});
