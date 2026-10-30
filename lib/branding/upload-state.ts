import { createHash } from 'node:crypto';
import { BRANDING_IMAGE_LIMITS } from './image-validation';

export type BrandingUploadRole = 'logo' | 'banner';
export type BrandingUploadStatus =
  | 'staging'
  | 'validating'
  | 'validated'
  | 'promoting'
  | 'promoted'
  | 'attaching'
  | 'attached'
  | 'attachment_failed_stale'
  | 'interrupted'
  | 'reconciliation_pending'
  | 'failed'
  | 'cleaned';

export type BrandingUpload = {
  id: string;
  workspaceId: string;
  role: BrandingUploadRole;
  draftRevision: number;
  stagingObjectKey: string;
  status: BrandingUploadStatus;
  interruptionStage?: 'staging' | 'validation' | 'promotion' | 'attachment';
  validatedBytes?: Uint8Array;
  contentHash?: string;
  validatedObjectKey?: string;
  attachedAssetId?: string;
};

export type BrandingUploadEvent =
  | { type: 'validation_started' }
  | {
      type: 'validation_succeeded';
      validatedBytes: Uint8Array;
      contentHash: string;
    }
  | { type: 'promotion_started' }
  | { type: 'promotion_succeeded'; validatedObjectKey: string }
  | { type: 'attachment_started' }
  | {
      type: 'attach';
      expectedDraftRevision: number;
      currentDraftRevision: number;
      assetId?: string;
    }
  | { type: 'validation_failed' }
  | { type: 'promotion_failed' }
  | { type: 'attachment_failed' }
  | { type: 'reconciliation_pending' }
  | {
      type: 'reconciliation_complete';
      status: 'staging' | 'validating' | 'promoting' | 'attaching' | 'cleaned';
    };

function invalidTransition(): never {
  throw new Error('Invalid branding upload transition');
}

export function createBrandingUpload(
  input: Omit<BrandingUpload, 'status'>,
): BrandingUpload {
  if (
    !input.id ||
    !input.workspaceId ||
    !input.stagingObjectKey ||
    !Number.isSafeInteger(input.draftRevision) ||
    input.draftRevision < 0
  )
    throw new Error('Invalid branding upload');
  return { ...input, status: 'staging' };
}

export function transitionBrandingUpload(
  upload: BrandingUpload,
  event: BrandingUploadEvent,
): BrandingUpload {
  if (
    upload.status === 'attached' ||
    upload.status === 'cleaned' ||
    upload.status === 'failed'
  ) {
    if (
      event.type === 'reconciliation_complete' &&
      event.status === upload.status
    )
      return upload;
    invalidTransition();
  }
  switch (event.type) {
    case 'validation_started':
      if (upload.status !== 'staging') invalidTransition();
      return { ...upload, status: 'validating' };
    case 'validation_succeeded':
      if (
        upload.status !== 'validating' ||
        !(event.validatedBytes instanceof Uint8Array) ||
        event.validatedBytes.byteLength >
          BRANDING_IMAGE_LIMITS[upload.role].maxOutputBytes ||
        !/^[0-9a-f]{64}$/.test(event.contentHash) ||
        createHash('sha256').update(event.validatedBytes).digest('hex') !==
          event.contentHash
      )
        invalidTransition();
      return {
        ...upload,
        status: 'validated',
        validatedBytes: event.validatedBytes.slice(),
        contentHash: event.contentHash,
      };
    case 'promotion_started':
      if (upload.status !== 'validated') invalidTransition();
      return { ...upload, status: 'promoting' };
    case 'promotion_succeeded':
      if (
        upload.status !== 'promoting' ||
        event.validatedObjectKey !==
          `${upload.workspaceId}/validated/${upload.role}/${upload.contentHash}-${upload.id}`
      )
        invalidTransition();
      return {
        ...upload,
        status: 'promoted',
        validatedObjectKey: event.validatedObjectKey,
      };
    case 'attachment_started':
      if (upload.status !== 'promoted') invalidTransition();
      return { ...upload, status: 'attaching' };
    case 'attach':
      if (upload.status !== 'promoted' && upload.status !== 'attaching')
        invalidTransition();
      if (event.expectedDraftRevision !== upload.draftRevision)
        invalidTransition();
      if (event.currentDraftRevision !== event.expectedDraftRevision)
        return { ...upload, status: 'attachment_failed_stale' };
      if (!event.assetId) invalidTransition();
      return { ...upload, status: 'attached', attachedAssetId: event.assetId };
    case 'validation_failed':
      if (upload.status !== 'validating') invalidTransition();
      return {
        ...upload,
        status: 'failed',
        validatedBytes: undefined,
        contentHash: undefined,
      };
    case 'promotion_failed':
      if (upload.status !== 'promoting') invalidTransition();
      return { ...upload, status: 'failed' };
    case 'attachment_failed':
      if (upload.status !== 'attaching') invalidTransition();
      return { ...upload, status: 'attachment_failed_stale' };
    case 'reconciliation_pending':
      return { ...upload, status: 'reconciliation_pending' };
    case 'reconciliation_complete':
      if (
        upload.status !== 'reconciliation_pending' &&
        upload.status !== 'interrupted'
      )
        invalidTransition();
      return { ...upload, status: event.status, interruptionStage: undefined };
  }
}

export function interruptBrandingUpload(
  upload: BrandingUpload,
  stage: NonNullable<BrandingUpload['interruptionStage']>,
): BrandingUpload {
  if (
    upload.status === 'attached' ||
    upload.status === 'cleaned' ||
    upload.status === 'failed'
  )
    invalidTransition();
  return { ...upload, status: 'interrupted', interruptionStage: stage };
}

export function isBrandingUploadReferenceActive(
  upload: BrandingUpload,
  objectKey: string,
): boolean {
  if (
    upload.status === 'attached' ||
    upload.status === 'cleaned' ||
    upload.status === 'failed'
  )
    return false;
  return (
    upload.stagingObjectKey === objectKey ||
    upload.validatedObjectKey === objectKey
  );
}
