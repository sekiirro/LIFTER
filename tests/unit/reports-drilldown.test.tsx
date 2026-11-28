import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from '../../app/(app)/reports/page';
import {
  ReportsView,
  type DrilldownData,
  type PlatformData,
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

const wsId1 = '00000000-0000-0000-0000-000000000001';
const wsId2 = '00000000-0000-0000-0000-000000000002';

const packageRow = {
  id: 'package-test-id',
  market: 'Egypt',
  type: 'Promotional',
};

const workspaces = [
  { id: wsId1, name: 'Main Gym' },
  { id: wsId2, name: 'Branch East' },
];

const emptyReportsData: ReportsData = {
  collections: {
    status: 'ok',
    rows: [],
    totalConvertedEgpMinor: '0',
    pendingEventIds: [],
  },
  commissions: { status: 'ok', rows: [] },
  installments: { status: 'ok', rows: [] },
};

const samplePlatformData: PlatformData = {
  status: 'ok',
  period: '2026-11',
  breakdown: 'month',
  totals: {
    revenueConvertedEgpMinor: '15000000', // 150,000.00 EGP
    subscriptionCount: 42,
    clientCount: 38,
  },
  workspaceAggregates: [
    {
      workspaceId: wsId1,
      workspaceName: 'Main Gym',
      revenueConvertedEgpMinor: '10000000',
      subscriptionCount: 28,
      clientCount: 25,
    },
    {
      workspaceId: wsId2,
      workspaceName: 'Branch East',
      revenueConvertedEgpMinor: '5000000',
      subscriptionCount: 14,
      clientCount: 13,
    },
  ],
  breakdowns: [
    {
      key: '2026-11',
      label: '2026-11',
      revenueConvertedEgpMinor: '15000000',
      subscriptionCount: 42,
      clientCount: 38,
    },
  ],
};

const sampleDrilldownData: DrilldownData = {
  status: 'ok',
  workspaceId: wsId1,
  workspaceName: 'Main Gym',
  totals: {
    revenueConvertedEgpMinor: '10000000',
    subscriptionCount: 2,
    clientCount: 1,
  },
  rows: [
    {
      id: 'row-1',
      recordedAt: '2026-11-15T10:00:00.000Z',
      package: packageRow,
      clientName: 'Tarek Zaki',
      kind: 'collection',
      status: 'completed',
      amountMinor: '10000000',
      currency: 'EGP',
      convertedEgpExact: '10000000',
      commissionMinor: '1000000',
      dueOn: null,
      paidMinor: '10000000',
      remainingMinor: '0',
    },
  ],
};

function renderSourceRow(status: string, locale: 'ar' | 'en') {
  const messages = getMessages(locale);
  const html = renderToStaticMarkup(
    createElement(ReportsView, {
      locale,
      month: '2026-11',
      workspaceId: wsId1,
      workspaces,
      data: emptyReportsData,
      totalConvertedEgp: null,
      messages,
      role: 'platform_owner',
      drilldownData: {
        ...sampleDrilldownData,
        rows: [{ ...sampleDrilldownData.rows[0]!, status }],
      },
    }),
  );
  return { html, messages };
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
    userId: wsId1,
    role: 'platform_owner',
    activeWorkspaceIds: [],
  });
  mocks.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
  mocks.from.mockImplementation((table: string) =>
    queryResult(table === 'workspaces' ? workspaces : [packageRow]),
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
  mocks.platformReport.mockResolvedValue(samplePlatformData);
  mocks.drilldownRows.mockResolvedValue(sampleDrilldownData);
});

