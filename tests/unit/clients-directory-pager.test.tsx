import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
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

async function renderPage(
  searchParams: Record<string, string> = {},
  locale: 'en' | 'ar' = 'en',
) {
  mocks.cookies.mockResolvedValue({
    get: () => ({ value: locale }),
  });
  const element = await Page({ searchParams: Promise.resolve(searchParams) });
  const html = renderToStaticMarkup(element);
  return new JSDOM(html).window.document;
}

describe('clients directory pagination labels and landmark (S73-UIQA-F11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({
      userId: 'staff-user-1',
      role: 'platform_owner',
      activeWorkspaceIds: [],
    });
    mocks.session.mockResolvedValue({
      from: vi.fn(() => queryResult([workspaceRow])),
    });
  });

  it('verifies dictionary contains approved pagination keys with exact UTF-8 strings', () => {
    const en = getMessages('en') as Record<string, string>;
    const ar = getMessages('ar') as Record<string, string>;

    expect(en['staff.clientDirectory.previousPage']).toBe('Previous page');
    expect(ar['staff.clientDirectory.previousPage']).toBe('الصفحة السابقة');

    expect(en['staff.clientDirectory.nextPage']).toBe('Next page');
    expect(ar['staff.clientDirectory.nextPage']).toBe('الصفحة التالية');

    expect(en['staff.clientDirectory.paginationLabel']).toBe(
      'Clients pagination',
    );
    expect(ar['staff.clientDirectory.paginationLabel']).toBe('صفحات العملاء');
  });

  it('renders pager nav with paginationLabel as aria-label in EN and AR', async () => {
    mocks.directory.mockResolvedValue({
      status: 'ok',
      rows: [directoryRow()],
      hasMore: true,
    });

    // EN check
    const docEn = await renderPage({ page: '2' }, 'en');
    const navEn = docEn.querySelector('nav');
    expect(navEn).not.toBeNull();
    expect(navEn?.getAttribute('aria-label')).toBe('Clients pagination');
    expect(navEn?.getAttribute('aria-label')).not.toBe('Clients');

    // AR check
    const docAr = await renderPage({ page: '2' }, 'ar');
    const navAr = docAr.querySelector('nav');
    expect(navAr).not.toBeNull();
    expect(navAr?.getAttribute('aria-label')).toBe('صفحات العملاء');
    expect(navAr?.getAttribute('aria-label')).not.toBe('العملاء');
  });

  it('renders previousPage and nextPage link labels instead of wizard buttons in EN and AR', async () => {
    mocks.directory.mockResolvedValue({
      status: 'ok',
      rows: [directoryRow()],
      hasMore: true,
    });

    // EN
    const docEn = await renderPage({ page: '2' }, 'en');
    const linksEn = docEn.querySelectorAll('nav a');
    expect(linksEn.length).toBe(2);
    expect(linksEn[0]?.textContent).toBe('Previous page');
    expect(linksEn[0]?.textContent).not.toBe('Back');
    expect(linksEn[1]?.textContent).toBe('Next page');
    expect(linksEn[1]?.textContent).not.toBe('Continue');

    // AR
    const docAr = await renderPage({ page: '2' }, 'ar');
    const linksAr = docAr.querySelectorAll('nav a');
    expect(linksAr.length).toBe(2);
    expect(linksAr[0]?.textContent).toBe('الصفحة السابقة');
    expect(linksAr[0]?.textContent).not.toBe('رجوع');
    expect(linksAr[1]?.textContent).toBe('الصفحة التالية');
    expect(linksAr[1]?.textContent).not.toBe('متابعة');
  });

  it('renders only nextPage link on page 1 when hasMore is true', async () => {
    mocks.directory.mockResolvedValue({
      status: 'ok',
      rows: [directoryRow()],
      hasMore: true,
    });

    const doc = await renderPage({ page: '1' }, 'en');
    const links = doc.querySelectorAll('nav a');
    expect(links.length).toBe(1);
    expect(links[0]?.textContent).toBe('Next page');
  });

  it('renders only previousPage link on page 2 when hasMore is false', async () => {
    mocks.directory.mockResolvedValue({
      status: 'ok',
      rows: [directoryRow()],
      hasMore: false,
    });

    const doc = await renderPage({ page: '2' }, 'en');
    const links = doc.querySelectorAll('nav a');
    expect(links.length).toBe(1);
    expect(links[0]?.textContent).toBe('Previous page');
  });

  it('renders no pager nav on page 1 when hasMore is false', async () => {
    mocks.directory.mockResolvedValue({
      status: 'ok',
      rows: [directoryRow()],
      hasMore: false,
    });

    const doc = await renderPage({ page: '1' }, 'en');
    const nav = doc.querySelector('nav');
    expect(nav).toBeNull();
  });
});
