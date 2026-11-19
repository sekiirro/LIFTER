import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
  loadActorRows: vi.fn(),
  authorize: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));
vi.mock('../../lib/auth/actor', () => ({
  loadActorRows: mocks.loadActorRows,
}));
vi.mock('../../lib/auth/authorize', () => ({
  authorize: mocks.authorize,
}));

import {
  removeBrandingAsset,
  uploadBrandingAsset,
} from '../../app/(dashboard)/branding/upload-actions';

const workspaceId = 'c671d83a-9870-41cb-82cd-1c93a0484d8d';
const pngFile = () =>
  new File(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])],
    'brand.png',
    { type: 'image/png' },
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createSessionClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'actor-1' } },
        error: null,
      }),
    },
    rpc: mocks.rpc,
  });
  mocks.loadActorRows.mockResolvedValue({
    userId: 'actor-1',
    role: 'sales',
    memberships: [],
  });
  mocks.authorize.mockReturnValue(false);
});

describe('branding upload server actions authorization and detach', () => {
  it('denies uploadBrandingAsset when the actor lacks manage_branding scope', async () => {
    const result = await uploadBrandingAsset({
      workspaceId,
      expectedRevision: 0,
      assetRole: 'logo',
      file: pngFile(),
      identityOnlyConfirmed: false,
    });

    expect(result).toEqual({ ok: false, code: 'forbidden' });
    expect(mocks.authorize).toHaveBeenCalledWith(
      { userId: 'actor-1', role: 'sales', memberships: [] },
      'manage_branding',
      workspaceId,
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('denies banner upload when identityOnlyConfirmed is false without touching session', async () => {
    const result = await uploadBrandingAsset({
      workspaceId,
      expectedRevision: 0,
      assetRole: 'banner',
      file: pngFile(),
      identityOnlyConfirmed: false,
    });

    expect(result).toEqual({ ok: false, code: 'forbidden' });
    expect(mocks.createSessionClient).not.toHaveBeenCalled();
  });

  it('denies removeBrandingAsset when the actor lacks manage_branding scope', async () => {
    const result = await removeBrandingAsset({
      workspaceId,
      expectedRevision: 2,
      assetRole: 'logo',
    });

    expect(result).toEqual({ ok: false, code: 'forbidden' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('maps stale revision on removeBrandingAsset without clearing prior state', async () => {
    mocks.authorize.mockReturnValue(true);
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '40001', message: 'stale_branding_revision' },
    });

    const result = await removeBrandingAsset({
      workspaceId,
      expectedRevision: 2,
      assetRole: 'banner',
    });

    expect(result).toEqual({ ok: false, code: 'stale_revision' });
  });

  it('returns the new revision and null thumbnail on authorized removeBrandingAsset', async () => {
    mocks.authorize.mockReturnValue(true);
    mocks.rpc.mockResolvedValue({ data: 3, error: null });

    const result = await removeBrandingAsset({
      workspaceId,
      expectedRevision: 2,
      assetRole: 'logo',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('branding_asset_detach', {
      workspace_id: workspaceId,
      asset_role: 'logo',
      expected_revision: 2,
    });
    expect(result).toEqual({
      ok: true,
      assetRole: 'logo',
      newRevision: 3,
      thumbnailUrl: null,
    });
  });
});
