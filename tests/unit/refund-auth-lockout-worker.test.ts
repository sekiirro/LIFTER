import { expect, it, vi } from 'vitest';
import { drainRefundAuthLockouts } from '../../workers/cron/src/refund-auth-lockout';

const job = (digit: string) => ({
  id: `00000000-0000-4000-8000-00000000000${digit}`,
  auth_user_id: `10000000-0000-4000-8000-00000000000${digit}`,
  attempts: 0,
  status: 'pending',
});

it('times out Auth Admin calls and continues processing the claimed batch', async () => {
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  const adminOptions: RequestInit[] = [];
  const retried: unknown[] = [];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/auth/v1/')) {
        adminOptions.push(init ?? {});
        if (adminOptions.length === 1) throw new Error('simulated timeout');
        return new Response(null, { status: 200 });
      }
      const rpc = url.split('/').at(-1);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (rpc === 'claim_refund_auth_lockout_jobs')
        return Response.json([job('1'), job('2')]);
      if (rpc === 'retry_refund_auth_lockout_job') retried.push(body);
      return Response.json(
        rpc === 'alert_expired_refund_auth_lockouts' ? 0 : true,
      );
    },
  );

  try {
    await expect(
      drainRefundAuthLockouts(
        {
          SUPABASE_URL: 'http://127.0.0.1:35421',
          SUPABASE_SERVICE_ROLE_KEY: 'test-only',
        },
        { fetcher },
      ),
    ).resolves.toMatchObject({ claimed: 2, failed: 1 });
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(adminOptions).toHaveLength(2);
    expect(
      adminOptions.every((options) => options.signal instanceof AbortSignal),
    ).toBe(true);
    expect(retried).toHaveLength(1);
  } finally {
    timeout.mockRestore();
  }
});