describe('Spec 029: Platform Owner Reporting Drill-Down UI', () => {
  describe('Screen 1 — Platform aggregate reports & breakdowns', () => {
    it('renders platform aggregate title, metrics, and breakdown controls for PO', () => {
      const messages = getMessages('en');
      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: 'all',
          workspaces,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          breakdown: 'month',
          platformData: samplePlatformData,
        }),
      );

      // Surface headers
      expect(html).toContain(messages['reports.title']);
      expect(html).toContain(messages['reports.platform.title']);

      // Metric cards
      expect(html).toContain(messages['reports.metric.revenue']);
      expect(html).toContain(messages['reports.metric.subscriptions']);
      expect(html).toContain(messages['reports.metric.clients']);
      expect(html).toContain('42'); // Subscription count
      expect(html).toContain('38'); // Client count

      // Breakdown selector
      expect(html).toContain(messages['reports.breakdown.label']);
      expect(html).toContain(messages['reports.breakdown.byMonth']);
      expect(html).toContain(messages['reports.breakdown.byPackage']);

      // Workspace selector with All option
      expect(html).toContain(messages['catalog.all']);
      expect(html).toContain('Main Gym');
      expect(html).toContain('Branch East');

      // Drill-down action per workspace
      expect(html).toContain(messages['reports.drilldown.action']);
    });

    it('renders package breakdown when breakdown=package', () => {
      const messages = getMessages('en');
      const packagePlatformData: PlatformData = {
        ...samplePlatformData,
        breakdown: 'package',
        breakdowns: [
          {
            key: 'package-test-id',
            label: 'Egypt · Promotional',
            package: packageRow,
            revenueConvertedEgpMinor: '15000000',
            subscriptionCount: 42,
            clientCount: 38,
          },
        ],
      };

      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: 'all',
          workspaces,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          breakdown: 'package',
          platformData: packagePlatformData,
        }),
      );

      expect(html).toContain('Egypt · Promotional');
      expect(html).toContain(messages['reports.breakdown.byPackage']);
    });

    it('renders empty state when no report data exists', () => {
      const messages = getMessages('en');
      const emptyPlatformData: PlatformData = {
        ...samplePlatformData,
        status: 'empty',
        workspaceAggregates: [],
        breakdowns: [],
      };

      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: 'all',
          workspaces,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          breakdown: 'month',
          platformData: emptyPlatformData,
        }),
      );

      expect(html).toContain(messages['reports.drilldown.empty']);
    });

    it('renders error state with retry button on platform aggregate failure', () => {
      const messages = getMessages('en');
      const errorPlatformData: PlatformData = {
        ...samplePlatformData,
        status: 'error',
      };

      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: 'all',
          workspaces,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          breakdown: 'month',
          platformData: errorPlatformData,
        }),
      );

      expect(html).toContain(messages['reports.drilldown.error']);
      expect(html).toContain(messages['states.retry']);
    });

    it('renders Egyptian Arabic copy correctly in AR locale', () => {
      const messages = getMessages('ar');
      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'ar',
          month: '2026-11',
          workspaceId: 'all',
          workspaces,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          breakdown: 'month',
          platformData: samplePlatformData,
        }),
      );

      expect(html).toContain('تقارير المنصة'); // reports.platform.title
      expect(html).toContain('التقسيم'); // reports.breakdown.label
      expect(html).toContain('بالشهر'); // reports.breakdown.byMonth
      expect(html).toContain('الإيرادات'); // reports.metric.revenue
      expect(html).toContain('الاشتراكات'); // reports.metric.subscriptions
      expect(html).toContain('العملاء'); // reports.metric.clients
      expect(html).toContain('عرض التفاصيل'); // reports.drilldown.action
    });
  });

  describe('Screen 2 — Workspace drill-down source rows', () => {
    it('renders workspace details heading, back button, and source row columns', () => {
      const messages = getMessages('en');
      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: wsId1,
          workspaces,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          drilldownData: sampleDrilldownData,
        }),
      );

      // Heading and back button
      expect(html).toContain(messages['reports.drilldown.workspaceHeading']);
      expect(html).toContain('Main Gym');
      expect(html).toContain(messages['button.secondary']);

      // Client name and package
      expect(html).toContain('Tarek Zaki');
      expect(html).toContain('Egypt · Promotional');

      // Column labels
      expect(html).toContain(messages['reports.column.kind']);
      expect(html).toContain(messages['reports.column.status']);
      expect(html).toContain(messages['reports.column.date']);
      expect(html).toContain(messages['reports.column.amount']);
      expect(html).toContain(messages['reports.column.commission']);
      expect(html).toContain(messages['reports.column.paid']);
      expect(html).toContain(messages['reports.column.remaining']);
      expect(html).toContain(messages['reports.export.title']);
    });

    it.each([
      ['en', 'Completed'],
      ['ar', 'تم'],
    ] as const)(
      'renders the approved %s completed label without the raw status',
      (locale, label) => {
        const { html, messages } = renderSourceRow('completed', locale);

        expect(html).toContain(
          `<dt>${messages['reports.column.status']}</dt><dd>${label}</dd>`,
        );
        expect(html).not.toContain('completed');
      },
    );

    it.each(['en', 'ar'] as const)(
      'renders nothing for an unknown source-row status in %s',
      (locale) => {
        const status = 'unexpected_internal_status';
        const { html, messages } = renderSourceRow(status, locale);

        expect(html).toContain(
          `<dt>${messages['reports.column.status']}</dt><dd></dd>`,
        );
        expect(html).not.toContain(status);
      },
    );

    it('renders empty state when workspace has no source rows', () => {
      const messages = getMessages('en');
      const emptyDrilldown: DrilldownData = {
        ...sampleDrilldownData,
        status: 'empty',
        rows: [],
      };

      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: wsId1,
          workspaces,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          drilldownData: emptyDrilldown,
        }),
      );

      expect(html).toContain(messages['reports.drilldown.sourceRows.empty']);
    });

    it('renders error state when source rows fail to load', () => {
      const messages = getMessages('en');
      const errorDrilldown: DrilldownData = {
        ...sampleDrilldownData,
        status: 'error',
        rows: [],
      };

      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: wsId1,
          workspaces,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          drilldownData: errorDrilldown,
        }),
      );

      expect(html).toContain(messages['states.error.title']);
      expect(html).toContain(messages['states.error.description']);
      expect(html).toContain(messages['states.retry']);
    });

    it('renders Arabic strings on Screen 2 in AR locale', () => {
      const messages = getMessages('ar');
      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'ar',
          month: '2026-11',
          workspaceId: wsId1,
          workspaces,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          drilldownData: sampleDrilldownData,
        }),
      );

      expect(html).toContain('تفاصيل مساحة العمل'); // reports.drilldown.workspaceHeading
      expect(html).toContain('رجوع'); // button.secondary
      expect(html).toContain('النوع'); // reports.column.kind
      expect(html).toContain('الحالة'); // reports.column.status
      expect(html).toContain('التاريخ'); // reports.column.date
    });
  });

  describe('Server-side Role Gate & Gating Enforcement', () => {
    it('hides platform aggregate and drill-down controls for workspace_owner', () => {
      const messages = getMessages('en');
      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: wsId1,
          workspaces: [workspaces[0]!],
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'workspace_owner',
        }),
      );

      // WO must NOT see platform reports title or breakdown selector
      expect(html).not.toContain(messages['reports.platform.title']);
      expect(html).not.toContain(messages['reports.breakdown.label']);
      expect(html).not.toContain(messages['catalog.all']);
      // WO sees workspace-scoped collections
      expect(html).toContain(messages['reports.section.collections']);
    });

    it('denies workspace_owner when requesting all workspaces on page route', async () => {
      mocks.actor.mockResolvedValue({
        userId: wsId1,
        role: 'workspace_owner',
        activeWorkspaceIds: [wsId1],
      });

      const response = await Page({
        searchParams: Promise.resolve({ workspace: 'all' }),
      });
      const html = renderToStaticMarkup(response);
      const messages = getMessages('en');
      expect(html).toContain(messages['reports.denied']);
    });

    it('denies workspace_owner when attempting to drill down into foreign workspace', async () => {
      mocks.actor.mockResolvedValue({
        userId: wsId1,
        role: 'workspace_owner',
        activeWorkspaceIds: [wsId1],
      });

      const response = await Page({
        searchParams: Promise.resolve({ drilldown: wsId2 }),
      });
      const html = renderToStaticMarkup(response);
      const messages = getMessages('en');
      expect(html).toContain(messages['reports.denied']);
    });

    it('denies non-staff roles without disclosure', async () => {
      for (const role of ['trainer', 'sales', 'client']) {
        mocks.actor.mockResolvedValue({
          userId: wsId1,
          role,
          activeWorkspaceIds: [wsId1],
        });

        const response = await Page({
          searchParams: Promise.resolve({}),
        });
        const html = renderToStaticMarkup(response);
        const messages = getMessages('en');
        expect(html).toContain(messages['reports.denied']);
      }
    });
  });
});
