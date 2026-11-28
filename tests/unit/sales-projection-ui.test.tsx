import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getMessages } from '../../lib/i18n';
import {
  SalesMonthlyTotalView,
  formatCairoMonth,
  type SalesMonthlyTotalViewProps,
} from '../../components/workforce/SalesMonthlyTotalView';
import { ToastProvider } from '../../components/ui/Toast';
import SalesMonthlyTotalPage from '../../app/(app)/workforce/sales-projection/page';

function renderView(props: SalesMonthlyTotalViewProps) {
  const messages = getMessages(props.locale);
  return renderToStaticMarkup(
    createElement(
      ToastProvider as unknown as (p: {
        dismissLabel: string;
        children?: unknown;
      }) => ReactElement,
      { dismissLabel: messages['toast.dismiss'] ?? 'Dismiss' },
      createElement(SalesMonthlyTotalView, props),
    ),
  );
}

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  cookies: vi.fn(),
  readSalesMonthlyTotal: vi.fn(),
  readOwnBasicSalary: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ requireActor: mocks.actor }));
vi.mock('../../lib/workforce/sales-projection', () => ({
  readSalesMonthlyTotal: mocks.readSalesMonthlyTotal,
  readOwnBasicSalary: mocks.readOwnBasicSalary,
}));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));

