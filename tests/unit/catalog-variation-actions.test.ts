import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadWorkspaceVideoVariationsAction,
  saveVideoVariationAction,
} from '../../app/(dashboard)/catalog-variations/actions';

const validWorkspaceId = '22222222-2222-4222-8222-222222222222';
const validExerciseId = '55555555-5555-4555-8555-555555555555';

const { writeVariation, search, exerciseOverrideVersion } = vi.hoisted(() => ({
  writeVariation: vi.fn(),
  search: vi.fn(),
  exerciseOverrideVersion: vi.fn(),
}));
vi.mock('../../lib/catalog/server', () => ({
  authoringWorkspaces: vi.fn(),
  search,
  writeVariation,
  exerciseOverrideVersion,
}));

describe('catalog variation actions', () => {
  beforeEach(() => {
    writeVariation.mockReset();
    search.mockReset();
    exerciseOverrideVersion.mockReset();
    writeVariation.mockResolvedValue({ status: 'ok', data: {} });
  });

  it('binds every write to the explicitly selected workspace and exercise', async () => {
    await saveVideoVariationAction(
      {
        workspaceId: validWorkspaceId,
        exerciseId: validExerciseId,
        videoUrl: 'https://youtu.be/abcdefghijk',
        note: 'Local mapping',
      },
      null,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(writeVariation).toHaveBeenCalledWith({
      operationKey: '11111111-1111-4111-8111-111111111111',
      workspaceId: validWorkspaceId,
      id: validExerciseId,
      expectedVersion: null,
      request: {
        video_url: 'https://youtu.be/abcdefghijk',
        note: 'Local mapping',
      },
    });
  });

  it.each([
    ['', 'Local note', { video_url: null, note: 'Local note' }],
    [
      'https://youtu.be/abcdefghijk',
      '   ',
      {
        video_url: 'https://youtu.be/abcdefghijk',
        note: null,
      },
    ],
  ])(
    'sends an explicitly blank variation field as a reset at the action boundary',
    async (videoUrl, note, request) => {
      await saveVideoVariationAction(
        {
          workspaceId: validWorkspaceId,
          exerciseId: validExerciseId,
          videoUrl,
          note,
        },
        3,
        '11111111-1111-4111-8111-111111111111',
      );

      expect(writeVariation).toHaveBeenCalledWith({
        operationKey: '11111111-1111-4111-8111-111111111111',
        workspaceId: validWorkspaceId,
        id: validExerciseId,
        expectedVersion: 3,
        request,
      });
    },
  );

  it('rejects an invalid host before the catalog wall call', async () => {
    const result = await saveVideoVariationAction(
      {
        workspaceId: validWorkspaceId,
        exerciseId: validExerciseId,
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
        workspaceId: validWorkspaceId,
        exerciseId: validExerciseId,
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
        workspaceId: validWorkspaceId,
        exerciseId: validExerciseId,
        videoUrl: 'https://youtu.be/abcdefghijk',
        note: 'Local mapping',
      },
      '1' as never,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result).toEqual({ status: 'invalid' });
    expect(writeVariation).not.toHaveBeenCalled();
  });

  it('returns invalid for malformed workspace/exercise ids', async () => {
    expect(
      await saveVideoVariationAction(
        {
          workspaceId: 'not-a-uuid',
          exerciseId: validExerciseId,
          videoUrl: 'https://youtu.be/abcdefghijk',
          note: '',
        },
        null,
        '11111111-1111-4111-8111-111111111111',
      ),
    ).toEqual({ status: 'invalid' });
    expect(
      await saveVideoVariationAction(
        {
          workspaceId: validWorkspaceId,
          exerciseId: 'not-a-uuid',
          videoUrl: 'https://youtu.be/abcdefghijk',
          note: '',
        },
        null,
        '11111111-1111-4111-8111-111111111111',
      ),
    ).toEqual({ status: 'invalid' });
    expect(
      await loadWorkspaceVideoVariationsAction(validWorkspaceId, 'not-a-uuid'),
    ).toEqual({ status: 'invalid' });
    expect(writeVariation).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it.each([null, 42, {}, 'not-a-uuid'])(
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
          result_id: validExerciseId,
          result_workspace_id: validWorkspaceId,
          result_version: 3,
          result_payload: {
            effective_fields: {
              video: { value: 'https://youtu.be/abcdefghijk' },
              notes: { value: 'Workspace note' },
            },
          },
        },
        {
          result_id: '44444444-4444-4444-8444-444444444444',
          result_workspace_id: '44444444-4444-4444-8444-444444444444',
          result_version: 1,
          result_payload: { video_url: 'https://drive.google.com/foreign' },
        },
      ],
    });
    expect(await loadWorkspaceVideoVariationsAction(validWorkspaceId)).toEqual({
      status: 'ok',
      data: [
        {
          workspaceId: validWorkspaceId,
          exerciseId: validExerciseId,
          version: 3,
          videoUrl: 'https://youtu.be/abcdefghijk',
          note: 'Workspace note',
        },
      ],
    });
    expect(search).toHaveBeenCalledWith({
      kind: 'variation',
      query: '',
      workspaceId: validWorkspaceId,
      filters: { page_size: 50 },
      cursor: null,
    });
  });

  it('stops paging after collecting the page with the requested exercise', async () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      result_id: `55555555-5555-4555-8555-5555555555${String(index).padStart(2, '0')}`,
      result_workspace_id: validWorkspaceId,
      result_version: 1,
      result_payload: { note: 'mapping' },
    }));
    search
      .mockResolvedValueOnce({ status: 'ok', data: rows })
      .mockResolvedValueOnce({ status: 'ok', data: [] });

    const result = await loadWorkspaceVideoVariationsAction(
      validWorkspaceId,
      '55555555-5555-4555-8555-555555555520',
    );

    expect(result.status).toBe('ok');
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('loads the current authorized override version when variation fields are hidden', async () => {
    search.mockResolvedValue({ status: 'ok', data: [] });
    exerciseOverrideVersion.mockResolvedValue({
      status: 'ok',
      data: { version: 4 },
    });

    await expect(
      loadWorkspaceVideoVariationsAction(validWorkspaceId, validExerciseId),
    ).resolves.toEqual({
      status: 'ok',
      data: [
        {
          workspaceId: validWorkspaceId,
          exerciseId: validExerciseId,
          videoUrl: '',
          note: '',
          version: 4,
        },
      ],
    });
    expect(exerciseOverrideVersion).toHaveBeenCalledWith({
      workspaceId: validWorkspaceId,
      exerciseId: validExerciseId,
    });
  });

  it('fails closed when the authorized version read denies the workspace', async () => {
    search.mockResolvedValue({ status: 'ok', data: [] });
    exerciseOverrideVersion.mockResolvedValue({ status: 'not_permitted' });

    await expect(
      loadWorkspaceVideoVariationsAction(validWorkspaceId, validExerciseId),
    ).resolves.toEqual({ status: 'not_permitted' });
  });
});
