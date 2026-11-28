import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  getPlatformAggregateReport,
  getWorkspaceDrilldownRows,
  type BackendAggregateResponse,
  type BackendSourceRowsResponse,
} from '../../lib/packages/reporting';
import {
  ReportsView,
  kindLabel,
  type DrilldownData,
  type PlatformData,
  type ReportsData,
} from '../../app/(app)/reports/ReportsView';
import { getMessages } from '../../lib/i18n';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  push: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ getActor: mocks.actor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.session,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

const wsId = '00000000-0000-0000-0000-000000000001';
const pkgId = '00000000-0000-0000-0000-000000000002';

const workspacesData = [{ id: wsId, name: 'Alpha Fitness' }];
const packagesData = [{ id: pkgId, market: 'Egypt', type: 'Promotional' }];

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

function queryBuilder(table: string) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'eq', 'single']) {
    q[m] = vi.fn(() => q);
  }
  q.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({
      data:
        table === 'workspaces'
          ? workspacesData
          : table === 'packages'
            ? packagesData
            : [],
      error: null,
    }).then(resolve);
  return q;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({
    userId: '00000000-0000-0000-0000-000000000099',
    role: 'platform_owner',
    deleted: false,
    activeWorkspaceIds: [wsId],
  });
  mocks.from.mockImplementation((table: string) => queryBuilder(table));
  mocks.session.mockResolvedValue({
    rpc: mocks.rpc,
    from: mocks.from,
  });
});

afterEach(() => {
  vi.resetAllMocks();
});

const sampleBackendAggregate: BackendAggregateResponse = {
  status: 'ok',
  workspace_id: null,
  month: '2026-11',
  counts: {
    distinct_clients: 45,
    distinct_subscriptions: 50,
  },
  workspace_counts: [
    {
      workspace_id: wsId,
      distinct_clients: 45,
      distinct_subscriptions: 50,
    },
  ],
  month_counts: [
    {
      month: '2026-11',
      distinct_clients: 45,
      distinct_subscriptions: 50,
    },
  ],
  package_counts: [
    {
      package_id: pkgId,
      distinct_clients: 45,
      distinct_subscriptions: 50,
    },
  ],
  currency_totals: [
    {
      currency: 'USD',
      collection_minor: '50000',
      reversal_minor: '-5000',
      refund_minor: '10000',
      commission_minor: '2000',
      converted_egp_exact: '2000000',
      converted_commission_egp_exact: '100000',
      converted_egp_minor: '2000000',
      converted_commission_egp_minor: '100000',
      pending_fx_count: 0,
    },
  ],
  workspaces: [
    {
      workspace_id: wsId,
      currency: 'USD',
      collection_minor: '50000',
      reversal_minor: '-5000',
      refund_minor: '10000',
      commission_minor: '2000',
      converted_egp_exact: '2000000',
      converted_commission_egp_exact: '100000',
      converted_egp_minor: '2000000',
      converted_commission_egp_minor: '100000',
      pending_fx_count: 0,
    },
  ],
  months: [
    {
      month: '2026-11',
      currency: 'USD',
      collection_minor: '50000',
      reversal_minor: '-5000',
      refund_minor: '10000',
      commission_minor: '2000',
      converted_egp_exact: '2000000',
      converted_commission_egp_exact: '100000',
      converted_egp_minor: '2000000',
      converted_commission_egp_minor: '100000',
      pending_fx_count: 0,
    },
  ],
  packages: [
    {
      package_id: pkgId,
      currency: 'USD',
      collection_minor: '50000',
      reversal_minor: '-5000',
      refund_minor: '10000',
      commission_minor: '2000',
      converted_egp_exact: '2000000',
      converted_commission_egp_exact: '100000',
      converted_egp_minor: '2000000',
      converted_commission_egp_minor: '100000',
      pending_fx_count: 0,
    },
  ],
};

