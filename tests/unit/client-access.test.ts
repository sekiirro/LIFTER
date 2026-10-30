import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createSessionClient } = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
}));
vi.mock('../../lib/supabase/server', () => ({ createSessionClient }));
vi.mock('server-only', () => ({}));

import {
  createClientStatusReader,
  getClientSelfStatus,
} from '../../lib/client-access/status';
import { authorizeClientAccess } from '../../lib/client-access/authorize';

function setBackend(
  data: unknown,
  user: { id: string } | null = { id: 'client-user' },
) {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  createSessionClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : { code: 'auth' },
      }),
    },
    rpc,
  });
  return rpc;
}

describe('signed client self status', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['pending-approval', 'approved', 'rejected'] as const)(
    'reads only the current session association for %s',
    async (approval_state) => {
      const rpc = setBackend({ status: 'ok', approval_state });
      expect(await getClientSelfStatus()).toEqual({
        status: 'ok',
        approval_state,
      });
      expect(rpc).toHaveBeenCalledOnce();
      expect(rpc).toHaveBeenCalledWith('client_self_status');
      expect(rpc.mock.calls[0]).toHaveLength(1);
    },
  );

  it('denies anonymous, malformed, and backend failure results without caller IDs', async () => {
    setBackend({ status: 'ok', approval_state: 'approved' }, null);
    expect(await getClientSelfStatus()).toEqual({ status: 'not_permitted' });
    const rpc = setBackend({ status: 'ok', approval_state: 'approved' });
    const result = await authorizeClientAccess();
    expect(result).toEqual({ allowed: true, approvalState: 'approved' });
    expect(rpc.mock.calls[0]).toEqual(['client_self_status']);
    setBackend({
      status: 'ok',
      approval_state: 'pending-approval',
      client_id: 'spoofed',
    });
    expect(await getClientSelfStatus()).toEqual({
      status: 'ok',
      approval_state: 'pending-approval',
    });
    setBackend({ status: 'unavailable', detail: 'private detail' });
    expect(await getClientSelfStatus()).toEqual({ status: 'unavailable' });
  });

  it('memoizes only inside a reader instance and shares no result across requests', async () => {
    const firstRequestFetch = vi
      .fn()
      .mockResolvedValue({ status: 'ok', approval_state: 'pending-approval' });
    const secondRequestFetch = vi
      .fn()
      .mockResolvedValue({ status: 'ok', approval_state: 'approved' });
    const firstRequest = createClientStatusReader(firstRequestFetch);
    const secondRequest = createClientStatusReader(secondRequestFetch);
    await expect(firstRequest()).resolves.toEqual({
      status: 'ok',
      approval_state: 'pending-approval',
    });
    await expect(firstRequest()).resolves.toEqual({
      status: 'ok',
      approval_state: 'pending-approval',
    });
    await expect(secondRequest()).resolves.toEqual({
      status: 'ok',
      approval_state: 'approved',
    });
    expect(firstRequestFetch).toHaveBeenCalledOnce();
    expect(secondRequestFetch).toHaveBeenCalledOnce();
  });

  it('never accepts a target user/client ID or imports a service-role path', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(
        new URL('../../lib/client-access/status.ts', import.meta.url),
        'utf8',
      ),
    );
    expect(source).not.toMatch(
      /service[_-]?role|SUPABASE_SERVICE_ROLE|createServiceClient/,
    );
    expect(source).toMatch(/auth\.getUser\(\)/);
    expect(source).toMatch(/rpc\(['"]client_self_status['"]\)/);
    expect(source).toMatch(/cache\(loadSignedClientSelfStatus\)/);
    expect(source).not.toMatch(
      /\b(new Map|globalThis|let shared|const shared)/,
    );
  });
});
