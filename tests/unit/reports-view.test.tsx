import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from '../../app/(app)/reports/page';
import {
  ReportsView,
  packageLabel,
  type ReportsData,
} from '../../app/(app)/reports/ReportsView';
import { getMessages } from '../../lib/i18n';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  cookies: vi.fn(),
  session: vi.fn(),
  collections: vi.fn(),
  commissions: vi.fn(),
  installments: vi.fn(),
  platformReport: vi.fn(),
  drilldownRows: vi.fn(),
  push: vi.fn(),
  from: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ requireActor: mocks.actor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.session,
}));
vi.mock('../../lib/packages/reporting', () => ({
  getPackageMonthlyCollections: mocks.collections,
  getPackageCommissionReport: mocks.commissions,
  getPackageInstallmentReport: mocks.installments,
  getPlatformAggregateReport: mocks.platformReport,
  getWorkspaceDrilldownRows: mocks.drilldownRows,
}));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));

const own = '00000000-0000-0000-0000-000000000001';
const foreign = '00000000-0000-0000-0000-000000000002';
const packageRow = {
  id: 'package-private-id',
  market: 'Egypt',
  type: 'Promotional',
};
const workspaceRow = { id: own, name: 'Own workspace' };
const reportData: ReportsData = {
  collections: {
    status: 'ok',
    rows: [
      {
        id: 'event-id',
        package: packageRow,
        clientName: 'Mona Hassan',
        recordedAt: '2026-11-08T12:00:00.000Z',
        amountMinor: '9007199254740993',
        currency: 'EGP',
        convertedEgpExact: '9007199254740993',
      },
    ],
    totalConvertedEgpMinor: '9007199254740993',
    pendingEventIds: ['pending-id'],
  },
  commissions: {
    status: 'ok',
    rows: [
      {
        package: packageRow,
        byCurrency: { USD: '9007199254740993', EGP: '999' },
        convertedEgpExact: null,
        pendingRateCount: 2,
      },
    ],
  },
  installments: {
    status: 'ok',
    rows: [
      {
        id: 'installment-id',
        package: packageRow,
        clientName: 'Mona Hassan',
        dueOn: '2026-11-30',
        amountMinor: '50000',
        paidMinor: '0',
        remainingMinor: '50000',
        currency: 'EGP',
        isInstallmentClient: true,
      },
    ],
  },
};

function renderView(data = reportData, locale: 'en' | 'ar' = 'en') {
  const messages = getMessages(locale);
  return renderToStaticMarkup(
    createElement(ReportsView, {
      locale,
      month: '2026-11',
      workspaceId: own,
      workspaces: [workspaceRow],
      data,
      totalConvertedEgp: '90,071,992,547,409.93 EGP',
      messages,
    }),
  );
}

function queryResult(data: unknown, error: unknown = null) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'order', 'in', 'eq'])
    query[method] = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve);
  return query;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({
    userId: own,
    role: 'platform_owner',
    activeWorkspaceIds: [],
  });
  mocks.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
  mocks.from.mockImplementation((table: string) =>
    queryResult(table === 'workspaces' ? [workspaceRow] : [packageRow]),
  );
  mocks.session.mockResolvedValue({ from: mocks.from });
  mocks.collections.mockResolvedValue({
    status: 'ok',
    collections: [],
    pending_event_ids: [],
    converted_egp_minor: '0',
  });
  mocks.commissions.mockResolvedValue({ status: 'ok', commissions: [] });
  mocks.installments.mockResolvedValue({ status: 'ok', installments: [] });
  mocks.platformReport.mockResolvedValue({
    status: 'ok',
    period: '2026-11',
    breakdown: 'month',
    totals: {
      revenueConvertedEgpMinor: '0',
      subscriptionCount: 0,
      clientCount: 0,
    },
    workspaceAggregates: [],
    breakdowns: [],
  });
  mocks.drilldownRows.mockResolvedValue({
    status: 'ok',
    workspaceId: own,
    workspaceName: 'Own workspace',
    rows: [],
    totals: {
      revenueConvertedEgpMinor: '0',
      subscriptionCount: 0,
      clientCount: 0,
    },
  });
});

