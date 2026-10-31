'use server';

import { createClient } from '@supabase/supabase-js';
import { authorize } from '../../../lib/auth/authorize';
import { loadActorRows } from '../../../lib/auth/actor';
import { createSupabaseBrandingUploadRepository } from '../../../lib/branding/repository';
import type {
  BrandingAssetActionResult,
  BrandingAssetRole,
  BrandingUploadErrorCode,
} from '../../../lib/branding/client-contract';
import {
  BRANDING_IMAGE_LIMITS,
  validateBrandingImage,
} from '../../../lib/branding/image-validation';
import { brandingValidatedObjectName } from '../../../lib/branding/object-path';
import { createBrandingUploadService } from '../../../lib/branding/upload-service';
import { isUuid } from '../../../lib/registration-links/validation';
import { readBrandingCredential } from '../../../lib/branding/credentials';
import { isSecureUrl } from '../../../lib/supabase/env';
import { createSessionClient } from '../../../lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

type AssetInput = {
  workspaceId: string;
  expectedRevision: number;
  assetRole: BrandingAssetRole;
};
type UploadInput = AssetInput & { file: File; identityOnlyConfirmed: boolean };

function errorCode(error: unknown): BrandingUploadErrorCode {
  const code = (error as { code?: string } | null)?.code;
  if (code === '40001' || code === 'stale_revision') return 'stale_revision';
  if (code === '42501' || code === 'denied' || code === 'forbidden')
    return 'forbidden';
  return 'server_error';
}

function failure(code: BrandingUploadErrorCode): BrandingAssetActionResult {
  return { ok: false, code };
}

function authorizedInput(input: unknown): input is AssetInput {
  if (!input || typeof input !== 'object') return false;
  const value = input as Partial<AssetInput>;
  return (
    isUuid(value.workspaceId) &&
    Number.isSafeInteger(value.expectedRevision) &&
    (value.expectedRevision as number) >= 0 &&
    (value.assetRole === 'logo' || value.assetRole === 'banner')
  );
}

async function ownerClient(workspaceId: string) {
  const client = await createSessionClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const actor = await loadActorRows(client, data.user.id);
  if (!actor || !authorize(actor, 'manage_branding', workspaceId)) return null;
  return client;
}

function codedError(code: string): Error & { code: string } {
  return Object.assign(new Error('Branding operation failed'), { code });
}

function storageFailureCode(error: unknown): 'forbidden' | 'interrupted' {
  const value = error as { code?: unknown; statusCode?: unknown } | null;
  return value?.code === '42501' || value?.statusCode === '403'
    ? 'forbidden'
    : 'interrupted';
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  );
}

