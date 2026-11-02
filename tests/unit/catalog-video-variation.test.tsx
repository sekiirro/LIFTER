import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VideoVariationEditor } from '../../components/catalog/VideoVariationEditor';
import {
  buildVideoVariationRequest,
  isAllowedCatalogVideoUrl,
  resetVariationForWorkspace,
  validateVideoVariationDraft,
} from '../../lib/catalog/video-variation';

describe('workspace video variation UI (T023)', () => {
  const base = {
    workspaceId: 'workspace-selected',
    exerciseId: 'exercise-squat',
    videoUrl: 'https://youtu.be/abcdefghijk',
    note: '',
  };

  it('accepts only HTTPS YouTube or Google Drive hosts without credentials', () => {
    expect(isAllowedCatalogVideoUrl(base.videoUrl)).toBe(true);
    expect(
      isAllowedCatalogVideoUrl('https://drive.google.com/file/d/123'),
    ).toBe(true);
    for (const url of [
      'http://youtube.com/watch?v=1',
      'https://youtube.com.evil.example/watch?v=1',
      'https://evil.example/?next=youtube.com',
      'https://user:pass@youtube.com/watch?v=1',
      'https://m.youtube.com/watch?v=1',
    ])
      expect(isAllowedCatalogVideoUrl(url)).toBe(false);
  });

  it('requires an explicit workspace and valid content, and emits only selected mapping data', () => {
    expect(
      validateVideoVariationDraft({ ...base, workspaceId: '' }),
    ).toMatchObject({
      workspaceId: 'required',
    });
    expect(
      validateVideoVariationDraft({ ...base, videoUrl: 'https://evil.test' }),
    ).toMatchObject({
      videoUrl: 'host',
    });
    expect(buildVideoVariationRequest(base)).toEqual({
      video_url: 'https://youtu.be/abcdefghijk',
    });
    const markup = renderToStaticMarkup(
      createElement(VideoVariationEditor, {
        locale: 'en',
        workspaces: [{ id: base.workspaceId, label: 'Selected workspace' }],
        exercises: [{ id: base.exerciseId, label: 'Squat' }],
        mapping: { ...base, version: 1 },
      }),
    );
    expect(markup).toContain('Selected workspace');
    expect(markup).toContain('https://youtu.be/abcdefghijk');
    expect(markup).not.toContain('Foreign workspace');
    expect(markup).toContain('type="submit"');
  });

  it('clears the previous workspace mapping before switching selection', () => {
    expect(resetVariationForWorkspace('workspace-next')).toEqual({
      workspaceId: 'workspace-next',
      exerciseId: '',
      videoUrl: '',
      note: '',
    });
  });
});
