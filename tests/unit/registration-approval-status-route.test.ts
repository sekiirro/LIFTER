import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  status: vi.fn(),
  replace: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('../../lib/client-access/status', () => ({
  getClientSelfStatus: mocks.status,
}));

import Page from '../../app/(client)/account/status/page';
import { preflightClientHomeNavigation } from '../../app/(client)/account/status/actions';
import { performApprovedStatusRedirect } from '../../components/registration-approval/status-polling';

describe('client registration status route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
  });

  it('renders only the current session status with pending copy and manual refresh', async () => {
    mocks.status.mockResolvedValue({
      status: 'ok',
      approval_state: 'pending-approval',
    });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('Registration status');
    expect(html).toContain('Pending review');
    expect(html).toContain('Refresh status');
    expect(html).not.toMatch(/client_id|subscription_id|email|name/i);
    expect(mocks.status).toHaveBeenCalledOnce();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('keeps approved status explicit that approval is not activation and offers the fixed home fallback', async () => {
    mocks.status.mockResolvedValue({
      status: 'ok',
      approval_state: 'approved',
    });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('Approved');
    expect(html).toContain('does not mean your subscription is active');
    expect(html).toContain('href="/"');
    expect(html).not.toContain('href="/intake"');
  });

  it('shows a generic denial for staff or missing client associations', async () => {
    mocks.status.mockResolvedValue({ status: 'not_permitted' });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('This status page is not available.');
    expect(html).not.toMatch(/pending|approved|rejected|client_id/i);
  });

  it('preflights only the existing home route for the current approved session', async () => {
    mocks.status.mockResolvedValue({
      status: 'ok',
      approval_state: 'approved',
    });
    await expect(preflightClientHomeNavigation()).resolves.toEqual({
      status: 'ok',
      destination: '/',
    });
    mocks.status.mockResolvedValue({
      status: 'ok',
      approval_state: 'pending-approval',
    });
    const pendingResult = await preflightClientHomeNavigation();
    expect(pendingResult).toEqual({
      status: 'ok',
      approval_state: 'pending-approval',
    });
    expect(JSON.stringify(pendingResult)).not.toMatch(/client_id|next=/i);
  });

  it('navigates once only after preflight and keeps the manual fallback on failure', async () => {
    const preflight = vi.fn().mockResolvedValue({
      status: 'ok',
      destination: '/',
    });
    const navigate = vi.fn();
    await expect(
      performApprovedStatusRedirect({ preflight, navigate }),
    ).resolves.toBe('redirected');
    expect(preflight).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/');

    const failedNavigation = vi.fn(() => {
      throw new Error('navigation failed');
    });
    await expect(
      performApprovedStatusRedirect({
        preflight,
        navigate: failedNavigation,
      }),
    ).resolves.toBe('fallback');
    expect(failedNavigation).toHaveBeenCalledExactlyOnceWith('/');

    await expect(
      performApprovedStatusRedirect({
        preflight: async () => {
          throw new Error('preflight unavailable');
        },
        navigate,
      }),
    ).resolves.toBe('fallback');
    expect(navigate).toHaveBeenCalledOnce();
  });
});
