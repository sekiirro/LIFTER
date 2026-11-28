import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  ReportsView,
  type DrilldownData,
  type DrilldownSourceRow,
  type ReportsData,
} from '../../app/(app)/reports/ReportsView';
import Page from '../../app/(app)/reports/page';
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

const wsId = '00000000-0000-0000-0000-000000000001';
const workspaces = [{ id: wsId, name: 'Main Gym' }];

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

function sampleRow(id: string): DrilldownSourceRow {
  return {
    id,
    recordedAt: '2026-11-20T10:00:00Z',
    package: null,
    clientName: 'Client ' + id,
    kind: 'collection',
    status: 'completed',
    amountMinor: '10000',
    currency: 'EGP',
    convertedEgpExact: '100.00',
    commissionMinor: null,
  };
}

function renderDrilldownView(
  drilldownOverrides: Partial<DrilldownData> = {},
  locale: 'en' | 'ar' = 'en',
) {
  const messages = getMessages(locale);
  const drilldownData: DrilldownData = {
    status: 'ok',
    workspaceId: wsId,
    workspaceName: 'Main Gym',
    rows: [sampleRow('row-1'), sampleRow('row-2')],
    totals: {
      revenueConvertedEgpMinor: '20000',
      subscriptionCount: 2,
      clientCount: 2,
    },
    hasMore: false,
    nextCursor: null,
    ...drilldownOverrides,
  };

  const html = renderToStaticMarkup(
    createElement(ReportsView, {
      locale,
      month: '2026-11',
      workspaceId: wsId,
      workspaces,
      data: emptyReportsData,
      totalConvertedEgp: null,
      role: 'platform_owner',
      messages,
      drilldownData,
    }),
  );
  return new JSDOM(html).window.document;
}

