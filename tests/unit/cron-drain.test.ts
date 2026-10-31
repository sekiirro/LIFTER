import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  drain,
  JobError,
  type Job,
  type Rpc,
} from '../../workers/cron/src/drain';
import { createRpc } from '../../workers/cron/src/rpc';
import { createBrandingGc } from '../../workers/cron/src/branding-gc';
import worker from '../../workers/cron/src';
import { drainRefundAuthLockouts } from '../../workers/cron/src/refund-auth-lockout';
import {
  AUTH_LOCKOUT_BAN_DURATION,
  authLockoutRetryAt,
  authLockoutSafeErrorCode,
} from '../../lib/payments/refund-auth-lockout-policy';

const job = (id: string, kind = 'system.noop'): Job => ({
  id,
  kind,
  workspace_id: 'workspace-a',
  payload: { entity_id: 'entity-a', workspace_id: 'untrusted' },
  lease_token: `lease-${id}`,
});

function fakeRpc(batches: Job[][]) {
  return vi.fn<Rpc>().mockImplementation((async (name) => {
    if (name === 'jobs_claim') return batches.shift() ?? [];
    if (name === 'jobs_complete') return true;
    return 'dead';
  }) as Rpc);
}

describe('cron drain (T004)', () => {
  it('dispatches each job once with explicit workspace and completes its lease', async () => {
    const jobs = [job('a'), { ...job('b'), workspace_id: null }];
    const rpc = fakeRpc([jobs, []]);
    const handler = vi.fn().mockResolvedValue(undefined);
    await drain({ rpc, handlers: { 'system.noop': handler } });
    expect(handler.mock.calls).toEqual(
      jobs.map((j) => [
        {
          jobId: j.id,
          kind: j.kind,
          workspaceId: j.workspace_id,
          payload: j.payload,
        },
      ]),
    );
    expect(rpc.mock.calls).toEqual([
      ['jobs_claim', { batch: 25 }],
      ['jobs_complete', { id: 'a', lease: 'lease-a' }],
      ['jobs_complete', { id: 'b', lease: 'lease-b' }],
      ['jobs_claim', { batch: 25 }],
    ]);
  });

  it('records only handler_error for arbitrary errors and continues other jobs', async () => {
    const rpc = fakeRpc([[job('a', 'system.broken'), job('b')], []]);
    const handler = vi.fn().mockResolvedValue(undefined);
    await drain({
      rpc,
      handlers: {
        'system.noop': handler,
        'system.broken': async () => {
          throw new Error('private@example.test secret payload');
        },
      },
    });
    expect(rpc).toHaveBeenCalledWith('jobs_fail', {
      id: 'a',
      lease: 'lease-a',
      error_code: 'handler_error',
      permanent: false,
    });
    expect(rpc).toHaveBeenCalledWith('jobs_complete', {
      id: 'b',
      lease: 'lease-b',
    });
    expect(handler).toHaveBeenCalledOnce();
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(
      'private@example.test',
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('secret payload');
  });

  it('preserves a deliberate permanent JobError code', async () => {
    const rpc = fakeRpc([[job('a')], []]);
    await drain({
      rpc,
      handlers: {
        'system.noop': async () => {
          throw new JobError('x_y', { permanent: true });
        },
      },
    });
    expect(rpc).toHaveBeenCalledWith('jobs_fail', {
      id: 'a',
      lease: 'lease-a',
      error_code: 'x_y',
      permanent: true,
    });
    expect(rpc.mock.calls.some(([name]) => name === 'jobs_complete')).toBe(
      false,
    );
  });

  it.each(['system.missing', 'toString'])(
    'fails unknown kind %s permanently',
    async (kind) => {
      const rpc = fakeRpc([[job('a', kind)], []]);
      await drain({ rpc, handlers: {} });
      expect(rpc).toHaveBeenCalledWith('jobs_fail', {
        id: 'a',
        lease: 'lease-a',
        error_code: 'unknown_kind',
        permanent: true,
      });
    },
  );

  it('stops claiming after the first batch exceeds the budget', async () => {
    let time = 0;
    const rpc = fakeRpc([[job('a')], [job('b')]]);
    await drain({
      rpc,
      now: () => time,
      budgetMs: 10,
      batch: 1,
      handlers: {
        'system.noop': async () => {
          time = 11;
        },
      },
    });
    expect(rpc.mock.calls).toEqual([
      ['jobs_claim', { batch: 1 }],
      ['jobs_complete', { id: 'a', lease: 'lease-a' }],
    ]);
  });

  it('leaves unstarted jobs to lease expiry when the budget expires mid-batch', async () => {
    let time = 0;
    const rpc = fakeRpc([[job('a'), job('b')]]);
    const handler = vi.fn(async () => {
      time = 20;
    });
    await drain({
      rpc,
      now: () => time,
      budgetMs: 10,
      handlers: { 'system.noop': handler },
    });
    expect(handler).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('stops immediately on an empty claim', async () => {
    const rpc = fakeRpc([[]]);
    await drain({ rpc, handlers: {} });
    expect(rpc.mock.calls).toEqual([['jobs_claim', { batch: 25 }]]);
  });

  it('sanitizes invalid deliberate codes', () => {
    expect(new JobError('private@example.test').code).toBe('handler_error');
    expect(new JobError('x'.repeat(65)).code).toBe('handler_error');
  });

  it('propagates completion transport failures without reporting a handler failure', async () => {
    const rpc = fakeRpc([[job('a')]]);
    rpc
      .mockImplementationOnce(async () => [job('a')])
      .mockRejectedValueOnce(new Error('rpc_http_500'));
    await expect(
      drain({ rpc, handlers: { 'system.noop': async () => {} } }),
    ).rejects.toThrow('rpc_http_500');
    expect(rpc.mock.calls.some(([name]) => name === 'jobs_fail')).toBe(false);
  });
});

describe('cron edge wiring', () => {
  it('configures the existing cron Worker for a one-minute tick', () => {
    const config = readFileSync(
      new URL('../../workers/cron/wrangler.jsonc', import.meta.url),
      'utf8',
    );
    expect(config).toMatch(/"crons"\s*:\s*\[\s*"\* \* \* \* \*"\s*\]/);
  });

  it.each(['http://example.test', 'not a url', 'ftp://example.test', ''])(
    'rejects insecure RPC URL %s before fetching',
    (url) => {
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal('fetch', fetchMock);
      try {
        const env = {
          SUPABASE_URL: url,
          SUPABASE_SERVICE_ROLE_KEY: 'test-runtime-key',
        };
        expect(() => createRpc(env)).toThrow(/^rpc_insecure_url$/);
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it('does not include runtime secrets or the URL in validation errors', () => {
    const env = {
      SUPABASE_URL: 'http://example.test/private',
      SUPABASE_SERVICE_ROLE_KEY: 'test-runtime-key',
    };
    expect(() => createRpc(env)).toThrow(/^rpc_insecure_url$/);
    expect(() => createRpc(env)).not.toThrow(env.SUPABASE_URL);
    expect(() => createRpc(env)).not.toThrow(env.SUPABASE_SERVICE_ROLE_KEY);
  });

  it('rejects a non-HTTPS branding GC URL before using the service-role key', () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    try {
      expect(() =>
        createBrandingGc({
          SUPABASE_URL: 'http://remote.example.test',
          SUPABASE_SERVICE_ROLE_KEY: 'test-runtime-key',
        }),
      ).toThrow(/^rpc_insecure_url$/);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('bounds both branding GC RPC and Storage requests', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const gc = createBrandingGc({
        SUPABASE_URL: 'https://example.test',
        SUPABASE_SERVICE_ROLE_KEY: 'test-runtime-key',
      });
      await gc.claim(1);
      await gc.remove('branding-staging', 'workspace/staging/upload');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      for (const [, init] of fetchMock.mock.calls)
        expect(init?.signal).toBeInstanceOf(AbortSignal);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://[::1]:54321',
  ])('accepts loopback RPC URL %s', (url) => {
    expect(() =>
      createRpc({
        SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: 'test-runtime-key',
      }),
    ).not.toThrow();
  });

  it('POSTs scoped RPC arguments using runtime secrets', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json([]));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const rpc = createRpc({
        SUPABASE_URL: 'https://example.test/',
        SUPABASE_SERVICE_ROLE_KEY: 'test-runtime-key',
      });
      expect(await rpc('jobs_claim', { batch: 3 })).toEqual([]);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.test/rest/v1/rpc/jobs_claim',
        {
          method: 'POST',
          redirect: 'manual',
          headers: {
            apikey: 'test-runtime-key',
            Authorization: 'Bearer test-runtime-key',
            'Content-Type': 'application/json',
          },
          body: '{"batch":3}',
        },
      );
      fetchMock.mockResolvedValueOnce(
        new Response('private response', { status: 403 }),
      );
      await expect(rpc('jobs_claim', { batch: 3 })).rejects.toThrow(
        /^rpc_http_403$/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects redirects without fetching again', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.test/' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const rpc = createRpc({
        SUPABASE_URL: 'https://example.test/',
        SUPABASE_SERVICE_ROLE_KEY: 'test-runtime-key',
      });
      await expect(rpc('jobs_claim', { batch: 3 })).rejects.toThrow(
        /^rpc_http_302$/,
      );
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('registers the job, branding GC, and refund drains under waitUntil', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('alert_expired_refund_auth_lockouts'))
          return Response.json(0);
        return Response.json([]);
      });
    vi.stubGlobal('fetch', fetchMock);
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    try {
      worker.scheduled(
        { scheduledTime: 0, cron: '* * * * *', noRetry() {} },
        {
          SUPABASE_URL: 'https://example.test',
          SUPABASE_SERVICE_ROLE_KEY: 'test-runtime-key',
        },
        { waitUntil },
      );
      expect(waitUntil).toHaveBeenCalledOnce();
      await Promise.all(waitUntil.mock.calls.map(([promise]) => promise));
      const paths = fetchMock.mock.calls.map(
        ([input]) => new URL(String(input)).pathname,
      );
      expect(paths).toContain('/rest/v1/rpc/jobs_claim');
      expect(paths).toContain('/rest/v1/rpc/branding_gc_claim');
      expect(paths).toContain(
        '/rest/v1/rpc/alert_expired_refund_auth_lockouts',
      );
      expect(paths).toContain('/rest/v1/rpc/claim_refund_auth_lockout_jobs');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('waits for independent scheduled jobs and signals sanitized failure', async () => {
    let releaseRefundDrain!: () => void;
    let refundDrainStarted = false;
    const refundDrainGate = new Promise<void>((resolve) => {
      releaseRefundDrain = resolve;
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/rpc/jobs_claim'))
          throw new Error('private provider payload');
        if (url.includes('/rpc/branding_gc_claim')) return Response.json([]);
        if (url.includes('/rpc/alert_expired_refund_auth_lockouts'))
          return Response.json(0);
        if (url.includes('/rpc/claim_refund_auth_lockout_jobs')) {
          refundDrainStarted = true;
          await refundDrainGate;
          return Response.json([]);
        }
        return Response.json(true);
      });
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', fetchMock);
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    try {
      worker.scheduled(
        { scheduledTime: 0, cron: '* * * * *', noRetry() {} },
        {
          SUPABASE_URL: 'https://example.test',
          SUPABASE_SERVICE_ROLE_KEY: 'test-runtime-key',
        },
        { waitUntil },
      );
      const outcome = waitUntil.mock.calls[0]?.[0];
      expect(outcome).toBeDefined();
      let settled = false;
      void outcome!.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      await vi.waitFor(() => expect(refundDrainStarted).toBe(true));
      await Promise.resolve();
      expect(settled).toBe(false);
      releaseRefundDrain();
      await expect(outcome).rejects.toThrow('scheduled_jobs_failed');
      expect(logError).toHaveBeenCalledExactlyOnceWith(
        'scheduled_job_failed',
        'jobs',
      );
      expect(JSON.stringify(logError.mock.calls)).not.toContain(
        'private provider payload',
      );
    } finally {
      releaseRefundDrain();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('runs the bounded refund lockout drain and five-minute alert sweep on every tick', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) =>
        String(input).includes('alert_expired_refund_auth_lockouts')
          ? Response.json(0)
          : Response.json([]),
      );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await drainRefundAuthLockouts(
        {
          SUPABASE_URL: 'https://example.test',
          SUPABASE_SERVICE_ROLE_KEY: 'test-runtime-key',
        },
        { limit: 7, now: () => new Date('2026-10-30T12:05:00.000Z') },
      );
      expect(result).toEqual({ alerted: 0, claimed: 0, failed: 0 });
      expect(
        fetchMock.mock.calls.map(([url, init]) => [url, init?.body]),
      ).toEqual([
        [
          'https://example.test/rest/v1/rpc/alert_expired_refund_auth_lockouts',
          '{"p_limit":7,"p_checked_at":"2026-10-30T12:05:00.000Z"}',
        ],
        [
          'https://example.test/rest/v1/rpc/claim_refund_auth_lockout_jobs',
          '{"p_limit":7}',
        ],
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('records only an allow-listed retry code when Auth Admin returns private provider text', async () => {
    const bodies: string[] = [];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = String(input);
        const body = String(init?.body ?? '');
        if (url.includes('/rpc/alert_expired_refund_auth_lockouts'))
          return Response.json(0);
        if (url.includes('/rpc/claim_refund_auth_lockout_jobs'))
          return Response.json([
            {
              id: '00000000-0000-4000-8000-000000000001',
              auth_user_id: '00000000-0000-4000-8000-000000000002',
              attempts: 0,
              status: 'pending',
            },
          ]);
        if (url.includes('/auth/v1/admin/users/'))
          return new Response('private provider error email@example.test', {
            status: 503,
          });
        bodies.push(body);
        return Response.json(true);
      });
    const result = await drainRefundAuthLockouts(
      {
        SUPABASE_URL: 'https://example.test',
        SUPABASE_SERVICE_ROLE_KEY: 'test-runtime-key',
      },
      { now: () => new Date('2026-10-30T12:00:00.000Z'), fetcher: fetchMock },
    );

    expect(result).toEqual({ alerted: 0, claimed: 1, failed: 1 });
    expect(bodies).toContain(
      '{"p_id":"00000000-0000-4000-8000-000000000001","p_attempt":1,"p_retry_at":"2026-10-30T12:02:00.000Z","p_safe_error_code":"provider_unavailable"}',
    );
    expect(JSON.stringify(bodies)).not.toContain('private provider error');
    expect(JSON.stringify(bodies)).not.toContain('email@example.test');
  });

  it('uses the same Auth lockout ban, safe-error and exponential-backoff policy as the server worker', () => {
    expect(AUTH_LOCKOUT_BAN_DURATION).toBe('876000h');
    expect(authLockoutRetryAt(1, new Date('2026-10-30T12:00:00.000Z'))).toEqual(
      new Date('2026-10-30T12:02:00.000Z'),
    );
    expect(authLockoutRetryAt(3, new Date('2026-10-30T12:00:00.000Z'))).toEqual(
      new Date('2026-10-30T12:08:00.000Z'),
    );
    expect(authLockoutSafeErrorCode({ code: 'provider_unavailable' })).toBe(
      'provider_unavailable',
    );
    expect(
      authLockoutSafeErrorCode({ message: 'secret provider payload' }),
    ).toBe('auth_admin_unavailable');
  });

  it('schedules both drains for every minute tick with a bounded Auth batch', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) =>
        String(input).includes('alert_expired_refund_auth_lockouts')
          ? Response.json(0)
          : Response.json([]),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T12:00:00.000Z'));
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    try {
      worker.scheduled(
        { scheduledTime: 0, cron: '* * * * *', noRetry() {} },
        {
          SUPABASE_URL: 'https://example.test',
          SUPABASE_SERVICE_ROLE_KEY: 'test-runtime-key',
        },
        { waitUntil },
      );
      expect(waitUntil).toHaveBeenCalledOnce();
      await waitUntil.mock.calls[0]?.[0];
      const rpcCalls = fetchMock.mock.calls.map(([url, init]) => [
        url,
        init?.body,
      ]);
      expect(rpcCalls).toContainEqual([
        'https://example.test/rest/v1/rpc/alert_expired_refund_auth_lockouts',
        '{"p_limit":25,"p_checked_at":"2026-10-30T12:00:00.000Z"}',
      ]);
      expect(rpcCalls).toContainEqual([
        'https://example.test/rest/v1/rpc/claim_refund_auth_lockout_jobs',
        '{"p_limit":25}',
      ]);
      expect(rpcCalls).toContainEqual([
        'https://example.test/rest/v1/rpc/jobs_claim',
        '{"batch":25}',
      ]);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
