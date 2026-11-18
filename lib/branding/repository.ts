import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BrandingServiceError,
  type BrandingDraft,
  type BrandingDraftAsset,
  type BrandingRepository,
  type BrandingVersion,
  type PublishRepositoryResult,
} from './service';
import {
  fromPersistedBrandingFields,
  toPersistedBrandingFields,
} from './rpc-contract';
import {
  BrandingValidationError,
  type NormalizedBrandingDraft,
} from './validation';

type ReadResult = {
  workspace_id: string;
  revision: number;
  fields: unknown;
  current_publication: null | { sequence: number; fields: unknown };
};

function readResult(value: unknown): ReadResult {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as ReadResult).workspace_id !== 'string' ||
    !Number.isSafeInteger((value as ReadResult).revision)
  )
    throw new Error('Invalid branding RPC response');
  return value as ReadResult;
}

function hasPersistedName(fields: unknown): boolean {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields))
    return false;
  const name = (fields as { name?: unknown }).name;
  if (!name || typeof name !== 'object' || Array.isArray(name)) return false;
  return ['ar', 'en'].some((locale) => {
    const text = (name as Record<string, unknown>)[locale];
    return typeof text === 'string' && text.trim().length > 0;
  });
}

function asDraft(result: ReadResult): BrandingDraft | null {
  if (!hasPersistedName(result.fields) && result.revision === 0) return null;
  const rawFields = result.fields as Record<string, unknown>;
  const assets: Partial<Record<'logo' | 'banner', BrandingDraftAsset>> = {};
  for (const role of ['logo', 'banner'] as const) {
    const value = rawFields[role];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const asset = value as Record<string, unknown>;
    if (
      asset.bucket === 'branding-validated' &&
      typeof asset.object === 'string' &&
      (asset.content_type === 'image/png' ||
        asset.content_type === 'image/webp') &&
      Number.isSafeInteger(asset.byte_size) &&
      (asset.byte_size as number) > 0
    )
      assets[role] = {
        thumbnailUrl: `/api/branding/draft-image?workspace=${encodeURIComponent(result.workspace_id)}&role=${role}&v=${result.revision}`,
        bucket: 'branding-validated',
        object: asset.object,
        contentType: asset.content_type,
        byteSize: asset.byte_size as number,
      };
  }
  const persisted = {
    name: rawFields.name,
    bannerAlt: rawFields.bannerAlt,
    color: rawFields.color,
  };
  return {
    workspaceId: result.workspace_id,
    revision: result.revision,
    fields: fromPersistedBrandingFields(persisted),
    assets,
  };
}

function asVersion(
  workspaceId: string,
  value: ReadResult['current_publication'],
): BrandingVersion | null {
  return value
    ? {
        workspaceId,
        sequence: value.sequence,
        fields: fromPersistedBrandingFields(value.fields),
      }
    : null;
}

function throwRpcError(error: { code?: string; message: string }): never {
  if (error.code === '40001') {
    throw new BrandingServiceError('Draft revision is stale', 'stale_revision');
  }
  if (error.code === '42501') {
    throw new BrandingServiceError('Branding access denied', 'denied');
  }
  if (error.code === '22023') {
    throw new BrandingValidationError('Branding fields are invalid');
  }
  throw new Error('Branding operation failed');
}

/** The client passed here must be the caller's authenticated session client. */
export function createSupabaseBrandingRepository(
  client: SupabaseClient,
  readSignal?: AbortSignal,
): BrandingRepository {
  async function read(workspaceId: string): Promise<ReadResult> {
    let request = client.rpc('branding_draft_read', {
      workspace_id: workspaceId,
    });
    if (readSignal) request = request.abortSignal(readSignal);
    const { data, error } = await request;
    if (error) throwRpcError(error);
    return readResult(data);
  }
  return {
    async getDraft(workspaceId) {
      return asDraft(await read(workspaceId));
    },
    async compareAndSetDraft(
      workspaceId,
      expectedRevision,
      fields: NormalizedBrandingDraft,
    ) {
      const { data, error } = await client.rpc('branding_draft_save', {
        workspace_id: workspaceId,
        expected_revision: expectedRevision,
        fields: toPersistedBrandingFields(fields),
      });
      if (error) throwRpcError(error);
      const result = await read(workspaceId);
      if (result.revision !== data)
        throw new BrandingServiceError(
          'Draft revision is stale',
          'stale_revision',
        );
      return asDraft(result);
    },
    async getCurrentPublication(workspaceId) {
      return asVersion(
        workspaceId,
        (await read(workspaceId)).current_publication,
      );
    },
    async publishDraftCAS(
      workspaceId,
      expectedRevision,
    ): Promise<PublishRepositoryResult> {
      const before = await read(workspaceId);
      if (before.revision !== expectedRevision) return { status: 'stale' };
      const { error } = await client.rpc('branding_publish', {
        workspace_id: workspaceId,
        expected_revision: expectedRevision,
      });
      if (error?.code === '40001') return { status: 'stale' };
      if (error) throwRpcError(error);
      const current = asVersion(
        workspaceId,
        (await read(workspaceId)).current_publication,
      );
      if (!current)
        throw new Error('Branding publication missing after publish');
      const previous = asVersion(workspaceId, before.current_publication);
      return previous && previous.sequence === current.sequence
        ? { status: 'unchanged', current }
        : { status: 'published', current };
    },
  };
}

export type BrandingUploadRepository = {
  beginUpload(
    workspaceId: string,
    role: 'logo' | 'banner',
    expectedRevision: number,
  ): Promise<string>;
  attachUpload(uploadId: string, expectedRevision: number): Promise<number>;
};

export function createSupabaseBrandingUploadRepository(
  client: SupabaseClient,
): BrandingUploadRepository {
  return {
    async beginUpload(workspaceId, role, expectedRevision) {
      const { data, error } = await client.rpc('branding_upload_begin', {
        workspace_id: workspaceId,
        role,
        expected_revision: expectedRevision,
      });
      if (error) throwRpcError(error);
      if (typeof data !== 'string')
        throw new Error('Invalid branding upload response');
      return data;
    },
    async attachUpload(uploadId, expectedRevision) {
      const { data, error } = await client.rpc('branding_asset_attach', {
        upload_id: uploadId,
        expected_revision: expectedRevision,
      });
      if (error) throwRpcError(error);
      if (typeof data !== 'number')
        throw new Error('Invalid branding attachment response');
      return data;
    },
  };
}
