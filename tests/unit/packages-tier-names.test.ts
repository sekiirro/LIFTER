import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renamePlatformTierName,
  setWorkspaceTierNameOverride,
  loadWorkspaceTierNames,
} from '../../lib/packages/tier-names';
import {
  renamePlatformTierName as renameAction,
  setWorkspaceTierNameOverride as overrideAction,
} from '../../app/(app)/packages/tier-names-actions';
import type { Actor } from '../../lib/auth/authorize';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ getActor: mocks.actor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.session,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

const ws = '00000000-0000-0000-0000-000000000001';
const otherWs = '00000000-0000-0000-0000-000000000002';
const userId = '00000000-0000-0000-0000-000000000003';
const actors = {
  po: { userId, role: 'platform_owner', activeWorkspaceIds: [] },
  wo: { userId, role: 'workspace_owner', activeWorkspaceIds: [ws] },
  woOther: { userId, role: 'workspace_owner', activeWorkspaceIds: [otherWs] },
  sales: { userId, role: 'sales', activeWorkspaceIds: [ws] },
  trainer: { userId, role: 'trainer', activeWorkspaceIds: [ws] },
  deletedWo: {
    userId,
    role: 'workspace_owner',
    activeWorkspaceIds: [ws],
    deleted: true,
  },
} satisfies Record<string, Actor>;
const validGlobal = { tierRank: 2, locale: 'en', name: 'Golden Global' };
const validOverride = {
  workspaceId: ws,
  tierRank: 2,
  locale: 'en',
  name: 'Workspace Gold',
};
let logs: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  vi.resetAllMocks();
  logs = (['log', 'warn', 'error', 'info', 'debug', 'trace'] as const).map(
    (key) => vi.spyOn(console, key).mockImplementation(() => {}),
  );
  mocks.session.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => {
  for (const log of logs) expect(log).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('tier-name app walls', () => {
  it('lets only the PO rename a tier globally', async () => {
    mocks.actor.mockResolvedValue(actors.po);
    await expect(renamePlatformTierName(validGlobal)).resolves.toEqual({
      status: 'ok',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('set_package_tier_name', {
      tier_rank: 2,
      locale: 'en',
      name: 'Golden Global',
    });
  });
  it.each(['wo', 'woOther', 'sales', 'trainer', 'deletedWo'])(
    'denies the global rename for forged accepting RPC actor %s',
    async (key) => {
      mocks.actor.mockResolvedValue(actors[key as keyof typeof actors]);
      await expect(renamePlatformTierName(validGlobal)).resolves.toEqual({
        status: 'denied',
      });
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it('denies the global rename without an actor and on unavailable transport', async () => {
    mocks.actor.mockResolvedValue(null);
    await expect(renamePlatformTierName(validGlobal)).resolves.toEqual({
      status: 'denied',
    });
    mocks.actor.mockResolvedValue(actors.po);
    mocks.session.mockResolvedValue(null);
    await expect(renamePlatformTierName(validGlobal)).resolves.toEqual({
      status: 'unavailable',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ['rank 0', { ...validGlobal, tierRank: 0 }],
    ['rank 4', { ...validGlobal, tierRank: 4 }],
    ['rank text', { ...validGlobal, tierRank: 'two' }],
    ['rank missing', { locale: 'en', name: 'x' }],
    ['locale fr', { ...validGlobal, locale: 'fr' }],
    ['locale ar upper', { ...validGlobal, locale: 'AR' }],
    ['blank name', { ...validGlobal, name: '   ' }],
    ['empty name', { ...validGlobal, name: '' }],
    ['name missing', { tierRank: 2, locale: 'en' }],
    ['non-string name', { ...validGlobal, name: 7 }],
  ])('rejects global rename input %s before any RPC', async (_label, input) => {
    mocks.actor.mockResolvedValue(actors.po);
    await expect(renamePlatformTierName(input)).resolves.toEqual({
      status: 'invalid_input',
    });
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('maps only controlled RPC failures for the global rename', async () => {
    mocks.actor.mockResolvedValue(actors.po);
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'not_permitted' },
    });
    await expect(renamePlatformTierName(validGlobal)).resolves.toEqual({
      status: 'denied',
    });
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '22023', message: 'invalid_input' },
    });
    await expect(renamePlatformTierName(validGlobal)).resolves.toEqual({
      status: 'invalid_input',
    });
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'boom' },
    });
    await expect(renamePlatformTierName(validGlobal)).resolves.toEqual({
      status: 'unavailable',
    });
    mocks.rpc.mockRejectedValueOnce(new Error('transport'));
    await expect(renamePlatformTierName(validGlobal)).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('lets a WO override a tier name only inside their own workspace', async () => {
    mocks.actor.mockResolvedValue(actors.wo);
    await expect(setWorkspaceTierNameOverride(validOverride)).resolves.toEqual({
      status: 'ok',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('set_package_tier_name_override', {
      workspace_id: ws,
      tier_rank: 2,
      locale: 'en',
      name: 'Workspace Gold',
    });
  });
  it.each(['po', 'woOther', 'sales', 'trainer', 'deletedWo'])(
    'denies the override for actor %s even with an accepting RPC',
    async (key) => {
      mocks.actor.mockResolvedValue(actors[key as keyof typeof actors]);
      await expect(
        setWorkspaceTierNameOverride(validOverride),
      ).resolves.toEqual({ status: 'denied' });
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['foreign workspace', { ...validOverride, workspaceId: otherWs }],
    ['malformed workspace', { ...validOverride, workspaceId: 'x' }],
    ['missing workspace', { tierRank: 2, locale: 'en', name: 'x' }],
    ['non-string workspace', { ...validOverride, workspaceId: 7 }],
  ])(
    'denies override target %s at the workspace wall',
    async (_label, input) => {
      mocks.actor.mockResolvedValue(actors.wo);
      await expect(setWorkspaceTierNameOverride(input)).resolves.toEqual({
        status: 'denied',
      });
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['rank out of range', { ...validOverride, tierRank: 9 }],
    ['rank zero', { ...validOverride, tierRank: 0 }],
    ['locale invalid', { ...validOverride, locale: 'de' }],
    ['blank name', { ...validOverride, name: ' \t ' }],
    ['empty name', { ...validOverride, name: '' }],
  ])('rejects override input %s before any RPC', async (_label, input) => {
    mocks.actor.mockResolvedValue(actors.wo);
    await expect(setWorkspaceTierNameOverride(input)).resolves.toEqual({
      status: 'invalid_input',
    });
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('maps only controlled RPC failures for the override', async () => {
    mocks.actor.mockResolvedValue(actors.wo);
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'not_permitted' },
    });
    await expect(setWorkspaceTierNameOverride(validOverride)).resolves.toEqual({
      status: 'denied',
    });
    mocks.rpc.mockRejectedValueOnce(new Error('transport'));
    await expect(setWorkspaceTierNameOverride(validOverride)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('tier-name resolved read', () => {
  it('denies reads without an authorized actor or a valid workspace', async () => {
    await expect(loadWorkspaceTierNames(null, ws)).resolves.toEqual({
      status: 'denied',
    });
    await expect(
      loadWorkspaceTierNames(actors.wo, 'not-a-uuid'),
    ).resolves.toEqual({ status: 'denied' });
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it('resolves stored rows and falls back to the PO-approved defaults byte-exactly', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        { tier_rank: 1, locale: 'ar', name: null },
        { tier_rank: 1, locale: 'en', name: null },
        { tier_rank: 2, locale: 'ar', name: 'ذهبي عالمي' },
        { tier_rank: 2, locale: 'en', name: 'Golden Global' },
        { tier_rank: 3, locale: 'ar', name: null },
        { tier_rank: 3, locale: 'en', name: null },
      ],
      error: null,
    });
    const result = await loadWorkspaceTierNames(actors.wo, ws);
    expect(result).toEqual({
      status: 'ok',
      names: [
        { tierRank: 1, locale: 'ar', name: 'سيلفر' },
        { tierRank: 1, locale: 'en', name: 'Silver' },
        { tierRank: 2, locale: 'ar', name: 'ذهبي عالمي' },
        { tierRank: 2, locale: 'en', name: 'Golden Global' },
        { tierRank: 3, locale: 'ar', name: 'بلاتينيوم' },
        { tierRank: 3, locale: 'en', name: 'Platinum' },
      ],
    });
    expect(mocks.rpc).toHaveBeenCalledWith('get_package_tier_names', {
      workspace_id: ws,
    });
  });
  it('maps read failures generically', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'not_permitted' },
    });
    await expect(loadWorkspaceTierNames(actors.wo, ws)).resolves.toEqual({
      status: 'denied',
    });
    mocks.rpc.mockResolvedValueOnce({ data: 'garbage', error: null });
    await expect(loadWorkspaceTierNames(actors.wo, ws)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('tier-name server actions', () => {
  it('revalidates the packages route only after an ok mutation', async () => {
    mocks.actor.mockResolvedValue(actors.po);
    await renameAction(validGlobal);
    expect(mocks.revalidate).toHaveBeenCalledWith('/packages');
    mocks.revalidate.mockClear();
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'not_permitted' },
    });
    await renameAction(validGlobal);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    mocks.actor.mockResolvedValue(actors.wo);
    await overrideAction(validOverride);
    expect(mocks.revalidate).toHaveBeenCalledWith('/packages');
  });
});
