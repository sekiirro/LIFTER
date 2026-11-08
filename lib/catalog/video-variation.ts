import { MAX_CATALOG_NOTE_LENGTH } from './schemas';

export type VideoVariationDraft = {
  workspaceId: string;
  exerciseId: string;
  videoUrl: string;
  note: string;
};

export type VideoVariationErrors = Partial<
  Record<'workspaceId' | 'exerciseId' | 'videoUrl' | 'content', string>
>;

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'drive.google.com',
  'docs.google.com',
]);

export function isAllowedCatalogVideoUrl(value: string): boolean {
  try {
    const normalized = value.trim();
    const url = new URL(normalized);
    return (
      url.protocol === 'https:' &&
      !url.port &&
      !url.username &&
      !url.password &&
      ALLOWED_HOSTS.has(url.hostname.toLowerCase()) &&
      !/^https:\/\/[^/?#]+[?#]/i.test(normalized)
    );
  } catch {
    return false;
  }
}

export function validateVideoVariationDraft(
  draft: VideoVariationDraft,
): VideoVariationErrors {
  const errors: VideoVariationErrors = {};
  if (!draft.workspaceId.trim()) errors.workspaceId = 'required';
  if (!draft.exerciseId.trim()) errors.exerciseId = 'required';
  if (draft.videoUrl.trim() && !isAllowedCatalogVideoUrl(draft.videoUrl))
    errors.videoUrl = 'host';
  if (!draft.videoUrl.trim() && !draft.note.trim()) errors.content = 'required';
  if (Array.from(draft.note.trim()).length > MAX_CATALOG_NOTE_LENGTH)
    errors.content = 'too_long';
  return errors;
}

export function buildVideoVariationRequest(draft: VideoVariationDraft) {
  const url = draft.videoUrl.trim();
  const note = draft.note.trim();
  return {
    ...(url ? { video_url: url } : {}),
    ...(note ? { note } : {}),
  };
}

export function resetVariationForWorkspace(workspaceId: string) {
  return { workspaceId, exerciseId: '', videoUrl: '', note: '' };
}
