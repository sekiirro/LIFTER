import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CatalogVariationsPage from '../../app/(app)/catalog-variations/page';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  cookies: vi.fn(),
  workspaces: vi.fn(),
  search: vi.fn(),
}));

vi.mock('../../lib/auth/actor', () => ({ requireActor: mocks.actor }));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('../../lib/catalog/server', () => ({
  authoringWorkspaces: mocks.workspaces,
  search: mocks.search,
}));
vi.mock('../../components/catalog/VideoVariationFlow', () => ({
  VideoVariationFlow: () => createElement('div', null, 'variation flow'),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('404');
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ role: 'platform_owner' });
  mocks.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
  mocks.workspaces.mockResolvedValue({
    status: 'ok',
    data: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Studio' }],
  });
  mocks.search.mockResolvedValue({ status: 'ok', data: [] });
});

describe('catalog variations workspace gate', () => {
  it.each([
    [{ status: 'unavailable' }, en['catalog.errorTitle']],
    [{ status: 'ok', data: [] }, en['catalog.videoVariationNoWorkspace']],
  ])(
    'does not search exercises when workspace loading returns %j',
    async (workspaceResult, expectedMessage) => {
      mocks.workspaces.mockResolvedValue(workspaceResult);
      mocks.search.mockResolvedValue({ status: 'unavailable' });

      const html = renderToStaticMarkup(
        await CatalogVariationsPage({ searchParams: Promise.resolve({}) }),
      );

      expect(mocks.search).not.toHaveBeenCalled();
      expect(html).toContain(expectedMessage);
    },
  );

  it.each([['en', en], ['ar', ar]] as const)(
    'shows localized library-load copy when exercise search fails (%s)',
    async (locale, messages) => {
      mocks.cookies.mockResolvedValue({ get: () => ({ value: locale }) });
      mocks.search.mockResolvedValue({ status: 'unavailable' });

      const html = renderToStaticMarkup(
        await CatalogVariationsPage({ searchParams: Promise.resolve({}) }),
      );

      expect(html).toContain(messages['catalog.errorTitle']);
      expect(html).not.toContain(messages['catalog.videoVariationUnavailable']);
      expect(mocks.search).toHaveBeenCalledTimes(1);
    },
  );
});
