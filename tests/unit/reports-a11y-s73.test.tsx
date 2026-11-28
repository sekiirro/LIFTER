import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ReportsView,
  type PlatformData,
  type DrilldownData,
  type ReportsData,
} from '../../app/(app)/reports/ReportsView';
import { StaffNotifications } from '../../components/shell/StaffNotifications';
import type { UnifiedStaffNotification } from '../../app/(app)/notifications/actions';
import { cairoDate } from '../../lib/time/cairo-calendar';
import { getMessages } from '../../lib/i18n';

const wsId = '00000000-0000-0000-0000-000000000001';
const pkgRow = { id: 'pkg-1', market: 'Egypt', type: 'Promotional' };
const workspaces = [{ id: wsId, name: 'Main Gym' }];

/* prettier-ignore */
const sampleReportsData: ReportsData = {
  collections: { status: 'ok', rows: [{ id: 'col-1', package: pkgRow, clientName: 'Mona', recordedAt: '2026-11-08T12:00:00.000Z', amountMinor: '10000', currency: 'EGP', convertedEgpExact: '10000' }], totalConvertedEgpMinor: '10000', pendingEventIds: ['ev-1'] },
  commissions: { status: 'ok', rows: [{ package: pkgRow, byCurrency: { EGP: '500' }, convertedEgpExact: '500', pendingRateCount: 3 }] },
  installments: { status: 'ok', rows: [{ id: 'inst-1', package: pkgRow, clientName: 'Mona', dueOn: '2026-11-30', amountMinor: '50000', paidMinor: '0', remainingMinor: '50000', currency: 'EGP', isInstallmentClient: true }] },
};

/* prettier-ignore */
const sampleDrilldownData: DrilldownData = {
  status: 'ok', workspaceId: wsId, workspaceName: 'Main Gym',
  totals: { revenueConvertedEgpMinor: '10000', subscriptionCount: 1, clientCount: 1 },
  rows: [{ id: 'drill-1', recordedAt: '2026-11-08T12:00:00.000Z', package: pkgRow, clientName: 'Mona', kind: 'installment', status: 'completed', dueOn: '2026-11-30', amountMinor: '50000', currency: 'EGP', convertedEgpExact: '50000' }],
};

/* prettier-ignore */
const samplePlatformData: PlatformData = {
  status: 'ok', period: '2026-11', breakdown: 'month',
  totals: { revenueConvertedEgpMinor: '15000000', subscriptionCount: 42, clientCount: 38 },
  workspaceAggregates: [{ workspaceId: wsId, workspaceName: 'Main Gym', revenueConvertedEgpMinor: '15000000', subscriptionCount: 28, clientCount: 25 }],
  breakdowns: [{ key: '2026-11', label: '2026-11', revenueConvertedEgpMinor: '15000000', subscriptionCount: 42, clientCount: 38 }],
};

function renderReports(
  props: Partial<Parameters<typeof ReportsView>[0]> & { locale: 'en' | 'ar' },
) {
  return renderToStaticMarkup(
    createElement(ReportsView, {
      month: '2026-11',
      workspaceId: wsId,
      workspaces,
      data: sampleReportsData,
      totalConvertedEgp: '100.00 EGP',
      messages: getMessages(props.locale),
      role: 'platform_owner',
      ...props,
    }),
  );
}