export async function uploadBrandingAsset(
  input: UploadInput,
): Promise<BrandingAssetActionResult> {
  if (
    !authorizedInput(input) ||
    typeof File === 'undefined' ||
    !(input as UploadInput).file ||
    !((input as UploadInput).file instanceof File)
  )
    return failure('invalid_type');
  const uploadInput = input as UploadInput;
  if (
    uploadInput.assetRole === 'banner' &&
    uploadInput.identityOnlyConfirmed !== true
  )
    return failure('forbidden');
  if (
    uploadInput.file.size >
    BRANDING_IMAGE_LIMITS[uploadInput.assetRole].maxIngressBytes
  )
    return failure('too_large');

  let session: SupabaseClient | null = null;
  let validator: SupabaseClient | null = null;
  const requireSession = () => {
    if (!session) throw codedError('forbidden');
    return session;
  };
  const requireValidator = () => {
    if (validator) return validator;
    const jwt = readBrandingCredential('branding_validator');
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!jwt || !url || !anonKey || !isSecureUrl(url))
      throw codedError('server_error');
    validator = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    return validator;
  };

  const service = createBrandingUploadService({
    authorize: async (workspaceId) => {
      try {
        session = await ownerClient(workspaceId);
        return session !== null;
      } catch {
        return false;
      }
    },
    beginUpload: async (workspaceId, role, expectedRevision) =>
      createSupabaseBrandingUploadRepository(requireSession()).beginUpload(
        workspaceId,
        role,
        expectedRevision,
      ),
    stage: async (workspaceId, uploadId, bytes, contentType) => {
      const { error } = await requireSession()
        .storage.from('branding-staging')
        .upload(`${workspaceId}/staging/${uploadId}`, bytes, {
          contentType,
          upsert: false,
        });
      if (error) throw codedError(storageFailureCode(error));
    },
    inspectStaging: async (workspaceId, uploadId) => {
      const { data, error } = await requireSession()
        .storage.from('branding-staging')
        .download(`${workspaceId}/staging/${uploadId}`);
      return !error && data !== null;
    },
    retryStaging: async (workspaceId, uploadId, bytes, contentType) => {
      const path = `${workspaceId}/staging/${uploadId}`;
      const storage = requireSession().storage.from('branding-staging');
      const retried = await storage.upload(path, bytes, {
        contentType,
        upsert: false,
      });
      if (!retried.error) return true;
      const existing = await storage.download(path);
      if (existing.error || !existing.data) return false;
      return sameBytes(
        bytes,
        new Uint8Array(await existing.data.arrayBuffer()),
      );
    },
    validate: (bytes, role) => validateBrandingImage(bytes, { role }),
    prepare: async (uploadId) => {
      const { error } = await requireValidator().rpc(
        'branding_validation_prepare',
        { upload_id: uploadId },
      );
      if (error) throw codedError(error.code ?? 'interrupted');
    },
    promote: async (workspaceId, role, uploadId, processed) => {
      const path = brandingValidatedObjectName(
        workspaceId,
        role,
        processed.contentHash,
        uploadId,
        processed.mediaType,
      );
      const { error } = await requireValidator()
        .storage.from('branding-validated')
        .upload(path, processed.bytes, {
          contentType: processed.mediaType,
          upsert: false,
        });
      if (error) throw codedError('interrupted');
      return path;
    },
    complete: async (uploadId, stagingObject, validatedObject, processed) => {
      const { error } = await requireValidator().rpc(
        'branding_validation_complete',
        {
          upload_id: uploadId,
          staging_object: stagingObject,
          validated_bucket: 'branding-validated',
          validated_object: validatedObject,
          output_sha256: processed.contentHash,
          output_size: processed.bytes.byteLength,
          content_type: processed.mediaType,
        },
      );
      if (error) throw codedError(error.code ?? 'interrupted');
    },
    attach: (uploadId, expectedRevision) =>
      createSupabaseBrandingUploadRepository(requireSession()).attachUpload(
        uploadId,
        expectedRevision,
      ),
    readAfterAmbiguousAttach: async (workspaceId, role) => {
      const { data, error } = await requireSession().rpc(
        'branding_draft_read',
        {
          workspace_id: workspaceId,
        },
      );
      if (error || !data || !Number.isSafeInteger(data.revision)) return null;
      const asset = data.fields?.[role];
      return {
        revision: data.revision,
        object: typeof asset?.object === 'string' ? asset.object : null,
      };
    },
  });

  try {
    return await service.upload(uploadInput);
  } catch {
    return failure('server_error');
  }
}

export async function removeBrandingAsset(
  input: AssetInput,
): Promise<BrandingAssetActionResult> {
  if (!authorizedInput(input)) return failure('invalid_type');
  try {
    const client = await ownerClient(input.workspaceId);
    if (!client) return failure('forbidden');
    const { data, error } = await client.rpc('branding_asset_detach', {
      workspace_id: input.workspaceId,
      asset_role: input.assetRole,
      expected_revision: input.expectedRevision,
    });
    if (error) return failure(errorCode(error));
    if (typeof data !== 'number') return failure('server_error');
    return {
      ok: true,
      assetRole: input.assetRole,
      newRevision: data,
      thumbnailUrl: null,
    };
  } catch {
    return failure('server_error');
  }
}
