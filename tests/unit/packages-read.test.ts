import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadPackageOffers,
  loadPackageManagement,
  SAFE_VERSION_COLUMNS,
} from '../../lib/packages/read';
const m = vi.hoisted(() => ({
  session: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  responses: new Map(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: m.session,
}));
const ws = '00000000-0000-0000-0000-000000000001';
const actor = { userId: ws, role: 'sales' as const, activeWorkspaceIds: [ws] };
beforeEach(() => {
  vi.resetAllMocks();
  m.responses.clear();
  m.responses.set('packages', [{ id: 'p', code: 'test-pkg-fixture' }]);
  m.responses.set('package_offers', [
    { id: 'o', workspace_id: ws, package_id: 'p', available: false },
  ]);
  m.responses.set('package_versions_safe', [
    {
      id: 'v',
      workspace_id: ws,
      offer_id: 'o',
      price_minor: '9007199254740993',
    },
  ]);
  m.responses.set('workspaces', [{ id: ws }]);
  m.from.mockImplementation((table) => {
    const q = {
      select: m.select,
      eq: m.eq,
      maybeSingle: m.maybeSingle,
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: m.responses.get(table), error: null }),
    };
    m.select.mockReturnValue(q);
    m.eq.mockReturnValue(q);
    m.maybeSingle.mockResolvedValue({ data: { id: ws }, error: null });
    return q;
  });
  m.rpc.mockResolvedValue({
    data: [{ version_id: 'v', commission_rate_bp: 17 }],
    error: null,
  });
  m.session.mockResolvedValue({ from: m.from, rpc: m.rpc });
});
describe('scoped package reads', () => {
  it.each(['sales', 'trainer'] as const)(
    'omits rates entirely for %s',
    async (role) => {
      const result = await loadPackageOffers({ ...actor, role }, ws);
      expect(result.status).toBe('ok');
      expect(JSON.stringify(result)).not.toContain('commission');
      expect(m.rpc).not.toHaveBeenCalled();
      if (result.status === 'ok')
        expect(result.versions[0]?.price_minor).toBe('9007199254740993');
      expect(m.select).toHaveBeenCalledWith(SAFE_VERSION_COLUMNS);
      expect(SAFE_VERSION_COLUMNS).not.toContain('*');
      expect(SAFE_VERSION_COLUMNS).not.toContain('commission');
      expect(m.eq).toHaveBeenCalledWith('workspace_id', ws);
    },
  );
  it.each(['platform_owner', 'workspace_owner'] as const)(
    'allows scoped rates for %s',
    async (role) => {
      const result = await loadPackageOffers({ ...actor, role }, ws);
      expect(result.status).toBe('ok');
      expect(m.rpc).toHaveBeenCalledWith('get_package_version_commissions', {
        workspace_id: ws,
      });
      if (result.status === 'ok')
        expect(result.versions[0]).toHaveProperty('commission_rate_bp', 17);
    },
  );
  it('PO needs no membership', async () =>
    expect(
      (
        await loadPackageManagement(
          { ...actor, role: 'platform_owner', activeWorkspaceIds: [] },
          ws,
        )
      ).status,
    ).toBe('ok'));
  it('denies management before reads for all non-PO', async () => {
    expect(await loadPackageManagement(actor, ws)).toEqual({
      status: 'denied',
    });
    expect(m.session).not.toHaveBeenCalled();
  });
  it.each([
    { ...actor, activeWorkspaceIds: [] },
    { ...actor, role: null },
    null,
  ])('denies revoked/no-profile/anonymous %#', async (a) => {
    expect(await loadPackageOffers(a, ws)).toEqual({ status: 'denied' });
    expect(m.session).not.toHaveBeenCalled();
  });
  it('denies malformed workspace', async () =>
    expect(await loadPackageOffers(actor, 'forged')).toEqual({
      status: 'denied',
    }));
  it('fails closed without exact string transport', async () => {
    m.responses.set('package_versions_safe', [
      { id: 'v', price_minor: 9007199254740992 },
    ]);
    expect(await loadPackageOffers(actor, ws)).toEqual({
      status: 'unavailable',
    });
  });
  it('maps unavailable safely without logging or cross-user cache', async () => {
    const log = vi.spyOn(console, 'error');
    m.session.mockRejectedValue(new Error('secret'));
    expect(await loadPackageOffers(actor, ws)).toEqual({
      status: 'unavailable',
    });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it('does not cache between actors or reuse rates', async () => {
    await loadPackageOffers({ ...actor, role: 'platform_owner' }, ws);
    m.rpc.mockClear();
    const result = await loadPackageOffers(actor, ws);
    expect(JSON.stringify(result)).not.toContain('commission');
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.session).toHaveBeenCalledTimes(2);
  });
  it('returns generic failure on rate RPC error', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'secret' } });
    expect(
      await loadPackageOffers({ ...actor, role: 'workspace_owner' }, ws),
    ).toEqual({ status: 'unavailable' });
  });
});