describe('Sales My Monthly Total UI (T025 / FR-012, FR-017, FR-020, FR-029)', () => {
  it.each([
    ['en', 'My monthly total', 'Finalized total'],
    ['ar', 'إجمالي نقاطي للشهر', 'الإجمالي المعتمد'],
  ] as const)(
    'renders finalized total state in %s',
    (locale, expectedTitle, expectedTotalLabel) => {
      const messages = getMessages(locale);
      const html = renderView({
        workspaceId: 'ws-1',
        locale,
        month: '2026-10-01',
        status: 'finalized',
        total: '25.00',
      });

      expect(html).toContain(expectedTitle);
      expect(html).toContain(messages['reports.month']);
      expect(html).toContain(expectedTotalLabel);
      expect(html).toContain('25.00');
      expect(html).toContain(
        `aria-label="${messages['workforce.salesProjection.aria.total']}"`,
      );
    },
  );

  it.each(['en', 'ar'] as const)(
    'renders not-available-yet state with own salary in %s',
    (locale) => {
      const messages = getMessages(locale);
      const html = renderView({
        workspaceId: 'ws-1',
        locale,
        month: '2026-11-01',
        status: 'not_available',
        ownBasicSalary: { amount: '2500.50', currency: 'EGP' },
      });

      expect(html).toContain(
        messages['workforce.salesProjection.notAvailable'],
      );
      expect(html).toContain(
        messages['workforce.compensation.own.basicSalary'],
      );
      expect(html).toContain('2500.50 EGP');
      expect(html.replaceAll('&#x27;', "'")).toContain(
        messages['workforce.salesProjection.notAvailableUntilNextMonth'],
      );
      expect(html).not.toContain(
        messages['workforce.salesProjection.notAvailableHint'],
      );
      expect(html).not.toContain('25.00');
    },
  );

  it.each([
    ['en', 'No finalized total for this month.'],
    ['ar', 'مفيش إجمالي معتمد للشهر ده.'],
  ] as const)('renders empty state in %s', (locale, expectedEmpty) => {
    const html = renderView({
      workspaceId: 'ws-1',
      locale,
      month: '2026-09-01',
      status: 'empty',
    });

    expect(html).toContain(expectedEmpty);
    expect(html).not.toContain('25.00');
  });

  it.each([
    ['en', 'Loading your monthly total…'],
    ['ar', 'بنحمّل إجمالي الشهر…'],
  ] as const)('renders loading state in %s', (locale, expectedLoading) => {
    const html = renderView({
      workspaceId: 'ws-1',
      locale,
      month: '2026-10-01',
      status: 'loading',
    });

    expect(html).toContain(expectedLoading);
    expect(html).toContain('sales-projection-loading');
  });

  it.each([
    ['en', 'Unable to load your monthly total. Try again.', 'Retry'],
    ['ar', 'مش عارفين نحمّل إجمالي الشهر. حاول تاني.', 'إعادة المحاولة'],
  ] as const)(
    'renders error state with retry button in %s',
    (locale, expectedError, expectedRetry) => {
      const html = renderView({
        workspaceId: 'ws-1',
        locale,
        month: '2026-10-01',
        status: 'error',
      });

      expect(html).toContain(expectedError);
      expect(html).toContain(expectedRetry);
    },
  );

  it.each([
    ['en', 'You cannot view this total.'],
    ['ar', 'مش مسموح لك تشوف الإجمالي ده.'],
  ] as const)(
    'renders denied state with no existence disclosure in %s',
    (locale, expectedDenied) => {
      const html = renderView({
        workspaceId: 'ws-1',
        locale,
        month: '2026-10-01',
        status: 'denied',
      });

      expect(html).toContain(expectedDenied);
      expect(html).not.toContain('Finalized total');
      expect(html).not.toContain('25.00');
      expect(html).not.toContain('sales-projection-total');
    },
  );

  it('formats Cairo months correctly', () => {
    const enMonth = formatCairoMonth('2026-10-01', 'en');
    expect(enMonth).toContain('October');
    expect(enMonth).toContain('2026');

    expect(formatCairoMonth(null, 'en')).toBe('—');
    expect(formatCairoMonth(undefined, 'en')).toBe('—');
  });

  describe('SalesMonthlyTotalPage Server Component Authorization', () => {
    it('denies Platform Owner (PO) with no existence disclosure', async () => {
      mocks.actor.mockResolvedValue({
        role: 'platform_owner',
        activeWorkspaceIds: ['ws-1'],
      });
      mocks.cookies.mockResolvedValue({
        get: () => ({ value: 'en' }),
      });

      const page = await SalesMonthlyTotalPage({
        searchParams: Promise.resolve({ workspace: 'ws-1' }),
      });
      const html = renderToStaticMarkup(page);

      const en = getMessages('en');
      expect(html).toContain(en['workforce.salesProjection.denied']);
      expect(html).not.toContain('sales-projection-total');
    });

    it('denies Workspace Owner (WO) with no existence disclosure', async () => {
      mocks.actor.mockResolvedValue({
        role: 'workspace_owner',
        activeWorkspaceIds: ['ws-1'],
      });
      mocks.cookies.mockResolvedValue({
        get: () => ({ value: 'en' }),
      });

      const page = await SalesMonthlyTotalPage({
        searchParams: Promise.resolve({ workspace: 'ws-1' }),
      });
      const html = renderToStaticMarkup(page);

      const en = getMessages('en');
      expect(html).toContain(en['workforce.salesProjection.denied']);
      expect(html).not.toContain('sales-projection-total');
    });

    it('denies Trainer with no existence disclosure', async () => {
      mocks.actor.mockResolvedValue({
        role: 'trainer',
        activeWorkspaceIds: ['ws-1'],
      });
      mocks.cookies.mockResolvedValue({
        get: () => ({ value: 'en' }),
      });

      const page = await SalesMonthlyTotalPage({
        searchParams: Promise.resolve({ workspace: 'ws-1' }),
      });
      const html = renderToStaticMarkup(page);

      const en = getMessages('en');
      expect(html).toContain(en['workforce.salesProjection.denied']);
      expect(html).not.toContain('sales-projection-total');
    });

    it('allows Sales employee and displays finalized total', async () => {
      mocks.actor.mockResolvedValue({
        role: 'sales',
        activeWorkspaceIds: ['ws-1'],
      });
      mocks.cookies.mockResolvedValue({
        get: () => ({ value: 'en' }),
      });
      mocks.readSalesMonthlyTotal.mockResolvedValue({
        status: 'finalized',
        month: '2026-10-01',
        total: '42.00',
      });

      const page = await SalesMonthlyTotalPage({
        searchParams: Promise.resolve({
          workspace: 'ws-1',
          month: '2026-10-01',
        }),
      });
      const html = renderToStaticMarkup(page);

      const en = getMessages('en');
      expect(html).toContain(en['workforce.salesProjection.title']);
      expect(html).toContain(en['workforce.salesProjection.total']);
      expect(html).toContain('42.00');
    });

    it('allows Sales employee and displays not available yet for unfinalized month', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'sales-user-1',
        role: 'sales',
        activeWorkspaceIds: ['ws-1'],
      });
      mocks.cookies.mockResolvedValue({
        get: () => ({ value: 'en' }),
      });
      mocks.readSalesMonthlyTotal.mockResolvedValue({
        status: 'not_available',
      });
      mocks.readOwnBasicSalary.mockResolvedValue({
        status: 'ok',
        amount: '2500.50',
        currency: 'EGP',
      });

      const page = await SalesMonthlyTotalPage({
        searchParams: Promise.resolve({
          workspace: 'ws-1',
          month: '2026-11-01',
        }),
      });
      const html = renderToStaticMarkup(page);

      const en = getMessages('en');
      expect(html).toContain(en['workforce.salesProjection.notAvailable']);
      expect(html.replaceAll('&#x27;', "'")).toContain(
        en['workforce.salesProjection.notAvailableUntilNextMonth'],
      );
      expect(html).toContain('2500.50 EGP');
      expect(html).not.toContain(
        en['workforce.salesProjection.notAvailableHint'],
      );
      expect(mocks.readOwnBasicSalary).toHaveBeenCalledWith({
        employeeId: 'sales-user-1',
        month: '2026-11-01',
      });
    });
  });
});
