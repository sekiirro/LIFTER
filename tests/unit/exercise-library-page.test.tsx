import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from '../../app/(app)/exercise-library/page';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  search: vi.fn(),
  cookies: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('../../lib/auth/actor', () => ({ requireActor: m.actor }));
vi.mock('../../lib/catalog/server', () => ({ search: m.search }));
vi.mock('next/headers', () => ({ cookies: m.cookies }));
vi.mock('next/navigation', () => ({ notFound: m.notFound }));
vi.mock('../../app/(app)/exercise-library/ExerciseLibraryResults', () => ({
  ExerciseLibraryResults: (props: {
    items: readonly { names: { en: string } }[];
  }) =>
    createElement(
      'div',
      { 'data-testid': 'exercise-results' },
      props.items.map((item) => item.names.en).join(','),
    ),
}));

const ws = '22222222-2222-4222-8222-222222222222';
const exercise = {
  result_id: '33333333-3333-4333-8333-333333333333',
  result_payload: {
    name_ar: 'تمرين اختبار',
    name_en: 'Library test exercise',
    primary_muscle_code: 'chest',
    secondary_muscle_codes: ['triceps'],
    equipment_codes: ['barbell'],
    defaults: { working_sets: 3, reps: { min: 8, max: 12 }, rest_seconds: 90 },
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({
    userId: ws,
    role: 'platform_owner',
    activeWorkspaceIds: [],
  });
  m.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
  m.notFound.mockImplementation(() => {
    throw new Error('404');
  });
  m.search.mockResolvedValue({ status: 'ok', data: [exercise] });
});

describe('production exercise library route', () => {
  it.each(['sales', 'client', null])(
    'denies %s with generic 404 before search',
    async (role) => {
      m.actor.mockResolvedValue({ userId: ws, role, activeWorkspaceIds: [ws] });
      await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        '404',
      );
      expect(m.search).not.toHaveBeenCalled();
    },
  );

  it('uses only the authenticated catalog search wall with a bounded page', async () => {
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({
          q: 'press',
          muscle: 'chest',
          equipment: 'barbell',
        }),
      }),
    );
    expect(html).toContain('Library test exercise');
    expect(html).not.toContain('Barbell Bench Press');
    expect(m.search).toHaveBeenCalledWith({
      kind: 'exercise',
      query: 'press',
      filters: {
        primary_muscle_code: 'chest',
        equipment_codes: ['barbell'],
        page_size: 21,
      },
      cursor: null,
    });
  });

  it('provides a manual Add action for an authorized empty global library', async () => {
    m.search.mockResolvedValue({ status: 'ok', data: [] });
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain('href="/exercise-library/new"');
    expect(html).not.toContain('Barbell Bench Press');
  });
});
