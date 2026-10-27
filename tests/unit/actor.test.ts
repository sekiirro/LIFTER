import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actorFromRows, getActor, requireActor } from '../../lib/auth/actor';
import { authorize } from '../../lib/auth/authorize';
import { CAPABILITIES } from '../../lib/auth/capabilities';

const mocks = vi.hoisted(() => ({
  factory: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.factory,
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.factory.mockResolvedValue({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  });
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
});

describe('server actor verification', () => {
  it.each(['missing', 'tampered', 'network', 'env'])(
    'denies %s sessions',
    async (kind) => {
      if (kind === 'tampered')
        mocks.getUser.mockResolvedValue({
          data: { user: { id: 'forged' } },
          error: { message: 'invalid' },
        });
      if (kind === 'network')
        mocks.getUser.mockRejectedValue(new Error('network'));
      if (kind === 'env') mocks.factory.mockResolvedValue(null);
      expect(await getActor()).toBeNull();
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );
  it('loads both tables only for the verified user id', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'verified' } },
      error: null,
    });
    const staffEq = vi.fn().mockReturnValue({
      maybeSingle: async () => ({ data: { role: 'trainer' }, error: null }),
    });
    const membershipsEq = vi.fn().mockResolvedValue({
      data: [{ workspace_id: 'A', revoked_at: null }],
      error: null,
    });
    const staffSelect = vi.fn().mockReturnValue({ eq: staffEq });
    const membershipsSelect = vi.fn().mockReturnValue({ eq: membershipsEq });
    mocks.from.mockImplementation((table) => ({
      select: table === 'staff_profiles' ? staffSelect : membershipsSelect,
    }));
    expect(await getActor()).toEqual({
      userId: 'verified',
      role: 'trainer',
      activeWorkspaceIds: ['A'],
    });
    expect(staffSelect).toHaveBeenCalledWith('role');
    expect(membershipsSelect).toHaveBeenCalledWith('workspace_id, revoked_at');
    expect(staffEq).toHaveBeenCalledWith('user_id', 'verified');
    expect(membershipsEq).toHaveBeenCalledWith('user_id', 'verified');
  });
  it('redirects protected pages without an actor', async () => {
    mocks.redirect.mockImplementation(() => {
      throw new Error('redirect');
    });
    await expect(requireActor()).rejects.toThrow('redirect');
    expect(mocks.redirect).toHaveBeenCalledWith('/login');
  });
});

describe('actorFromRows', () => {
  it('excludes revoked memberships and deduplicates active rows', () => {
    const actor = actorFromRows('user', { role: 'trainer' }, [
      { workspace_id: 'A', revoked_at: null },
      { workspace_id: 'A', revoked_at: null },
      { workspace_id: 'B', revoked_at: '2026-01-01' },
    ]);
    expect(actor).toEqual({
      userId: 'user',
      role: 'trainer',
      activeWorkspaceIds: ['A'],
    });
    expect(authorize(actor, 'coaching_work', 'B')).toBe(false);
  });
  it('denies every capability for an auth-only identity', () => {
    const actor = actorFromRows('user', null, [
      { workspace_id: 'A', revoked_at: null },
    ]);
    expect(actor.role).toBeNull();
    for (const cap of CAPABILITIES)
      expect(authorize(actor, cap, 'A')).toBe(false);
  });
});
