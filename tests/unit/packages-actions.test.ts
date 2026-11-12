import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPackage,
  publishPackageVersion,
  setPackageOfferAvailable,
} from '../../app/(app)/packages/actions';
import { mapPackageError } from '../../lib/packages/results';
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  revalidate: vi.fn(),
  workspace: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ getActor: mocks.actor }));
vi.mock('../../lib/auth/authorize', () => ({ authorize: mocks.authorize }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.session,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
const ws = '00000000-0000-0000-0000-000000000001';
const id = '00000000-0000-0000-0000-000000000002';
const terms = {
  workspaceId: ws,
  packageId: id,
  tierRank: 2,
  durationMonths: null,
  durationDays: 60,
  nameAr: 'test-ar',
  nameEn: 'test-en',
  priceMinor: '9007199254740993',
  currency: 'XTS',
  commissionRateBp: 0,
};
const calls = () => [
  createPackage({ workspaceId: ws, code: 'test-pkg-fixture' }),
  publishPackageVersion(terms),
  setPackageOfferAvailable({ workspaceId: ws, offerId: id, available: true }),
];
let logs: ReturnType<typeof vi.spyOn>[];
beforeEach(async () => {
  vi.resetAllMocks();
  const actual = await vi.importActual<
    typeof import('../../lib/auth/authorize')
  >('../../lib/auth/authorize');
  mocks.authorize.mockImplementation(actual.authorize);
  logs = (['log', 'warn', 'error', 'info', 'debug', 'trace'] as const).map(
    (key) => vi.spyOn(console, key).mockImplementation(() => {}),
  );
  mocks.actor.mockResolvedValue({
    userId: id,
    role: 'platform_owner',
    activeWorkspaceIds: [],
  });
  mocks.workspace.mockResolvedValue({ data: { id: ws }, error: null });
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: mocks.workspace,
  };
  mocks.from.mockReturnValue(query);
  mocks.session.mockResolvedValue({ rpc: mocks.rpc, from: mocks.from });
  mocks.rpc.mockResolvedValue({ data: id, error: null });
});
afterEach(() => {
  for (const log of logs) expect(log).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
describe('package actions two walls', () => {
  it('obeys an app capability denial even for a verified PO and accepting RPC', async () => {
    mocks.authorize.mockReturnValue(false);
    for (const result of await Promise.all(calls()))
      expect(result).toEqual({ status: 'denied' });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each(['workspace_owner', 'sales', 'trainer', null])(
    'denies forged accepting RPC role %s',
    async (role) => {
      mocks.actor.mockResolvedValue({
        userId: id,
        role,
        activeWorkspaceIds: [ws],
      });
      for (const result of await Promise.all(calls()))
        expect(result).toEqual({ status: 'denied' });
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it('requires actor and rederives each request', async () => {
    mocks.actor.mockResolvedValue(null);
    for (const r of await Promise.all(calls()))
      expect(r).toEqual({ status: 'denied' });
    expect(mocks.actor).toHaveBeenCalledTimes(3);
  });
  it('transports exact terms without accepting actor/version/pointer overrides', async () => {
    expect(
      await publishPackageVersion({
        ...terms,
        publishedBy: 'forged',
        version: 999,
      }),
    ).toEqual({ status: 'ok', versionId: id });
    expect(mocks.rpc).toHaveBeenCalledWith('publish_package_version', {
      workspace_id: ws,
      package_id: id,
      tier_rank: 2,
      duration_months: null,
      duration_days: 60,
      name_ar: 'test-ar',
      name_en: 'test-en',
      price_minor: '9007199254740993',
      currency: 'XTS',
      commission_rate_bp: 0,
    });
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith('/packages');
  });
  it('validates selected existing workspace even for global create', async () => {
    mocks.workspace.mockResolvedValue({ data: null, error: null });
    expect(
      await createPackage({ workspaceId: ws, code: 'test-pkg-fixture' }),
    ).toEqual({ status: 'denied' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('creates with only code and revalidates after confirmed success', async () => {
    expect(
      await createPackage({ workspaceId: ws, code: 'test-pkg-fixture' }),
    ).toEqual({ status: 'ok', packageId: id });
    expect(mocks.rpc).toHaveBeenCalledWith('create_package', {
      code: 'test-pkg-fixture',
    });
    expect(mocks.revalidate).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])('toggle confirmed state %s', async (available) => {
    expect(
      await setPackageOfferAvailable({
        workspaceId: ws,
        offerId: id,
        available,
      }),
    ).toEqual({ status: 'ok', offerId: id });
    expect(mocks.rpc).toHaveBeenCalledWith('set_package_offer_available', {
      workspace_id: ws,
      offer_id: id,
      available,
    });
  });
  it.each(['true', 'false', 1, 0, null, undefined])(
    'rejects coerced boolean %#',
    async (available) => {
      expect(
        await setPackageOfferAvailable({
          workspaceId: ws,
          offerId: id,
          available,
        }),
      ).toEqual({ status: 'invalid_input' });
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it('has no partial success while pending', async () => {
    let finish!: (value: unknown) => void;
    mocks.rpc.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    let done = false;
    const request = setPackageOfferAvailable({
      workspaceId: ws,
      offerId: id,
      available: true,
    }).then((r) => {
      done = true;
      return r;
    });
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    expect(done).toBe(false);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    finish({ data: id, error: null });
    expect(await request).toEqual({ status: 'ok', offerId: id });
  });
  it.each([
    [{ code: '42501', message: 'secret' }, 'denied'],
    [{ code: '22023', message: 'invalid_input' }, 'invalid_input'],
    [{ code: '22023', message: 'private' }, 'unavailable'],
    [{ code: '23514', message: 'private' }, 'unavailable'],
    [{ message: 'email/token/sql' }, 'unavailable'],
  ])('maps generic failure %#', async (error, status) => {
    expect(mapPackageError(error)).toEqual({ status });
    mocks.rpc.mockResolvedValue({ error, data: null });
    for (const r of await Promise.all(calls())) expect(r).toEqual({ status });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('catches network and environment exceptions', async () => {
    mocks.session.mockRejectedValue(new Error('secret'));
    for (const r of await Promise.all(calls()))
      expect(r).toEqual({ status: 'unavailable' });
  });
  it.each([null, [], {}, { workspaceId: 'forged' }])(
    'denies malformed targets %#',
    async (input) => {
      expect(await createPackage(input)).toEqual({ status: 'denied' });
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid shared terms and codes', async () => {
    expect(
      await publishPackageVersion({ ...terms, priceMinor: 9007199254740992 }),
    ).toEqual({ status: 'invalid_input' });
    expect(await createPackage({ workspaceId: ws, code: 'INVALID' })).toEqual({
      status: 'invalid_input',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
