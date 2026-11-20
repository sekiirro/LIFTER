import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPackageCommissionReport,
  getPackageInstallmentReport,
  getPackageMonthlyCollections,
} from '../../lib/packages/reporting';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ getActor: mocks.actor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.session,
}));

const wsA = '00000000-0000-0000-0000-000000000001';
const wsB = '00000000-0000-0000-0000-000000000002';
const actor = (role: string | null, workspaces: string[] = []) => ({
  userId: '00000000-0000-0000-0000-000000000003',
  role,
  activeWorkspaceIds: workspaces,
});
const methods = [
  (workspaceId: string) =>
    getPackageMonthlyCollections(workspaceId, '2026-12-01'),
  (workspaceId: string) =>
    getPackageCommissionReport(workspaceId, '2026-12-01'),
  (workspaceId: string) => getPackageInstallmentReport(workspaceId),
];

afterEach(() => vi.resetAllMocks());

describe('package reporting app authorization wall', () => {
  it.each([
    ['sales', actor('sales', [wsA]), wsA],
    ['trainer', actor('trainer', [wsA]), wsA],
    ['client', actor(null, [wsA]), wsA],
    ['anonymous', null, wsA],
    ['foreign workspace owner', actor('workspace_owner', [wsA]), wsB],
  ])(
    '%s is denied before any RPC call',
    async (_label, currentActor, workspaceId) => {
      mocks.actor.mockResolvedValue(currentActor);
      mocks.session.mockResolvedValue({ rpc: mocks.rpc });
      mocks.rpc.mockResolvedValue({ data: { status: 'ok' }, error: null });
      for (const method of methods) {
        await expect(method(workspaceId as string)).resolves.toEqual({
          status: 'not_permitted',
        });
      }
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it('allows a PO and an own-workspace WO to call through the session RPC', async () => {
    mocks.actor.mockResolvedValueOnce(actor('platform_owner'));
    mocks.actor.mockResolvedValueOnce(actor('workspace_owner', [wsA]));
    mocks.session.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: { status: 'ok' }, error: null });
    await expect(
      getPackageCommissionReport(wsB, '2026-12-01'),
    ).resolves.toEqual({
      status: 'ok',
    });
    await expect(getPackageInstallmentReport(wsA)).resolves.toEqual({
      status: 'ok',
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
