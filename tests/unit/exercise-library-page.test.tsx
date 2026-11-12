import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from '../../app/(app)/exercise-library/page';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  search: vi.fn(),
  workspaceLibrary: vi.fn(),
  cookies: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('../../lib/auth/actor', () => ({ requireActor: m.actor }));
vi.mock('../../lib/catalog/server', () => ({
  search: m.search,
  workspaceLibrary: m.workspaceLibrary,
}));
vi.mock('next/headers', () => ({ cookies: m.cookies }));
vi.mock('next/navigation', () => ({ notFound: m.notFound }));
vi.mock('../../app/(app)/exercise-library/ExerciseLibraryResults', () => ({
  ExerciseLibraryResults: (props: {
    items: readonly { names: { en: string } }[];
    workspaceId?: string | null;
    emptyActionHref?: string;
    nextHref: string | null;
  }) =>
    createElement(
      'div',
      {
        'data-testid': 'exercise-results',
        'data-workspace-id': props.workspaceId ?? '',
        'data-add-href': props.emptyActionHref ?? '',
        'data-next-href': props.nextHref ?? '',
      },
      props.items.map((item) => item.names.en).join(','),
    ),
}));

const ws = '22222222-2222-4222-8222-222222222222';
const workspaceCursor = (name: string, id: string) =>
  Buffer.from(`${name.toLowerCase()}\u001f${id}`, 'utf8').toString('hex');
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
  m.workspaceLibrary.mockResolvedValue({ status: 'ok', data: [] });
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

  it.each(['not-a-uuid', '22222222-2222-4222-8222-222222222222/extra'])(
    'denies malformed workspace input %s before search',
    async (workspace) => {
      await expect(
        Page({ searchParams: Promise.resolve({ workspace }) }),
      ).rejects.toThrow('404');
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

  it('uses the merged workspace read with one cursor for search, Add, and pagination', async () => {
    const pageRows = Array.from({ length: 21 }, (_, index) => ({
      ...exercise,
      result_id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`,
      result_kind: index === 0 ? 'private' : 'global',
      result_cursor: workspaceCursor(
        exercise.result_payload.name_en,
        `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`,
      ),
    }));
    m.workspaceLibrary.mockResolvedValue({ status: 'ok', data: pageRows });

    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({
          workspace: ws,
          q: 'press',
          muscle: 'chest',
          equipment: 'barbell',
        }),
      }),
    );

    expect(m.search).not.toHaveBeenCalled();
    expect(m.workspaceLibrary).toHaveBeenCalledWith({
      workspaceId: ws,
      query: 'press',
      filters: {
        primary_muscle_code: 'chest',
        equipment_codes: ['barbell'],
      },
      cursor: null,
      limit: 21,
    });
    expect(html).toContain(`data-workspace-id="${ws}"`);
    const cursor = workspaceCursor(
      exercise.result_payload.name_en,
      '33333333-3333-4333-8333-000000000020',
    );
    expect(html).toContain(
      `data-next-href="/exercise-library?q=press&amp;muscle=chest&amp;equipment=barbell&amp;workspace=${ws}&amp;cursor=${cursor}"`,
    );
    await Page({ searchParams: Promise.resolve({ workspace: ws, cursor }) });
    expect(m.workspaceLibrary).toHaveBeenLastCalledWith(
      expect.objectContaining({ workspaceId: ws, cursor }),
    );
    expect(html).toContain(
      `href="/exercise-library/new?scope=workspace&amp;workspace=${ws}"`,
    );
  });

  it('rejects malformed opaque workspace cursors before the read', async () => {
    await expect(
      Page({
        searchParams: Promise.resolve({
          workspace: ws,
          cursor: 'not-a-cursor',
        }),
      }),
    ).rejects.toThrow('404');
    expect(m.workspaceLibrary).not.toHaveBeenCalled();
  });

  it('uses the raw page count when an unmappable lookahead row is returned', async () => {
    const pageRows = Array.from({ length: 20 }, (_, index) => ({
      ...exercise,
      result_id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`,
    }));
    m.search.mockResolvedValue({
      status: 'ok',
      data: [
        ...pageRows,
        {
          result_id: '33333333-3333-4333-8333-000000000021',
          result_payload: { name_en: 'Unmappable lookahead row' },
        },
      ],
    });

    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain(
      'data-next-href="/exercise-library?cursor=33333333-3333-4333-8333-000000000020"',
    );
    expect(html.match(/Library test exercise/g)).toHaveLength(20);
  });
});
