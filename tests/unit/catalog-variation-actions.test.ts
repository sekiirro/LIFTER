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
    });
  });
});
