import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from '../../app/(app)/exercise-library/new/page';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  authoringWorkspaces: vi.fn(),
  cookies: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('../../lib/auth/actor', () => ({ requireActor: m.actor }));
vi.mock('../../lib/catalog/server', () => ({
  authoringWorkspaces: m.authoringWorkspaces,
}));
vi.mock('next/headers', () => ({ cookies: m.cookies }));
vi.mock('next/navigation', () => ({ notFound: m.notFound }));
vi.mock('../../app/(app)/exercise-library/ExerciseAuthoringForm', () => ({
  ExerciseAuthoringForm: (props: {
    role: string;
    scope: string;
    workspaceId: string | null;
  }) =>
    createElement('div', {
      'data-role': props.role,
      'data-scope': props.scope,
      'data-workspace': props.workspaceId,
    }),
}));

const workspaces = [
  { id: '22222222-2222-4222-8222-222222222222', name: 'Authorized workspace' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Foreign workspace' },
];

beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({
    userId: 'actor',
    role: 'platform_owner',
    activeWorkspaceIds: [],
  });
  m.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
  m.notFound.mockImplementation(() => {
    throw new Error('404');
  });
  m.authoringWorkspaces.mockResolvedValue({ status: 'ok', data: workspaces });
});

describe('production Add Exercise route', () => {
  it.each(['sales', 'client', null])(
    'denies %s with the generic 404 before workspace lookup',
    async (role) => {
      m.actor.mockResolvedValue({
        userId: 'reader',
        role,
        activeWorkspaceIds: [],
      });
      await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        '404',
      );
      expect(m.authoringWorkspaces).not.toHaveBeenCalled();
    },
  );

  it.each(['workspace_owner', 'trainer'] as const)(
    'forces %s to its authorized workspace scope',
    async (role) => {
      m.actor.mockResolvedValue({
        userId: 'staff',
        role,
        activeWorkspaceIds: [workspaces[0]!.id],
      });
      const html = renderToStaticMarkup(
        await Page({
          searchParams: Promise.resolve({
            scope: 'global',
            workspace: workspaces[1]!.id,
          }),
        }),
      );
      expect(html).toContain('data-role="' + role + '"');
      expect(html).toContain('data-scope="workspace"');
      expect(html).toContain('data-workspace="' + workspaces[0]!.id + '"');
      expect(html).not.toContain('Global library');
    },
  );

  it('allows the PO to choose global or a listed workspace scope', async () => {
    const global = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );
    expect(global).toContain('data-role="po"');
    expect(global).toContain('data-scope="global"');
    const workspace = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({
          scope: 'workspace',
          workspace: workspaces[1]!.id,
        }),
      }),
    );
    expect(workspace).toContain('data-workspace="' + workspaces[1]!.id + '"');
  });
});