describe('S73 Reports and Accessibility Unit Tests', () => {
  describe('S73-UIQA-F12: Date and DueOn Locale Formatting with Bidi', () => {
    it('formats installments dueOn and collections recordedAt with cairoDate and Bidi for en and ar', () => {
      for (const loc of ['en', 'ar'] as const) {
        const html = renderReports({ locale: loc });
        expect(html).not.toContain('<dd>2026-11-30</dd>');
        expect(html).toContain(
          `<bdi dir="auto">${cairoDate('2026-11-30', loc)}</bdi>`,
        );
        expect(html).toContain(
          `<bdi dir="auto">${cairoDate('2026-11-08T12:00:00.000Z', loc)}</bdi>`,
        );
      }
    });

    it('formats drilldown dueOn and recordedAt with cairoDate and Bidi for en and ar', () => {
      for (const loc of ['en', 'ar'] as const) {
        const html = renderReports({
          locale: loc,
          drilldownData: sampleDrilldownData,
        });
        expect(html).not.toContain('<dd>2026-11-30</dd>');
        expect(html).toContain(
          `<bdi dir="auto">${cairoDate('2026-11-30', loc)}</bdi>`,
        );
        expect(html).toContain(
          `<bdi dir="auto">${cairoDate('2026-11-08T12:00:00.000Z', loc)}</bdi>`,
        );
      }
    });
  });

  describe('S73-UIQA-F13: Platform Aggregate Heading Semantics', () => {
    it('renders platform aggregate title as an <h2> with id="platform-title"', () => {
      const html = renderReports({
        locale: 'en',
        workspaceId: 'all',
        platformData: samplePlatformData,
      });
      expect(html).toContain('<h2 id="platform-title"');
      expect(html).not.toContain('<div id="platform-title"');
      expect(html).toContain('aria-labelledby="platform-title"');
    });
  });

  describe('S73-UIQA-F14: Metric Counts Formatted with Intl.NumberFormat and Bidi', () => {
    it('formats platform aggregate totals, breakdowns, and workspace counts in English and Arabic', () => {
      const enHtml = renderReports({
        locale: 'en',
        workspaceId: 'all',
        platformData: samplePlatformData,
      });
      expect(enHtml).toContain('<bdi dir="auto">42</bdi>');
      expect(enHtml).toContain('<bdi dir="auto">38</bdi>');
      expect(enHtml).toContain('<bdi dir="auto">28</bdi>');
      expect(enHtml).toContain('<bdi dir="auto">25</bdi>');

      const arHtml = renderReports({
        locale: 'ar',
        workspaceId: 'all',
        platformData: samplePlatformData,
      });
      expect(arHtml).toContain('<bdi dir="auto">٤٢</bdi>');
      expect(arHtml).toContain('<bdi dir="auto">٣٨</bdi>');
      expect(arHtml).toContain('<bdi dir="auto">٢٨</bdi>');
      expect(arHtml).toContain('<bdi dir="auto">٢٥</bdi>');
    });
  });

  describe('S73-UIQA-F16: Focus-Visible Ring on .exportDownload in CSS', () => {
    it('specifies outline: 2px solid var(--brand-ring) and outline-offset: 2px for .exportDownload:focus-visible', () => {
      const css = readFileSync(
        join(__dirname, '../../app/(app)/reports/reports.module.css'),
        'utf8',
      );
      expect(css).toMatch(
        /\.exportDownload:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--brand-ring\);[^}]*outline-offset:\s*2px;[^}]*\}/s,
      );
    });
  });

  describe('S73-UIQA-F19: Logical Margins on .sectionHeader p in CSS', () => {
    it('uses logical margin properties on .sectionHeader p instead of physical shorthand', () => {
      const css = readFileSync(
        join(__dirname, '../../app/(app)/reports/reports.module.css'),
        'utf8',
      );
      expect(css).not.toMatch(
        /\.sectionHeader p\s*\{[^}]*margin:\s*var\(--space-2\)\s+0\s+0;[^}]*\}/s,
      );
      expect(css).toMatch(
        /\.sectionHeader p\s*\{[^}]*margin-block(?:-start)?:\s*var\(--space-2\)/s,
      );
      expect(css).toMatch(/\.sectionHeader p\s*\{[^}]*margin-inline:\s*0/s);
    });
  });

  describe('S73-386-REJ: StaffNotifications Handle Rejections Without Unhandled Rejection', () => {
    let dom: JSDOM;
    let host: HTMLDivElement;
    let root: ReturnType<typeof createRoot>;

    beforeEach(() => {
      dom = new JSDOM(
        '<!DOCTYPE html><html><body><div id="root"></div></body></html>',
        { url: 'http://localhost' },
      );
      vi.stubGlobal('window', dom.window);
      vi.stubGlobal('document', dom.window.document);
      vi.stubGlobal('navigator', dom.window.navigator);
      vi.stubGlobal('KeyboardEvent', dom.window.KeyboardEvent);
      vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
      host = dom.window.document.getElementById('root') as HTMLDivElement;
      root = createRoot(host);
    });

    afterEach(async () => {
      if (root)
        await act(async () => {
          root.unmount();
        });
      dom?.window?.close();
      vi.unstubAllGlobals();
    });

    it('catches markRead and dismiss failures, preventing unhandled rejections while reloading', async () => {
      const notice: UnifiedStaffNotification = {
        type: 'staff_notice',
        id: 'notice-fail',
        kind: 'subscription_expiring_t3',
        workspaceId: wsId,
        sourceKey: 'sub-fail',
        createdAt: '2026-11-27T10:00:00Z',
        readAt: null,
        clientName: 'Client Fail',
        expiryDate: '2026-11-30T10:00:00Z',
      };
      const onFetch = vi.fn(async () => ({
        status: 'ok' as const,
        notifications: [notice],
      }));
      const onMarkRead = vi.fn(async () => {
        throw new Error('DB error');
      });
      const onDismiss = vi.fn(async () => {
        throw new Error('Timeout error');
      });
      const unhandled = vi.fn();
      dom.window.addEventListener('unhandledrejection', unhandled);

      await act(async () => {
        root.render(
          <StaffNotifications
            messages={getMessages('en')}
            initialOpen
            initialNotifications={[notice]}
            onFetch={onFetch}
            onMarkRead={onMarkRead}
            onDismiss={onDismiss}
          />,
        );
      });

      const markBtn = host.querySelector<HTMLButtonElement>(
        '[data-testid="mark-read-notice-fail"]',
      );
      const dismissBtn = host.querySelector<HTMLButtonElement>(
        '[data-testid="dismiss-notice-fail"]',
      );
      expect(markBtn).not.toBeNull();
      expect(dismissBtn).not.toBeNull();

      await act(async () => {
        markBtn!.click();
      });
      await act(async () => {
        dismissBtn!.click();
      });

      expect(unhandled).not.toHaveBeenCalled();
      expect(onFetch).toHaveBeenCalled();
    });
  });
});
