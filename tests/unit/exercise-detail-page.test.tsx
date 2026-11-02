import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../../app/(app)/exercise-library/[exerciseId]/page';
import { en } from '../../lib/i18n/messages/en';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  detail: vi.fn(),
  workspaces: vi.fn(),
  cookies: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('../../lib/auth/actor', () => ({ requireActor: m.actor }));
vi.mock('../../lib/catalog/server', () => ({
  exerciseDetail: m.detail,
  authoringWorkspaces: m.workspaces,
}));
vi.mock('next/headers', () => ({ cookies: m.cookies }));
vi.mock('next/navigation', () => ({
  notFound: m.notFound,
  redirect: vi.fn(),
}));

const id = '33333333-3333-4333-8333-333333333333';
const workspaceId = '44444444-4444-4444-8444-444444444444';
const row = {
  exercise_id: id,
  version: 2,
  payload: {
    name_ar: 'تمرين التفاصيل',
    name_en: 'Detail exercise',
    primary_muscle_code: 'chest',
    secondary_muscle_codes: ['triceps'],
    equipment_codes: ['barbell'],
    defaults: {
      warmup_sets: 1,
      working_sets: 3,
      reps: { min: 8, max: 12 },
      rest_seconds: 90,
      rir: 2,
    },
  },
  created_at: '2026-11-02T12:00:00Z',
  created_by: null,
  origin_workspace_id: null,
  name_ar: 'تمرين التفاصيل',
  name_en: 'Detail exercise',
  requested_id: id,
  survivor_id: id,
  lifecycle_state: 'active',
  variation: {
    workspace_id: workspaceId,
    video_url: 'https://youtu.be/abcdefghijk',
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({
    userId: 'po',
    role: 'platform_owner',
    activeWorkspaceIds: [],
  });
  m.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
  m.workspaces.mockResolvedValue({
    status: 'ok',
    data: [{ id: workspaceId, name: 'North Studio' }],
  });
  m.detail.mockResolvedValue({ status: 'ok', data: [row] });
  m.notFound.mockImplementation(() => {
    throw new Error('404');
  });
});

describe('production exercise detail route', () => {
  it('shows the current version, lifecycle, exact defaults, and authorized variation', async () => {
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ exerciseId: id }),
        searchParams: Promise.resolve({ workspace: workspaceId }),
      }),
    );
    expect(html).toContain(en['catalog.detailTitle']);
    expect(html).toContain(en['catalog.editorLifecycleActive']);
    expect(html).toContain('Detail exercise');
    expect(html).toContain('data-current-version="2"');
    expect(html).toContain('https://youtu.be/abcdefghijk');
    expect(html).toContain('<bdi dir="ltr">8–12</bdi>');
    expect(m.detail).toHaveBeenCalledWith({ exerciseId: id, workspaceId });
  });

  it.each(['sales', 'client', null])(
    'returns the same 404 for %s',
    async (role) => {
      m.actor.mockResolvedValue({
        userId: 'reader',
        role,
        activeWorkspaceIds: [workspaceId],
      });
      await expect(
        Page({
          params: Promise.resolve({ exerciseId: id }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow('404');
      expect(m.detail).not.toHaveBeenCalled();
    },
  );

  it('does not disclose not-permitted detail and does not read an unauthorized workspace variation', async () => {
    m.actor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [workspaceId],
    });
    m.detail.mockResolvedValue({ status: 'not_permitted' });
    await expect(
      Page({
        params: Promise.resolve({ exerciseId: id }),
        searchParams: Promise.resolve({
          workspace: '55555555-5555-4555-8555-555555555555',
        }),
      }),
    ).rejects.toThrow('404');
    expect(m.detail).not.toHaveBeenCalled();
  });
});
