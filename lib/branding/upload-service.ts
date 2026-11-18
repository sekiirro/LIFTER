import { BRANDING_IMAGE_LIMITS } from './image-validation';
import type { BrandingImageResult } from './image-validation';
import { reconcileBrandingUpload } from './reconciliation';
import {
  createBrandingUpload,
  interruptBrandingUpload,
  transitionBrandingUpload,
  type BrandingUpload,
} from './upload-state';
import type {
  BrandingAssetActionResult,
  BrandingAssetRole,
  BrandingUploadErrorCode,
} from './client-contract';

export type BrandingUploadInput = {
  workspaceId: string;
  expectedRevision: number;
  assetRole: BrandingAssetRole;
  file: File;
  identityOnlyConfirmed: boolean;
};

export type BrandingUploadServiceDependencies = {
  authorize(workspaceId: string): Promise<boolean>;
  beginUpload(
    workspaceId: string,
    role: BrandingAssetRole,
    expectedRevision: number,
  ): Promise<string>;
  stage(
    workspaceId: string,
    uploadId: string,
    bytes: Uint8Array,
    contentType: 'image/png' | 'image/webp',
  ): Promise<void>;
  inspectStaging(workspaceId: string, uploadId: string): Promise<boolean>;
  retryStaging(
    workspaceId: string,
    uploadId: string,
    bytes: Uint8Array,
    contentType: 'image/png' | 'image/webp',
  ): Promise<boolean>;
  validate(bytes: Uint8Array, role: BrandingAssetRole): BrandingImageResult;
  prepare(uploadId: string): Promise<void>;
  promote(
    workspaceId: string,
    role: BrandingAssetRole,
    uploadId: string,
    result: BrandingImageResult,
  ): Promise<string>;
  complete(
    uploadId: string,
    stagingObject: string,
    validatedObject: string,
    result: BrandingImageResult,
  ): Promise<void>;
  attach(uploadId: string, expectedRevision: number): Promise<number>;
  readAfterAmbiguousAttach(
    workspaceId: string,
    role: BrandingAssetRole,
  ): Promise<{ revision: number; object: string | null } | null>;
};

function failure(code: BrandingUploadErrorCode): BrandingAssetActionResult {
  return { ok: false, code };
}

function knownErrorCode(error: unknown): BrandingUploadErrorCode | null {
  const value = error as { code?: unknown } | null;
  switch (value?.code) {
    case '40001':
    case 'stale_revision':
      return 'stale_revision';
    case '42501':
    case 'denied':
    case 'forbidden':
      return 'forbidden';
    case 'invalid_type':
    case 'too_large':
    case 'bad_dimensions':
    case 'interrupted':
    case 'server_error':
      return value.code;
    default:
      return null;
  }
}

function contentType(bytes: Uint8Array): 'image/png' | 'image/webp' | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

function validInput(input: BrandingUploadInput): boolean {
  return (
    typeof input.workspaceId === 'string' &&
    Number.isSafeInteger(input.expectedRevision) &&
    input.expectedRevision >= 0 &&
    (input.assetRole === 'logo' || input.assetRole === 'banner') &&
    typeof File !== 'undefined' &&
    input.file instanceof File
  );
}

