import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadWorkspaceVideoVariationsAction,
  saveVideoVariationAction,
} from '../../app/(dashboard)/catalog-variations/actions';

const { writeVariation, search } = vi.hoisted(() => ({
  writeVariation: vi.fn(),
  search: vi.fn(),
}));
vi.mock('../../lib/catalog/server', () => ({
  authoringWorkspaces: vi.fn(),
  search,
  writeVariation,
}));

describe('catalog variation actions', () => {
  beforeEach(() => {
    writeVariation.mockReset();
    search.mockReset();
    writeVariation.mockResolvedValue({ status: 'ok', data: {} });
  });

  it('binds every write to the explicitly selected workspace and exercise', async () => {
    await saveVideoVariationAction(
      {
        workspaceId: 'workspace-selected',
        exerciseId: 'exercise-global',
        videoUrl: 'https://youtu.be/abcdefghijk',
        note: 'Local mapping',
      },
      null,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(writeVariation).toHaveBeenCalledWith({
      operationKey: '11111111-1111-4111-8111-111111111111',
      workspaceId: 'workspace-selected',
      id: 'exercise-global',
      expectedVersion: null,
      request: {
        video_url: 'https://youtu.be/abcdefghijk',
        note: 'Local mapping',
      },
    });
  });

  it('rejects an invalid host before the catalog wall call', async () => {
    const result = await saveVideoVariationAction(
      {
        workspaceId: 'workspace-selected',
        exerciseId: 'exercise-global',
        videoUrl: 'https://youtube.com.evil.example/watch',
        note: '',
      },
      null,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result).toEqual({ status: 'invalid' });
    expect(writeVariation).not.toHaveBeenCalled();
  });

  it.each([
    ['null draft', null],
    ['missing draft', {}],
    ['non-string workspace id', { workspaceId: null }],
    [
      'non-string exercise id',
      { workspaceId: 'workspace-selected', exerciseId: 7 },
    ],
    [
      'non-string video url',
      {
        workspaceId: 'workspace-selected',
        exerciseId: 'exercise-global',
        videoUrl: {},
        note: '',
      },
    ],
    [
      'non-string note',
      {
        workspaceId: 'workspace-selected',
        exerciseId: 'exercise-global',
        videoUrl: '',
        note: null,
      },
    ],
  ])(
    'returns invalid for a malformed %s without throwing',
    async (_case, draft) => {
      await expect(
        saveVideoVariationAction(
          draft as never,
          null,
          '11111111-1111-4111-8111-111111111111',
        ),
      ).resolves.toEqual({ status: 'invalid' });
      expect(writeVariation).not.toHaveBeenCalled();
    },
  );

  it('returns invalid for a non-string operation key', async () => {
    const result = await saveVideoVariationAction(
      {
        workspaceId: 'workspace-selected',
        exerciseId: 'exercise-global',
        videoUrl: 'https://youtu.be/abcdefghijk',
        note: 'Local mapping',
      },
      null,
      42 as never,
    );
    expect(result).toEqual({ status: 'invalid' });
    expect(writeVariation).not.toHaveBeenCalled();
  });

  it('returns invalid for a non-number expected version', async () => {
    const result = await saveVideoVariationAction(
      {
        workspaceId: 'workspace-selected',
        exerciseId: 'exercise-global',
        videoUrl: 'https://youtu.be/abcdefghijk',
        note: 'Local mapping',
      },
      '1' as never,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result).toEqual({ status: 'invalid' });
    expect(writeVariation).not.toHaveBeenCalled();
  });

  it.each([null, 42, {}])(
    'returns invalid for malformed workspace load arguments (%s)',
    async (workspaceId) => {
      await expect(
        loadWorkspaceVideoVariationsAction(workspaceId as never),
      ).resolves.toEqual({ status: 'invalid' });
      expect(search).not.toHaveBeenCalled();
    },
  );

  it('loads only the explicit selected workspace and filters mismatched projections', async () => {
    search.mockResolvedValue({
      status: 'ok',
      data: [
        {
          result_id: 'exercise-global',
          result_workspace_id: 'workspace-selected',
          result_version: 3,
          result_payload: { video_url: 'https://youtu.be/abcdefghijk' },
        },
        {
          result_id: 'exercise-foreign',
          result_workspace_id: 'workspace-foreign',
          result_version: 1,
          result_payload: { video_url: 'https://drive.google.com/foreign' },
        },
      ],
    });
    expect(
      await loadWorkspaceVideoVariationsAction('workspace-selected'),
    ).toEqual({
      status: 'ok',
      data: [
        {
          workspaceId: 'workspace-selected',
          exerciseId: 'exercise-global',
          version: 3,
          videoUrl: 'https://youtu.be/abcdefghijk',
          note: '',
        },
      ],
    });
    expect(search).toHaveBeenCalledWith({
      kind: 'variation',
      query: '',
      workspaceId: 'workspace-selected',
      filters: { page_size: 50 },
      cursor: null,
    });
  });

  it('stops paging after collecting the page with the requested exercise', async () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      result_id: `exercise-${String(index).padStart(2, '0')}`,
      result_workspace_id: 'workspace-selected',
      result_version: 1,
      result_payload: { note: 'mapping' },
    }));
    search
      .mockResolvedValueOnce({ status: 'ok', data: rows })
      .mockResolvedValueOnce({ status: 'ok', data: [] });

    const result = await loadWorkspaceVideoVariationsAction(
      'workspace-selected',
      'exercise-20',
    );

    expect(result.status).toBe('ok');
    expect(search).toHaveBeenCalledTimes(1);
  });
});
