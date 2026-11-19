import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPackageCategory,
  initializePackageCategories,
  publishPackageVersion,
  setPackageOfferAvailable,
} from '../../app/(app)/packages/actions';
import {
  loadPackageManagement,
  loadPackageOffers,
} from '../../lib/packages/read';
import {
  PACKAGE_MARKETS,
  PACKAGE_TYPES,
  parseCategoryIdentity,
} from '../../lib/packages/validation';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  revalidate: vi.fn(),
  workspace: vi.fn(),
  pkg: vi.fn(),
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
const pkgId = '00000000-0000-0000-0000-000000000002';
const offerId = '00000000-0000-0000-0000-000000000003';
const userId = '00000000-0000-0000-0000-000000000004';
const fourCategories = [
  {
    package_id: '00000000-0000-0000-0000-000000000011',
    market: 'Egypt',
    category_type: 'Promotional',
  },
  {
    package_id: '00000000-0000-0000-0000-000000000012',
    market: 'Egypt',
    category_type: 'Year-round',
  },
  {
    package_id: '00000000-0000-0000-0000-000000000013',
    market: 'International',
    category_type: 'Promotional',
  },
  {
    package_id: '00000000-0000-0000-0000-000000000014',
    market: 'International',
    category_type: 'Year-round',
  },
] as const;

const commercialTerms = {
  workspaceId: ws,
  packageId: pkgId,
  tierRank: 1 as const,
  durationMonths: 3 as const,
  durationDays: 90,
  nameAr: 'باقة تجريبية',
  nameEn: 'Synthetic package',
  priceMinor: '150000',
  currency: 'EGP',
  commissionRateBp: 1200,
};

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
    userId,
    role: 'platform_owner',
    activeWorkspaceIds: [],
  });
  mocks.workspace.mockResolvedValue({ data: { id: ws }, error: null });
  mocks.pkg.mockResolvedValue({
    data: {
      id: pkgId,
      workspace_id: ws,
      market: 'Egypt',
      type: 'Year-round',
    },
    error: null,
  });
  mocks.from.mockImplementation((table: string) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: table === 'packages' ? mocks.pkg : mocks.workspace,
  }));
  mocks.session.mockResolvedValue({ rpc: mocks.rpc, from: mocks.from });
  mocks.rpc.mockImplementation((fn: string) =>
    Promise.resolve({
      data:
        fn === 'initialize_workspace_package_categories'
          ? fourCategories
          : pkgId,
      error: null,
    }),
  );
});

afterEach(() => {
  for (const log of logs) expect(log).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('T054/T055 commercial terms role matrix and category initialization', () => {
  it('T055 initializes all four empty category pairs per workspace using S35-PO-1 literals', async () => {
    expect(PACKAGE_MARKETS).toEqual(['Egypt', 'International']);
    expect(PACKAGE_TYPES).toEqual(['Year-round', 'Promotional']);

    const result = await initializePackageCategories({ workspaceId: ws });
    expect(result).toEqual({
      status: 'ok',
      categories: [
        {
          packageId: fourCategories[0].package_id,
          market: 'Egypt',
          type: 'Promotional',
        },
        {
          packageId: fourCategories[1].package_id,
          market: 'Egypt',
          type: 'Year-round',
        },
        {
          packageId: fourCategories[2].package_id,
          market: 'International',
          type: 'Promotional',
        },
        {
          packageId: fourCategories[3].package_id,
          market: 'International',
          type: 'Year-round',
        },
      ],
    });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      'initialize_workspace_package_categories',
      { workspace_id: ws },
    );
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith('/packages');
  });

  it('T055 rejects malformed workspace targets, missing workspace, RPC failures, and incomplete category payloads', async () => {
    expect(await initializePackageCategories(null)).toEqual({
      status: 'denied',
    });
    expect(
      await initializePackageCategories({ workspaceId: 'not-a-uuid' }),
    ).toEqual({ status: 'denied' });
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.workspace.mockResolvedValueOnce({ data: null, error: null });
    expect(await initializePackageCategories({ workspaceId: ws })).toEqual({
      status: 'denied',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.workspace.mockResolvedValueOnce({
      data: null,
      error: { message: 'db' },
    });
    expect(await initializePackageCategories({ workspaceId: ws })).toEqual({
      status: 'unavailable',
    });

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'not_permitted' },
    });
    expect(await initializePackageCategories({ workspaceId: ws })).toEqual({
      status: 'denied',
    });

    mocks.rpc.mockResolvedValueOnce({
      data: fourCategories.slice(0, 3),
      error: null,
    });
    expect(await initializePackageCategories({ workspaceId: ws })).toEqual({
      status: 'unavailable',
    });

    mocks.rpc.mockResolvedValueOnce({
      data: [
        ...fourCategories.slice(0, 3),
        {
          package_id: '00000000-0000-0000-0000-000000000014',
          market: 'Egypt',
          category_type: 'Year-round',
        },
      ],
      error: null,
    });
    expect(await initializePackageCategories({ workspaceId: ws })).toEqual({
      status: 'unavailable',
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each(['workspace_owner', 'sales', 'trainer', null] as const)(
    'T054 denies %s from initializing categories or editing workspace commercial terms even in active workspace',
    async (role) => {
      mocks.actor.mockResolvedValue({
        userId,
        role,
        activeWorkspaceIds: [ws],
      });
      const attempts = await Promise.all([
        initializePackageCategories({ workspaceId: ws }),
        createPackageCategory({
          workspaceId: ws,
          market: 'Egypt',
          type: 'Year-round',
        }),
        publishPackageVersion(commercialTerms),
        publishPackageVersion({
          ...commercialTerms,
          nameAr: 'اسم معدل',
          nameEn: 'Renamed',
          priceMinor: '200000',
          commissionRateBp: 500,
        }),
        setPackageOfferAvailable({
          workspaceId: ws,
          offerId,
          available: true,
        }),
      ]);
      for (const result of attempts) {
        expect(result).toEqual({ status: 'denied' });
      }
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.revalidate).not.toHaveBeenCalled();
    },
  );

  it('T054 denies PO when app capability check fails even if RPC would accept', async () => {
    mocks.authorize.mockReturnValue(false);
    expect(await initializePackageCategories({ workspaceId: ws })).toEqual({
      status: 'denied',
    });
    expect(await publishPackageVersion(commercialTerms)).toEqual({
      status: 'denied',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('T054/T055 rejects any 5th category or non-canonical market/type literal', () => {
    for (const [market, type] of [
      ['MENA', 'Year-round'],
      ['Egypt', 'Seasonal'],
      ['egypt', 'Year-round'],
      ['international', 'Promotional'],
      ['Egypt', 'year-round'],
    ]) {
      expect(
        parseCategoryIdentity({ workspaceId: ws, market, type }),
      ).toBeNull();
    }
  });

  it('T054 strips forged market/type from commercial edits and rejects non-PO management reads', async () => {
    const published = await publishPackageVersion({
      ...commercialTerms,
      market: 'International',
      type: 'Promotional',
    });
    expect(published).toEqual({ status: 'ok', versionId: pkgId });
    expect(mocks.rpc.mock.calls[0]?.[1]).not.toHaveProperty('market');
    expect(mocks.rpc.mock.calls[0]?.[1]).not.toHaveProperty('type');

    for (const role of ['workspace_owner', 'sales', 'trainer'] as const) {
      expect(
        await loadPackageManagement(
          { userId, role, activeWorkspaceIds: [ws] },
          ws,
        ),
      ).toEqual({ status: 'denied' });
    }
    expect(await loadPackageOffers(null, ws)).toEqual({ status: 'denied' });
  });
});
