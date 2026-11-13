import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from '../../app/(app)/clients/[clientId]/page';
import ErrorPage from '../../app/(app)/clients/[clientId]/error';
import { getMessages } from '../../lib/i18n';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  capability: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ getActor: mocks.actor }));
vi.mock('../../lib/auth/capabilities', () => ({
  roleHasCapability: mocks.capability,
}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.session,
}));
vi.mock('../../lib/client-notes/service', () => ({
  readClientNotes: vi.fn(),
}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));

const clientId = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ userId: 'staff-a', role: 'trainer' });
  mocks.capability.mockReturnValue(true);
  mocks.session.mockResolvedValue({ rpc: mocks.rpc });
  mocks.notFound.mockImplementation(() => {
    throw new Error('404');
  });
});

describe('Client Details context availability', () => {
  it('throws a recoverable route error when the context RPC fails', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '08006', message: 'private database detail' },
    });

    await expect(
      Page({ params: Promise.resolve({ clientId }) }),
    ).rejects.toThrow('Client context unavailable');
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('keeps an absent or unauthorized context on the generic not-found path', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await expect(
      Page({ params: Promise.resolve({ clientId }) }),
    ).rejects.toThrow('404');
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it('renders only the approved generic recovery copy for RPC failures', () => {
    const messages = getMessages('ar');
    const html = renderToStaticMarkup(
      createElement(ErrorPage, {
        error: new Error('private database detail'),
        reset: vi.fn(),
      }),
    );
    expect(html).toContain(messages['states.error.title']);
    expect(html).toContain(messages['states.error.description']);
    expect(html).toContain(messages['states.retry']);
    expect(html).not.toContain('private database detail');
  });
});
