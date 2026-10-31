import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMessages } from '../../lib/i18n';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  requireActor: vi.fn(),
  createSessionClient: vi.fn(),
  getDraft: vi.fn(),
  getCurrentPublication: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('not found');
  }),
}));
vi.mock('../../lib/auth/actor', () => ({
  requireActor: mocks.requireActor,
}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));
vi.mock('../../lib/branding/repository', () => ({
  createSupabaseBrandingRepository: vi.fn(() => ({
    getDraft: mocks.getDraft,
    getCurrentPublication: mocks.getCurrentPublication,
  })),
}));
vi.mock('../../lib/branding/workspaces', () => ({
  filterBrandingWorkspaces: vi.fn((workspaces: unknown[]) => workspaces),
}));
vi.mock('../../app/(dashboard)/branding/actions', () => ({
  saveBrandingAction: vi.fn(),
  publishBrandingAction: vi.fn(),
}));
vi.mock('../../components/branding/ClientPortalBrandPreview', () => ({
  ClientPortalBrandPreview: () => null,
}));
vi.mock('../../components/branding/BrandingUploadManager', () => ({
  BrandingUploadManager: () => <div data-branding-upload-manager="" />,
}));

import WorkspaceBrandingPage from '../../app/(dashboard)/branding/page';

const workspaceId = '00000000-0000-0000-0000-000000000001';

function inputTag(html: string, name: string) {
  return html.match(new RegExp(`<input(?=[^>]*\\bname="${name}")[^>]*>`))?.[0];
}

async function renderEditor(locale: 'ar' | 'en') {
  mocks.cookies.mockResolvedValue({ get: () => ({ value: locale }) });
  const page = await WorkspaceBrandingPage({
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(page);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireActor.mockResolvedValue({ userId: 'user-1', role: 'owner' });
  mocks.createSessionClient.mockResolvedValue({
    from: () => ({
      select: () => ({
        order: async () => ({
          data: [{ id: workspaceId, name: 'Workspace' }],
          error: null,
        }),
      }),
    }),
  });
  mocks.getDraft.mockResolvedValue({
    workspaceId,
    revision: 7,
    fields: {
      names: { ar: 'نادي النخبة', en: 'Elite Club' },
      color: '#2563EB',
      bannerAltText: { ar: 'وصف اللافتة', en: 'Draft banner' },
    },
  });
  mocks.getCurrentPublication.mockResolvedValue(null);
});

describe('production branding editor banner alt text', () => {
  it('wires the upload manager to both draft revision forms', async () => {
    const html = await renderEditor('en');

    expect(html).toContain('data-branding-upload-manager');
    expect(html).toContain('id="branding-draft-form"');
    expect(html).toContain('id="branding-publish-form"');
  });

  it('renders a described fieldset with direction- and language-specific labels', async () => {
    const html = await renderEditor('en');
    const messages = getMessages('en');

    expect(html).toMatch(
      /<fieldset(?=[^>]*aria-describedby="branding-banner-alt-hint")[^>]*>/,
    );
    expect(html).toContain(`>${messages['branding.bannerAltLegend']}</legend>`);
    expect(html).toContain('id="branding-banner-alt-hint"');
    expect(html).toContain(messages['branding.bannerAltHint']);
    expect(html).toContain(
      `<label for="branding-banner-alt-ar">${messages['branding.bannerAltArabic']}</label>`,
    );
    expect(html).toContain(
      `<label for="branding-banner-alt-en">${messages['branding.bannerAltEnglish']}</label>`,
    );

    const arabic = inputTag(html, 'bannerAltAr');
    expect(arabic).toContain('dir="rtl"');
    expect(arabic).toContain('lang="ar"');
    expect(arabic).toContain('aria-describedby="branding-banner-alt-hint"');

    const english = inputTag(html, 'bannerAltEn');
    expect(english).toContain('dir="ltr"');
    expect(english).toContain('lang="en"');
    expect(english).toContain('aria-describedby="branding-banner-alt-hint"');
  });

  it('prefills both alt inputs from the saved draft projection', async () => {
    const html = await renderEditor('en');

    expect(inputTag(html, 'bannerAltAr')).toContain('value="وصف اللافتة"');
    expect(inputTag(html, 'bannerAltEn')).toContain('value="Draft banner"');
  });

  it('keeps the Arabic locale RTL and uses the approved bilingual legend and hint', async () => {
    const html = await renderEditor('ar');
    const messages = getMessages('ar');

    expect(html).toContain('dir="rtl"');
    expect(html).toContain(`>${messages['branding.bannerAltLegend']}</legend>`);
    expect(html).toContain(messages['branding.bannerAltHint']);
    expect(inputTag(html, 'bannerAltAr')).toContain('dir="rtl"');
    expect(inputTag(html, 'bannerAltEn')).toContain('dir="ltr"');
  });
});
