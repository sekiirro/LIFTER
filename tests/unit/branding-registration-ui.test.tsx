import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  openRegistrationLink: vi.fn(),
  sessionClient: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('../../lib/registration-links/open', () => ({
  openRegistrationLink: mocks.openRegistrationLink,
}));
vi.mock('../../lib/supabase/public-session', () => ({
  createPublicSessionClient: mocks.sessionClient,
}));
vi.mock('../../components/auth/AuthPreferences', () => ({
  AuthPreferences: () => null,
}));
vi.mock('../../app/register/[token]/SignupForm', () => ({
  SignupForm: () => createElement('form', { 'data-testid': 'signup-form' }),
}));

import RegisterPage from '../../app/register/[token]/page';
import { RegistrationBrand } from '../../components/branding/RegistrationBrand';

const brand = {
  name: { ar: 'نادي النخبة', en: 'Elite Club' },
  color: '#2563EB' as const,
  bannerAlt: { ar: 'واجهة النادي', en: 'Club frontage' },
  logo: true,
  banner: true,
};
const token = 'A'.repeat(43);

afterEach(() => vi.resetAllMocks());

describe('published registration brand', () => {
  it('renders the current published identity inside the registration card and keeps the form below the banner', async () => {
    mocks.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
    mocks.openRegistrationLink.mockResolvedValue({
      status: 'valid',
      workspace_name: 'Workspace fallback',
      render_handle: token,
      branding: brand,
    });
    mocks.sessionClient.mockResolvedValue(null);

    const page = await RegisterPage({ params: Promise.resolve({ token }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('data-registration-card="premium-centered"');
    expect(html).toContain('Elite Club');
    expect(html).toContain('data-brand-scope=""');
    expect(html).toContain('/api/branding/');
    expect(html).toContain('alt="Club frontage"');
    expect(html).toContain('data-testid="signup-form"');
    expect(html.indexOf('data-registration-banner')).toBeLessThan(
      html.indexOf('data-testid="signup-form"'),
    );
    expect(html).not.toContain('Workspace fallback');
  });

  it('keeps the generic invalid-token page neutral and does not expose published identity', async () => {
    mocks.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
    mocks.openRegistrationLink.mockResolvedValue({ status: 'invalid' });
    mocks.sessionClient.mockResolvedValue(null);

    const page = await RegisterPage({ params: Promise.resolve({ token }) });
    const html = renderToStaticMarkup(page);

    expect(html).not.toContain('data-registration-card="premium-centered"');
    expect(html).not.toContain('api/branding');
    expect(html).not.toContain('Elite Club');
    expect(html).not.toContain('data-testid="signup-form"');
  });

  it('uses only the opaque image proxy URL and preserves semantic status tokens', () => {
    const html = renderToStaticMarkup(
      createElement(RegistrationBrand, {
        brand,
        locale: 'en',
        token,
        renderHandle: token,
        fallbackName: 'Workspace',
      }),
    );

    expect(html).toContain(`/api/branding/${token}/logo?handle=${token}`);
    expect(html).toContain(`/api/branding/${token}/banner?handle=${token}`);
    expect(html).toContain('alt="Club frontage"');
    expect(html).toContain('data-registration-banner=""');
    expect(html).not.toContain('data-registration-banner-fallback');
    expect(html).not.toContain('signedUrl');
    expect(html).not.toContain('--color-success');
    expect(html).not.toContain('--color-warning');
    expect(html).not.toContain('--color-error');
  });

  it('reserves a 2:1 banner frame around an image with intrinsic size hints', () => {
    const html = renderToStaticMarkup(
      createElement(RegistrationBrand, {
        brand,
        locale: 'en',
        token,
        renderHandle: token,
        fallbackName: 'Workspace',
      }),
    );

    expect(html).toMatch(
      /<div class="[^"]*" data-registration-banner-frame=""><img\b(?=[^>]*\bwidth="1600")(?=[^>]*\bheight="800")(?=[^>]*data-registration-banner="")[^>]*\/><\/div>/,
    );
  });

  it('uses a neutral localized fallback hero when no banner is published', () => {
    const html = renderToStaticMarkup(
      createElement(RegistrationBrand, {
        brand: { ...brand, banner: false },
        locale: 'ar',
        token,
        renderHandle: token,
        fallbackName: 'Workspace',
      }),
    );
    expect(html).toContain('data-registration-banner-fallback=""');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label=');
    expect(html).not.toContain('/banner?handle=');
  });
});
