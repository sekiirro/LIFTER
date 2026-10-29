import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  load: vi.fn(),
  session: vi.fn(),
  cookies: vi.fn(),
  notFound: vi.fn(),
  open: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ requireActor: m.actor }));
vi.mock('../../lib/registration-links/read', () => ({
  loadRegistrationLinks: m.load,
}));
vi.mock('../../lib/registration-links/open', () => ({
  openRegistrationLink: m.open,
}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: m.session,
}));
vi.mock('next/headers', () => ({ cookies: m.cookies }));
vi.mock('next/navigation', () => ({ notFound: m.notFound }));
vi.mock('../../components/auth/AuthPreferences', () => ({
  AuthPreferences: () => createElement('div'),
}));
vi.mock('../../components/registration-links/RegistrationLinksManager', () => ({
  RegistrationLinksManager: (props: { canSchedule: boolean; data: unknown }) =>
    createElement(
      'div',
      { 'data-can-schedule': String(props.canSchedule) },
      'manager',
    ),
}));
import Page from '../../app/(app)/registration-links/page';
import Public, {
  dynamic as publicDynamic,
  revalidate as publicRevalidate,
} from '../../app/register/[token]/page';
import Loading from '../../app/(app)/registration-links/loading';
import StaffError from '../../app/(app)/registration-links/error';
import PublicError from '../../app/register/[token]/error';
import { getMessages } from '../../lib/i18n';
const ws = '00000000-0000-0000-0000-000000000001';
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({
    userId: ws,
    role: 'sales',
    activeWorkspaceIds: [ws],
  });
  m.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
  m.notFound.mockImplementation(() => {
    throw new Error('404');
  });
  m.load.mockResolvedValue({
    status: 'ok',
    offers: [],
    links: [],
    installments: [],
  });
  m.session.mockResolvedValue({
    from: () => ({
      select: () => ({
        order: async () => ({ data: [{ id: ws, name: 'A' }], error: null }),
      }),
    }),
  });
});
it('denies non-staff before reads', async () => {
  m.actor.mockResolvedValue({ role: null });
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    '404',
  );
  expect(m.session).not.toHaveBeenCalled();
  expect(m.load).not.toHaveBeenCalled();
});
it('propagates requireActor redirect before reads', async () => {
  m.actor.mockRejectedValue(new Error('redirect:/login'));
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    'redirect:/login',
  );
  expect(m.session).not.toHaveBeenCalled();
  expect(m.load).not.toHaveBeenCalled();
});
it('shows the no-workspace empty state without loading links', async () => {
  m.session.mockResolvedValue({
    from: () => ({
      select: () => ({ order: async () => ({ data: [], error: null }) }),
    }),
  });
  const html = renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain(getMessages('en')['registration.noWorkspace']);
  expect(html).not.toContain('manager');
  expect(m.load).not.toHaveBeenCalled();
});
it.each([
  { data: null, error: null },
  { data: null, error: { message: 'private' } },
])(
  'shows a generic failure when the selector query fails %#',
  async (reply) => {
    m.session.mockResolvedValue({
      from: () => ({ select: () => ({ order: async () => reply }) }),
    });
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain(getMessages('en')['registration.unavailable']);
    expect(html).not.toContain('manager');
    expect(m.load).not.toHaveBeenCalled();
  },
);
it('shows a generic failure when the loader fails after a valid scope', async () => {
  m.load.mockResolvedValue({ status: 'unavailable' });
  const html = renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain(getMessages('en')['registration.unavailable']);
  expect(html).not.toContain('manager');
});
it.each([
  ['sales', true],
  ['trainer', false],
  ['workspace_owner', true],
  ['platform_owner', true],
] as const)(
  'passes capability-only editor access for %s',
  async (role, can) => {
    m.actor.mockResolvedValue({
      userId: ws,
      role,
      activeWorkspaceIds: [ws],
    });
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain(`data-can-schedule="${can}"`);
  },
);
it('denies foreign selector before link reads', async () => {
  await expect(
    Page({
      searchParams: Promise.resolve({
        workspace: '00000000-0000-0000-0000-000000000002',
      }),
    }),
  ).rejects.toThrow('404');
  expect(m.load).not.toHaveBeenCalled();
});
it('scopes staff loader', async () => {
  expect(
    renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) })),
  ).toContain('manager');
  expect(m.load).toHaveBeenCalledWith(
    expect.objectContaining({ role: 'sales' }),
    ws,
  );
});
it('public page uses no actor and shows only name/validity', async () => {
  m.open.mockResolvedValue({
    status: 'valid',
    workspace_name: 'Synthetic workspace',
  });
  const html = renderToStaticMarkup(
    await Public({ params: Promise.resolve({ token: 'synthetic' }) }),
  );
  expect(html.includes('Synthetic workspace')).toBe(true);
  expect(html.includes('This registration link is valid.')).toBe(true);
  expect(html.includes('aria-label="Country"')).toBe(true);
  expect(html.includes('name="request_secret"')).toBe(true);
  expect(/price|Continue/.test(html)).toBe(false);
  expect(m.actor).not.toHaveBeenCalled();
});
it('public invalid page generic', async () => {
  m.open.mockResolvedValue({ status: 'invalid' });
  const html = renderToStaticMarkup(
    await Public({ params: Promise.resolve({ token: 'synthetic' }) }),
  );
  expect(html).toContain(
    'This registration link is invalid or no longer available.',
  );
  expect(m.actor).not.toHaveBeenCalled();
  expect(m.notFound).not.toHaveBeenCalled();
});
it('public render is dynamic/no-store and strips extra payload fields', async () => {
  expect(publicDynamic).toBe('force-dynamic');
  expect(publicRevalidate).toBe(0);
  m.open.mockResolvedValue({
    status: 'valid',
    workspace_name: 'Synthetic workspace',
    price: '1200',
    link_id: ws,
    token: 'synthetic',
  });
  const html = renderToStaticMarkup(
    await Public({ params: Promise.resolve({ token: 'synthetic' }) }),
  );
  expect(html).toContain('Synthetic workspace');
  expect(html).not.toMatch(/1200|link_id|price|synthetic/);
  expect(m.actor).not.toHaveBeenCalled();
  expect(m.notFound).not.toHaveBeenCalled();
});
it('loading and error shells are localized, contain no data and offer staff retry', async () => {
  const loading = renderToStaticMarkup(await Loading());
  expect(loading).toContain('role="status"');
  expect(loading).toContain('Loading…');
  const staff = renderToStaticMarkup(
    createElement(StaffError, { reset: vi.fn() }),
  );
  expect(staff).toContain(getMessages('ar')['registration.unavailable']);
  expect(staff).toContain('<button');
  const publicError = renderToStaticMarkup(createElement(PublicError));
  expect(publicError).toContain(
    getMessages('ar')['registration.publicInvalid'],
  );
  for (const html of [loading, staff, publicError])
    expect(html).not.toMatch(/price_minor|token_hash|commission|manager/);
  expect(m.load).not.toHaveBeenCalled();
});