export function createBrandingUploadService(
  dependencies: BrandingUploadServiceDependencies,
) {
  async function upload(
    input: BrandingUploadInput,
  ): Promise<BrandingAssetActionResult> {
    if (!validInput(input)) return failure('invalid_type');
    if (input.assetRole === 'banner' && input.identityOnlyConfirmed !== true)
      return failure('forbidden');
    const limits = BRANDING_IMAGE_LIMITS[input.assetRole];
    if (input.file.size > limits.maxIngressBytes) return failure('too_large');

    try {
      if (!(await dependencies.authorize(input.workspaceId)))
        return failure('forbidden');
    } catch {
      return failure('forbidden');
    }

    let uploadId: string;
    try {
      uploadId = await dependencies.beginUpload(
        input.workspaceId,
        input.assetRole,
        input.expectedRevision,
      );
    } catch (error) {
      const code = knownErrorCode(error);
      if (code === 'stale_revision') {
        try {
          const bytes = new Uint8Array(await input.file.arrayBuffer());
          const processed = dependencies.validate(bytes, input.assetRole);
          const persisted = await dependencies.readAfterAmbiguousAttach(
            input.workspaceId,
            input.assetRole,
          );
          const expectedObjectPrefix = `${input.workspaceId}/validated/${input.assetRole}/${processed.contentHash}-`;
          const expectedExtension =
            processed.mediaType === 'image/png' ? '.png' : '.webp';
          if (
            persisted?.revision === input.expectedRevision + 1 &&
            persisted.object?.startsWith(expectedObjectPrefix) &&
            persisted.object.endsWith(expectedExtension)
          )
            return {
              ok: true,
              assetRole: input.assetRole,
              newRevision: persisted.revision,
              thumbnailUrl: `/api/branding/draft-image?workspace=${encodeURIComponent(input.workspaceId)}&role=${input.assetRole}&v=${persisted.revision}`,
            };
        } catch {
          // A failed reconciliation stays a stale result; no draft data changed.
        }
      }
      return failure(code ?? 'server_error');
    }

    const stagingObject = `${input.workspaceId}/staging/${uploadId}`;
    let uploadState: BrandingUpload = createBrandingUpload({
      id: uploadId,
      workspaceId: input.workspaceId,
      role: input.assetRole,
      draftRevision: input.expectedRevision,
      stagingObjectKey: stagingObject,
    });
    try {
      const bytes = new Uint8Array(await input.file.arrayBuffer());
      if (bytes.byteLength > limits.maxIngressBytes)
        return failure('too_large');
      const ingressType = contentType(bytes);
      if (!ingressType) return failure('invalid_type');
      try {
        await dependencies.stage(
          input.workspaceId,
          uploadId,
          bytes,
          ingressType,
        );
      } catch (error) {
        const stageError = knownErrorCode(error);
        if (stageError === 'forbidden' || stageError === 'stale_revision')
          return failure(stageError);
        const interrupted = interruptBrandingUpload(uploadState, 'staging');
        const reconciled = await reconcileBrandingUpload(interrupted, {
          storage: {
            inspect: async () => ({
              present: await dependencies.inspectStaging(
                input.workspaceId,
                uploadId,
              ),
            }),
            retryStage: async () => ({
              completed: await dependencies.retryStaging(
                input.workspaceId,
                uploadId,
                bytes,
                ingressType,
              ),
              status: 'staging',
            }),
          },
        });
        if (reconciled.status !== 'staging') return failure('interrupted');
        uploadState = reconciled;
      }

      let processed: BrandingImageResult;
      uploadState = transitionBrandingUpload(uploadState, {
        type: 'validation_started',
      });
      try {
        processed = dependencies.validate(bytes, input.assetRole);
      } catch (error) {
        uploadState = transitionBrandingUpload(uploadState, {
          type: 'validation_failed',
        });
        return failure(knownErrorCode(error) ?? 'invalid_type');
      }
      uploadState = transitionBrandingUpload(uploadState, {
        type: 'validation_succeeded',
        validatedBytes: processed.bytes,
        contentHash: processed.contentHash,
      });
      await dependencies.prepare(uploadId);
      uploadState = transitionBrandingUpload(uploadState, {
        type: 'promotion_started',
      });
      const validatedObject = await dependencies.promote(
        input.workspaceId,
        input.assetRole,
        uploadId,
        processed,
      );
      uploadState = transitionBrandingUpload(uploadState, {
        type: 'promotion_succeeded',
        validatedObjectKey: validatedObject,
      });
      await dependencies.complete(
        uploadId,
        stagingObject,
        validatedObject,
        processed,
      );
      uploadState = transitionBrandingUpload(uploadState, {
        type: 'attachment_started',
      });

      try {
        const newRevision = await dependencies.attach(
          uploadId,
          input.expectedRevision,
        );
        uploadState = transitionBrandingUpload(uploadState, {
          type: 'attach',
          expectedDraftRevision: input.expectedRevision,
          currentDraftRevision: newRevision - 1,
          assetId: validatedObject,
        });
        if (uploadState.status !== 'attached') return failure('stale_revision');
        return {
          ok: true,
          assetRole: input.assetRole,
          newRevision,
          thumbnailUrl: `/api/branding/draft-image?workspace=${encodeURIComponent(input.workspaceId)}&role=${input.assetRole}&v=${newRevision}`,
        };
      } catch (error) {
        const code = knownErrorCode(error);
        if (code === 'stale_revision' || code === 'forbidden')
          return failure(code);
        const persisted = await dependencies
          .readAfterAmbiguousAttach(input.workspaceId, input.assetRole)
          .catch(() => null);
        if (
          persisted?.revision === input.expectedRevision + 1 &&
          persisted.object === validatedObject
        ) {
          uploadState = transitionBrandingUpload(uploadState, {
            type: 'attach',
            expectedDraftRevision: input.expectedRevision,
            currentDraftRevision: persisted.revision - 1,
            assetId: validatedObject,
          });
          if (uploadState.status === 'attached')
            return {
              ok: true,
              assetRole: input.assetRole,
              newRevision: persisted.revision,
              thumbnailUrl: `/api/branding/draft-image?workspace=${encodeURIComponent(input.workspaceId)}&role=${input.assetRole}&v=${persisted.revision}`,
            };
        }
        return failure('interrupted');
      }
    } catch (error) {
      const code = knownErrorCode(error);
      return failure(
        code === 'forbidden' ||
          code === 'stale_revision' ||
          code === 'server_error'
          ? code
          : 'interrupted',
      );
    }
  }

  return { upload };
}