const sampleBackendSourceRows: BackendSourceRowsResponse = {
  status: 'ok',
  workspace_id: wsId,
  rows: [
    {
      event_id: '11111111-0000-0000-0000-000000000001',
      workspace_id: wsId,
      subscription_id: 'sub-1',
      client_id: 'client-1',
      client_name: 'Ahmed Mostafa',
      package_id: pkgId,
      kind: 'collection',
      amount_minor: '10000',
      commission_minor: '1000',
      currency: 'EGP',
      recorded_at: '2026-11-10T12:00:00Z',
      fx: { status: 'ready', rate: '1' },
      converted_egp_exact: '10000',
      converted_commission_egp_exact: '1000',
    },
    {
      event_id: '11111111-0000-0000-0000-000000000002',
      workspace_id: wsId,
      subscription_id: 'sub-1',
      client_id: 'client-1',
      client_name: 'Ahmed Mostafa',
      package_id: pkgId,
      kind: 'correction_reversal',
      amount_minor: '-5000',
      commission_minor: '-500',
      currency: 'EGP',
      recorded_at: '2026-11-11T12:00:00Z',
      fx: { status: 'ready', rate: '1' },
      converted_egp_exact: '-5000',
      converted_commission_egp_exact: '-500',
    },
    {
      event_id: '11111111-0000-0000-0000-000000000003',
      workspace_id: wsId,
      subscription_id: 'sub-2',
      client_id: 'client-2',
      client_name: 'Sara Ali',
      package_id: pkgId,
      kind: 'refund',
      amount_minor: '3000',
      commission_minor: '300',
      currency: 'EGP',
      recorded_at: '2026-11-12T12:00:00Z',
      fx: { status: 'ready', rate: '1' },
      converted_egp_exact: '-3000',
      converted_commission_egp_exact: '-300',
    },
    {
      event_id: '11111111-0000-0000-0000-000000000004',
      workspace_id: wsId,
      subscription_id: null,
      client_id: 'client-3',
      client_name: 'Mona Hassan',
      package_id: pkgId,
      kind: 'client_count',
      amount_minor: null,
      commission_minor: null,
      currency: null,
      recorded_at: '2026-11-13T12:00:00Z',
      fx: { status: 'ready' },
      converted_egp_exact: null,
      converted_commission_egp_exact: null,
    },
    {
      event_id: '11111111-0000-0000-0000-000000000005',
      workspace_id: wsId,
      subscription_id: 'sub-4',
      client_id: 'client-4',
      client_name: 'Karim Adel',
      package_id: pkgId,
      kind: 'subscription_count',
      amount_minor: null,
      commission_minor: null,
      currency: null,
      recorded_at: '2026-11-14T12:00:00Z',
      fx: { status: 'ready' },
      converted_egp_exact: null,
      converted_commission_egp_exact: null,
    },
  ],
  has_more: false,
  next_cursor: null,
};

