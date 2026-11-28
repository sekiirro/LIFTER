import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from '../../app/(app)/clients/page';
import { getMessages } from '../../lib/i18n';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  cookies: vi.fn(),
  session: vi.fn(),
  directory: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ requireActor: mocks.actor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.session,
}));
vi.mock('../../lib/client-directory/service', () => ({
  loadClientDirectory: mocks.directory,
}));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound called');
  },
}));
vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    default: ({ children, ...props }: React.ComponentProps<'a'>) =>
      React.createElement('a', props, children),
  };
});

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const workspaceRow = { id: workspaceId, name: 'Own workspace' };

function queryResult(data: unknown, error: unknown = null) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'order']) query[method] = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve);
  return query;
}

function directoryRow(overrides: Record<string, unknown> = {}) {
  return {
    clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    name: 'Synthetic client',
    approvalState: 'approved',
    subscriptionStatus: 'active',
    refundScope: null,
    plansWaitingForDelivery: 0,
    pendingFoodReplacements: 0,
    newCheckIns: 0,
    expiryBucket: null,
    ...overrides,
  };
}

async function renderPage(searchParams: Record<string, string> = {}) {
  const element = await Page({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(element).replace(/&#x27;/g, "'");
}

describe('clients directory expiry badges (S73-UIQA-F08/F09/F10/F10b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({
      userId: 'staff-user-1',
      role: 'platform_owner',
      activeWorkspaceIds: [],
    });
    mocks.cookies.mockResolvedValue({
      get: () => ({ value: 'en' }),
    });
    mocks.session.mockResolvedValue({
      from: vi.fn(() => queryResult([workspaceRow])),
    });
  });

  it('reuses existing keys in both locales', () => {
    for (const locale of ['en', 'ar'] as const) {
      const m = getMessages(locale);
      expect(m['states.error.title']).toBeTruthy();
      expect(m['staff.clientDirectory.expiring']).toBeTruthy();
      expect(m['staff.clientDirectory.expiring.loadError']).toBeTruthy();
      expect(
        m['staff.clientDirectory.subscriptionStatus.expired'],
      ).toBeTruthy();
    }
  });

  it('renders the expiring badge for an expiring row', async () => {
    mocks.directory.mockResolvedValue({
      status: 'ok',
      rows: [
        directoryRow({
          expiryBucket: 'expiring',
          subscriptionStatus: 'expiring',
        }),
      ],
      hasMore: false,
    });
    const html = await renderPage();
    expect(html).toContain('data-testid="directory-expiring-badge"');
    expect(html).toContain('Expiring');
    const badge = html.match(
      /<p[^>]*data-testid="directory-expiring-badge"[^>]*>/,
    );
    expect(badge?.[0]).toContain('expiryBadge');
  });

  it('renders the expired badge for an expired row', async () => {
    mocks.directory.mockResolvedValue({
      status: 'ok',
      rows: [
        directoryRow({
          expiryBucket: 'expired',
          subscriptionStatus: 'expired',
        }),
      ],
      hasMore: false,
    });
    const html = await renderPage();
    expect(html).toContain('data-testid="directory-expired-badge"');
    expect(html).toContain('Expired');
    const badge = html.match(
      /<p[^>]*data-testid="directory-expired-badge"[^>]*>/,
    );
    expect(badge?.[0]).toContain('expiryBadge');
  });

  it('shows only the badge for an expired row, no duplicate status line', async () => {
    mocks.directory.mockResolvedValue({
      status: 'ok',
      rows: [
        directoryRow({
          expiryBucket: 'expired',
          subscriptionStatus: 'expired',
        }),
      ],
      hasMore: false,
    });
    const html = await renderPage();
    expect(html).toContain('data-testid="directory-expired-badge"');
    expect(html.split('data-testid="directory-expired-badge"').length - 1).toBe(
      1,
    );
    expect(html).not.toContain('data-testid="directory-subscription-status"');
    // Within the results list, "Expired" appears exactly once (the badge);
    // the filter <select> also has an "Expired" option, so count list-only.
    const resultsStart = html.indexOf('data-testid="client-directory-results"');
    const results = resultsStart === -1 ? '' : html.slice(resultsStart);
    expect(results.split('Expired').length - 1).toBe(1);
  });

  it('keeps the status line for an active row', async () => {
    mocks.directory.mockResolvedValue({
      status: 'ok',
      rows: [directoryRow()],
      hasMore: false,
    });
    const html = await renderPage();
    expect(html).toContain('data-testid="directory-subscription-status"');
    expect(html).not.toContain('data-testid="directory-expired-badge"');
  });

  it('shows a different title and body when the expiring filter load fails', async () => {
    mocks.directory.mockResolvedValue({ status: 'unavailable' });
    const html = await renderPage({ subscription: 'expiring' });
    const m = getMessages('en');
    const count = (text: string) => html.split(text).length - 1;
    expect(count(m['states.error.title'])).toBe(1);
    expect(count(m['staff.clientDirectory.expiring.loadError'])).toBe(1);
    expect(m['states.error.title']).not.toBe(
      m['staff.clientDirectory.expiring.loadError'],
    );
  });
});