describe('ReportsView', () => {
  it('shows full client names, installment badge, pending rate, and exact large amounts', () => {
    const html = renderView();
    expect(html).toContain('Mona Hassan');
    expect(html).toContain('Installment client');
    expect(html).toContain('Rate pending');
    expect(html).toContain('90,071,992,547,409.93 EGP');
    expect(html).toContain('90,071,992,547,409.93 USD');
    expect(html).toContain('USD');
    expect(html).toContain('0.00');
  });
  it('renders all four approved category label pairs without a package UUID', () => {
    expect(
      packageLabel(
        { id: 'private', market: 'Egypt', type: 'Promotional' },
        'en',
      ),
    ).toBe('Egypt · Promotional');
    expect(
      packageLabel(
        { id: 'private', market: 'International', type: 'Year-Round' },
        'ar',
      ),
    ).toBe('دولي · طول السنـة');
    expect(
      packageLabel(
        { id: 'private', market: 'Egypt', type: 'Year-Round' },
        'ar',
      ),
    ).toBe('مصر · طول السنـة');
    expect(
      packageLabel(
        { id: 'private', market: 'International', type: 'Year-round' },
        'en',
      ),
    ).toBe('International · Year-Round');
    expect(
      packageLabel(
        { id: 'private', market: 'International', type: 'Promotional' },
        'en',
      ),
    ).toBe('International · Promotional');
    expect(renderView()).not.toContain('package-private-id');
  });
  it('renders empty and independent load-error states', () => {
    const empty: ReportsData = {
      collections: {
        status: 'ok',
        rows: [],
        totalConvertedEgpMinor: '0',
        pendingEventIds: [],
      },
      commissions: { status: 'error' },
      installments: { status: 'ok', rows: [] },
    };
    const html = renderView(empty);
    expect(html).toContain('No collections in this period.');
    expect(html).toContain('No installments due.');
    expect(html).toContain('Unable to load commissions. Please try again.');
  });
});

describe('ReportsPage authorization wall', () => {
  it.each(['sales', 'trainer', null])(
    'denies %s before workspace and reporting reads',
    async (role) => {
      mocks.actor.mockResolvedValue({
        userId: own,
        role,
        activeWorkspaceIds: [own],
      });
      const html = renderToStaticMarkup(
        await Page({ searchParams: Promise.resolve({}) }),
      );
      expect(html).toContain('You cannot view reports.');
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.collections).not.toHaveBeenCalled();
      expect(mocks.commissions).not.toHaveBeenCalled();
      expect(mocks.installments).not.toHaveBeenCalled();
    },
  );
  it('denies a foreign-workspace owner target before any workspace or report read', async () => {
    mocks.actor.mockResolvedValue({
      userId: own,
      role: 'workspace_owner',
      activeWorkspaceIds: [own],
    });
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ workspace: foreign }) }),
    );
    expect(html).toContain('You cannot view reports.');
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.collections).not.toHaveBeenCalled();
    expect(html).not.toContain('Mona Hassan');
  });
  it.each(['platform_owner', 'workspace_owner'])(
    'loads reports for %s',
    async (role) => {
      mocks.actor.mockResolvedValue({
        userId: own,
        role,
        activeWorkspaceIds: role === 'workspace_owner' ? [own] : [],
      });
      const html = renderToStaticMarkup(
        await Page({
          searchParams: Promise.resolve({ workspace: own, month: '2026-11' }),
        }),
      );
      expect(html).toContain('Collections');
      expect(mocks.collections).toHaveBeenCalledWith(own, '2026-11-01');
      expect(mocks.installments).toHaveBeenCalledWith(own);
    },
  );
  it('shows empty authorized workspace state without report RPCs', async () => {
    mocks.from.mockImplementation(() => queryResult([]));
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain('No workspaces available.');
    expect(mocks.collections).not.toHaveBeenCalled();
  });
});
