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

const token = 'A'.repeat(43);

afterEach(() => vi.resetAllMocks());

describe('F14 public registration projection', () => {
  it('renders only the published identity while preserving signup behavior', async () => {
    mocks.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
    mocks.openRegistrationLink.mockResolvedValue({
      status: 'valid',
      workspace_name: 'Workspace fallback',
      render_handle: token,
      branding: {
        name: { ar: 'نادي النخبة', en: 'Elite Club' },
        color: '#2563EB',
        bannerAlt: { ar: 'واجهة النادي', en: 'Club frontage' },
        logo: true,
        banner: true,
      },
    });
    mocks.sessionClient.mockResolvedValue(null);

    const page = await RegisterPage({ params: Promise.resolve({ token }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('data-registration-card="premium-centered"');
    expect(html).toContain('Elite Club');
    expect(html).toContain('data-brand-scope=""');
    expect(html).toContain('/api/branding/');
    expect(html).toContain('data-testid="signup-form"');
    expect(html).not.toContain('Workspace fallback');
  });

  it('does not render branding or signup controls for the byte-stable invalid path', async () => {
    mocks.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
    mocks.openRegistrationLink.mockResolvedValue({ status: 'invalid' });
    mocks.sessionClient.mockResolvedValue(null);

    const page = await RegisterPage({ params: Promise.resolve({ token }) });
    const html = renderToStaticMarkup(page);

    expect(html).not.toContain('data-registration-card="premium-centered"');
    expect(html).not.toContain('api/branding');
    expect(html).not.toContain('data-testid="signup-form"');
    expect(html).toContain(
      'This registration link is invalid or no longer available.',
    );
  });
});
