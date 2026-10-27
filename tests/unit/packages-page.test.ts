import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import Page from '../../app/(app)/packages/page';
import Home from '../../app/(app)/page';
import Loading from '../../app/(app)/packages/loading';
import PackagesError from '../../app/(app)/packages/error';
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  load: vi.fn(),
  session: vi.fn(),
  from: vi.fn(),
  notFound: vi.fn(),
  cookies: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ requireActor: m.actor }));
vi.mock('../../lib/packages/read', () => ({ loadPackageManagement: m.load }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: m.session,
}));
vi.mock('next/headers', () => ({ cookies: m.cookies }));
vi.mock('next/navigation', () => ({ notFound: m.notFound }));
vi.mock('../../app/(app)/packages/PackagesManager', () => ({
  PackagesManager: (props: { data: unknown }) =>
    createElement(
      'div',
      { 'data-testid': 'manager' },
      JSON.stringify(props.data),
    ),
}));
const ws = '00000000-0000-0000-0000-000000000001';
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({
    userId: ws,
    role: 'platform_owner',
    activeWorkspaceIds: [],
  });
  m.notFound.mockImplementation(() => {
    throw new Error('404');
  });
  m.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
  m.from.mockReturnValue({
    select: () => ({
      order: async () => ({
        data: [{ id: ws, name: 'test-workspace' }],
        error: null,
      }),
    }),
  });
  m.session.mockResolvedValue({ from: m.from });
  m.load.mockResolvedValue({
    status: 'ok',
    packages: [],
    offers: [],
    versions: [],
  });
});
describe('PO package page', () => {
  it('loading shell contains no management values', async () => {
    const html = renderToStaticMarkup(await Loading());
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('commission');
    expect(m.load).not.toHaveBeenCalled();
  });
  it('error shell never renders the thrown provider error or management data', () => {
    const html = renderToStaticMarkup(
      createElement(PackagesError, {
        reset: vi.fn(),
        error: new Error('private-provider-detail'),
      }),
    );
    expect(html).toContain('alert');
    expect(html).not.toContain('private-provider-detail');
    expect(html).not.toContain('manager');
    expect(m.load).not.toHaveBeenCalled();
  });
  it.each(['workspace_owner', 'sales', 'trainer', null])(
    'guards %s before session/management reads',
    async (role) => {
      m.actor.mockResolvedValue({ userId: ws, role, activeWorkspaceIds: [ws] });
      await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        '404',
      );
      expect(m.load).not.toHaveBeenCalled();
      expect(m.session).not.toHaveBeenCalled();
    },
  );
  it('requires verified actor independently of hiding UI', async () => {
    m.actor.mockRejectedValue(new Error('redirect:/login'));
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'redirect:/login',
    );
    expect(m.load).not.toHaveBeenCalled();
  });
  it('loads selected real workspace only after PO guard', async () => {
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ workspace: ws }) }),
    );
    expect(html).toContain('manager');
    expect(m.load).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'platform_owner' }),
      ws,
    );
  });
  it.each(['forged', '00000000-0000-0000-0000-000000000002'])(
    'handles invalid/absent workspace %s generically',
    async (workspace) => {
      const html = renderToStaticMarkup(
        await Page({ searchParams: Promise.resolve({ workspace }) }),
      );
      expect(html).not.toContain('manager');
      expect(m.load).not.toHaveBeenCalled();
    },
  );
  it('shows no fabricated catalog for no workspaces', async () => {
    m.from.mockReturnValue({
      select: () => ({ order: async () => ({ data: [], error: null }) }),
    });
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );
    expect(html).not.toContain('manager');
    expect(m.load).not.toHaveBeenCalled();
  });
  it('shows generic safe error without provider text', async () => {
    m.load.mockResolvedValue({ status: 'unavailable' });
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ workspace: ws }) }),
    );
    expect(html).not.toContain('manager');
    expect(html).toContain('alert');
  });
  it('landing link is PO-only', async () => {
    expect(renderToStaticMarkup(await Home())).toContain('href="/packages"');
    m.actor.mockResolvedValue({
      userId: ws,
      role: 'sales',
      activeWorkspaceIds: [ws],
    });
    expect(renderToStaticMarkup(await Home())).not.toContain(
      'href="/packages"',
    );
  });
});
