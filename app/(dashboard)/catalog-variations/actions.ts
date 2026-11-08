'use server';

import {
  authoringWorkspaces,
  search,
  writeVariation,
  type CatalogResult,
} from '../../../lib/catalog/server';
import {
  buildVideoVariationRequest,
  validateVideoVariationDraft,
  type VideoVariationDraft,
} from '../../../lib/catalog/video-variation';
import { isUuid } from '../../../lib/catalog/uuid';

export type AuthoringWorkspacesResult = CatalogResult<
  { id: string; name: string }[]
>;

export async function loadCatalogAuthoringWorkspacesAction(): Promise<AuthoringWorkspacesResult> {
  return authoringWorkspaces();
}

export type VideoVariationLoadResult =
  | {
      status: 'ok';
      data: {
        workspaceId: string;
        exerciseId: string;
        videoUrl: string;
        note: string;
        version: number;
      }[];
    }
  | {
      status:
        'not_permitted' | 'unavailable' | 'invalid' | 'conflict' | 'limit';
    };

function isVideoVariationDraft(value: unknown): value is VideoVariationDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  return (
    isUuid(draft.workspaceId) &&
    isUuid(draft.exerciseId) &&
    typeof draft.videoUrl === 'string' &&
    typeof draft.note === 'string'
  );
}

export async function loadWorkspaceVideoVariationsAction(
  workspaceId: string,
  exerciseId?: string,
): Promise<VideoVariationLoadResult> {
  if (!isUuid(workspaceId) || (exerciseId !== undefined && !isUuid(exerciseId)))
    return { status: 'invalid' };
  const variationRows: unknown[] = [];
  let cursor: string | null = null;
  do {
    const page = await search({
      kind: 'variation',
      query: '',
      workspaceId,
      filters: { page_size: 50 },
      cursor,
    });
    if (page.status !== 'ok') return page;
    if (!Array.isArray(page.data)) return { status: 'unavailable' };
    variationRows.push(...page.data);
    if (
      exerciseId !== undefined &&
      page.data.some(
        (value) =>
          value !== null &&
          typeof value === 'object' &&
          (value as Record<string, unknown>).result_workspace_id ===
            workspaceId &&
          (value as Record<string, unknown>).result_id === exerciseId,
      )
    )
      break;
    const last = page.data.at(-1) as Record<string, unknown> | undefined;
    cursor =
      page.data.length === 50 && typeof last?.result_id === 'string'
        ? last.result_id
        : null;
  } while (cursor);
  const rows = variationRows.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    if (
      row.result_workspace_id !== workspaceId ||
      typeof row.result_id !== 'string' ||
      (exerciseId !== undefined && row.result_id !== exerciseId) ||
      typeof row.result_version !== 'number' ||
      !row.result_payload ||
      typeof row.result_payload !== 'object'
    )
      return [];
    const payload = row.result_payload as Record<string, unknown>;
    return [
      {
        workspaceId,
        exerciseId: row.result_id,
        version: row.result_version,
        videoUrl:
          typeof payload.video_url === 'string' ? payload.video_url : '',
        note: typeof payload.note === 'string' ? payload.note : '',
      },
    ];
  });
  return { status: 'ok', data: rows };
}

export async function saveVideoVariationAction(
  draft: VideoVariationDraft,
  expectedVersion: number | null,
  operationKey: string,
): Promise<CatalogResult> {
  if (
    !isVideoVariationDraft(draft) ||
    (expectedVersion !== null &&
      (typeof expectedVersion !== 'number' ||
        !Number.isInteger(expectedVersion))) ||
    !isUuid(operationKey)
  )
    return { status: 'invalid' };
  if (
    Object.keys(validateVideoVariationDraft(draft)).length ||
    (expectedVersion !== null && !Number.isInteger(expectedVersion))
  )
    return { status: 'invalid' };
  return writeVariation({
    operationKey,
    workspaceId: draft.workspaceId,
    id: draft.exerciseId,
    expectedVersion,
    request: buildVideoVariationRequest(draft),
  });
}