describe('CR-029-04 reports workspace drill-down pager UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Copy byte-exactness (S74-R55)', () => {
    it('verifies i18n messages match S74-R55 ruling line byte-for-byte', () => {
      const docPath = join(
        __dirname,
        '../../specs/029-po-reporting-drilldown/copy-approved-pager-s74-po-4.md',
      );
      const docText = readFileSync(docPath, 'utf-8');
      expect(docText).toContain('S74-PO-4');
      expect(docText).toContain('S74-R55');

      const rulingsPath = 'C:/Users/NEW LAP/.lifter/runs/s74-rulings.md';
      if (existsSync(rulingsPath)) {
        const text = readFileSync(rulingsPath, 'utf-8');
        const rulingLine = text
          .split('\n')
          .find((l) => l.startsWith('- S74-R55'));
        expect(rulingLine).toBeDefined();

        const match = rulingLine!.match(
          /previous "([^"]+)" \/ "([^"]+)", next "([^"]+)" \/ "([^"]+)", nav landmark "([^"]+)" \/ "([^"]+)"/,
        );
        expect(match).not.toBeNull();
        const [, prevEn, prevAr, nextEn, nextAr, landEn, landAr] = match!;

        const enMsg = getMessages('en') as Record<string, string>;
        const arMsg = getMessages('ar') as Record<string, string>;

        expect(enMsg['reports.drilldown.previousPage']).toBe(prevEn);
        expect(arMsg['reports.drilldown.previousPage']).toBe(prevAr);
        expect(enMsg['reports.drilldown.nextPage']).toBe(nextEn);
        expect(arMsg['reports.drilldown.nextPage']).toBe(nextAr);
        expect(enMsg['reports.drilldown.paginationLabel']).toBe(landEn);
        expect(arMsg['reports.drilldown.paginationLabel']).toBe(landAr);
      }

      const en = getMessages('en') as Record<string, string>;
      const ar = getMessages('ar') as Record<string, string>;

      expect(en['reports.drilldown.previousPage']).toBe('Previous page');
      expect(ar['reports.drilldown.previousPage']).toBe('الصفحة السابقة');

      expect(en['reports.drilldown.nextPage']).toBe('Next page');
      expect(ar['reports.drilldown.nextPage']).toBe('الصفحة التالية');

      expect(en['reports.drilldown.paginationLabel']).toBe(
        'Reports pagination',
      );
      expect(ar['reports.drilldown.paginationLabel']).toBe('صفحات التقارير');
    });
  });

  describe('Nav landmark and accessible controls', () => {
    it('renders a nav landmark with approved pagination label in EN and AR', () => {
      const docEn = renderDrilldownView({ hasMore: true }, 'en');
      const navEn = docEn.querySelector('nav');
      expect(navEn).not.toBeNull();
      expect(navEn?.getAttribute('aria-label')).toBe('Reports pagination');

      const docAr = renderDrilldownView({ hasMore: true }, 'ar');
      const navAr = docAr.querySelector('nav');
      expect(navAr).not.toBeNull();
      expect(navAr?.getAttribute('aria-label')).toBe('صفحات التقارير');
    });

    it('renders Previous and Next controls with exact approved copy', () => {
      const docEn = renderDrilldownView({ hasMore: true }, 'en');
      const buttonsEn = docEn.querySelectorAll('nav button');
      expect(buttonsEn.length).toBe(2);
      expect(buttonsEn[0]?.textContent?.trim()).toBe('Previous page');
      expect(buttonsEn[1]?.textContent?.trim()).toBe('Next page');

      const docAr = renderDrilldownView({ hasMore: true }, 'ar');
      const buttonsAr = docAr.querySelectorAll('nav button');
      expect(buttonsAr.length).toBe(2);
      expect(buttonsAr[0]?.textContent?.trim()).toBe('الصفحة السابقة');
      expect(buttonsAr[1]?.textContent?.trim()).toBe('الصفحة التالية');
    });
  });

  describe('Disabled ends on first and last page', () => {
    it('disables Previous on first page and enables Next when hasMore is true', () => {
      const doc = renderDrilldownView({
        hasMore: true,
        nextCursor: { recorded_at: '2026-11-19T10:00:00Z', event_id: 'e-1' },
        cursorHistory: [],
      });
      const buttons = doc.querySelectorAll('nav button');
      expect(buttons[0]?.hasAttribute('disabled')).toBe(true);
      expect(buttons[1]?.hasAttribute('disabled')).toBe(false);
    });

    it('enables Previous and Next on a middle page', () => {
      const doc = renderDrilldownView({
        hasMore: true,
        nextCursor: { recorded_at: '2026-11-18T10:00:00Z', event_id: 'e-2' },
        cursorHistory: [null],
      });
      const buttons = doc.querySelectorAll('nav button');
      expect(buttons[0]?.hasAttribute('disabled')).toBe(false);
      expect(buttons[1]?.hasAttribute('disabled')).toBe(false);
    });

    it('enables Previous and disables Next on last page (hasMore: false)', () => {
      const doc = renderDrilldownView({
        hasMore: false,
        nextCursor: null,
        cursorHistory: [null],
      });
      const buttons = doc.querySelectorAll('nav button');
      expect(buttons[0]?.hasAttribute('disabled')).toBe(false);
      expect(buttons[1]?.hasAttribute('disabled')).toBe(true);
    });

    it('disables both Previous and Next when single page (no history and hasMore: false)', () => {
      const doc = renderDrilldownView({
        hasMore: false,
        nextCursor: null,
        cursorHistory: [],
      });
      const buttons = doc.querySelectorAll('nav button');
      expect(buttons[0]?.hasAttribute('disabled')).toBe(true);
      expect(buttons[1]?.hasAttribute('disabled')).toBe(true);
    });
  });

  describe('Client-side interactive navigation', () => {
    it('pushes next cursor and updates cursor history when Next is clicked', async () => {
      const dom = new JSDOM(
        '<!doctype html><html><body><div id="root"></div></body></html>',
        {
          url: 'http://localhost:3000/reports',
        },
      );
      globalThis.window = dom.window as unknown as Window & typeof globalThis;
      globalThis.document = dom.window.document;
      const { createRoot } = await import('react-dom/client');

      const host = dom.window.document.getElementById('root')!;
      const root = createRoot(host);

      const nextCursor = {
        recorded_at: '2026-11-19T10:00:00Z',
        event_id: 'e-1',
      };
      const messages = getMessages('en');

      await act(async () => {
        root.render(
          createElement(ReportsView, {
            locale: 'en',
            month: '2026-11',
            workspaceId: wsId,
            workspaces,
            data: emptyReportsData,
            totalConvertedEgp: null,
            role: 'platform_owner',
            messages,
            drilldownData: {
              status: 'ok',
              workspaceId: wsId,
              workspaceName: 'Main Gym',
              rows: [sampleRow('r1')],
              totals: {
                revenueConvertedEgpMinor: '10000',
                subscriptionCount: 1,
                clientCount: 1,
              },
              hasMore: true,
              nextCursor,
              currentCursor: null,
              cursorHistory: [],
            },
          }),
        );
      });

      const buttons = host.querySelectorAll('nav button');
      expect(buttons.length).toBe(2);

      // Next button is buttons[1]
      await act(async () => {
        (buttons[1] as HTMLButtonElement).click();
      });

      expect(mocks.push).toHaveBeenCalledTimes(1);
      const url = mocks.push.mock.calls[0]![0];
      expect(url).toContain('drilldown=' + wsId);
      expect(url).toContain('cursor_recorded_at=2026-11-19T10%3A00%3A00Z');
      expect(url).toContain('cursor_event_id=e-1');
      expect(url).toContain('cursor_history=%5Bnull%5D');
    });

    it('pushes previous cursor and removes last history item when Previous is clicked', async () => {
      const dom = new JSDOM(
        '<!doctype html><html><body><div id="root"></div></body></html>',
        {
          url: 'http://localhost:3000/reports',
        },
      );
      globalThis.window = dom.window as unknown as Window & typeof globalThis;
      globalThis.document = dom.window.document;
      const { createRoot } = await import('react-dom/client');

      const host = dom.window.document.getElementById('root')!;
      const root = createRoot(host);

      const messages = getMessages('en');
      const prevCursor = {
        recorded_at: '2026-11-19T10:00:00Z',
        event_id: 'e-1',
      };

      await act(async () => {
        root.render(
          createElement(ReportsView, {
            locale: 'en',
            month: '2026-11',
            workspaceId: wsId,
            workspaces,
            data: emptyReportsData,
            totalConvertedEgp: null,
            role: 'platform_owner',
            messages,
            drilldownData: {
              status: 'ok',
              workspaceId: wsId,
              workspaceName: 'Main Gym',
              rows: [sampleRow('r2')],
              totals: {
                revenueConvertedEgpMinor: '10000',
                subscriptionCount: 1,
                clientCount: 1,
              },
              hasMore: false,
              nextCursor: null,
              currentCursor: {
                recorded_at: '2026-11-18T10:00:00Z',
                event_id: 'e-2',
              },
              cursorHistory: [null, prevCursor],
            },
          }),
        );
      });

      const buttons = host.querySelectorAll('nav button');
      // Previous button is buttons[0]
      await act(async () => {
        (buttons[0] as HTMLButtonElement).click();
      });

      expect(mocks.push).toHaveBeenCalledTimes(1);
      const url = mocks.push.mock.calls[0]![0];
      expect(url).toContain('cursor_recorded_at=2026-11-19T10%3A00%3A00Z');
      expect(url).toContain('cursor_event_id=e-1');
      expect(url).toContain('cursor_history=%5Bnull%5D');
    });
  });

  describe('ReportsPage server component integration', () => {
    it('passes cursor and retrieves pagination data from getWorkspaceDrilldownRows', async () => {
      mocks.actor.mockResolvedValue({
        userId: '00000000-0000-0000-0000-000000000099',
        role: 'platform_owner',
        deleted: false,
        activeWorkspaceIds: [wsId],
      });
      mocks.cookies.mockResolvedValue({
        get: () => ({ value: 'en' }),
      });
      mocks.platformReport.mockResolvedValue({
        status: 'ok',
        period: '2026-11',
        breakdown: 'month',
        totals: {
          revenueConvertedEgpMinor: '10000',
          subscriptionCount: 1,
          clientCount: 1,
        },
        workspaceAggregates: [],
        breakdowns: [],
      });
      mocks.collections.mockResolvedValue({
        status: 'ok',
        month: '2026-11',
        collections: [],
        accounting_events: [],
        pending_event_ids: [],
        converted_egp_minor: '0',
      });
      mocks.commissions.mockResolvedValue({
        status: 'ok',
        month: '2026-11',
        commissions: [],
      });
      mocks.installments.mockResolvedValue({
        status: 'ok',
        installments: [],
      });
      mocks.session.mockResolvedValue({
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi
            .fn()
            .mockReturnValue(
              Promise.resolve({ data: workspaces, error: null }),
            ),
        })),
      });

      const nextCursor = {
        recorded_at: '2026-11-19T10:00:00Z',
        event_id: 'ev-1',
      };
      mocks.drilldownRows.mockResolvedValue({
        status: 'ok',
        workspaceId: wsId,
        workspaceName: 'Main Gym',
        rows: [sampleRow('r-1')],
        totals: {
          revenueConvertedEgpMinor: '10000',
          subscriptionCount: 1,
          clientCount: 1,
        },
        hasMore: true,
        nextCursor,
      });

      const element = await Page({
        searchParams: Promise.resolve({
          month: '2026-11',
          drilldown: wsId,
          cursor_recorded_at: '2026-11-20T10:00:00Z',
          cursor_event_id: 'ev-0',
        }),
      });

      expect(mocks.drilldownRows).toHaveBeenCalledWith({
        workspaceId: wsId,
        monthStart: '2026-11-01',
        cursor: {
          recorded_at: '2026-11-20T10:00:00Z',
          event_id: 'ev-0',
        },
      });

      const html = renderToStaticMarkup(element);
      const doc = new JSDOM(html).window.document;
      const nav = doc.querySelector('nav');
      expect(nav).not.toBeNull();
      expect(nav?.getAttribute('aria-label')).toBe('Reports pagination');
    });
  });
});