describe('B1 & B2 RPC fixes: po_reporting_aggregate & po_reporting_source_rows', () => {
  describe('B1: po_reporting_aggregate wiring and mapping', () => {
    it('calls po_reporting_aggregate with exact named parameters and maps snake_case payload', async () => {
      mocks.rpc.mockResolvedValueOnce({
        data: sampleBackendAggregate,
        error: null,
      });

      const res = await getPlatformAggregateReport({
        monthStart: '2026-11-01',
        breakdown: 'month',
        workspaceId: wsId,
      });

      expect(mocks.rpc).toHaveBeenCalledWith('po_reporting_aggregate', {
        p_workspace_id: wsId,
        p_month_start: '2026-11-01',
        p_package_id: null,
      });

      expect(res.status).toBe('ok');
      if (res.status === 'ok') {
        expect(res.totals.revenueConvertedEgpMinor).toBe('2000000');
        expect(res.totals.subscriptionCount).toBe(50);
        expect(res.totals.clientCount).toBe(45);
        expect(res.workspaceAggregates).toHaveLength(1);
        expect(res.workspaceAggregates[0]).toEqual({
          workspaceId: wsId,
          workspaceName: 'Alpha Fitness',
          revenueConvertedEgpMinor: '2000000',
          subscriptionCount: 50,
          clientCount: 45,
          pendingFxCount: 0,
        });
        expect(res.breakdowns).toHaveLength(1);
        expect(res.breakdowns[0]).toEqual({
          key: '2026-11',
          label: '2026-11',
          revenueConvertedEgpMinor: '2000000',
          subscriptionCount: 50,
          clientCount: 45,
          pendingFxCount: 0,
        });
      }
    });

    it('maps package breakdown with real metrics from po_reporting_aggregate', async () => {
      mocks.rpc.mockResolvedValueOnce({
        data: sampleBackendAggregate,
        error: null,
      });

      const res = await getPlatformAggregateReport({
        monthStart: '2026-11-01',
        breakdown: 'package',
        workspaceId: 'all',
      });

      expect(mocks.rpc).toHaveBeenCalledWith('po_reporting_aggregate', {
        p_workspace_id: null,
        p_month_start: '2026-11-01',
        p_package_id: null,
      });

      expect(res.status).toBe('ok');
      if (res.status === 'ok') {
        expect(res.breakdowns).toHaveLength(1);
        expect(res.breakdowns[0]).toEqual({
          key: pkgId,
          label: 'Egypt · Promotional',
          package: packagesData[0],
          revenueConvertedEgpMinor: '2000000',
          subscriptionCount: 50,
          clientCount: 45,
          pendingFxCount: 0,
        });
      }
    });

    it('rounds workspace partitions independently and sums the parent from its children', async () => {
      const secondWorkspaceId = '00000000-0000-0000-0000-000000000003';
      const fractional = {
        ...sampleBackendAggregate,
        currency_totals: [
          {
            ...sampleBackendAggregate.currency_totals[0]!,
            converted_egp_exact: '101',
            converted_egp_minor: '101',
          },
        ],
        workspaces: [wsId, secondWorkspaceId].map((workspace_id) => ({
          ...sampleBackendAggregate.workspaces[0]!,
          workspace_id,
          converted_egp_exact: '50.5',
          converted_egp_minor: '51',
        })),
      };
      mocks.rpc.mockResolvedValueOnce({ data: fractional, error: null });
      mocks.from.mockImplementation((table: string) => {
        const q = queryBuilder(table);
        if (table === 'workspaces') {
          q.then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve({
              data: [
                ...workspacesData,
                { id: secondWorkspaceId, name: 'Beta Fitness' },
              ],
              error: null,
            }).then(resolve);
        }
        return q;
      });

      const res = await getPlatformAggregateReport({
        monthStart: '2026-11-01',
        breakdown: 'month',
      });

      expect(res.status).toBe('ok');
      if (res.status === 'ok') {
        expect(res.totals.revenueConvertedEgpMinor).toBe('102');
        expect(
          res.workspaceAggregates.reduce(
            (sum, workspace) =>
              sum + BigInt(workspace.revenueConvertedEgpMinor),
            0n,
          ),
        ).toBe(102n);
      }
    });

    it('returns unavailable on missing RPC error without silent legacy fallback', async () => {
      mocks.rpc.mockResolvedValueOnce({
        data: null,
        error: {
          code: '42883',
          message: 'function public.po_reporting_aggregate does not exist',
        },
      });

      const res = await getPlatformAggregateReport({
        monthStart: '2026-11-01',
        breakdown: 'month',
      });

      expect(res).toEqual({ status: 'unavailable' });
      // Crucial: no legacy query fallback executed
      expect(mocks.from).not.toHaveBeenCalled();
    });

    it('returns not_permitted when backend raises 42501', async () => {
      mocks.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'not_permitted' },
      });

      const res = await getPlatformAggregateReport({
        monthStart: '2026-11-01',
        breakdown: 'month',
      });

      expect(res).toEqual({ status: 'not_permitted' });
    });
  });

  describe('B2: po_reporting_source_rows wiring, mapping, and row kinds', () => {
    it('calls po_reporting_source_rows with exact named parameters and maps all 5 row kinds', async () => {
      mocks.rpc
        .mockResolvedValueOnce({
          data: sampleBackendSourceRows,
          error: null,
        })
        .mockResolvedValueOnce({
          data: sampleBackendAggregate,
          error: null,
        });

      const res = await getWorkspaceDrilldownRows({
        workspaceId: wsId,
        monthStart: '2026-11-01',
      });

      expect(mocks.rpc).toHaveBeenCalledWith('po_reporting_source_rows', {
        p_workspace_id: wsId,
        p_month_start: '2026-11-01',
        p_package_id: null,
        p_page_size: 50,
        p_cursor_recorded_at: null,
        p_cursor_event_id: null,
      });

      expect(res.status).toBe('ok');
      if (res.status === 'ok') {
        expect(res.workspaceName).toBe('Alpha Fitness');
        expect(res.rows).toHaveLength(5);
        expect(res.rows.map((r) => r.kind)).toEqual([
          'collection',
          'correction_reversal',
          'refund',
          'client_count',
          'subscription_count',
        ]);

        // Refund row mapping
        const refundRow = res.rows.find((r) => r.kind === 'refund')!;
        expect(refundRow.clientName).toBe('Sara Ali');
        expect(refundRow.amountMinor).toBe('3000');
        expect(refundRow.currency).toBe('EGP');
        expect(refundRow.convertedEgpExact).toBe('-3000');

        // Client count row mapping
        const clientCountRow = res.rows.find((r) => r.kind === 'client_count')!;
        expect(clientCountRow.clientName).toBe('Mona Hassan');
        expect(clientCountRow.amountMinor).toBeNull();
        expect(clientCountRow.currency).toBeNull();

        // Subscription count row mapping
        const subCountRow = res.rows.find(
          (r) => r.kind === 'subscription_count',
        )!;
        expect(subCountRow.clientName).toBe('Karim Adel');
        expect(subCountRow.amountMinor).toBeNull();
        expect(subCountRow.currency).toBeNull();

        // Reconciles with aggregate
        expect(res.totals.revenueConvertedEgpMinor).toBe('2000000');
        expect(res.totals.subscriptionCount).toBe(50);
        expect(res.totals.clientCount).toBe(45);
      }
    });

    it('passes a cursor through and returns server pagination metadata', async () => {
      const cursor = {
        recorded_at: '2026-11-10T12:00:00Z',
        event_id: '11111111-0000-0000-0000-000000000001',
      };
      mocks.rpc
        .mockResolvedValueOnce({
          data: {
            ...sampleBackendSourceRows,
            has_more: true,
            next_cursor: cursor,
          },
          error: null,
        })
        .mockResolvedValueOnce({ data: sampleBackendAggregate, error: null });

      const res = await getWorkspaceDrilldownRows({
        workspaceId: wsId,
        monthStart: '2026-11-01',
        cursor,
      });

      expect(mocks.rpc).toHaveBeenCalledWith('po_reporting_source_rows', {
        p_workspace_id: wsId,
        p_month_start: '2026-11-01',
        p_package_id: null,
        p_page_size: 50,
        p_cursor_recorded_at: cursor.recorded_at,
        p_cursor_event_id: cursor.event_id,
      });
      expect(res.status).toBe('ok');
      if (res.status === 'ok') {
        expect(res.hasMore).toBe(true);
        expect(res.nextCursor).toEqual(cursor);
      }
    });

    it('returns unavailable on missing RPC error without silent legacy fallback', async () => {
      mocks.rpc.mockResolvedValueOnce({
        data: null,
        error: {
          code: '42883',
          message: 'function public.po_reporting_source_rows does not exist',
        },
      });

      const res = await getWorkspaceDrilldownRows({
        workspaceId: wsId,
        monthStart: '2026-11-01',
      });

      expect(res).toEqual({ status: 'unavailable' });
      // Crucial: no legacy collections/commissions queries called
      expect(mocks.from).not.toHaveBeenCalled();
    });

    it('returns not_permitted when backend raises 42501', async () => {
      mocks.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'not_permitted' },
      });

      const res = await getWorkspaceDrilldownRows({
        workspaceId: wsId,
        monthStart: '2026-11-01',
      });

      expect(res).toEqual({ status: 'not_permitted' });
    });
  });

  describe('UI localization & row kinds: no raw tokens rendered', () => {
    const drilldownDataAllKinds: DrilldownData = {
      status: 'ok',
      workspaceId: wsId,
      workspaceName: 'Alpha Fitness',
      totals: {
        revenueConvertedEgpMinor: '2000000',
        subscriptionCount: 50,
        clientCount: 45,
      },
      rows: [
        {
          id: 'row-col',
          recordedAt: '2026-11-10T12:00:00Z',
          package: packagesData[0]!,
          clientName: 'Ahmed Mostafa',
          kind: 'collection',
          status: 'completed',
          amountMinor: '10000',
          currency: 'EGP',
          convertedEgpExact: '10000',
        },
        {
          id: 'row-rev',
          recordedAt: '2026-11-11T12:00:00Z',
          package: packagesData[0]!,
          clientName: 'Ahmed Mostafa',
          kind: 'correction_reversal',
          status: 'completed',
          amountMinor: '-5000',
          currency: 'EGP',
          convertedEgpExact: '-5000',
        },
        {
          id: 'row-ref',
          recordedAt: '2026-11-12T12:00:00Z',
          package: packagesData[0]!,
          clientName: 'Sara Ali',
          kind: 'refund',
          status: 'completed',
          amountMinor: '3000',
          currency: 'EGP',
          convertedEgpExact: '-3000',
        },
        {
          id: 'row-client',
          recordedAt: '2026-11-13T12:00:00Z',
          package: packagesData[0]!,
          clientName: 'Mona Hassan',
          kind: 'client_count',
          status: 'completed',
          amountMinor: null,
          currency: null,
          convertedEgpExact: null,
        },
        {
          id: 'row-sub',
          recordedAt: '2026-11-14T12:00:00Z',
          package: packagesData[0]!,
          clientName: 'Karim Adel',
          kind: 'subscription_count',
          status: 'completed',
          amountMinor: null,
          currency: null,
          convertedEgpExact: null,
        },
      ],
    };

    it('renders each row kind with its approved label in English (no raw tokens)', () => {
      const messages = getMessages('en');
      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: wsId,
          workspaces: workspacesData,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          drilldownData: drilldownDataAllKinds,
        }),
      );

      // Verify approved reused labels appear
      expect(html).toContain(messages['reports.section.collections']); // 'Collections'
      expect(html).toContain(
        messages['workforce.payroll.input.category.correction'],
      ); // 'Correction'
      expect(html).toContain(
        messages['staff.clientDirectory.subscriptionStatus.refunded'],
      ); // 'Refunded'
      expect(html).toContain(messages['reports.metric.clients']); // 'Clients'
      expect(html).toContain(messages['reports.metric.subscriptions']); // 'Subscriptions'

      // Verify NO raw kind tokens are rendered in the HTML
      expect(html).not.toMatch(/<dd>\s*collection\s*<\/dd>/);
      expect(html).not.toMatch(/<dd>\s*correction_reversal\s*<\/dd>/);
      expect(html).not.toMatch(/<dd>\s*refund\s*<\/dd>/);
      expect(html).not.toMatch(/<dd>\s*client_count\s*<\/dd>/);
      expect(html).not.toMatch(/<dd>\s*subscription_count\s*<\/dd>/);
    });

    it('renders each row kind with its approved label in Egyptian Arabic (no raw tokens)', () => {
      const messages = getMessages('ar');
      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'ar',
          month: '2026-11',
          workspaceId: wsId,
          workspaces: workspacesData,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          drilldownData: drilldownDataAllKinds,
        }),
      );

      // Verify approved reused Arabic labels appear
      expect(html).toContain('التحصيلات'); // collection
      expect(html).toContain('تصحيح'); // correction_reversal
      expect(html).toContain('تم رد المبلغ'); // refund
      expect(html).toContain('العملاء'); // client_count
      expect(html).toContain('الاشتراكات'); // subscription_count

      // Verify NO raw kind tokens in Arabic mode
      expect(html).not.toMatch(/<dd>\s*collection\s*<\/dd>/);
      expect(html).not.toMatch(/<dd>\s*correction_reversal\s*<\/dd>/);
      expect(html).not.toMatch(/<dd>\s*refund\s*<\/dd>/);
      expect(html).not.toMatch(/<dd>\s*client_count\s*<\/dd>/);
      expect(html).not.toMatch(/<dd>\s*subscription_count\s*<\/dd>/);
    });

    it('kindLabel function maps each kind to exact approved message string', () => {
      const en = getMessages('en');
      expect(kindLabel('collection', en)).toBe(
        en['reports.section.collections'],
      );
      expect(kindLabel('correction_reversal', en)).toBe(
        en['workforce.payroll.input.category.correction'],
      );
      expect(kindLabel('refund', en)).toBe(
        en['staff.clientDirectory.subscriptionStatus.refunded'],
      );
      expect(kindLabel('client_count', en)).toBe(en['reports.metric.clients']);
      expect(kindLabel('subscription_count', en)).toBe(
        en['reports.metric.subscriptions'],
      );
      expect(kindLabel('unknown', en)).toBe('—');

      const ar = getMessages('ar');
      expect(kindLabel('collection', ar)).toBe('التحصيلات');
      expect(kindLabel('correction_reversal', ar)).toBe('تصحيح');
      expect(kindLabel('refund', ar)).toBe('تم رد المبلغ');
      expect(kindLabel('client_count', ar)).toBe('العملاء');
      expect(kindLabel('subscription_count', ar)).toBe('الاشتراكات');
      expect(kindLabel('unknown', ar)).toBe('—');
    });
  });

  describe('CR-029-06: No silent totals fallback on aggregate error or not_permitted', () => {
    it('returns unavailable when po_reporting_aggregate raises an error, even if source rows succeed (no recomputed total)', async () => {
      mocks.rpc
        .mockResolvedValueOnce({
          data: sampleBackendSourceRows,
          error: null,
        })
        .mockResolvedValueOnce({
          data: null,
          error: { code: '42883', message: 'aggregate error' },
        });

      const res = await getWorkspaceDrilldownRows({
        workspaceId: wsId,
        monthStart: '2026-11-01',
      });

      expect(res).toEqual({ status: 'unavailable' });
      // Crucial: no legacy collections/commissions queries called and no recomputed totals returned
      expect(mocks.from).not.toHaveBeenCalledWith('collections');
      expect(mocks.from).not.toHaveBeenCalledWith('commissions');
    });

    it('returns unavailable when po_reporting_aggregate returns non-ok status for drilldown rows', async () => {
      mocks.rpc
        .mockResolvedValueOnce({
          data: sampleBackendSourceRows,
          error: null,
        })
        .mockResolvedValueOnce({
          data: { status: 'error' },
          error: null,
        });

      const res = await getWorkspaceDrilldownRows({
        workspaceId: wsId,
        monthStart: '2026-11-01',
      });

      expect(res).toEqual({ status: 'unavailable' });
      expect(mocks.from).not.toHaveBeenCalledWith('collections');
      expect(mocks.from).not.toHaveBeenCalledWith('commissions');
    });

    it('returns not_permitted when po_reporting_aggregate raises 42501 for drilldown rows', async () => {
      mocks.rpc
        .mockResolvedValueOnce({
          data: sampleBackendSourceRows,
          error: null,
        })
        .mockResolvedValueOnce({
          data: null,
          error: { code: '42501', message: 'not_permitted' },
        });

      const res = await getWorkspaceDrilldownRows({
        workspaceId: wsId,
        monthStart: '2026-11-01',
      });

      expect(res).toEqual({ status: 'not_permitted' });
    });

    it('returns not_permitted when po_reporting_aggregate returns status not_permitted for drilldown rows', async () => {
      mocks.rpc
        .mockResolvedValueOnce({
          data: sampleBackendSourceRows,
          error: null,
        })
        .mockResolvedValueOnce({
          data: { status: 'not_permitted' },
          error: null,
        });

      const res = await getWorkspaceDrilldownRows({
        workspaceId: wsId,
        monthStart: '2026-11-01',
      });

      expect(res).toEqual({ status: 'not_permitted' });
    });

    it('returns not_permitted when backend aggregate returns status not_permitted for platform read', async () => {
      mocks.rpc.mockResolvedValueOnce({
        data: { status: 'not_permitted' },
        error: null,
      });

      const res = await getPlatformAggregateReport({
        monthStart: '2026-11-01',
        breakdown: 'month',
      });

      expect(res).toEqual({ status: 'not_permitted' });
    });

    it('returns unavailable when backend aggregate returns non-ok status for platform read', async () => {
      mocks.rpc.mockResolvedValueOnce({
        data: { status: 'internal_error' },
        error: null,
      });

      const res = await getPlatformAggregateReport({
        monthStart: '2026-11-01',
        breakdown: 'month',
      });

      expect(res).toEqual({ status: 'unavailable' });
      expect(mocks.from).not.toHaveBeenCalled();
    });
  });

  describe('CR-029-07: Pending exchange rate indicators in UI across totals and breakdowns', () => {
    it('platform totals: USD-only with converted_egp_minor null/0 and pendingFxCount>0 shows pending indicator and NOT 0.00 EGP', () => {
      const messages = getMessages('en');
      const platformData: PlatformData = {
        status: 'ok',
        period: '2026-11',
        breakdown: 'month',
        totals: {
          revenueConvertedEgpMinor: '0',
          subscriptionCount: 10,
          clientCount: 8,
          pendingFxCount: 3,
        },
        workspaceAggregates: [
          {
            workspaceId: wsId,
            workspaceName: 'Alpha Fitness',
            revenueConvertedEgpMinor: '1000000',
            subscriptionCount: 10,
            clientCount: 8,
            pendingFxCount: 0,
          },
        ],
        breakdowns: [
          {
            key: '2026-11',
            label: '2026-11',
            revenueConvertedEgpMinor: '1000000',
            subscriptionCount: 10,
            clientCount: 8,
            pendingFxCount: 0,
          },
        ],
      };

      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: 'all',
          workspaces: workspacesData,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          platformData,
        }),
      );

      const section = html.slice(
        html.indexOf('id="platform-title"'),
        html.indexOf('id="collections-title"'),
      );
      expect(section).toContain(messages['reports.statusPendingRate']);
      expect(section).not.toMatch(/(^|[^\d])0\.00 EGP/);
    });

    it('platform totals: mixed EGP + pending USD shows EGP amount plus the pending indicator', () => {
      const messages = getMessages('en');
      const platformData: PlatformData = {
        status: 'ok',
        period: '2026-11',
        breakdown: 'month',
        totals: {
          revenueConvertedEgpMinor: '5000000', // 50,000.00 EGP
          subscriptionCount: 20,
          clientCount: 18,
          pendingFxCount: 2,
        },
        workspaceAggregates: [
          {
            workspaceId: wsId,
            workspaceName: 'Alpha Fitness',
            revenueConvertedEgpMinor: '5000000',
            subscriptionCount: 20,
            clientCount: 18,
            pendingFxCount: 0,
          },
        ],
        breakdowns: [
          {
            key: '2026-11',
            label: '2026-11',
            revenueConvertedEgpMinor: '5000000',
            subscriptionCount: 20,
            clientCount: 18,
            pendingFxCount: 0,
          },
        ],
      };

      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: 'all',
          workspaces: workspacesData,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          platformData,
        }),
      );

      const section = html.slice(
        html.indexOf('id="platform-title"'),
        html.indexOf('id="collections-title"'),
      );
      expect(section).toContain('50,000.00 EGP');
      expect(section).toContain(messages['reports.statusPendingRate']);
    });

    it('workspace aggregates: USD-only with pendingFxCount>0 shows pending indicator and NOT 0.00 EGP', () => {
      const messages = getMessages('en');
      const platformData: PlatformData = {
        status: 'ok',
        period: '2026-11',
        breakdown: 'month',
        totals: {
          revenueConvertedEgpMinor: '1000000',
          subscriptionCount: 10,
          clientCount: 8,
          pendingFxCount: 0,
        },
        workspaceAggregates: [
          {
            workspaceId: wsId,
            workspaceName: 'Alpha Fitness',
            revenueConvertedEgpMinor: '0',
            subscriptionCount: 10,
            clientCount: 8,
            pendingFxCount: 2,
          },
        ],
        breakdowns: [
          {
            key: '2026-11',
            label: '2026-11',
            revenueConvertedEgpMinor: '1000000',
            subscriptionCount: 10,
            clientCount: 8,
            pendingFxCount: 0,
          },
        ],
      };

      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: 'all',
          workspaces: workspacesData,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          platformData,
        }),
      );

      const section = html.slice(
        html.indexOf('id="platform-title"'),
        html.indexOf('id="collections-title"'),
      );
      expect(section).toContain(messages['reports.statusPendingRate']);
      expect(section).not.toMatch(/(^|[^\d])0\.00 EGP/);
    });

    it('workspace aggregates: mixed EGP + pending USD shows EGP amount plus the pending indicator', () => {
      const messages = getMessages('en');
      const platformData: PlatformData = {
        status: 'ok',
        period: '2026-11',
        breakdown: 'month',
        totals: {
          revenueConvertedEgpMinor: '1200000',
          subscriptionCount: 10,
          clientCount: 8,
          pendingFxCount: 0,
        },
        workspaceAggregates: [
          {
            workspaceId: wsId,
            workspaceName: 'Alpha Fitness',
            revenueConvertedEgpMinor: '1200000', // 12,000.00 EGP
            subscriptionCount: 10,
            clientCount: 8,
            pendingFxCount: 1,
          },
        ],
        breakdowns: [
          {
            key: '2026-11',
            label: '2026-11',
            revenueConvertedEgpMinor: '1200000',
            subscriptionCount: 10,
            clientCount: 8,
            pendingFxCount: 0,
          },
        ],
      };

      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: 'all',
          workspaces: workspacesData,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          platformData,
        }),
      );

      const section = html.slice(
        html.indexOf('id="platform-title"'),
        html.indexOf('id="collections-title"'),
      );
      expect(section).toContain('12,000.00 EGP');
      expect(section).toContain(messages['reports.statusPendingRate']);
    });

    it('month breakdown: covers USD-only (pending indicator, not 0.00 EGP) and mixed EGP + pending USD', () => {
      const messages = getMessages('en');
      const platformData: PlatformData = {
        status: 'ok',
        period: '2026-11',
        breakdown: 'month',
        totals: {
          revenueConvertedEgpMinor: '2500000',
          subscriptionCount: 15,
          clientCount: 12,
          pendingFxCount: 0,
        },
        workspaceAggregates: [
          {
            workspaceId: wsId,
            workspaceName: 'Alpha Fitness',
            revenueConvertedEgpMinor: '2500000',
            subscriptionCount: 15,
            clientCount: 12,
            pendingFxCount: 0,
          },
        ],
        breakdowns: [
          {
            key: '2026-10',
            label: '2026-10',
            revenueConvertedEgpMinor: '0',
            subscriptionCount: 5,
            clientCount: 4,
            pendingFxCount: 1, // USD-only month
          },
          {
            key: '2026-11',
            label: '2026-11',
            revenueConvertedEgpMinor: '2500000', // 25,000.00 EGP
            subscriptionCount: 10,
            clientCount: 8,
            pendingFxCount: 1, // mixed
          },
        ],
      };

      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: 'all',
          workspaces: workspacesData,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          platformData,
          breakdown: 'month',
        }),
      );

      const section = html.slice(
        html.indexOf('id="platform-title"'),
        html.indexOf('id="collections-title"'),
      );
      // Verify mixed month has both amount and pending
      expect(section).toContain('25,000.00 EGP');
      expect(section).toContain(messages['reports.statusPendingRate']);
      // Verify USD-only month does NOT show "0.00 EGP"
      expect(section).not.toMatch(/(^|[^\d])0\.00 EGP/);
    });

    it('package breakdown: covers USD-only (pending indicator, not 0.00 EGP) and mixed EGP + pending USD', () => {
      const messages = getMessages('en');
      const pkgId2 = '00000000-0000-0000-0000-000000000003';
      const platformData: PlatformData = {
        status: 'ok',
        period: '2026-11',
        breakdown: 'package',
        totals: {
          revenueConvertedEgpMinor: '3500000',
          subscriptionCount: 20,
          clientCount: 15,
          pendingFxCount: 0,
        },
        workspaceAggregates: [
          {
            workspaceId: wsId,
            workspaceName: 'Alpha Fitness',
            revenueConvertedEgpMinor: '3500000',
            subscriptionCount: 20,
            clientCount: 15,
            pendingFxCount: 0,
          },
        ],
        breakdowns: [
          {
            key: pkgId,
            label: 'Egypt · Promotional',
            package: packagesData[0],
            revenueConvertedEgpMinor: '0',
            subscriptionCount: 8,
            clientCount: 6,
            pendingFxCount: 2, // USD-only package
          },
          {
            key: pkgId2,
            label: 'International · Standard',
            package: { id: pkgId2, market: 'International', type: 'Standard' },
            revenueConvertedEgpMinor: '3500000', // 35,000.00 EGP
            subscriptionCount: 12,
            clientCount: 9,
            pendingFxCount: 1, // mixed
          },
        ],
      };

      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: 'all',
          workspaces: workspacesData,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          platformData,
          breakdown: 'package',
        }),
      );

      const section = html.slice(
        html.indexOf('id="platform-title"'),
        html.indexOf('id="collections-title"'),
      );

      // Verify mixed package has both amount and pending
      expect(section).toContain('35,000.00 EGP');
      expect(section).toContain(messages['reports.statusPendingRate']);
      // Verify USD-only package does NOT show "0.00 EGP"
      expect(section).not.toMatch(/(^|[^\d])0\.00 EGP/);
    });

    it('workspace drilldown totals: covers USD-only and mixed EGP + pending USD', () => {
      const messages = getMessages('en');
      const sampleRow = {
        id: 'row-1',
        recordedAt: '2026-11-10T12:00:00Z',
        package: packagesData[0]!,
        clientName: 'Ahmed Mostafa',
        kind: 'collection' as const,
        status: 'completed',
        amountMinor: '1000',
        currency: 'USD',
        convertedEgpExact: null,
      };

      // 1) USD-only drilldown total
      const usdOnlyDrilldown: DrilldownData = {
        status: 'ok',
        workspaceId: wsId,
        workspaceName: 'Alpha Fitness',
        totals: {
          revenueConvertedEgpMinor: '0',
          subscriptionCount: 5,
          clientCount: 4,
          pendingFxCount: 2,
        },
        rows: [sampleRow],
      };

      const htmlUsdOnly = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: wsId,
          workspaces: workspacesData,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          drilldownData: usdOnlyDrilldown,
        }),
      );

      const sectionUsdOnly = htmlUsdOnly.slice(
        0,
        htmlUsdOnly.indexOf('id="collections-title"'),
      );
      expect(sectionUsdOnly).toContain(messages['reports.statusPendingRate']);
      expect(sectionUsdOnly).not.toMatch(/(^|[^\d])0\.00 EGP/);

      // 2) Mixed drilldown total
      const mixedDrilldown: DrilldownData = {
        status: 'ok',
        workspaceId: wsId,
        workspaceName: 'Alpha Fitness',
        totals: {
          revenueConvertedEgpMinor: '10000000', // 100,000.00 EGP
          subscriptionCount: 10,
          clientCount: 8,
          pendingFxCount: 1,
        },
        rows: [sampleRow],
      };

      const htmlMixed = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'en',
          month: '2026-11',
          workspaceId: wsId,
          workspaces: workspacesData,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          drilldownData: mixedDrilldown,
        }),
      );

      const sectionMixed = htmlMixed.slice(
        0,
        htmlMixed.indexOf('id="collections-title"'),
      );
      expect(sectionMixed).toContain('100,000.00 EGP');
      expect(sectionMixed).toContain(messages['reports.statusPendingRate']);
    });

    it('Egyptian Arabic (ar): renders Arabic pending message and Arabic numerals without ٠٫٠٠ EGP on USD-only', () => {
      const messages = getMessages('ar');
      const platformData: PlatformData = {
        status: 'ok',
        period: '2026-11',
        breakdown: 'month',
        totals: {
          revenueConvertedEgpMinor: '0',
          subscriptionCount: 5,
          clientCount: 4,
          pendingFxCount: 1,
        },
        workspaceAggregates: [
          {
            workspaceId: wsId,
            workspaceName: 'Alpha Fitness',
            revenueConvertedEgpMinor: '1500000', // 15,000.00 EGP
            subscriptionCount: 5,
            clientCount: 4,
            pendingFxCount: 1,
          },
        ],
        breakdowns: [
          {
            key: '2026-11',
            label: '2026-11',
            revenueConvertedEgpMinor: '1500000',
            subscriptionCount: 5,
            clientCount: 4,
            pendingFxCount: 1,
          },
        ],
      };

      const html = renderToStaticMarkup(
        createElement(ReportsView, {
          locale: 'ar',
          month: '2026-11',
          workspaceId: 'all',
          workspaces: workspacesData,
          data: emptyReportsData,
          totalConvertedEgp: null,
          messages,
          role: 'platform_owner',
          platformData,
        }),
      );

      const section = html.slice(
        html.indexOf('id="platform-title"'),
        html.indexOf('id="collections-title"'),
      );
      expect(section).toContain(messages['reports.statusPendingRate']);
      expect(section).not.toMatch(/(^|[^\u0660-\u0669])٠٫٠٠ EGP/);
      expect(section).toContain('١٥٬٠٠٠٫٠٠ EGP');
    });
  });
});
