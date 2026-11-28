import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  cookies: vi.fn(),
  client: vi.fn(),
  from: vi.fn(),
  quality: vi.fn(),
  report: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ requireActor: mocks.actor }));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.client,
}));
vi.mock('../../lib/workforce/quality-server', () => ({
  getMonthlyQuality: mocks.quality,
}));
vi.mock('../../lib/workforce/report', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/workforce/report')>()),
  fetchWorkforceReport: mocks.report,
}));
vi.mock('../../app/(app)/workforce/quality/actions', () => ({
  recordMonthlyQualityAction: vi.fn(),
}));

import Page from '../../app/(app)/workforce/quality/page';
import { en } from '../../lib/i18n/messages/en';
import { ar } from '../../lib/i18n/messages/ar';

const workspaceId = '11111111-1111-1111-1111-111111111111';
const trainerId = '22222222-2222-2222-2222-222222222222';
const trainer = {
  staff_user_id: trainerId,
  role: 'trainer',
  display_name: 'Trainer A',
  points: '0.00',
  is_negative: false,
};

async function renderPage(
  search: Record<string, string | string[]> = {},
  locale: 'en' | 'ar' = 'en',
) {
  mocks.cookies.mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: locale }),
  });
  return renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve(search) }),
  );
}

describe('Monthly quality page authorization and data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
    mocks.actor.mockResolvedValue({
      userId: '55555555-5555-5555-5555-555555555555',
      role: 'platform_owner',
      activeWorkspaceIds: [],
    });
    mocks.client.mockResolvedValue({ from: mocks.from });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [{ id: workspaceId, name: 'Workspace A' }],
          error: null,
        }),
      }),
    });
    mocks.report.mockResolvedValue({
      status: 'ok',
      data: { is_closed: false, trainers: [trainer] },
    });
    mocks.quality.mockResolvedValue({
      status: 'ok',
      effective: [],
      revisions: [],
    });
  });

  it.each(['workspace_owner', 'trainer', 'sales', null])(
    'uses the non-disclosing PO-only notFound path for %s',
    async (role) => {
      mocks.actor.mockResolvedValue(
        role ? { userId: 'u', role, activeWorkspaceIds: [] } : null,
      );
      await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
      expect(mocks.client).not.toHaveBeenCalled();
      expect(mocks.quality).not.toHaveBeenCalled();
      expect(mocks.report).not.toHaveBeenCalled();
    },
  );

  it('renders the EN screen and loads existing report/quality RPCs', async () => {
    const html = await renderPage({
      workspace: workspaceId,
      trainer: trainerId,
      month: '2026-11',
    });
    expect(html).toContain(en['workforce.quality.title']);
    expect(html).toContain('Trainer A');
    expect(html).toContain(en['workforce.quality.revision.history.empty']);
    expect(mocks.report).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      '2026-11',
    );
    expect(mocks.quality).toHaveBeenCalledWith(workspaceId, '2026-11');
  });

  it('renders the AR screen from the locale cookie', async () => {
    const html = await renderPage({}, 'ar');
    expect(html).toContain(ar['workforce.quality.title']);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain(ar['workforce.quality.revision.history.empty']);
  });

  it('rejects a foreign workspace without loading its data', async () => {
    await expect(
      renderPage({ workspace: '99999999-9999-9999-9999-999999999999' }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.quality).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('renders generic empty and error states without inventing copy', async () => {
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    expect(await renderPage()).toContain(en['states.empty.title']);

    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [{ id: workspaceId, name: 'Workspace A' }],
          error: null,
        }),
      }),
    });
    mocks.quality.mockResolvedValue({ status: 'error' });
    const errorHtml = await renderPage();
    expect(errorHtml).toContain(en['states.error.title']);
    expect(errorHtml).toContain(en['states.retry']);
  });

  it('treats an empty Trainer query as the first Trainer after workspace changes', async () => {
    const html = await renderPage({
      workspace: workspaceId,
      trainer: '',
      month: '2026-11',
    });
    expect(html).toContain('Trainer A');
    expect(html).toContain('data-testid="quality-form"');
  });

  it('renders an empty state when the workspace has no Trainers', async () => {
    mocks.report.mockResolvedValue({
      status: 'ok',
      data: { is_closed: false, trainers: [] },
    });
    const html = await renderPage();
    expect(html).toContain(en['states.empty.title']);
    expect(html).not.toContain('data-testid="quality-form"');
  });

  it('passes finalized state to the read-only form', async () => {
    mocks.report.mockResolvedValue({
      status: 'ok',
      data: { is_closed: true, trainers: [trainer] },
    });
    const html = await renderPage();
    expect(html).toContain(en['workforce.finalize.alreadyFinalized']);
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });
});
