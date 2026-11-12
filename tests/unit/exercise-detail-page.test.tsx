import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../../app/(app)/exercise-library/[exerciseId]/page';
import EditPage from '../../app/(app)/exercise-library/[exerciseId]/edit/page';
import { en } from '../../lib/i18n/messages/en';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  detail: vi.fn(),
  workspaces: vi.fn(),
  alternatives: vi.fn(),
  pickerOptions: vi.fn(),
  overrideVersion: vi.fn(),
  cookies: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('../../lib/auth/actor', () => ({ requireActor: m.actor }));
vi.mock('../../lib/catalog/server', () => ({
  exerciseDetail: m.detail,
  authoringWorkspaces: m.workspaces,
  alternativeOptions: m.alternatives,
  alternativePickerOptions: m.pickerOptions,
  exerciseOverrideVersion: m.overrideVersion,
}));
vi.mock('../../components/catalog/ExerciseOverrideEditor', () => ({
  ExerciseOverrideEditor: (props: {
    workspaceId: string;
    expectedVersion: number;
  }) =>
    createElement('div', {
      'data-testid': 'override-editor',
      'data-workspace': props.workspaceId,
      'data-version': props.expectedVersion,
    }),
}));
vi.mock('../../app/(app)/exercise-library/ExerciseAuthoringForm', () => ({
  ExerciseAuthoringForm: (props: { equipmentCodes?: string[] }) =>
    createElement('div', {
      'data-testid': 'version-editor',
      'data-equipment-codes': props.equipmentCodes?.join(','),
    }),
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
    effective_fields: {
      name: {
        value: { name_ar: 'تمرين التفاصيل', name_en: 'Detail exercise' },
        source: 'canonical',
      },
      description: { value: null, source: 'none' },
      notes: { value: null, source: 'none' },
      video: { value: null, source: 'none' },
      alternatives: { value: [], source: 'none' },
      default_rest_time: { value: 90, source: 'canonical' },
      default_rir: { value: 2, source: 'canonical' },
      default_reps: { value: { min: 8, max: 12 }, source: 'canonical' },
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
  lifecycle_revision: 0,
  override_version: 5,
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
  m.alternatives.mockResolvedValue({ status: 'ok', data: [] });
  m.pickerOptions.mockResolvedValue({
    status: 'ok',
    data: { options: [], nextCursor: null },
  });
  m.overrideVersion.mockResolvedValue({ status: 'ok', data: { version: 0 } });
  m.notFound.mockImplementation(() => {
    throw new Error('404');
  });
});

describe('production exercise detail route', () => {
  it.each([
    'not-a-uuid',
    '55555555-5555-4555-8555-555555555555/extra',
    [
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666',
    ],
  ])(
    'returns the generic 404 for malformed workspace query %s before detail lookup',
    async (workspace) => {
      await expect(
        Page({
          params: Promise.resolve({ exerciseId: id }),
          searchParams: Promise.resolve({ workspace }),
        }),
      ).rejects.toThrow('404');
      expect(m.detail).not.toHaveBeenCalled();
    },
  );

  it('preserves an explicitly empty workspace query for platform-owner global detail', async () => {
    await Page({
      params: Promise.resolve({ exerciseId: id }),
      searchParams: Promise.resolve({ workspace: '' }),
    });
    expect(m.detail).toHaveBeenCalledWith({
      exerciseId: id,
      scope: 'global',
      workspaceId: null,
    });
  });

  it('uses the override version returned with the authorized detail snapshot', async () => {
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ exerciseId: id }),
        searchParams: Promise.resolve({ workspace: workspaceId }),
      }),
    );
    expect(html).toContain('data-testid="override-editor"');
    expect(html).toContain('data-version="5"');
    expect(m.overrideVersion).not.toHaveBeenCalled();
  });

  it('resolves private Alternative names in the selected workspace context', async () => {
    const privateAlternativeId = '77777777-7777-4777-8777-777777777777';
    m.detail.mockResolvedValue({
      status: 'ok',
      data: [
        {
          ...row,
          payload: {
            ...row.payload,
            effective_fields: {
              ...row.payload.effective_fields,
              alternatives: {
                value: [{ workspace_exercise_id: privateAlternativeId }],
                source: 'override',
              },
            },
          },
        },
      ],
    });
    m.pickerOptions.mockImplementation(
      async (input: { workspaceId: string | null }) => ({
        status: 'ok',
        data: {
          options:
            input.workspaceId === workspaceId
              ? [
                  {
                    id: privateAlternativeId,
                    kind: 'private',
                    names: { en: 'Workspace private alternative' },
                  },
                ]
              : [],
          nextCursor: null,
        },
      }),
    );

    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ exerciseId: id }),
        searchParams: Promise.resolve({ workspace: workspaceId }),
      }),
    );

    expect(html).toContain('Workspace private alternative');
    expect(m.pickerOptions).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId, excludeId: id }),
    );
  });

  it('uses the resolved canonical video when no workspace variation row exists', async () => {
    m.detail.mockResolvedValue({
      status: 'ok',
      data: [
        {
          ...row,
          variation: null,
          payload: {
            ...row.payload,
            video_url: 'https://youtu.be/canonical01',
            effective_fields: {
              ...row.payload.effective_fields,
              video: {
                value: 'https://youtu.be/canonical01',
                source: 'canonical',
              },
            },
          },
        },
      ],
    });
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ exerciseId: id }),
        searchParams: Promise.resolve({ workspace: workspaceId }),
      }),
    );
    expect(html).toContain('href="https://youtu.be/canonical01"');
  });

  it('T092 FR-024 shows the checked private video from a workspace-private detail payload', async () => {
    m.detail.mockResolvedValue({
      status: 'ok',
      data: [
        {
          ...row,
          origin_workspace_id: null,
          variation: null,
          payload: {
            ...row.payload,
            video_url: 'https://youtu.be/private01',
            effective_fields: undefined,
          },
        },
      ],
    });

    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ exerciseId: id }),
        searchParams: Promise.resolve({ workspace: workspaceId }),
      }),
    );

    expect(html).toContain('href="https://youtu.be/private01"');
  });

  it('does not render an unresolved raw Video URL', async () => {
    m.detail.mockResolvedValue({
      status: 'ok',
      data: [
        {
          ...row,
          variation: null,
          payload: {
            ...row.payload,
            video_url: 'https://disallowed.example/private',
            effective_fields: {
              ...row.payload.effective_fields,
              video: { value: null, source: 'none' },
            },
          },
        },
      ],
    });
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ exerciseId: id }),
        searchParams: Promise.resolve({ workspace: workspaceId }),
      }),
    );
    expect(html).not.toContain('href="https://disallowed.example/private"');
  });

  it('shows the empty workspace choice only for platform-owner global detail', async () => {
    const globalHtml = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ exerciseId: id }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(globalHtml).toContain(
      `<option value="" selected="">${en['catalog.editorNone']}</option>`,
    );

    const workspaceHtml = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ exerciseId: id }),
        searchParams: Promise.resolve({
          scope: 'workspace',
          workspace: workspaceId,
        }),
      }),
    );
    expect(workspaceHtml).toContain(
      '<input type="hidden" name="scope" value="workspace"/>',
    );
    expect(workspaceHtml).not.toContain(
      `<option value="">${en['catalog.editorNone']}</option>`,
    );
  });

  it('shows the current version, lifecycle, exact defaults, and authorized variation', async () => {
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ exerciseId: id }),
        searchParams: Promise.resolve({ workspace: workspaceId }),
      }),
    );
    expect(html).toContain(en['catalog.detailTitle']);
    expect(html).toContain(en['catalog.editorLifecycleActive']);
    expect(html).not.toContain(en['catalog.editorRestore']);
    expect(html).not.toContain(en['catalog.editorMerge']);
    expect(html).toContain('Detail exercise');
    expect(html).toContain('data-current-version="2"');
    expect(html).toContain('https://youtu.be/abcdefghijk');
    expect(html).toContain('<bdi dir="ltr">8–12</bdi>');
    expect(m.detail).toHaveBeenCalledWith({
      exerciseId: id,
      scope: 'global',
      workspaceId,
    });
    expect(html).toContain(en['catalog.editorRemove']);
  });

  it('loads workspace detail in explicit tenant scope and exposes Remove to own workspace staff', async () => {
    m.actor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [workspaceId],
    });
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ exerciseId: id }),
        searchParams: Promise.resolve({
          scope: 'workspace',
          workspace: workspaceId,
        }),
      }),
    );
    expect(m.detail).toHaveBeenCalledWith({
      exerciseId: id,
      scope: 'workspace',
      workspaceId,
    });
    expect(html).toContain(en['catalog.editorRemove']);
  });

  it.each(['platform_owner', 'workspace_owner'] as const)(
    'exposes workspace Remove to %s for an explicitly selected workspace',
    async (role) => {
      m.actor.mockResolvedValue({
        userId: role,
        role,
        activeWorkspaceIds: role === 'platform_owner' ? [] : [workspaceId],
      });
      const html = renderToStaticMarkup(
        await Page({
          params: Promise.resolve({ exerciseId: id }),
          searchParams: Promise.resolve({
            scope: 'workspace',
            workspace: workspaceId,
          }),
        }),
      );
      expect(html).toContain(en['catalog.editorRemove']);
    },
  );

  it('does not show global Remove to workspace staff', async () => {
    m.actor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [workspaceId],
    });
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ exerciseId: id }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(html).not.toContain(en['catalog.editorRemove']);
  });

  it('uses localized fallback text instead of exposing a workspace id', async () => {
    m.workspaces.mockResolvedValue({ status: 'ok', data: [] });
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ exerciseId: id }),
        searchParams: Promise.resolve({ workspace: workspaceId }),
      }),
    );
    expect(html).toContain(en['catalog.editorWorkspace']);
    expect(html).not.toContain(`>${workspaceId}</option>`);
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

describe('edit as a new immutable version', () => {
  it('loads the current version into the PO version action with compare-and-swap', async () => {
    const html = renderToStaticMarkup(
      await EditPage({ params: Promise.resolve({ exerciseId: id }) }),
    );
    expect(html).toContain(en['catalog.editAsNewVersion']);
    expect(html).toContain('Detail exercise');
    expect(m.detail).toHaveBeenCalledWith({ exerciseId: id });
    expect(html).toContain('data-testid="version-editor"');
  });

  it('passes all existing equipment codes into the new version editor', async () => {
    m.detail.mockResolvedValueOnce({
      status: 'ok',
      data: [
        {
          ...row,
          payload: { ...row.payload, equipment_codes: ['barbell', 'cable'] },
        },
      ],
    });
    const html = renderToStaticMarkup(
      await EditPage({ params: Promise.resolve({ exerciseId: id }) }),
    );
    expect(html).toContain('data-equipment-codes="barbell,cable"');
  });

  it('hides the version editor from non-PO roles', async () => {
    m.actor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [workspaceId],
    });
    await expect(
      EditPage({ params: Promise.resolve({ exerciseId: id }) }),
    ).rejects.toThrow('404');
    expect(m.detail).not.toHaveBeenCalled();
  });
});
