import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  session: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: m.session,
}));
vi.mock('../../lib/supabase/admin', () => ({
  createAdminClient: m.admin,
}));
import { search } from '../../lib/catalog/server';

describe('catalog production entry uses only the user session client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.rpc.mockResolvedValue({ data: [], error: null });
    m.session.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: { id: 'user' } }, error: null }),
      },
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({
            data:
              table === 'staff_profiles' ? { role: 'platform_owner' } : null,
            error: null,
          }),
          then: (resolve: (value: unknown) => void) =>
            resolve({ data: [], error: null }),
        };
        return query;
      },
      rpc: m.rpc,
    });
  });

  it('resolves identity and invokes RPC through createSessionClient without service role', async () => {
    expect(await search({ kind: 'exercise', query: '' })).toEqual({
      status: 'ok',
      data: [],
    });
    expect(m.session).toHaveBeenCalledOnce();
    expect(m.rpc).toHaveBeenCalledOnce();
    expect(m.admin).not.toHaveBeenCalled();
  });
});
